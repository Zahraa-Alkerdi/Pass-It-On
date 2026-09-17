import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { getSession } from '@/lib/auth';
import { getGeminiClient } from '@/lib/gemini';
import { MAX_ACTIVE_MENTORSHIPS } from '@/lib/constants';
import type { RecommendedMentor } from '@/app/user/matchmaker/actions';

/**
 * Route Handler: POST /api/matchmaker
 * 
 * Provides real-time Server-Sent Events (SSE) streaming for the AI Matchmaker.
 * Streams conversational guidance token-by-token directly from Gemini,
 * suppresses raw JSON code fences during streaming, and concludes with a terminal
 * 'done' event carrying structured mentor recommendation cards and notices.
 * 
 * Resilience:
 * Preserves the inner try/catch fallback to the Section 3 keyword/semantic matcher
 * if Gemini encounters quota limits, 503 high-demand spikes, or missing API keys.
 */

interface MentorSkill {
  id: string;
  name: string;
}

interface ActiveMentorItem {
  id: string;
  name: string;
  bio: string | null;
  skills: MentorSkill[];
}

export async function POST(req: NextRequest) {
  // ---------------------------------------------------------------------------
  // 1. AUTHENTICATION & REQUEST PARSING
  // ---------------------------------------------------------------------------
  const session = await getSession();
  const currentUserId = session?.userId;

  let body: { userMessage?: string; messageHistory?: { role: string; content: string }[] };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const userMessage = (body.userMessage || '').trim();
  const messageHistory = body.messageHistory || [];

  if (!userMessage) {
    return new Response(JSON.stringify({ error: 'userMessage is required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // ---------------------------------------------------------------------------
  // 2. DATABASE CONTEXT GATHERING
  // ---------------------------------------------------------------------------
  // Parallel query: fetch skills, mentors with skills, and active mentorship counts
  const [allSkills, potentialMentors, activeMentorships] = await Promise.all([
    prisma.skill.findMany({
      select: { id: true, name: true, description: true },
      orderBy: { name: 'asc' },
    }),
    prisma.user.findMany({
      include: {
        userSkills: {
          include: {
            skill: true,
          },
        },
      },
    }),
    prisma.mentorship.findMany({
      where: { status: 'ACTIVE' },
      select: { mentorId: true },
    }),
  ]);

  // Compute active mentorship load per mentor
  const mentorActiveLoad = new Map<string, number>();
  for (const m of activeMentorships) {
    mentorActiveLoad.set(m.mentorId, (mentorActiveLoad.get(m.mentorId) || 0) + 1);
  }

  // Filter active mentors: exclude current user, mentors without skills,
  // and mentors who reached or exceeded MAX_ACTIVE_MENTORSHIPS capacity
  const activeMentors: ActiveMentorItem[] = potentialMentors
    .filter((u: any) => {
      if (u.id === currentUserId) return false;
      if (!u.userSkills || u.userSkills.length === 0) return false;
      const currentLoad = mentorActiveLoad.get(u.id) || 0;
      return currentLoad < MAX_ACTIVE_MENTORSHIPS;
    })
    .map((u: any) => ({
      id: u.id,
      name: u.name,
      bio: u.bio,
      skills: u.userSkills.map((us: any) => ({
        id: us.skill.id,
        name: us.skill.name,
      })),
    }));

  // Check student's mentorship economy status
  let mentorshipOwedNotice: string | undefined;
  if (currentUserId) {
    const currentUser = await prisma.user.findUnique({
      where: { id: currentUserId },
      select: { mentorshipsOwed: true, name: true },
    });
    if (currentUser && currentUser.mentorshipsOwed > 1) {
      mentorshipOwedNotice = `Notice: You currently owe ${currentUser.mentorshipsOwed} mentorships to the community under the PassItOn pay-it-forward rule. You can still chat and discover mentors, but will need to mentor a peer before starting a new cycle!`;
    }
  }

  // ---------------------------------------------------------------------------
  // 3. STREAMING SETUP (ReadableStream + SSE Protocol)
  // ---------------------------------------------------------------------------
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const sendEvent = (eventData: object) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(eventData)}\n\n`));
      };

      try {
        const ai = getGeminiClient();

        if (ai) {
          try {
            const systemPrompt = `You are the friendly, expert AI Matchmaker for "PassItOn", a student skill mentorship platform with a pay-it-forward philosophy.
Your job is to:
1. Understand the student's learning goals, skill level, and aspirations.
2. Recommend the best real mentors from the platform's verified mentor directory.
3. Provide practical learning advice, roadmap steps, or clarify what skills they need.
4. Always be supportive, encouraging, and clear.

LIVE DIRECTORY OF PLATFORM MENTORS:
${JSON.stringify(activeMentors, null, 2)}

CATALOG OF AVAILABLE SKILLS:
${allSkills.map(s => s.name).join(', ')}

IMPORTANT RULES FOR MATCHING:
- ONLY recommend mentors from the verified directory above. Never invent fake names or IDs.
- If the student's question is general (e.g. asking about career paths or study roadmaps), give a helpful breakdown and suggest 1-2 mentors who specialize in relevant tech.
- When you recommend a mentor, you MUST output a JSON block at the very end of your response inside a \`\`\`json\`\`\` codefence with the following structure:
\`\`\`json
{
  "matches": [
    {
      "mentorId": "exact id from directory",
      "matchScore": 95,
      "matchReason": "1 concise sentence explaining why this mentor matches their exact goal"
    }
  ]
}
\`\`\`
- If the conversation does not warrant recommending specific mentors yet (e.g. initial greeting or follow-up question), output an empty array: "matches": [].
- Speak in natural, warm language. Do not expose internal IDs in your conversational text; refer to mentors by name.`;

            // Build conversation contents for Gemini
            const conversationContents = [];

            // Add prior turns (exclude the last item if it matches the current user message to avoid duplicate user turns)
            const priorTurns = messageHistory.length > 0 && messageHistory[messageHistory.length - 1].role === 'user'
              ? messageHistory.slice(0, -1)
              : messageHistory;

            for (const msg of priorTurns.slice(-6)) {
              conversationContents.push({
                role: msg.role === 'user' ? 'user' : 'model',
                parts: [{ text: msg.content }],
              });
            }

            // Ensure Gemini contents start with a 'user' turn (strip leading 'model' turns)
            while (conversationContents.length > 0 && conversationContents[0].role === 'model') {
              conversationContents.shift();
            }

            // Add single current message turn with system context instruction
            conversationContents.push({
              role: 'user',
              parts: [{ text: `${systemPrompt}\n\nStudent says: "${userMessage}"` }],
            });

            // Call Gemini streaming API
            const responseStream = await ai.models.generateContentStream({
              model: 'gemini-3.8-flash',
              contents: conversationContents,
            });

            let fullOutput = '';
            let isInsideJsonBlock = false;
            let streamBuffer = '';

            for await (const chunk of responseStream) {
              const chunkText = chunk.text || '';
              fullOutput += chunkText;

              if (!isInsideJsonBlock) {
                streamBuffer += chunkText;

                // Detect if the start of ```json code fence has arrived
                const fenceIndex = streamBuffer.indexOf('```json');
                if (fenceIndex !== -1) {
                  // Emit everything prior to the code fence
                  const visibleText = streamBuffer.slice(0, fenceIndex);
                  if (visibleText.length > 0) {
                    sendEvent({ type: 'token', content: visibleText });
                  }
                  isInsideJsonBlock = true;
                  streamBuffer = '';
                } else {
                  // Buffer safety: retain the last 7 chars in case ```json is split across chunks
                  if (streamBuffer.length > 7) {
                    const flushable = streamBuffer.slice(0, -7);
                    sendEvent({ type: 'token', content: flushable });
                    streamBuffer = streamBuffer.slice(-7);
                  }
                }
              }
            }

            // Flush any remaining non-JSON buffer
            if (!isInsideJsonBlock && streamBuffer.length > 0) {
              sendEvent({ type: 'token', content: streamBuffer });
            }

            // -----------------------------------------------------------------
            // PARSE RECOMMENDATIONS FROM JSON CODE BLOCK
            // -----------------------------------------------------------------
            let recommendations: RecommendedMentor[] = [];
            let narrativeText = fullOutput;

            const jsonMatch = fullOutput.match(/```json\s*([\s\S]*?)\s*```/);
            if (jsonMatch) {
              try {
                const parsed = JSON.parse(jsonMatch[1]);
                if (Array.isArray(parsed.matches)) {
                  recommendations = parsed.matches
                    .map((m: any) => {
                      const mentorRecord = activeMentors.find((am) => am.id === m.mentorId);
                      if (!mentorRecord) return null;
                      return {
                        id: mentorRecord.id,
                        name: mentorRecord.name,
                        bio: mentorRecord.bio,
                        skills: mentorRecord.skills,
                        matchScore: m.matchScore || 90,
                        matchReason: m.matchReason || 'Matches your target skills and learning journey.',
                      };
                    })
                    .filter(Boolean) as RecommendedMentor[];
                }
                narrativeText = fullOutput.replace(/```json[\s\S]*?```/, '').trim();
              } catch (parseErr) {
                console.warn('Could not parse JSON matches block from Gemini stream:', parseErr);
              }
            }

            // Emit terminal 'done' event with structured payload
            sendEvent({
              type: 'done',
              text: narrativeText,
              recommendations,
              notice: mentorshipOwedNotice,
            });

            controller.close();
            return;
          } catch (geminiError) {
            console.warn('Gemini matchmaker streaming unavailable or quota reached; falling back to keyword matcher:', geminiError);
          }
        }

        // ---------------------------------------------------------------------
        // 4. FALLBACK KEYWORD / SEMANTIC MATCHER (Section 3 preserved)
        // ---------------------------------------------------------------------
        const normalizedInput = userMessage.toLowerCase();

        // Identify matched skills
        const matchingSkills = allSkills.filter((s) =>
          normalizedInput.includes(s.name.toLowerCase()) ||
          (s.description && normalizedInput.includes(s.description.toLowerCase()))
        );

        // Fix 1: Default to empty candidate list if no skill matched
        let candidateMentors: ActiveMentorItem[] = [];
        if (matchingSkills.length > 0) {
          const skillIds = new Set(matchingSkills.map((s) => s.id));
          candidateMentors = activeMentors.filter((m) =>
            m.skills.some((ms) => skillIds.has(ms.id))
          );
        }

        // Rank candidate mentors
        const recommendations: RecommendedMentor[] = candidateMentors.slice(0, 2).map((m, index) => {
          const matchedSkillNames = m.skills
            .filter((s) => matchingSkills.some((ms) => ms.id === s.id))
            .map((s) => s.name);

          const highlightSkill = matchedSkillNames.length > 0 ? matchedSkillNames.join(', ') : m.skills[0]?.name || 'Mentorship';

          return {
            id: m.id,
            name: m.name,
            bio: m.bio,
            skills: m.skills,
            matchScore: 95 - index * 5,
            matchReason: `Verified expertise in ${highlightSkill} with an active track record on PassItOn.`,
          };
        });

        let narrativeText = '';
        if (recommendations.length > 0) {
          const names = recommendations.map(r => r.name).join(' and ');
          narrativeText = `I analyzed your learning goals for "${userMessage}". Based on our verified community directory, I highly recommend connecting with **${names}**!\n\nThey have direct experience in the skills you're focusing on and have active availability to guide you through hands-on milestones. You can send them a direct mentorship request right below!`;
        } else if (matchingSkills.length > 0) {
          // Fix 3: Recognized platform skill gap notice
          const skillNames = matchingSkills.map((s) => s.name).join(', ');
          narrativeText = `Great choice focusing on **${skillNames}**! While it is a recognized skill track on PassItOn, we don't currently have active community mentors registered for it.\n\nAs our pay-it-forward community grows, newly certified peers frequently join as mentors. In the meantime, you can explore our Search page to browse all available mentors and skills, or let me know if there's a related topic you'd like to explore!`;
        } else {
          narrativeText = `I hear you! Whether you want to master web development, explore AI, or polish your portfolio, having a direct mentor accelerates your journey.\n\nCould you share a bit more detail about the specific programming language, framework, or project milestone you'd like to tackle? You can also explore popular topics like **React**, **Node.js**, or **Python**.`;
        }

        // Stream the fallback narrative tokens
        sendEvent({ type: 'token', content: narrativeText });

        // Emit terminal 'done' event
        sendEvent({
          type: 'done',
          text: narrativeText,
          recommendations,
          notice: mentorshipOwedNotice,
        });

        controller.close();
      } catch (streamError: any) {
        console.error('Fatal error in matchmaker route stream:', streamError);
        sendEvent({
          type: 'error',
          message: streamError?.message || 'Unexpected server error occurred.',
        });
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
    },
  });
}

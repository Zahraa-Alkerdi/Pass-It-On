'use server';

/**
 * Server Action: AI Matchmaker Service
 * 
 * Architecture & System Flow:
 * 1. Queries available mentors, verified skills, and student platform context from Prisma.
 * 2. Formulates a grounded prompt with real mentor profiles (names, bios, skills, IDs).
 * 3. Calls the Gemini API (`gemini-3.8-flash`) for multi-turn conversational reasoning,
 *    structured mentor matching, and roadmap advice.
 * 4. If `GEMINI_API_KEY` is not present, seamlessly falls back to a smart keyword/semantic
 *    matcher so the user experience is uninterrupted.
 * 5. Returns conversational text accompanied by structured mentor cards for 1-click requests.
 */

import prisma from '@/lib/prisma';
import { getSession } from '@/lib/auth';
import { getGeminiClient } from '@/lib/gemini';
import { MAX_ACTIVE_MENTORSHIPS } from '@/lib/constants';

export interface RecommendedMentor {
  id: string;
  name: string;
  bio: string | null;
  skills: { id: string; name: string }[];
  matchScore: number;
  matchReason: string;
}

export interface MatchmakerResponse {
  text: string;
  recommendations: RecommendedMentor[];
  mentorshipOwedNotice?: string;
  error?: string;
}

/**
 * Main AI Matchmaker Server Action
 * 
 * @param userMessage - Latest user input message
 * @param messageHistory - Prior conversation history
 * @returns MatchmakerResponse with AI narrative & structured mentor cards
 */
export async function getAIResponse(
  userMessage: string,
  messageHistory: { role: string; content: string }[]
): Promise<MatchmakerResponse> {
  const session = await getSession();
  const currentUserId = session?.userId;

  try {
    // -------------------------------------------------------------------------
    // 1. GATHER LIVE CONTEXT FROM DATABASE
    // -------------------------------------------------------------------------
    // Fetch all skills, potential mentors, and currently active mentorships in parallel.
    // Using a single batch query for active mentorships avoids N+1 queries while accurately
    // determining each mentor's current capacity.
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

    // Calculate active mentorship load per mentor
    const mentorActiveLoad = new Map<string, number>();
    for (const m of activeMentorships) {
      mentorActiveLoad.set(m.mentorId, (mentorActiveLoad.get(m.mentorId) || 0) + 1);
    }

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

    // Filter active mentors: exclude current logged-in user, mentors without skills,
    // and mentors who have reached or exceeded the active capacity cap (MAX_ACTIVE_MENTORSHIPS)
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

    // -------------------------------------------------------------------------
    // 2. CALL GEMINI API IF CONFIGURED
    // -------------------------------------------------------------------------
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

        // Add prior turns (exclude the last item if it matches the current user message)
        const priorTurns = messageHistory.length > 0 && messageHistory[messageHistory.length - 1].role === 'user'
          ? messageHistory.slice(0, -1)
          : messageHistory;

        for (const msg of priorTurns.slice(-6)) {
          conversationContents.push({
            role: msg.role === 'user' ? 'user' : 'model',
            parts: [{ text: msg.content }],
          });
        }

        // Ensure Gemini contents start with a 'user' turn (strip leading 'model' turns like initial greeting)
        while (conversationContents.length > 0 && conversationContents[0].role === 'model') {
          conversationContents.shift();
        }

        // Add single current message turn with system context instruction
        conversationContents.push({
          role: 'user',
          parts: [{ text: `${systemPrompt}\n\nStudent says: "${userMessage}"` }],
        });

        const response = await ai.models.generateContent({
          model: 'gemini-3.8-flash',
          contents: conversationContents,
        });

        const fullOutput = response.text || '';

        // Parse matches JSON if present in model output
        let recommendations: RecommendedMentor[] = [];
        let narrativeText = fullOutput;

        const jsonMatch = fullOutput.match(/```json\s*([\s\S]*?)\s*```/);
        if (jsonMatch) {
          try {
            const parsed = JSON.parse(jsonMatch[1]);
            if (Array.isArray(parsed.matches)) {
              recommendations = parsed.matches
                .map((m: any) => {
                  const mentorRecord = activeMentors.find((am: ActiveMentorItem) => am.id === m.mentorId);
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
            // Remove the raw JSON block from displayed narrative text
            narrativeText = fullOutput.replace(/```json[\s\S]*?```/, '').trim();
          } catch (parseErr) {
            console.warn('Could not parse JSON matches block from Gemini response:', parseErr);
          }
        }

        return {
          text: narrativeText,
          recommendations,
          mentorshipOwedNotice,
        };
      } catch (geminiError) {
        // If Gemini is unavailable or rate-limited (e.g. 429, 503), log and fall back to the semantic matcher below
        console.warn('Gemini matchmaker generation unavailable or quota reached; falling back to keyword matcher:', geminiError);
      }
    }

    // -------------------------------------------------------------------------
    // 3. FALLBACK SMART SEMANTIC / KEYWORD MATCHER (When GEMINI_API_KEY is not set)
    // -------------------------------------------------------------------------
    const normalizedInput = userMessage.toLowerCase();

    // Identify matched skills
    const matchingSkills = allSkills.filter((s: { id: string; name: string; description: string | null }) =>
      normalizedInput.includes(s.name.toLowerCase()) ||
      (s.description && normalizedInput.includes(s.description.toLowerCase()))
    );

    let candidateMentors: ActiveMentorItem[] = [];
    if (matchingSkills.length > 0) {
      const skillIds = new Set(matchingSkills.map((s: { id: string }) => s.id));
      candidateMentors = activeMentors.filter((m: ActiveMentorItem) =>
        m.skills.some((ms: MentorSkill) => skillIds.has(ms.id))
      );
    }

    // Rank candidate mentors
    const recommendations: RecommendedMentor[] = candidateMentors.slice(0, 2).map((m: ActiveMentorItem, index: number) => {
      const matchedSkillNames = m.skills
        .filter((s: MentorSkill) => matchingSkills.some((ms: { id: string }) => ms.id === s.id))
        .map((s: MentorSkill) => s.name);

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
      narrativeText = `I analyzed your learning goals for "${userMessage}". Based on our verified community directory, I highly recommend connecting with **${names}**!

They have direct experience in the skills you're focusing on and have active availability to guide you through hands-on milestones. You can send them a direct mentorship request right below!`;
    } else if (matchingSkills.length > 0) {
      const skillNames = matchingSkills.map((s: { name: string }) => s.name).join(', ');
      narrativeText = `Great choice focusing on **${skillNames}**! While it is a recognized skill track on PassItOn, we don't currently have active community mentors registered for it.

As our pay-it-forward community grows, newly certified peers frequently join as mentors. In the meantime, you can explore our Search page to browse all available mentors and skills, or let me know if there's a related topic you'd like to explore!`;
    } else {
      narrativeText = `I hear you! Whether you want to master web development, explore AI, or polish your portfolio, having a direct mentor accelerates your journey. 

Could you share a bit more detail about the specific programming language, framework, or project milestone you'd like to tackle? You can also explore popular topics like **React**, **Node.js**, or **Python**.`;
    }

    return {
      text: narrativeText,
      recommendations,
      mentorshipOwedNotice,
    };
  } catch (error: any) {
    console.error('AI Matchmaker error:', error);
    return {
      text: "I encountered an issue processing your request. Here are some of our top community mentors available to help!",
      recommendations: [],
      error: error?.message || 'Unexpected error occurred in AI matchmaker.',
    };
  }
}

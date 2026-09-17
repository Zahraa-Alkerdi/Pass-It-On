import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { getSession } from '@/lib/auth';
import { getGeminiClient } from '@/lib/gemini';

/**
 * Route Handler: POST /api/support
 * 
 * Provides real-time Server-Sent Events (SSE) streaming for the Platform Support AI.
 * Streams conversational guidance token-by-token directly from Gemini,
 * concluding with a terminal 'done' event carrying structured deep navigation links.
 * 
 * Resilience & Reliability:
 * - Employs Option A defensive guards for user.mentorshipsAsMentee and user.mentorshipsAsMentor
 *   to avoid unhandled TypeErrors when running with in-memory stores or selective projections.
 * - Preserves the inner try/catch fallback to the comprehensive Section 3 static knowledge
 *   base if Gemini encounters 503 high-demand spikes, quota limits (429), or missing API keys.
 */

export async function POST(req: NextRequest) {
  // ---------------------------------------------------------------------------
  // 1. AUTHENTICATION & REQUEST PARSING
  // ---------------------------------------------------------------------------
  const session = await getSession();

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
  // 2. GATHER USER CONTEXT (Option A Defensive Guards Preserved)
  // ---------------------------------------------------------------------------
  let userContextSummary = 'Visitor is browsing anonymously or not logged in.';
  const suggestedLinks: { label: string; href: string }[] = [];

  if (session?.userId) {
    const user = await prisma.user.findUnique({
      where: { id: session.userId },
      select: {
        id: true,
        name: true,
        mentorshipsOwed: true,
        mentorshipsAsMentee: {
          where: { status: 'ACTIVE' },
          select: {
            id: true,
            skill: { select: { name: true } },
            status: true,
            projects: {
              orderBy: { createdAt: 'desc' },
              take: 1,
              select: { status: true, title: true },
            },
          },
        },
        mentorshipsAsMentor: {
          where: { status: 'ACTIVE' },
          select: { id: true, skill: { select: { name: true } }, status: true },
        },
      },
    });

    if (user) {
      // Defensive normalization (Option A fix): Ensure relationship arrays are at least empty lists ([])
      // Why: When running in development mode against the in-memory fallback store or if a selective
      // database projection returns undefined for relational fields, accessing .map() or .length directly
      // on user.mentorshipsAsMentee would throw an unhandled TypeError. Guarding with `|| []` guarantees resilience.
      const menteeMentorships: any[] = user.mentorshipsAsMentee || [];
      const mentorMentorships: any[] = user.mentorshipsAsMentor || [];

      const menteeSummary = menteeMentorships
        .map((m: any) => {
          const projectStatus = m.projects?.[0]?.status
            ? ` [Project: ${m.projects[0].status}]`
            : ' [No project submitted yet]';
          return `${m.skill?.name || 'Skill'}: ${m.status}${projectStatus}`;
        })
        .join(', ') || 'None';

      userContextSummary = `Logged-in User:
- Name: ${user.name}
- Role: ${session.role}
- Mentorships Owed to Community: ${user.mentorshipsOwed}
- Active learning mentorships (as student): ${menteeMentorships.length} (${menteeSummary})
- Active mentoring sessions (as mentor): ${mentorMentorships.length} (${mentorMentorships.map((m: any) => `${m.skill?.name || 'Skill'}: ${m.status}`).join(', ') || 'None'})`;

      // Suggest useful navigation paths based on their state
      if (session.role === 'ADMIN') {
        suggestedLinks.push({ label: 'Admin Dashboard', href: '/admin/dashboard' });
      } else {
        suggestedLinks.push({ label: 'My Dashboard', href: '/user/dashboard' });
        suggestedLinks.push({ label: 'Find Mentors', href: '/user/search' });
        if (menteeMentorships.length > 0 || mentorMentorships.length > 0) {
          const activeId = menteeMentorships[0]?.id || mentorMentorships[0]?.id;
          suggestedLinks.push({ label: 'Open Active Workspace', href: `/user/workspace/${activeId}` });
        }
      }
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
            const systemInstruction = `You are the friendly, knowledgeable Support AI for "PassItOn", a student skill mentorship platform with a pay-it-forward philosophy.
Your goal is to guide students and mentors through platform features, project submissions, workspace milestones, and rules.

PLATFORM ARCHITECTURE & RULES:
1. "Pay-It-Forward" Model:
   - When a student completes a mentorship and earns their verified skill certificate, they commit to "paying it forward" by mentoring another peer who wants to learn that skill.
   - If a student has mentorshipsOwed > 1, they must accept and mentor a peer before they can start another learning cycle.

2. Mentorship Lifecycle:
   - Step 1: Student finds a mentor on Search or via AI Matchmaker (/user/matchmaker) and sends a request with their target skill.
   - Step 2: Mentor reviews incoming requests on their Dashboard (/user/dashboard) and accepts.
   - Step 3: A dedicated collaborative Workspace (/user/workspace/[id]) is unlocked with real-time chat, milestone tracking, GitHub repo submission, and live demo link fields.
   - Step 4: Submission & Dual-Approval:
     * Student submits their project code with GitHub repo and live URL.
     * Mentor reviews and approves the project in the workspace.
     * Admin performs final verification on the Admin Dashboard (/admin/dashboard) and issues the official digital certificate.

3. Certificates & Verification:
   - Certificates appear on the student profile and dashboard upon admin approval.
   - Every certificate has a unique ID and issue date.

CURRENT USER CONTEXT:
${userContextSummary}

RESPONSE GUIDELINES:
- Give direct, step-by-step guidance on how to navigate the platform.
- If they ask about their active mentorship or owed balance, reference their context respectfully.
- Use clear bullet points and clean formatting.
- Keep tone encouraging, professional, and concise.
- Be warm and personable — make the student feel supported, not like they're reading documentation.
- Only state facts that are covered in the PLATFORM ARCHITECTURE & RULES or CURRENT USER CONTEXT sections above. If asked something outside that scope, say you're not sure and point them to their Dashboard rather than guessing or inventing details.`;

            // Build multi-turn conversation contents for Gemini
            const contents = [];
            for (const msg of messageHistory.slice(-6)) {
              contents.push({
                role: msg.role === 'user' ? 'user' : 'model',
                parts: [{ text: msg.content }],
              });
            }

            contents.push({
              role: 'user',
              parts: [{ text: userMessage }],
            });

            // Call Gemini streaming API
            const responseStream = await ai.models.generateContentStream({
              model: 'gemini-3.8-flash',
              contents,
              config: {
                systemInstruction,
              },
            });

            let fullOutput = '';
            for await (const chunk of responseStream) {
              const chunkText = chunk.text || '';
              if (chunkText) {
                fullOutput += chunkText;
                sendEvent({ type: 'token', content: chunkText });
              }
            }

            // Emit terminal 'done' event with suggested navigation links
            sendEvent({
              type: 'done',
              text: fullOutput || 'I am here to assist you with any questions about PassItOn!',
              suggestedLinks,
            });

            controller.close();
            return;
          } catch (geminiError) {
            // If Gemini is unavailable or rate-limited (e.g. 503, 429), log and fall through to the knowledge base below
            console.warn('Gemini support generation unavailable or quota reached; falling back to knowledge base:', geminiError);
          }
        }

        // ---------------------------------------------------------------------
        // 4. SMART FALLBACK KNOWLEDGE BASE (Section 3 preserved)
        // ---------------------------------------------------------------------
        const normalized = userMessage.toLowerCase();
        let text = '';

        if (normalized.includes('pay it forward') || normalized.includes('rule') || normalized.includes('owed')) {
          text = `**The PassItOn "Pay-It-Forward" Philosophy:**

1. **Free Peer Mentorship:** You receive dedicated 1-on-1 mentorship from an experienced peer at zero financial cost.
2. **The Community Promise:** In exchange, once you finish your project and earn your verified certificate, you commit to mentoring another student who wants to learn that skill.
3. **Owed Balance:** If you complete a course, your *mentorships owed* increments. You fulfill this pledge by accepting a mentorship request from a new peer!`;
          suggestedLinks.push({ label: 'View Dashboard & Balance', href: '/user/dashboard' });
        } else if (normalized.includes('submit') || normalized.includes('project') || normalized.includes('workspace')) {
          text = `**How to Submit Your Project for Review:**

1. Navigate to your active mentorship workspace (via **My Dashboard** ➔ **Open Workspace**).
2. Ensure you have tested your code and have your **GitHub Repository URL** and optional **Live Demo URL** ready.
3. Click **Submit Project** inside the workspace.
4. **Approval Stages:**
   - **Step 1: Mentor Review** — Your peer mentor reviews your submission and approves your code.
   - **Step 2: Admin Certification** — Platform admins perform final verification and issue your digital certificate!`;
          suggestedLinks.push({ label: 'My Dashboard', href: '/user/dashboard' });
        } else if (normalized.includes('certificate') || normalized.includes('cert')) {
          text = `**About Certificates & Verification:**

- Certificates are officially issued once **both** your peer mentor and a platform admin have approved your project submission.
- You can view and showcase your earned certificates directly on your **Student Profile** and **Dashboard**.
- Each certificate confirms verified practical skill proficiency.`;
          suggestedLinks.push({ label: 'My Profile', href: '/user/profile' });
        } else if (normalized.includes('matchmaker') || normalized.includes('find') || normalized.includes('mentor')) {
          text = `**Finding the Right Mentor:**

- **AI Matchmaker:** Visit the [AI Matchmaker](/user/matchmaker) to converse with our intelligent advisor and get matched with mentors best suited for your goals.
- **Mentor Directory:** Visit the [Search](/user/search) page to filter mentors by verified skills and send requests directly.`;
          suggestedLinks.push({ label: 'Open AI Matchmaker', href: '/user/matchmaker' });
          suggestedLinks.push({ label: 'Browse Mentors', href: '/user/search' });
        } else {
          text = `Welcome to PassItOn Support! I can help you with:
- **Pay-It-Forward Rules**: Understanding community mentorship commitments and balances.
- **Workspace & Submissions**: Guidance on submitting projects and milestone reviews.
- **Certificates**: Information on mentor reviews, admin approvals, and credentials.
- **Account & Navigation**: Finding mentors, updating your profile, and tracking active requests.

What would you like to explore?`;
          suggestedLinks.push({ label: 'My Dashboard', href: '/user/dashboard' });
          suggestedLinks.push({ label: 'Find Mentors', href: '/user/search' });
        }

        // Stream the fallback narrative tokens
        sendEvent({ type: 'token', content: text });

        // Emit terminal 'done' event with suggested navigation links
        sendEvent({
          type: 'done',
          text,
          suggestedLinks,
        });

        controller.close();
      } catch (streamError: any) {
        console.error('Fatal error in support route stream:', streamError);
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

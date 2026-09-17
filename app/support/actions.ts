'use server';

/**
 * Server Action: Platform Support AI Service
 * 
 * Architecture & Flow:
 * 1. Fetches current session context (whether the user is logged in as Student or Admin,
 *    and their active mentorships or owed count).
 * 2. Prepares a grounded knowledge prompt covering:
 *    - The Pay-It-Forward philosophy (1-on-1 mentorship for free in return for mentoring next)
 *    - The 4-step mentorship lifecycle: Request -> Acceptance -> Workspace milestones -> Two-tier Project Review
 *    - Dual-approval verification: Mentor review -> Admin certification
 *    - Workspace features: GitHub repo links, live demo submission, real-time message chat
 *    - Certificate verification and career portfolio
 * 3. Invokes Gemini (`gemini-3.8-flash`) via `getGeminiClient()` with full conversation memory.
 * 4. Gracefully falls back to an internal platform knowledge responder if GEMINI_API_KEY is not configured.
 */

import prisma from '@/lib/prisma';
import { getSession } from '@/lib/auth';
import { getGeminiClient } from '@/lib/gemini';

export interface SupportResponse {
  text: string;
  suggestedLinks?: { label: string; href: string }[];
  error?: string;
}

/**
 * Handles incoming support queries from students and mentors
 * 
 * @param userMessage - The latest user question or query
 * @param messageHistory - Conversation turn history for multi-turn context
 * @returns SupportResponse with AI answer and optional deep navigation links
 */
export async function getSupportAIResponse(
  userMessage: string,
  messageHistory: { role: string; content: string }[]
): Promise<SupportResponse> {
  try {
    // -------------------------------------------------------------------------
    // 1. GATHER USER CONTEXT
    // -------------------------------------------------------------------------
    const session = await getSession();
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
        const menteeSummary = user.mentorshipsAsMentee.map((m: any) => {
          const projectStatus = m.projects[0]?.status ? ` [Project: ${m.projects[0].status}]` : ' [No project submitted yet]';
          return `${m.skill.name}: ${m.status}${projectStatus}`;
        }).join(', ') || 'None';

        userContextSummary = `Logged-in User:
- Name: ${user.name}
- Role: ${session.role}
- Mentorships Owed to Community: ${user.mentorshipsOwed}
- Active learning mentorships (as student): ${user.mentorshipsAsMentee.length} (${menteeSummary})
- Active mentoring sessions (as mentor): ${user.mentorshipsAsMentor.length} (${user.mentorshipsAsMentor.map((m: any) => `${m.skill.name}: ${m.status}`).join(', ') || 'None'})`;

        // Suggest useful navigation paths based on their state
        if (session.role === 'ADMIN') {
          suggestedLinks.push({ label: 'Admin Dashboard', href: '/admin/dashboard' });
        } else {
          suggestedLinks.push({ label: 'My Dashboard', href: '/user/dashboard' });
          suggestedLinks.push({ label: 'Find Mentors', href: '/user/search' });
          if (user.mentorshipsAsMentee.length > 0 || user.mentorshipsAsMentor.length > 0) {
            const activeId = user.mentorshipsAsMentee[0]?.id || user.mentorshipsAsMentor[0]?.id;
            suggestedLinks.push({ label: 'Open Active Workspace', href: `/user/workspace/${activeId}` });
          }
        }
      }
    }

    // -------------------------------------------------------------------------
    // 2. GEMINI AI GENERATION
    // -------------------------------------------------------------------------
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
- Keep tone encouraging, professional, and concise.`;

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

        const response = await ai.models.generateContent({
          model: 'gemini-3.8-flash',
          contents,
          config: {
            systemInstruction,
          },
        });

        return {
          text: response.text || 'I am here to assist you with any questions about PassItOn!',
          suggestedLinks,
        };
      } catch (geminiError) {
        // If Gemini is unavailable or rate-limited (e.g. 429, 503), log and fall back to the knowledge base below
        console.warn('Gemini generation unavailable or quota reached; falling back to knowledge base:', geminiError);
      }
    }

    // -------------------------------------------------------------------------
    // 3. SMART FALLBACK KNOWLEDGE BASE (When GEMINI_API_KEY is not set)
    // -------------------------------------------------------------------------
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

    return {
      text,
      suggestedLinks,
    };
  } catch (error: any) {
    console.error('Support AI error:', error);
    return {
      text: "I experienced a temporary difficulty fetching support information. Please explore your Dashboard or ask again in a moment.",
      error: error?.message,
    };
  }
}

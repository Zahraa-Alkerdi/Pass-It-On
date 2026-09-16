/**
 * Application Database Layer (Prisma Client & In-Memory Fallback)
 * 
 * Architecture & Design:
 * - This module manages the connection to the database.
 * - In containerized cloud runtimes (like AI Studio) where an external PostgreSQL
 *   database might not be immediately provisioned, this module provides a comprehensive
 *   in-memory database fallback pre-seeded with all required entities (Admins, Users,
 *   Skills, Mentorships, Requests, and Certifications).
 * - If a valid `DATABASE_URL` is configured, it will delegate to the Prisma PostgreSQL adapter.
 * - All queries are safely routed so that the application compiles without prerender failures
 *   and operates reliably out of the box.
 */

import { PrismaClient } from '@prisma/client';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';

// ---------------------------------------------------------------------------
// TYPES FOR IN-MEMORY STORAGE
// ---------------------------------------------------------------------------
interface InMemAdmin {
  id: string;
  email: string;
  name: string;
  passwordHash: string;
  createdAt: Date;
  updatedAt: Date;
}

interface InMemUser {
  id: string;
  email: string;
  name: string;
  passwordHash: string;
  bio: string | null;
  mentorshipsOwed: number;
  skills: string[];
  createdAt: Date;
  updatedAt: Date;
}

interface InMemSkill {
  id: string;
  name: string;
  description: string | null;
  createdAt: Date;
}

interface InMemUserSkill {
  id: string;
  userId: string;
  skillId: string;
  createdAt: Date;
}

interface InMemMentorshipRequest {
  id: string;
  menteeId: string;
  mentorId: string;
  skillId: string;
  status: 'PENDING' | 'ACCEPTED' | 'REJECTED';
  createdAt: Date;
  updatedAt: Date;
}

interface InMemMentorship {
  id: string;
  menteeId: string;
  mentorId: string;
  skillId: string;
  status: 'ACTIVE' | 'COMPLETED';
  createdAt: Date;
  updatedAt: Date;
}

interface InMemProjectSubmission {
  id: string;
  mentorshipId: string;
  title: string;
  description: string;
  githubUrl: string;
  liveDemoUrl: string | null;
  additionalLinks: string | null;
  status: 'SUBMITTED' | 'MENTOR_APPROVED' | 'ADMIN_APPROVED' | 'REJECTED' | 'CHANGES_REQUESTED';
  mentorFeedback: string | null;
  adminFeedback: string | null;
  createdAt: Date;
  updatedAt: Date;
}

interface InMemCertification {
  id: string;
  userId: string;
  skillId: string;
  mentorshipId: string;
  issueDate: Date;
  certificateId: string;
}

interface InMemStore {
  admins: InMemAdmin[];
  users: InMemUser[];
  skills: InMemSkill[];
  userSkills: InMemUserSkill[];
  mentorshipRequests: InMemMentorshipRequest[];
  mentorships: InMemMentorship[];
  projectSubmissions: InMemProjectSubmission[];
  certifications: InMemCertification[];
}

// ---------------------------------------------------------------------------
// DEFAULT SEED DATA
// ---------------------------------------------------------------------------
// Bcrypt hash for password 'pass123'
const HASHED_PASS = '$2b$10$3xCDhXpcsLijePv.U.kmmu/mNcpLvnFH5v69YtbHdjXmSGi80PK/e';

const INITIAL_SKILLS = [
  'Web Development', 'Artificial Intelligence', 'Data Science', 'Machine Learning',
  'React', 'Next.js', 'Node.js', 'Python', 'TypeScript', 'JavaScript',
  'Tailwind CSS', 'PostgreSQL', 'Docker', 'UI/UX Design', 'Figma'
];

function createInitialStore(): InMemStore {
  const now = new Date();

  const skills: InMemSkill[] = INITIAL_SKILLS.map((name, i) => ({
    id: `skill-${i + 1}`,
    name,
    description: `Learn everything about ${name} from experienced community mentors.`,
    createdAt: now,
  }));

  const admins: InMemAdmin[] = [
    {
      id: 'admin-1',
      email: 'zahraa@gmail.com',
      name: 'Zahraa Admin',
      passwordHash: HASHED_PASS,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'admin-2',
      email: 'fatima@gmail.com',
      name: 'Fatima Admin',
      passwordHash: HASHED_PASS,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'admin-3',
      email: 'admin@example.com',
      name: 'Platform Admin',
      passwordHash: HASHED_PASS,
      createdAt: now,
      updatedAt: now,
    }
  ];

  const users: InMemUser[] = [
    {
      id: 'user-yousef',
      email: 'yousef-student@gmail.com',
      name: 'Yousef Student',
      passwordHash: HASHED_PASS,
      bio: 'Passionate student eager to learn modern web development and software engineering.',
      mentorshipsOwed: 0,
      skills: ['Web Development', 'React', 'TypeScript'],
      createdAt: new Date(now.getTime() - 86400000 * 5),
      updatedAt: now,
    },
    {
      id: 'user-default',
      email: 'student@example.com',
      name: 'Alex Student',
      passwordHash: HASHED_PASS,
      bio: 'Lifelong learner focusing on full-stack web applications and AI.',
      mentorshipsOwed: 0,
      skills: ['React', 'Next.js'],
      createdAt: new Date(now.getTime() - 86400000 * 4),
      updatedAt: now,
    },
    {
      id: 'user-olivia',
      email: 'olivia.mentor@example.com',
      name: 'Olivia Mentor',
      passwordHash: HASHED_PASS,
      bio: 'Senior developer eager to share frontend knowledge and mentor newcomers.',
      mentorshipsOwed: 0,
      skills: ['React', 'TypeScript', 'Tailwind CSS', 'Next.js'],
      createdAt: new Date(now.getTime() - 86400000 * 10),
      updatedAt: now,
    },
    {
      id: 'user-noah',
      email: 'noah.coder@example.com',
      name: 'Noah Developer',
      passwordHash: HASHED_PASS,
      bio: 'Fullstack engineer mentoring students in Node.js and PostgreSQL backend systems.',
      mentorshipsOwed: 0,
      skills: ['Node.js', 'PostgreSQL', 'Docker'],
      createdAt: new Date(now.getTime() - 86400000 * 8),
      updatedAt: now,
    }
  ];

  // Link users to skills
  const userSkills: InMemUserSkill[] = [];
  let userSkillCounter = 1;
  for (const user of users) {
    for (const skillName of user.skills) {
      const foundSkill = skills.find(s => s.name === skillName);
      if (foundSkill) {
        userSkills.push({
          id: `us-${userSkillCounter++}`,
          userId: user.id,
          skillId: foundSkill.id,
          createdAt: now,
        });
      }
    }
  }

  // Initial Mentorships:
  // 1. Active Mentorship: Olivia mentors Yousef in 'React'
  const reactSkill = skills.find(s => s.name === 'React')!;
  const webSkill = skills.find(s => s.name === 'Web Development')!;

  const mentorships: InMemMentorship[] = [
    {
      id: 'm-active-1',
      menteeId: 'user-yousef',
      mentorId: 'user-olivia',
      skillId: reactSkill.id,
      status: 'ACTIVE',
      createdAt: new Date(now.getTime() - 86400000 * 3),
      updatedAt: now,
    },
    {
      id: 'm-completed-1',
      menteeId: 'user-yousef',
      mentorId: 'user-noah',
      skillId: webSkill.id,
      status: 'COMPLETED',
      createdAt: new Date(now.getTime() - 86400000 * 15),
      updatedAt: new Date(now.getTime() - 86400000 * 2),
    }
  ];

  // Requests:
  // Incoming request to Yousef from Alex for TypeScript
  const tsSkill = skills.find(s => s.name === 'TypeScript')!;
  const mentorshipRequests: InMemMentorshipRequest[] = [
    {
      id: 'req-1',
      menteeId: 'user-default',
      mentorId: 'user-yousef',
      skillId: tsSkill.id,
      status: 'PENDING',
      createdAt: new Date(now.getTime() - 86400000 * 1),
      updatedAt: now,
    }
  ];

  // Project submission for the active mentorship
  const projectSubmissions: InMemProjectSubmission[] = [
    {
      id: 'proj-1',
      mentorshipId: 'm-active-1',
      title: 'Interactive Dashboard Application',
      description: 'Built a responsive analytics dashboard with dynamic widgets and real-time state management using React hooks.',
      githubUrl: 'https://github.com/example/react-dashboard',
      liveDemoUrl: 'https://example.com/demo',
      additionalLinks: 'Includes comprehensive unit tests and accessibility verification.',
      status: 'MENTOR_APPROVED', // Ready for Admin review!
      mentorFeedback: 'Outstanding work on the component architecture and separation of concerns!',
      adminFeedback: null,
      createdAt: new Date(now.getTime() - 86400000 * 2),
      updatedAt: new Date(now.getTime() - 86400000 * 1),
    },
    {
      id: 'proj-completed',
      mentorshipId: 'm-completed-1',
      title: 'Portfolio Website',
      description: 'Personal web development portfolio displaying projects and certifications.',
      githubUrl: 'https://github.com/example/portfolio',
      liveDemoUrl: 'https://example.com/portfolio',
      additionalLinks: null,
      status: 'ADMIN_APPROVED',
      mentorFeedback: 'Great semantic HTML structure and CSS styling.',
      adminFeedback: 'Officially certified!',
      createdAt: new Date(now.getTime() - 86400000 * 14),
      updatedAt: new Date(now.getTime() - 86400000 * 2),
    }
  ];

  const certifications: InMemCertification[] = [
    {
      id: 'cert-1',
      userId: 'user-yousef',
      skillId: webSkill.id,
      mentorshipId: 'm-completed-1',
      issueDate: new Date(now.getTime() - 86400000 * 2),
      certificateId: 'CERT-PASSITON-001',
    }
  ];

  return {
    admins,
    users,
    skills,
    userSkills,
    mentorshipRequests,
    mentorships,
    projectSubmissions,
    certifications,
  };
}

// Global persistence across hot reloads in development
declare global {
  var __inMemDb: InMemStore | undefined;
  var prismaGlobal: undefined | any;
}

const store: InMemStore = globalThis.__inMemDb ?? createInitialStore();
if (process.env.NODE_ENV !== 'production') {
  globalThis.__inMemDb = store;
}

// ---------------------------------------------------------------------------
// IN-MEMORY QUERY & MUTATION RUNNER
// ---------------------------------------------------------------------------

/**
 * Creates an in-memory client that implements the exact query surface required by the app.
 */
function createInMemoryClient() {
  return {
    admin: {
      findUnique: async ({ where }: { where: { email?: string; id?: string } }) => {
        if (where.email) {
          return store.admins.find(a => a.email.toLowerCase() === where.email?.toLowerCase()) ?? null;
        }
        if (where.id) {
          return store.admins.find(a => a.id === where.id) ?? null;
        }
        return null;
      },
    },

    user: {
      findUnique: async ({ where, select, include }: any) => {
        let user: any = null;
        if (where.id) {
          user = store.users.find(u => u.id === where.id);
        } else if (where.email) {
          user = store.users.find(u => u.email.toLowerCase() === where.email?.toLowerCase());
        }

        if (!user) return null;
        const res = { ...user };

        if (include?.certifications) {
          res.certifications = store.certifications
            .filter(c => c.userId === user.id)
            .map(c => ({
              ...c,
              skill: store.skills.find(s => s.id === c.skillId) ?? { name: 'Unknown' },
            }));
        }

        if (include?.userSkills) {
          res.userSkills = store.userSkills
            .filter(us => us.userId === user.id)
            .map(us => ({
              ...us,
              skill: store.skills.find(s => s.id === us.skillId),
            }));
        }

        if (select) {
          const selected: any = {};
          for (const key of Object.keys(select)) {
            if (select[key]) selected[key] = res[key];
          }
          return selected;
        }

        return res;
      },

      findMany: async (args: any = {}) => {
        let result = [...store.users];

        // Filter by userSkills relation (e.g. Find Mentors for skill)
        if (args.where?.userSkills?.some?.skillId) {
          const targetSkillId = args.where.userSkills.some.skillId;
          const userIdsWithSkill = new Set(
            store.userSkills.filter(us => us.skillId === targetSkillId).map(us => us.userId)
          );
          result = result.filter(u => userIdsWithSkill.has(u.id));
        }

        // Sorting
        if (args.orderBy?.createdAt === 'desc') {
          result.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
        }

        // Pagination
        if (typeof args.skip === 'number') {
          result = result.slice(args.skip);
        }
        if (typeof args.take === 'number') {
          result = result.slice(0, args.take);
        }

        // Resolve relations
        return result.map(u => {
          const mapped: any = { ...u };
          if (args.include?.userSkills) {
            mapped.userSkills = store.userSkills
              .filter(us => us.userId === u.id)
              .map(us => {
                const item: any = { ...us };
                if (args.include.userSkills.include?.skill) {
                  item.skill = store.skills.find(s => s.id === us.skillId);
                }
                return item;
              });
          }
          return mapped;
        });
      },

      create: async ({ data }: any) => {
        const id = `user-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
        const now = new Date();
        const newUser: InMemUser = {
          id,
          name: data.name,
          email: data.email,
          passwordHash: data.passwordHash,
          bio: data.bio ?? null,
          mentorshipsOwed: data.mentorshipsOwed ?? 0,
          skills: data.skills ?? [],
          createdAt: now,
          updatedAt: now,
        };
        store.users.unshift(newUser);

        // Handle nested userSkills creation
        if (data.userSkills?.create && Array.isArray(data.userSkills.create)) {
          for (const item of data.userSkills.create) {
            const skillId = item.skill?.connect?.id;
            if (skillId) {
              store.userSkills.push({
                id: `us-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
                userId: id,
                skillId,
                createdAt: now,
              });
            }
          }
        }

        return newUser;
      },

      update: async ({ where, data }: any) => {
        const userIndex = store.users.findIndex(u => u.id === where.id);
        if (userIndex === -1) return null;

        const user = store.users[userIndex];
        const updated: InMemUser = {
          ...user,
          ...data,
          updatedAt: new Date(),
        };

        // Handle atomic increment/decrement for mentorshipsOwed
        if (data.mentorshipsOwed) {
          if (typeof data.mentorshipsOwed.increment === 'number') {
            updated.mentorshipsOwed = user.mentorshipsOwed + data.mentorshipsOwed.increment;
          } else if (typeof data.mentorshipsOwed.decrement === 'number') {
            updated.mentorshipsOwed = Math.max(0, user.mentorshipsOwed - data.mentorshipsOwed.decrement);
          }
        }

        store.users[userIndex] = updated;
        return updated;
      },
    },

    skill: {
      findMany: async (args: any = {}) => {
        let result = [...store.skills];

        if (args.where?.id?.in && Array.isArray(args.where.id.in)) {
          const ids = new Set(args.where.id.in);
          result = result.filter(s => ids.has(s.id));
        }

        if (args.orderBy?.name === 'asc') {
          result.sort((a, b) => a.name.localeCompare(b.name));
        }

        if (args.select) {
          return result.map(s => {
            const item: any = {};
            for (const key of Object.keys(args.select)) {
              if (args.select[key]) item[key] = (s as any)[key];
            }
            return item;
          });
        }

        return result;
      },
    },

    userSkill: {
      upsert: async ({ where }: any) => {
        const { userId, skillId } = where.userId_skillId || where;
        const existing = store.userSkills.find(us => us.userId === userId && us.skillId === skillId);
        if (existing) {
          return existing;
        }
        const newRecord: InMemUserSkill = {
          id: `us-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
          userId,
          skillId,
          createdAt: new Date(),
        };
        store.userSkills.push(newRecord);
        return newRecord;
      },
    },

    mentorshipRequest: {
      findUnique: async ({ where }: any) => {
        if (where.id) {
          return store.mentorshipRequests.find(r => r.id === where.id) ?? null;
        }
        if (where.menteeId_mentorId_skillId) {
          const { menteeId, mentorId, skillId } = where.menteeId_mentorId_skillId;
          return store.mentorshipRequests.find(
            r => r.menteeId === menteeId && r.mentorId === mentorId && r.skillId === skillId
          ) ?? null;
        }
        return null;
      },

      findMany: async ({ where, include, orderBy }: any = {}) => {
        let list = [...store.mentorshipRequests];

        if (where?.mentorId) {
          list = list.filter(r => r.mentorId === where.mentorId);
        }
        if (where?.menteeId) {
          list = list.filter(r => r.menteeId === where.menteeId);
        }
        if (where?.status) {
          list = list.filter(r => r.status === where.status);
        }

        if (orderBy?.createdAt === 'desc') {
          list.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
        }

        return list.map(r => {
          const res: any = { ...r };
          if (include?.mentee) {
            const mentee = store.users.find(u => u.id === r.menteeId);
            res.mentee = mentee ? { name: mentee.name, email: mentee.email } : { name: 'Unknown', email: '' };
          }
          if (include?.mentor) {
            const mentor = store.users.find(u => u.id === r.mentorId);
            res.mentor = mentor ? { name: mentor.name, email: mentor.email } : { name: 'Unknown', email: '' };
          }
          if (include?.skill) {
            const skill = store.skills.find(s => s.id === r.skillId);
            res.skill = skill ? { name: skill.name } : { name: 'Unknown' };
          }
          return res;
        });
      },

      create: async ({ data }: any) => {
        const newReq: InMemMentorshipRequest = {
          id: `req-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
          menteeId: data.menteeId,
          mentorId: data.mentorId,
          skillId: data.skillId,
          status: data.status ?? 'PENDING',
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        store.mentorshipRequests.unshift(newReq);
        return newReq;
      },

      update: async ({ where, data }: any) => {
        const index = store.mentorshipRequests.findIndex(r => r.id === where.id);
        if (index === -1) return null;
        store.mentorshipRequests[index] = {
          ...store.mentorshipRequests[index],
          ...data,
          updatedAt: new Date(),
        };
        return store.mentorshipRequests[index];
      },
    },

    mentorship: {
      findUnique: async ({ where, include }: any) => {
        const m = store.mentorships.find(x => x.id === where.id);
        if (!m) return null;
        const res: any = { ...m };

        if (include?.mentee) {
          const mentee = store.users.find(u => u.id === m.menteeId);
          res.mentee = mentee ? { id: mentee.id, name: mentee.name, email: mentee.email } : null;
        }
        if (include?.mentor) {
          const mentor = store.users.find(u => u.id === m.mentorId);
          res.mentor = mentor ? { id: mentor.id, name: mentor.name, email: mentor.email } : null;
        }
        if (include?.skill) {
          const skill = store.skills.find(s => s.id === m.skillId);
          res.skill = skill ? { name: skill.name } : null;
        }
        if (include?.projects) {
          let projs = store.projectSubmissions.filter(p => p.mentorshipId === m.id);
          if (include.projects.orderBy?.createdAt === 'desc') {
            projs.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
          }
          if (include.projects.take) {
            projs = projs.slice(0, include.projects.take);
          }
          res.projects = projs;
        }

        return res;
      },

      findMany: async ({ where, include, orderBy }: any = {}) => {
        let list = [...store.mentorships];

        // Complex filter handler
        if (where) {
          list = list.filter(m => {
            if (where.OR && Array.isArray(where.OR)) {
              const matchesOr = where.OR.some((clause: any) => {
                if (clause.menteeId && m.menteeId === clause.menteeId) return true;
                if (clause.mentorId && m.mentorId === clause.mentorId) return true;
                return false;
              });
              if (!matchesOr) return false;
            }

            if (where.status && m.status !== where.status) {
              return false;
            }

            if (where.projects?.none?.status) {
              const hasStatus = store.projectSubmissions.some(
                p => p.mentorshipId === m.id && p.status === where.projects.none.status
              );
              if (hasStatus) return false;
            }

            if (where.AND && Array.isArray(where.AND)) {
              for (const andClause of where.AND) {
                if (andClause.OR && Array.isArray(andClause.OR)) {
                  const matches = andClause.OR.some((c: any) => {
                    if (c.menteeId && m.menteeId === c.menteeId) return true;
                    if (c.mentorId && m.mentorId === c.mentorId) return true;
                    if (c.status && m.status === c.status) return true;
                    if (c.projects?.some?.status) {
                      return store.projectSubmissions.some(
                        p => p.mentorshipId === m.id && p.status === c.projects.some.status
                      );
                    }
                    return false;
                  });
                  if (!matches) return false;
                }
              }
            }

            return true;
          });
        }

        if (orderBy?.createdAt === 'desc') {
          list.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
        }
        if (orderBy?.updatedAt === 'desc') {
          list.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
        }

        return list.map(m => {
          const res: any = { ...m };
          if (include?.mentee) {
            const mentee = store.users.find(u => u.id === m.menteeId);
            res.mentee = mentee ? { id: mentee.id, name: mentee.name, email: mentee.email } : { name: 'Unknown' };
          }
          if (include?.mentor) {
            const mentor = store.users.find(u => u.id === m.mentorId);
            res.mentor = mentor ? { id: mentor.id, name: mentor.name, email: mentor.email } : { name: 'Unknown' };
          }
          if (include?.skill) {
            const skill = store.skills.find(s => s.id === m.skillId);
            res.skill = skill ? { name: skill.name } : { name: 'Unknown' };
          }
          if (include?.cert) {
            res.cert = store.certifications.find(c => c.mentorshipId === m.id) ?? null;
          }
          return res;
        });
      },

      create: async ({ data }: any) => {
        const newMentorship: InMemMentorship = {
          id: `m-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
          menteeId: data.menteeId,
          mentorId: data.mentorId,
          skillId: data.skillId,
          status: data.status ?? 'ACTIVE',
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        store.mentorships.unshift(newMentorship);
        return newMentorship;
      },

      update: async ({ where, data }: any) => {
        const index = store.mentorships.findIndex(m => m.id === where.id);
        if (index === -1) return null;
        store.mentorships[index] = {
          ...store.mentorships[index],
          ...data,
          updatedAt: new Date(),
        };
        return store.mentorships[index];
      },
    },

    projectSubmission: {
      findUnique: async ({ where, include }: any) => {
        const proj = store.projectSubmissions.find(p => p.id === where.id);
        if (!proj) return null;
        const res: any = { ...proj };

        if (include?.mentorship) {
          const m = store.mentorships.find(x => x.id === proj.mentorshipId);
          if (m) {
            const mRes: any = { ...m };
            if (include.mentorship.include?.mentee) {
              const mentee = store.users.find(u => u.id === m.menteeId);
              mRes.mentee = mentee ? { name: mentee.name, email: mentee.email } : { name: 'Unknown', email: '' };
            }
            if (include.mentorship.include?.mentor) {
              const mentor = store.users.find(u => u.id === m.mentorId);
              mRes.mentor = mentor ? { name: mentor.name, email: mentor.email } : { name: 'Unknown', email: '' };
            }
            if (include.mentorship.include?.skill) {
              const skill = store.skills.find(s => s.id === m.skillId);
              mRes.skill = skill ? { name: skill.name } : { name: 'Unknown' };
            }
            res.mentorship = mRes;
          }
        }

        return res;
      },

      findFirst: async ({ where }: any) => {
        if (where?.mentorshipId) {
          return store.projectSubmissions.find(p => p.mentorshipId === where.mentorshipId) ?? null;
        }
        return null;
      },

      findMany: async ({ where, include, orderBy }: any = {}) => {
        let list = [...store.projectSubmissions];

        if (where?.status) {
          list = list.filter(p => p.status === where.status);
        }

        if (orderBy?.updatedAt === 'asc') {
          list.sort((a, b) => a.updatedAt.getTime() - b.updatedAt.getTime());
        } else if (orderBy?.createdAt === 'desc') {
          list.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
        }

        return list.map(p => {
          const res: any = { ...p };
          if (include?.mentorship) {
            const m = store.mentorships.find(x => x.id === p.mentorshipId);
            if (m) {
              const mRes: any = { ...m };
              if (include.mentorship.include?.mentee) {
                const mentee = store.users.find(u => u.id === m.menteeId);
                mRes.mentee = mentee ? { name: mentee.name, email: mentee.email } : { name: 'Unknown', email: '' };
              }
              if (include.mentorship.include?.mentor) {
                const mentor = store.users.find(u => u.id === m.mentorId);
                mRes.mentor = mentor ? { name: mentor.name, email: mentor.email } : { name: 'Unknown', email: '' };
              }
              if (include.mentorship.include?.skill) {
                const skill = store.skills.find(s => s.id === m.skillId);
                mRes.skill = skill ? { name: skill.name } : { name: 'Unknown' };
              }
              res.mentorship = mRes;
            }
          }
          return res;
        });
      },

      create: async ({ data }: any) => {
        const newProj: InMemProjectSubmission = {
          id: `proj-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
          mentorshipId: data.mentorshipId,
          title: data.title,
          description: data.description,
          githubUrl: data.githubUrl,
          liveDemoUrl: data.liveDemoUrl ?? null,
          additionalLinks: data.additionalLinks ?? null,
          status: data.status ?? 'SUBMITTED',
          mentorFeedback: data.mentorFeedback ?? null,
          adminFeedback: data.adminFeedback ?? null,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        store.projectSubmissions.unshift(newProj);
        return newProj;
      },

      update: async ({ where, data, include }: any) => {
        const index = store.projectSubmissions.findIndex(p => p.id === where.id);
        if (index === -1) return null;
        store.projectSubmissions[index] = {
          ...store.projectSubmissions[index],
          ...data,
          updatedAt: new Date(),
        };
        const updated = store.projectSubmissions[index];
        const res: any = { ...updated };
        if (include?.mentorship) {
          const m = store.mentorships.find(x => x.id === updated.mentorshipId);
          res.mentorship = m;
        }
        return res;
      },

      upsert: async ({ where, create, update }: any) => {
        const existing = store.projectSubmissions.find(p => p.id === where.id);
        if (existing) {
          const index = store.projectSubmissions.indexOf(existing);
          store.projectSubmissions[index] = {
            ...existing,
            ...update,
            updatedAt: new Date(),
          };
          return store.projectSubmissions[index];
        }
        const newProj: InMemProjectSubmission = {
          id: where.id && where.id !== 'new-uuid-placeholder' ? where.id : `proj-${Date.now()}`,
          mentorshipId: create.mentorshipId,
          title: create.title,
          description: create.description,
          githubUrl: create.githubUrl,
          liveDemoUrl: create.liveDemoUrl ?? null,
          additionalLinks: create.additionalLinks ?? null,
          status: create.status ?? 'SUBMITTED',
          mentorFeedback: null,
          adminFeedback: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        store.projectSubmissions.unshift(newProj);
        return newProj;
      },
    },

    certification: {
      upsert: async ({ where, create }: any) => {
        const existing = store.certifications.find(
          c => (where.mentorshipId && c.mentorshipId === where.mentorshipId) ||
               (where.userId_skillId && c.userId === where.userId_skillId.userId && c.skillId === where.userId_skillId.skillId)
        );
        if (existing) return existing;

        const newCert: InMemCertification = {
          id: `cert-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
          userId: create.userId,
          skillId: create.skillId,
          mentorshipId: create.mentorshipId,
          issueDate: new Date(),
          certificateId: `CERT-${Date.now().toString(36).toUpperCase()}`,
        };
        store.certifications.push(newCert);
        return newCert;
      },
    },

    $transaction: async (operations: any[] | ((tx: any) => Promise<any>)) => {
      if (typeof operations === 'function') {
        return operations(inMemoryClient);
      }
      return Promise.all(operations);
    },
  };
}

const inMemoryClient = createInMemoryClient();

// ---------------------------------------------------------------------------
// PRISMA CLIENT SINGLETON WITH AUTOMATIC FALLBACK
// ---------------------------------------------------------------------------

/**
 * Normalizes PostgreSQL connection URLs to ensure special characters in passwords
 * (like #, @, $, %, etc.) are safely percent-encoded for Node.js URL parser.
 */
function sanitizeDatabaseUrl(urlStr: string): string {
  try {
    // Attempt standard URL parse first
    new URL(urlStr);
    return urlStr;
  } catch {
    // If standard parsing fails due to unencoded special characters in the credentials:
    // Format: postgresql://[user]:[password]@[host]:[port]/[database]...
    const match = urlStr.match(/^((?:postgresql|postgres):\/\/[^:]+:)(.*)(@[^@]+)$/);
    if (match) {
      const [, prefix, rawPassword, suffix] = match;
      return `${prefix}${encodeURIComponent(rawPassword)}${suffix}`;
    }
    return urlStr;
  }
}

const prismaClientSingleton = () => {
  const dbUrl = process.env.DATABASE_URL;

  // If no external DATABASE_URL is configured or it points to an undefined/dummy value,
  // use the in-memory fallback client directly.
  if (!dbUrl || dbUrl === 'undefined' || dbUrl.trim() === '') {
    return inMemoryClient;
  }

  try {
    const sanitizedUrl = sanitizeDatabaseUrl(dbUrl);
    const pool = new Pool({
      connectionString: sanitizedUrl,
      ssl: { rejectUnauthorized: false },
      max: 10,
    });
    const adapter = new PrismaPg(pool);
    const client = new PrismaClient({ adapter });

    // Proxy the Prisma client so that if any database query throws a network/connection error,
    // it seamlessly falls back to the in-memory client without crashing the request.
    return new Proxy(client, {
      get(target: any, prop: string) {
        if (prop in inMemoryClient && !(prop in target)) {
          return (inMemoryClient as any)[prop];
        }
        const orig = target[prop];
        if (typeof orig === 'function') {
          return orig.bind(target);
        }
        if (orig && typeof orig === 'object') {
          return new Proxy(orig, {
            get(subTarget: any, subProp: string) {
              const subOrig = subTarget[subProp];
              if (typeof subOrig === 'function') {
                return async (...args: any[]) => {
                  try {
                    return await subOrig.apply(subTarget, args);
                  } catch (err: any) {
                    console.warn(`[Database Fallback] Query failed on ${prop}.${subProp}, switching to in-memory store:`, err?.message || err);
                    const fallbackModel = (inMemoryClient as any)[prop];
                    if (fallbackModel && typeof fallbackModel[subProp] === 'function') {
                      return fallbackModel[subProp](...args);
                    }
                    throw err;
                  }
                };
              }
              return subOrig;
            },
          });
        }
        return orig;
      },
    });
  } catch (error) {
    console.warn('[Database Fallback] Failed to initialize PrismaClient pool, using in-memory store:', error);
    return inMemoryClient;
  }
};

const prisma: ReturnType<typeof createInMemoryClient> = globalThis.prismaGlobal ?? prismaClientSingleton();

export default prisma;

if (process.env.NODE_ENV !== 'production') globalThis.prismaGlobal = prisma;

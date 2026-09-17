'use server';

import prisma from '@/lib/prisma';
import { MAX_ACTIVE_MENTORSHIPS } from '@/lib/constants';

/**
 * Server Action: fetchMentorsBySkill
 * 
 * Fetches a paginated list of available mentors for a specific skill.
 * We use this both for the initial server render and for the "Load More" button on the client.
 * 
 * Availability Rule:
 * Mentors with count of active mentorships (status = 'ACTIVE') >= MAX_ACTIVE_MENTORSHIPS (5)
 * are excluded so students are only connected with peers who have active bandwidth to mentor.
 * 
 * Query Strategy:
 * Uses Option B (single batch query on Mentorship) to compute mentor capacity in O(1) time per candidate
 * without incurring N+1 database roundtrips.
 * 
 * @param skillId - The UUID of the selected skill
 * @param skip - How many records to skip (for pagination)
 * @param take - How many records to return (defaults to 10)
 */
export async function fetchMentorsBySkill(skillId: string, skip: number = 0, take: number = 10) {
  // 1. Batch query active mentorships to compute each mentor's current capacity load
  const activeMentorships = await prisma.mentorship.findMany({
    where: { status: 'ACTIVE' },
    select: { mentorId: true },
  });

  const mentorLoad = new Map<string, number>();
  for (const m of activeMentorships) {
    mentorLoad.set(m.mentorId, (mentorLoad.get(m.mentorId) || 0) + 1);
  }

  // Identify mentors at or over capacity limit
  const busyMentorIds = Array.from(mentorLoad.entries())
    .filter(([, count]) => count >= MAX_ACTIVE_MENTORSHIPS)
    .map(([mentorId]) => mentorId);

  // 2. Query mentors with the requested skill, excluding busy mentors
  const mentors = await prisma.user.findMany({
    where: {
      userSkills: {
        some: { skillId },
      },
      ...(busyMentorIds.length > 0 ? { id: { notIn: busyMentorIds } } : {}),
    },
    include: {
      userSkills: {
        include: { skill: true },
      },
    },
    // We order by creation date so the pagination remains stable
    orderBy: { createdAt: 'desc' },
    skip,
    take,
  });

  // Safe fallback filter ensuring complete compatibility with both SQL and in-memory stores
  return mentors.filter((m: any) => (mentorLoad.get(m.id) || 0) < MAX_ACTIVE_MENTORSHIPS);
}

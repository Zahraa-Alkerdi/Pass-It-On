/**
 * Global Platform Constants
 * 
 * Central configuration values governing business logic, capacity thresholds,
 * and mentorship economics across the PassItOn application.
 */

/**
 * Maximum number of concurrent active mentorships a single mentor can undertake.
 * 
 * Why: To prevent mentor burnout and guarantee high-quality, focused guidance for every
 * student, mentors who reach or exceed this threshold are dynamically excluded from
 * discovery in both the AI Matchmaker and manual Search directories until existing
 * mentorship cycles reach completion.
 */
export const MAX_ACTIVE_MENTORSHIPS = 5;

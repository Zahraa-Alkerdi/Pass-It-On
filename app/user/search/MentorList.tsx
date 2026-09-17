'use client'; // Client Component to maintain state for pagination

import { useState } from 'react';
import { fetchMentorsBySkill } from './actions';
import { requestMentorship } from './requestAction';
import CelebrationPopup from '@/components/ui/CelebrationPopup';

interface MentorListProps {
  initialMentors: any[];
  skillId: string;
}

/**
 * MentorList Component
 * 
 * Renders the grid of mentors for a specific skill.
 * It takes the first 10 mentors as an initial prop from the server,
 * and maintains its own state to fetch and append more mentors when the user clicks "Load More".
 */
export default function MentorList({ initialMentors, skillId }: MentorListProps) {
  // ---------------------------------------------------------------------------
  // STATE
  // ---------------------------------------------------------------------------
  // Holds the continuously growing list of mentors
  const [mentors, setMentors] = useState(initialMentors);
  
  // Tracks whether we are currently fetching more from the database
  const [isLoading, setIsLoading] = useState(false);
  
  // If the server returns exactly 10, there MIGHT be more. If < 10, there are definitely no more.
  const [hasMore, setHasMore] = useState(initialMentors.length === 10);

  // Track the status of mentorship requests by mentorId ('idle' | 'loading' | 'success' | error message)
  const [requestStatus, setRequestStatus] = useState<Record<string, string>>({});

  // Controls visibility of the motivational mascot celebration popup
  const [showCelebration, setShowCelebration] = useState<boolean>(false);

  // ---------------------------------------------------------------------------
  // HANDLERS
  // ---------------------------------------------------------------------------
  /**
   * Fetches the next batch of mentors based on the current length of the array.
   */
  const handleLoadMore = async () => {
    setIsLoading(true);
    try {
      // Fetch the next 10 mentors by skipping the ones we already have
      const nextBatch = await fetchMentorsBySkill(skillId, mentors.length, 10);
      
      // If we received fewer than 10, we've hit the end of the database results
      if (nextBatch.length < 10) {
        setHasMore(false);
      }
      
      // Append the new batch to our existing state
      setMentors((prev) => [...prev, ...nextBatch]);
    } catch (error) {
      console.error("Failed to load more mentors:", error);
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Handles requesting mentorship from a specific mentor.
   * 
   * Non-Blocking Behavior:
   * Fires the visual celebration popup immediately without awaiting the async database request.
   */
  const handleRequest = async (mentorId: string) => {
    // 1. Immediately trigger the non-blocking celebration popup
    setShowCelebration(true);

    // 2. Concurrently submit the actual mentorship request to the database
    setRequestStatus(prev => ({ ...prev, [mentorId]: 'loading' }));
    
    try {
      const result = await requestMentorship(mentorId, skillId);
      
      if (result.error) {
        setRequestStatus(prev => ({ ...prev, [mentorId]: result.error }));
      } else {
        setRequestStatus(prev => ({ ...prev, [mentorId]: 'success' }));
      }
    } catch (error) {
      setRequestStatus(prev => ({ ...prev, [mentorId]: 'An unexpected error occurred.' }));
    }
  };

  // ---------------------------------------------------------------------------
  // RENDER UI
  // ---------------------------------------------------------------------------
  if (mentors.length === 0) {
    return (
      <div className="bg-slate-50 border border-slate-200 rounded-xl p-8 text-center">
        <p className="text-slate-500 text-lg">No mentors are currently available for this skill.</p>
        <p className="text-slate-400 mt-2">Try searching for something else!</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* MENTOR GRID */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {mentors.map(mentor => (
          <div key={mentor.id} className="bg-white border border-slate-200 shadow-sm rounded-xl p-6 hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-lg text-slate-900">{mentor.name}</h3>
              <span className="bg-emerald-100 text-emerald-700 text-xs font-bold px-2 py-1 rounded-full uppercase tracking-wide">
                Mentor
              </span>
            </div>
            
            {/* Safely render the bio or a fallback */}
            <p className="text-slate-600 text-sm mb-4 line-clamp-3">
              {mentor.bio || "This mentor hasn't written a bio yet."}
            </p>
            
            {/* Display a small badge for every skill this mentor has */}
            <div className="flex flex-wrap gap-2 mb-6">
              {mentor.userSkills?.map((us: any) => (
                <span key={us.skill.id} className="bg-slate-100 text-slate-600 text-xs px-2 py-1 rounded-md">
                  {us.skill.name}
                </span>
              ))}
            </div>
            
            {/* Request Mentorship Button & Status Messages */}
            <div className="mt-auto pt-4 border-t border-slate-100">
              {requestStatus[mentor.id] === 'success' ? (
                <div className="text-emerald-600 bg-emerald-50 text-center font-semibold py-2 px-4 rounded-lg border border-emerald-200">
                  Request Sent!
                </div>
              ) : (
                <div className="space-y-2">
                  <button 
                    onClick={() => handleRequest(mentor.id)}
                    disabled={requestStatus[mentor.id] === 'loading'}
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-4 rounded-lg transition-colors disabled:bg-blue-400 flex justify-center"
                  >
                    {requestStatus[mentor.id] === 'loading' ? (
                      <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    ) : (
                      'Request Mentorship'
                    )}
                  </button>
                  
                  {/* Error Message */}
                  {requestStatus[mentor.id] && requestStatus[mentor.id] !== 'loading' && requestStatus[mentor.id] !== 'success' && (
                    <p className="text-red-500 text-xs text-center px-1">
                      {requestStatus[mentor.id]}
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* LOAD MORE BUTTON */}
      {hasMore && (
        <div className="flex justify-center pt-4">
          <button 
            onClick={handleLoadMore} 
            disabled={isLoading}
            className="px-6 py-3 bg-slate-900 text-white font-semibold rounded-lg hover:bg-slate-800 transition-colors disabled:bg-slate-700 flex items-center justify-center min-w-[200px]"
          >
            {isLoading ? (
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              'Load More Mentors'
            )}
          </button>
        </div>
      )}

      {/* NON-BLOCKING VISUAL CELEBRATION OVERLAY */}
      <CelebrationPopup
        isOpen={showCelebration}
        onClose={() => setShowCelebration(false)}
      />
    </div>
  );
}

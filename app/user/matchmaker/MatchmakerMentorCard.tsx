'use client';

/**
 * MatchmakerMentorCard Component
 * 
 * Displays an interactive mentor match card inside the AI chat timeline.
 * Allows the student to inspect the mentor's skills, compatibility reason,
 * and trigger a direct mentorship request with one click without leaving the chat.
 */

import { useState } from 'react';
import { requestMentorship } from '@/app/user/search/requestAction';
import { Sparkles, CheckCircle2, AlertCircle, ArrowRight, UserCheck } from 'lucide-react';
import type { RecommendedMentor } from './actions';
import CelebrationPopup from '@/components/ui/CelebrationPopup';

interface MatchmakerMentorCardProps {
  mentor: RecommendedMentor;
}

export default function MatchmakerMentorCard({ mentor }: MatchmakerMentorCardProps) {
  // Select the default skill to request mentorship for (prefer the first verified skill)
  const [selectedSkillId, setSelectedSkillId] = useState<string>(
    mentor.skills[0]?.id || ''
  );
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [statusMessage, setStatusMessage] = useState<string>('');
  // Controls visibility of the motivational mascot celebration popup
  const [showCelebration, setShowCelebration] = useState<boolean>(false);

  const handleSendRequest = async () => {
    if (!selectedSkillId) return;

    // 1. Immediately trigger the non-blocking celebration popup
    setShowCelebration(true);

    // 2. Concurrently execute the database request
    setStatus('loading');
    setStatusMessage('');

    try {
      const res = await requestMentorship(mentor.id, selectedSkillId);
      if (res.error) {
        setStatus('error');
        setStatusMessage(res.error);
      } else {
        setStatus('success');
        setStatusMessage('Mentorship request sent! They will see it in their incoming requests.');
      }
    } catch (err: any) {
      setStatus('error');
      setStatusMessage(err?.message || 'Failed to send mentorship request.');
    }
  };

  return (
    <div
      id={`match-card-${mentor.id}`}
      className="bg-white border border-slate-200 hover:border-indigo-200 transition-all rounded-xl p-4 shadow-sm space-y-3"
    >
      {/* Header: Mentor Name & Match Score Badge */}
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <h4 className="font-bold text-slate-900 text-base">{mentor.name}</h4>
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-full border border-indigo-100">
              <Sparkles className="w-3 h-3 text-indigo-500" />
              {mentor.matchScore}% Match
            </span>
          </div>
          {mentor.bio && (
            <p className="text-xs text-slate-600 mt-1 line-clamp-2 leading-relaxed">
              {mentor.bio}
            </p>
          )}
        </div>
      </div>

      {/* Match Justification */}
      <div className="bg-slate-50 border border-slate-100 rounded-lg p-2.5 text-xs text-slate-700">
        <span className="font-semibold text-slate-900">Why matched: </span>
        {mentor.matchReason}
      </div>

      {/* Skills Pill Selector */}
      {mentor.skills.length > 0 && (
        <div className="space-y-1.5">
          <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
            Target Skill for Mentorship:
          </label>
          <div className="flex flex-wrap gap-1.5">
            {mentor.skills.map((skill) => {
              const isSelected = skill.id === selectedSkillId;
              return (
                <button
                  key={skill.id}
                  type="button"
                  onClick={() => setSelectedSkillId(skill.id)}
                  disabled={status === 'success' || status === 'loading'}
                  className={`text-xs px-2.5 py-1 rounded-md font-medium transition-colors ${
                    isSelected
                      ? 'bg-indigo-600 text-white shadow-xs'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  {skill.name}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Status Feedback / Alert */}
      {status === 'success' && (
        <div className="flex items-center gap-2 text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg p-2.5">
          <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
          <span>{statusMessage}</span>
        </div>
      )}

      {status === 'error' && (
        <div className="flex items-center gap-2 text-xs font-medium text-rose-700 bg-rose-50 border border-rose-200 rounded-lg p-2.5">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>{statusMessage}</span>
        </div>
      )}

      {/* Action Button */}
      {status !== 'success' && (
        <button
          id={`request-btn-${mentor.id}`}
          type="button"
          onClick={handleSendRequest}
          disabled={status === 'loading' || !selectedSkillId}
          className="w-full flex items-center justify-center gap-2 bg-slate-900 hover:bg-indigo-600 text-white font-medium text-xs py-2.5 px-4 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
        >
          {status === 'loading' ? (
            <span className="flex items-center gap-2">
              <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              Sending Request...
            </span>
          ) : (
            <>
              <UserCheck className="w-3.5 h-3.5" />
              Request Mentorship from {mentor.name}
              <ArrowRight className="w-3.5 h-3.5 ml-auto" />
            </>
          )}
        </button>
      )}

      {/* Non-blocking visual celebration overlay */}
      <CelebrationPopup
        isOpen={showCelebration}
        onClose={() => setShowCelebration(false)}
      />
    </div>
  );
}

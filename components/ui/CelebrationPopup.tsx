'use client';

import React, { useState, useEffect } from 'react';

/**
 * ============================================================================
 * CELEBRATION POPUP COMPONENT (components/ui/CelebrationPopup.tsx)
 * ============================================================================
 * 
 * Purpose:
 * A lightweight, non-blocking visual celebration overlay triggered when a student
 * clicks "Request Mentorship". Reinforces the platform's pay-it-forward relay theme
 * with a friendly, custom-drawn inline SVG Torch/Baton mascot.
 * 
 * Animation & Interaction Lifecycle:
 * 1. Modal Mounts: Enters with a gentle pop-bounce scale transition over a semi-transparent dimmed backdrop.
 * 2. Pose 1 (0ms - 550ms): The mascot lands in a steady, poised "Ready" pose holding its calm flame.
 * 3. Pose 2 (550ms - 2200ms): The mascot bursts into a triumphant "Celebrating" pose — arms thrown in the air,
 *    flame expanding with sparks, and a joyful arched-eye smile.
 * 4. Auto-Dismiss: Auto-dismisses at 2.2s, or dismisses immediately if the user taps/clicks anywhere.
 * 
 * Non-Blocking Guarantee:
 * This overlay is purely cosmetic and does NOT prevent or await the actual async mentorship
 * request submission.
 */

// A curated pool of upbeat, commitment-oriented motivational lines (under 8 words)
const CELEBRATION_MESSAGES = [
  "Locked in. Let's go!",
  "No backing out now! 💪",
  "You just leveled up your journey!",
  "Target acquired. Time to build!",
  "Torch passed. Time to shine!",
  "Pledge made. You've got this!",
];

interface CelebrationPopupProps {
  /** Controls visibility of the popup */
  isOpen: boolean;
  /** Callback to close the popup */
  onClose: () => void;
}

/**
 * Custom Inline SVG Mascot: "Baton the Torch"
 * Renders two responsive states: 'ready' (calm handoff) and 'celebrating' (triumphant victory cheer).
 */
function TorchMascot({ isCelebrating }: { isCelebrating: boolean }) {
  return (
    <div className="relative w-32 h-36 mx-auto mb-2 flex items-center justify-center select-none">
      <svg
        viewBox="0 0 120 140"
        className={`w-full h-full transition-transform duration-500 ease-out ${
          isCelebrating ? 'scale-110 -translate-y-1' : 'scale-100 translate-y-0'
        }`}
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          {/* Warm metallic gradient for the baton body */}
          <linearGradient id="batonBodyGrad" x1="46" y1="55" x2="74" y2="115" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#FDE68A" />
            <stop offset="40%" stopColor="#F59E0B" />
            <stop offset="100%" stopColor="#D97706" />
          </linearGradient>

          {/* Outer flame gradient */}
          <linearGradient id="outerFlameGrad" x1="60" y1="10" x2="60" y2="58" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#EF4444" />
            <stop offset="60%" stopColor="#F97316" />
            <stop offset="100%" stopColor="#F59E0B" />
          </linearGradient>

          {/* Inner flame core gradient */}
          <linearGradient id="innerFlameGrad" x1="60" y1="20" x2="60" y2="58" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#FEF08A" />
            <stop offset="100%" stopColor="#FBBF24" />
          </linearGradient>
        </defs>

        {/* ================================================================== */}
        {/* FLAME & CELEBRATION SPARKS */}
        {/* ================================================================== */}
        {/* Twin celebration starburst sparks (visible only when celebrating) */}
        {isCelebrating && (
          <g className="animate-pulse transition-opacity duration-300">
            {/* Left Sparkle */}
            <path
              d="M 28 30 Q 33 30 33 25 Q 33 30 38 30 Q 33 30 33 35 Q 33 30 28 30 Z"
              fill="#F59E0B"
            />
            {/* Right Sparkle */}
            <path
              d="M 82 24 Q 87 24 87 19 Q 87 24 92 24 Q 87 24 87 29 Q 87 24 82 24 Z"
              fill="#F59E0B"
            />
          </g>
        )}

        {/* Outer Flame: morphs between calm teardrop and large energetic flare */}
        <path
          d={
            isCelebrating
              ? "M 60 8 C 76 18 84 38 76 56 C 70 59 50 59 44 56 C 36 38 44 18 60 8 Z"
              : "M 60 22 C 72 32 74 46 70 56 C 66 58 54 58 50 56 C 46 46 48 32 60 22 Z"
          }
          fill="url(#outerFlameGrad)"
          className="transition-all duration-300 ease-out origin-bottom"
        />

        {/* Inner Bright Flame Core */}
        <path
          d={
            isCelebrating
              ? "M 60 22 C 70 30 72 44 68 56 C 64 57 56 57 52 56 C 48 44 50 30 60 22 Z"
              : "M 60 32 C 67 38 68 48 65 56 C 62 57 58 57 55 56 C 52 48 53 38 60 32 Z"
          }
          fill="url(#innerFlameGrad)"
          className="transition-all duration-300 ease-out"
        />

        {/* ================================================================== */}
        {/* ARMS */}
        {/* ================================================================== */}
        {/* 
          Pose 1: Arms resting calmly against the baton body.
          Pose 2: Arms thrown upward into the air celebrating.
        */}
        {isCelebrating ? (
          // Celebrating Arms (High in the air)
          <g stroke="#D97706" strokeWidth="4.5" strokeLinecap="round" className="transition-all duration-300">
            {/* Left Arm High */}
            <path d="M 47 72 C 38 66 30 52 26 42" />
            <circle cx="26" cy="42" r="3" fill="#F59E0B" stroke="none" />
            {/* Right Arm High */}
            <path d="M 73 72 C 82 66 90 52 94 42" />
            <circle cx="94" cy="42" r="3" fill="#F59E0B" stroke="none" />
          </g>
        ) : (
          // Ready Arms (Relaxed by side)
          <g stroke="#D97706" strokeWidth="4.5" strokeLinecap="round" className="transition-all duration-300">
            {/* Left Arm Relaxed */}
            <path d="M 47 76 C 38 82 34 90 38 98" />
            <circle cx="38" cy="98" r="3" fill="#F59E0B" stroke="none" />
            {/* Right Arm Relaxed */}
            <path d="M 73 76 C 82 82 86 90 82 98" />
            <circle cx="82" cy="98" r="3" fill="#F59E0B" stroke="none" />
          </g>
        )}

        {/* ================================================================== */}
        {/* BATON BODY & GRIP */}
        {/* ================================================================== */}
        {/* Main Baton Cylinder with pill rounded corners */}
        <rect x="46" y="55" width="28" height="60" rx="14" fill="url(#batonBodyGrad)" stroke="#D97706" strokeWidth="2" />

        {/* Grip detail band across lower half */}
        <rect x="47" y="86" width="26" height="5" fill="#B45309" rx="1.5" />
        <rect x="47" y="94" width="26" height="5" fill="#B45309" rx="1.5" />

        {/* ================================================================== */}
        {/* FACE (EYES, BLUSH, SMILE) */}
        {/* ================================================================== */}
        {/* Cheerful pink blush on both cheeks */}
        <ellipse cx="51" cy="74" rx="3" ry="2" fill="#FDA4AF" opacity="0.8" />
        <ellipse cx="69" cy="74" rx="3" ry="2" fill="#FDA4AF" opacity="0.8" />

        {isCelebrating ? (
          // Celebrating Face: joyful arched squinting eyes + wide open smile
          <g>
            {/* Left Arched Eye */}
            <path d="M 51 68 Q 54 63 57 68" stroke="#1E293B" strokeWidth="2.4" strokeLinecap="round" fill="none" />
            {/* Right Arched Eye */}
            <path d="M 63 68 Q 66 63 69 68" stroke="#1E293B" strokeWidth="2.4" strokeLinecap="round" fill="none" />
            {/* Wide Open Smile with tongue */}
            <path d="M 55 74 Q 60 83 65 74 Z" fill="#E11D48" stroke="#1E293B" strokeWidth="1.6" strokeLinejoin="round" />
            <ellipse cx="60" cy="78" rx="2.5" ry="1.5" fill="#FDA4AF" />
          </g>
        ) : (
          // Ready Face: attentive round eyes with white catchlight + gentle smile
          <g>
            {/* Left Eye */}
            <circle cx="54" cy="68" r="2.8" fill="#1E293B" />
            <circle cx="53" cy="67" r="1.0" fill="#FFFFFF" />
            {/* Right Eye */}
            <circle cx="66" cy="68" r="2.8" fill="#1E293B" />
            <circle cx="65" cy="67" r="1.0" fill="#FFFFFF" />
            {/* Gentle Smile */}
            <path d="M 56 75 Q 60 79 64 75" stroke="#1E293B" strokeWidth="2.0" strokeLinecap="round" fill="none" />
          </g>
        )}
      </svg>
    </div>
  );
}

/**
 * Internal modal content rendered only when open.
 * Mounting this component naturally initializes the random message and triggers the sequence.
 */
function CelebrationModalContent({ onClose }: { onClose: () => void }) {
  // Current mascot pose: false = Ready (Pose 1), true = Celebrating (Pose 2)
  const [isCelebrating, setIsCelebrating] = useState<boolean>(false);
  
  // Pick a random punchy line on initial mount
  const [message] = useState<string>(() => {
    const randomIndex = Math.floor(Math.random() * CELEBRATION_MESSAGES.length);
    return CELEBRATION_MESSAGES[randomIndex];
  });

  // Handle pose transition sequence and auto-dismiss timer
  useEffect(() => {
    // Stage 1: Transition from Pose 1 (Ready) to Pose 2 (Celebrating) after 550ms
    const poseTimer = setTimeout(() => {
      setIsCelebrating(true);
    }, 550);

    // Stage 2: Auto-dismiss after 2200ms total
    const dismissTimer = setTimeout(() => {
      onClose();
    }, 2200);

    // Clean up timers if the user dismisses early or the component unmounts
    return () => {
      clearTimeout(poseTimer);
      clearTimeout(dismissTimer);
    };
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-[2px] transition-opacity duration-200 cursor-pointer animate-in fade-in"
    >
      {/* Centered Celebration Card */}
      <div
        onClick={(e) => {
          // Allow tapping anywhere on card to close as well
          e.stopPropagation();
          onClose();
        }}
        className="bg-white/95 border-2 border-amber-200/90 shadow-2xl rounded-3xl p-6 sm:p-7 text-center max-w-xs w-full select-none cursor-pointer transform transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]"
        style={{
          animation: 'popBounce 350ms cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards',
        }}
      >
        {/* Mascot Character with Pose Transitions */}
        <TorchMascot isCelebrating={isCelebrating} />

        {/* Motivational Headline */}
        <h3 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight leading-snug mb-1">
          {message}
        </h3>

        {/* Encouraging Context Subtitle */}
        <p className="text-xs font-semibold text-amber-700 mt-1">
          Mentorship request sent to your peer!
        </p>

        {/* Subtle tap to dismiss hint */}
        <div className="text-[10px] text-slate-400 font-medium mt-4 tracking-wide uppercase">
          Tap anywhere to close
        </div>
      </div>

      {/* Inline Keyframes for springy pop-in bounce */}
      <style jsx>{`
        @keyframes popBounce {
          0% {
            opacity: 0;
            transform: scale(0.65) translateY(12px);
          }
          70% {
            opacity: 1;
            transform: scale(1.06) translateY(-4px);
          }
          100% {
            opacity: 1;
            transform: scale(1) translateY(0);
          }
        }
      `}</style>
    </div>
  );
}

/**
 * Main Celebration Popup Component
 */
export default function CelebrationPopup({ isOpen, onClose }: CelebrationPopupProps) {
  // If not open, render nothing to maintain clean DOM
  if (!isOpen) return null;

  return <CelebrationModalContent onClose={onClose} />;
}

'use client';

import { useState, useEffect } from 'react';
import type { BlueprintSection } from '@/lib/supabase';

interface BlueprintProgressTrackerProps {
  section: BlueprintSection;
  isGenerating: boolean;
}

interface Stage {
  label: string;
  duration: number; // seconds to spend on this stage
}

const SECTION_STAGES: Record<BlueprintSection, Stage[]> = {
  pareto: [
    { label: 'Analyzing app data and reviews...', duration: 3 },
    { label: 'Identifying core value proposition...', duration: 4 },
    { label: 'Mapping Pareto features (20/80)...', duration: 5 },
    { label: 'Designing onboarding strategy...', duration: 4 },
    { label: 'Formulating monetization approach...', duration: 4 },
    { label: 'Reviewing architecture decisions...', duration: 3 },
    { label: 'Polishing final strategy...', duration: 5 },
  ],
  wireframes: [
    { label: 'Reading strategy document...', duration: 2 },
    { label: 'Planning screen flow...', duration: 4 },
    { label: 'Designing onboarding screens...', duration: 5 },
    { label: 'Mapping main feature screens...', duration: 6 },
    { label: 'Detailing paywall and settings...', duration: 4 },
    { label: 'Adding UI element specifications...', duration: 4 },
    { label: 'Reviewing wireframe consistency...', duration: 3 },
  ],
  tech_stack: [
    { label: 'Analyzing feature requirements...', duration: 3 },
    { label: 'Selecting iOS framework stack...', duration: 4 },
    { label: 'Identifying required iPhone APIs...', duration: 4 },
    { label: 'Evaluating backend services...', duration: 4 },
    { label: 'Researching third-party SDKs...', duration: 5 },
    { label: 'Reviewing technical compatibility...', duration: 3 },
    { label: 'Finalizing recommendations...', duration: 4 },
  ],
  prd: [
    { label: 'Synthesizing all sections...', duration: 3 },
    { label: 'Writing executive summary...', duration: 4 },
    { label: 'Defining problem and users...', duration: 4 },
    { label: 'Detailing feature requirements...', duration: 6 },
    { label: 'Setting success metrics...', duration: 4 },
    { label: 'Planning timeline and risks...', duration: 4 },
    { label: 'Final review and polish...', duration: 5 },
  ],
  manifest: [
    { label: 'Reading blueprint sections...', duration: 2 },
    { label: 'Extracting app metadata...', duration: 3 },
    { label: 'Compiling feature list...', duration: 4 },
    { label: 'Mapping technology requirements...', duration: 4 },
    { label: 'Generating file structure...', duration: 5 },
    { label: 'Creating build configuration...', duration: 4 },
    { label: 'Finalizing manifest...', duration: 3 },
  ],
};

export default function BlueprintProgressTracker({
  section,
  isGenerating,
}: BlueprintProgressTrackerProps) {
  const [currentStageIndex, setCurrentStageIndex] = useState(0);
  const [stageProgress, setStageProgress] = useState(0);
  const [elapsedTime, setElapsedTime] = useState(0);

  const stages = SECTION_STAGES[section];
  const currentStage = stages[currentStageIndex];
  const totalStages = stages.length;

  // Calculate overall progress
  const completedStagesProgress = (currentStageIndex / totalStages) * 100;
  const currentStageContribution = (stageProgress / 100) * (1 / totalStages) * 100;
  const overallProgress = Math.min(completedStagesProgress + currentStageContribution, 95);

  useEffect(() => {
    if (!isGenerating) {
      setCurrentStageIndex(0);
      setStageProgress(0);
      setElapsedTime(0);
      return;
    }

    const interval = setInterval(() => {
      setElapsedTime((prev) => prev + 0.1);

      setStageProgress((prev) => {
        const newProgress = prev + (100 / (currentStage.duration * 10));

        if (newProgress >= 100) {
          // Move to next stage
          if (currentStageIndex < totalStages - 1) {
            setCurrentStageIndex((idx) => idx + 1);
            return 0;
          }
          // Stay at last stage but keep cycling
          return 0;
        }

        return newProgress;
      });
    }, 100);

    return () => clearInterval(interval);
  }, [isGenerating, currentStageIndex, currentStage.duration, totalStages]);

  if (!isGenerating) return null;

  return (
    <div className="py-12 px-6">
      {/* Main progress container */}
      <div className="max-w-md mx-auto">
        {/* Animated icon */}
        <div className="flex justify-center mb-6">
          <div className="relative">
            <div className="w-16 h-16 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
              <svg
                className="w-8 h-8 text-blue-600 dark:text-blue-400 animate-pulse"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
                />
              </svg>
            </div>
            {/* Spinning ring */}
            <div className="absolute inset-0 w-16 h-16">
              <svg className="w-full h-full animate-spin" style={{ animationDuration: '3s' }} viewBox="0 0 64 64">
                <circle
                  cx="32"
                  cy="32"
                  r="30"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeDasharray="30 60"
                  className="text-blue-600 dark:text-blue-400 opacity-30"
                />
              </svg>
            </div>
          </div>
        </div>

        {/* Current stage label */}
        <p className="text-center text-gray-700 dark:text-gray-300 font-medium mb-4 min-h-[1.5rem]">
          {currentStage.label}
        </p>

        {/* Progress bar */}
        <div className="relative h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden mb-3">
          <div
            className="absolute inset-y-0 left-0 bg-gradient-to-r from-blue-500 to-blue-600 rounded-full transition-all duration-300 ease-out"
            style={{ width: `${overallProgress}%` }}
          />
          {/* Shimmer effect */}
          <div
            className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent"
            style={{
              animation: 'shimmer 2s infinite',
              transform: 'translateX(-100%)',
            }}
          />
        </div>

        {/* Progress stats */}
        <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400">
          <span>Step {currentStageIndex + 1} of {totalStages}</span>
          <span>{Math.round(overallProgress)}%</span>
        </div>

        {/* Stage indicators */}
        <div className="flex justify-center gap-1.5 mt-6">
          {stages.map((_, idx) => (
            <div
              key={idx}
              className={`w-2 h-2 rounded-full transition-all duration-300 ${
                idx < currentStageIndex
                  ? 'bg-blue-600 dark:bg-blue-400'
                  : idx === currentStageIndex
                  ? 'bg-blue-600 dark:bg-blue-400 scale-125'
                  : 'bg-gray-300 dark:bg-gray-600'
              }`}
            />
          ))}
        </div>

        {/* Elapsed time */}
        <p className="text-center text-xs text-gray-400 mt-4">
          {Math.floor(elapsedTime)}s elapsed
        </p>
      </div>

      {/* CSS for shimmer animation */}
      <style jsx>{`
        @keyframes shimmer {
          0% {
            transform: translateX(-100%);
          }
          100% {
            transform: translateX(100%);
          }
        }
      `}</style>
    </div>
  );
}

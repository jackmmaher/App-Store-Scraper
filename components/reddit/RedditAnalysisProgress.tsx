'use client';

import { useState, useEffect } from 'react';

export type RedditAnalysisStage =
  | 'idle'
  | 'crawling'
  | 'analyzing'
  | 'storing'
  | 'complete'
  | 'error';

interface RedditAnalysisProgressProps {
  stage: RedditAnalysisStage;
  error?: string | null;
}

interface StageConfig {
  label: string;
  description: string;
  duration: number; // estimated seconds
  icon: 'search' | 'brain' | 'database' | 'check';
}

const STAGES: Record<Exclude<RedditAnalysisStage, 'idle' | 'complete' | 'error'>, StageConfig> = {
  crawling: {
    label: 'Crawling Reddit',
    description: 'Searching subreddits and fetching posts with comments...',
    duration: 120, // 2 minutes estimate
    icon: 'search',
  },
  analyzing: {
    label: 'AI Analysis',
    description: 'Extracting unmet needs, sentiment, and language patterns...',
    duration: 45, // 45 seconds estimate
    icon: 'brain',
  },
  storing: {
    label: 'Saving Results',
    description: 'Storing analysis in database...',
    duration: 5,
    icon: 'database',
  },
};

const STAGE_ORDER: (keyof typeof STAGES)[] = ['crawling', 'analyzing', 'storing'];

function StageIcon({ icon, isActive }: { icon: StageConfig['icon']; isActive: boolean }) {
  const baseClass = `w-5 h-5 ${isActive ? 'text-orange-500' : 'text-gray-400'}`;

  switch (icon) {
    case 'search':
      return (
        <svg className={baseClass} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
      );
    case 'brain':
      return (
        <svg className={baseClass} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
        </svg>
      );
    case 'database':
      return (
        <svg className={baseClass} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" />
        </svg>
      );
    case 'check':
      return (
        <svg className={baseClass} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
      );
  }
}

export default function RedditAnalysisProgress({
  stage,
  error,
}: RedditAnalysisProgressProps) {
  const [elapsedTime, setElapsedTime] = useState(0);
  const [stageElapsed, setStageElapsed] = useState(0);
  const [subStageIndex, setSubStageIndex] = useState(0);

  const currentStageIndex = STAGE_ORDER.indexOf(stage as keyof typeof STAGES);
  const isActive = stage !== 'idle' && stage !== 'complete' && stage !== 'error';
  const currentStageConfig = isActive ? STAGES[stage as keyof typeof STAGES] : null;

  // Sub-stages for crawling (to show more detailed progress)
  const crawlingSubStages = [
    'Connecting to Reddit API...',
    'Searching topic keywords...',
    'Fetching matching posts...',
    'Loading comment threads...',
    'Filtering by engagement...',
    'Deduplicating results...',
  ];

  const analyzingSubStages = [
    'Processing post content...',
    'Identifying pain points...',
    'Extracting user quotes...',
    'Analyzing sentiment patterns...',
    'Categorizing by severity...',
    'Generating insights...',
  ];

  // Reset on stage change
  useEffect(() => {
    setStageElapsed(0);
    setSubStageIndex(0);
  }, [stage]);

  // Timer effect
  useEffect(() => {
    if (!isActive) {
      setElapsedTime(0);
      return;
    }

    const interval = setInterval(() => {
      setElapsedTime((prev) => prev + 1);
      setStageElapsed((prev) => prev + 1);
    }, 1000);

    return () => clearInterval(interval);
  }, [isActive]);

  // Sub-stage cycling
  useEffect(() => {
    if (!isActive || !currentStageConfig) return;

    const subStages = stage === 'crawling' ? crawlingSubStages :
                      stage === 'analyzing' ? analyzingSubStages : [];

    if (subStages.length === 0) return;

    const cycleTime = Math.max(5, currentStageConfig.duration / subStages.length);

    const interval = setInterval(() => {
      setSubStageIndex((prev) => (prev + 1) % subStages.length);
    }, cycleTime * 1000);

    return () => clearInterval(interval);
  }, [stage, isActive, currentStageConfig]);

  // Calculate progress
  const calculateProgress = () => {
    if (stage === 'complete') return 100;
    if (stage === 'error' || stage === 'idle') return 0;

    const completedStages = currentStageIndex;
    const totalStages = STAGE_ORDER.length;

    // Base progress from completed stages
    const baseProgress = (completedStages / totalStages) * 100;

    // Progress within current stage (estimate based on time)
    const currentConfig = STAGES[stage as keyof typeof STAGES];
    const stageProgress = Math.min(stageElapsed / currentConfig.duration, 0.95);
    const stageContribution = (stageProgress / totalStages) * 100;

    return Math.min(baseProgress + stageContribution, 95);
  };

  const progress = calculateProgress();

  // Get current sub-stage label
  const getSubStageLabel = () => {
    if (stage === 'crawling') return crawlingSubStages[subStageIndex];
    if (stage === 'analyzing') return analyzingSubStages[subStageIndex];
    if (stage === 'storing') return 'Writing to database...';
    return '';
  };

  if (stage === 'idle') return null;

  if (stage === 'error') {
    return (
      <div className="py-8 px-6">
        <div className="max-w-md mx-auto text-center">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
            <svg className="w-8 h-8 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
          <h3 className="text-lg font-medium text-red-600 dark:text-red-400 mb-2">Analysis Failed</h3>
          <p className="text-sm text-gray-600 dark:text-gray-400">{error || 'An unexpected error occurred'}</p>
        </div>
      </div>
    );
  }

  if (stage === 'complete') {
    return (
      <div className="py-8 px-6">
        <div className="max-w-md mx-auto text-center">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
            <svg className="w-8 h-8 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h3 className="text-lg font-medium text-green-600 dark:text-green-400 mb-2">Analysis Complete</h3>
          <p className="text-sm text-gray-600 dark:text-gray-400">Reddit insights are ready to view</p>
        </div>
      </div>
    );
  }

  return (
    <div className="py-8 px-6">
      <div className="max-w-md mx-auto">
        {/* Animated Reddit icon */}
        <div className="flex justify-center mb-6">
          <div className="relative">
            <div className="w-16 h-16 rounded-full bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center">
              <svg
                className="w-8 h-8 text-orange-500 animate-pulse"
                viewBox="0 0 24 24"
                fill="currentColor"
              >
                <path d="M12 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0zm5.01 4.744c.688 0 1.25.561 1.25 1.249a1.25 1.25 0 0 1-2.498.056l-2.597-.547-.8 3.747c1.824.07 3.48.632 4.674 1.488.308-.309.73-.491 1.207-.491.968 0 1.754.786 1.754 1.754 0 .716-.435 1.333-1.01 1.614a3.111 3.111 0 0 1 .042.52c0 2.694-3.13 4.87-7.004 4.87-3.874 0-7.004-2.176-7.004-4.87 0-.183.015-.366.043-.534A1.748 1.748 0 0 1 4.028 12c0-.968.786-1.754 1.754-1.754.463 0 .898.196 1.207.49 1.207-.883 2.878-1.43 4.744-1.487l.885-4.182a.342.342 0 0 1 .14-.197.35.35 0 0 1 .238-.042l2.906.617a1.214 1.214 0 0 1 1.108-.701z"/>
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
                  className="text-orange-500 opacity-30"
                />
              </svg>
            </div>
          </div>
        </div>

        {/* Current stage title */}
        <h3 className="text-center text-lg font-semibold text-gray-900 dark:text-white mb-1">
          {currentStageConfig?.label}
        </h3>

        {/* Sub-stage description */}
        <p className="text-center text-sm text-gray-600 dark:text-gray-400 mb-6 min-h-[1.25rem]">
          {getSubStageLabel()}
        </p>

        {/* Progress bar */}
        <div className="relative h-3 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden mb-3">
          <div
            className="absolute inset-y-0 left-0 bg-gradient-to-r from-orange-400 to-orange-500 rounded-full transition-all duration-500 ease-out"
            style={{ width: `${progress}%` }}
          />
          {/* Shimmer effect */}
          <div
            className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent animate-shimmer"
          />
        </div>

        {/* Progress stats */}
        <div className="flex justify-between text-sm text-gray-500 dark:text-gray-400 mb-6">
          <span>Step {currentStageIndex + 1} of {STAGE_ORDER.length}</span>
          <span>{Math.round(progress)}%</span>
        </div>

        {/* Stage indicators */}
        <div className="flex justify-between items-center gap-2 mb-6">
          {STAGE_ORDER.map((stageKey, idx) => {
            const config = STAGES[stageKey];
            const isCompleted = idx < currentStageIndex;
            const isCurrent = stageKey === stage;

            return (
              <div key={stageKey} className="flex-1">
                <div className={`flex flex-col items-center p-3 rounded-lg transition-all ${
                  isCurrent
                    ? 'bg-orange-50 dark:bg-orange-900/20 ring-2 ring-orange-500'
                    : isCompleted
                      ? 'bg-green-50 dark:bg-green-900/20'
                      : 'bg-gray-50 dark:bg-gray-800'
                }`}>
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center mb-2 ${
                    isCurrent
                      ? 'bg-orange-100 dark:bg-orange-900/50'
                      : isCompleted
                        ? 'bg-green-100 dark:bg-green-900/50'
                        : 'bg-gray-200 dark:bg-gray-700'
                  }`}>
                    {isCompleted ? (
                      <svg className="w-4 h-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    ) : isCurrent ? (
                      <svg className="w-4 h-4 text-orange-500 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                    ) : (
                      <StageIcon icon={config.icon} isActive={false} />
                    )}
                  </div>
                  <span className={`text-xs font-medium text-center ${
                    isCurrent
                      ? 'text-orange-600 dark:text-orange-400'
                      : isCompleted
                        ? 'text-green-600 dark:text-green-400'
                        : 'text-gray-500 dark:text-gray-400'
                  }`}>
                    {config.label.split(' ')[0]}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Elapsed time */}
        <p className="text-center text-xs text-gray-400">
          {elapsedTime}s elapsed
          {currentStageConfig && stageElapsed < currentStageConfig.duration && (
            <span className="ml-2">
              • ~{Math.max(0, Math.round(currentStageConfig.duration - stageElapsed))}s remaining for this step
            </span>
          )}
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
        .animate-shimmer {
          animation: shimmer 2s infinite;
        }
      `}</style>
    </div>
  );
}

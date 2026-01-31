'use client';

import { useState, useEffect, useRef } from 'react';

export interface ProgressStep {
  id: string;
  label: string;
  status: 'pending' | 'active' | 'done' | 'error';
  detail?: string;
}

export interface AppIdeaProgressProps {
  title: string;
  steps: ProgressStep[];
  currentStepIndex: number;
  isActive: boolean;
  totalItems?: number;
  completedItems?: number;
  currentItemLabel?: string;
  progressMode?: 'items' | 'keywords' | 'steps';
}

function formatTime(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const mins = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  return `${mins}m ${secs}s`;
}

export default function AppIdeaProgress({
  title,
  steps,
  currentStepIndex,
  isActive,
  totalItems,
  completedItems,
  currentItemLabel,
  progressMode = 'items',
}: AppIdeaProgressProps) {
  // Track elapsed time
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const startTimeRef = useRef<number | null>(null);

  // Start timer when active
  useEffect(() => {
    if (isActive && startTimeRef.current === null) {
      startTimeRef.current = Date.now();
    }
    if (!isActive) {
      startTimeRef.current = null;
      setElapsedSeconds(0);
    }
  }, [isActive]);

  // Update elapsed time every second
  useEffect(() => {
    if (!isActive) return;

    const interval = setInterval(() => {
      if (startTimeRef.current) {
        setElapsedSeconds(Math.floor((Date.now() - startTimeRef.current) / 1000));
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [isActive]);

  // Calculate progress percentage
  const getProgressPercent = (): number => {
    if (totalItems && totalItems > 0) {
      return Math.min(((completedItems || 0) / totalItems) * 100, 100);
    }
    // Fallback to step-based progress
    if (steps.length === 0) return 0;
    const completedSteps = steps.filter(s => s.status === 'done').length;
    const activeBonus = steps.some(s => s.status === 'active') ? 0.5 : 0;
    return ((completedSteps + activeBonus) / steps.length) * 100;
  };

  // Calculate estimated time remaining
  const getEstimatedTimeRemaining = (): string | null => {
    if (!isActive || !totalItems || totalItems <= 1) return null;
    const completed = completedItems || 0;
    if (completed < 1) return null;

    const avgTimePerItem = elapsedSeconds / completed;
    const remainingItems = totalItems - completed;
    const estimatedRemaining = avgTimePerItem * remainingItems;

    if (estimatedRemaining < 5) return 'Almost done...';
    return `~${formatTime(estimatedRemaining)} remaining`;
  };

  const percentComplete = getProgressPercent();
  const estimatedRemaining = getEstimatedTimeRemaining();

  return (
    <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-5">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-blue-900 dark:text-blue-100">
          {title}
        </h3>
        {isActive && (
          <div className="flex items-center gap-3">
            <span className="text-sm text-blue-600 dark:text-blue-400">
              {formatTime(elapsedSeconds)} elapsed
            </span>
            <div className="flex items-center text-sm text-blue-600 dark:text-blue-400">
              <span className="relative flex h-3 w-3 mr-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-blue-500"></span>
              </span>
              Active
            </div>
          </div>
        )}
      </div>

      {/* Progress bar */}
      <div className="mb-4">
        <div className="flex justify-between text-sm text-blue-700 dark:text-blue-300 mb-1">
          <span>
            {progressMode === 'keywords'
              ? `${completedItems || 0} keywords discovered`
              : totalItems
                ? `${completedItems || 0} of ${totalItems} items`
                : `Step ${currentStepIndex + 1} of ${steps.length}`}
            {progressMode !== 'keywords' && ` (${Math.round(percentComplete)}%)`}
          </span>
          {currentItemLabel && (
            <span className="text-blue-600 dark:text-blue-400 truncate max-w-[200px]">
              {currentItemLabel}
            </span>
          )}
        </div>
        <div className="w-full bg-blue-200 dark:bg-blue-800 rounded-full h-3 overflow-hidden">
          <div
            className="bg-blue-600 h-3 rounded-full transition-all duration-500 relative"
            style={{ width: `${percentComplete}%` }}
          >
            {/* Animated shimmer effect */}
            {isActive && (
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-blue-400/30 to-transparent animate-shimmer" />
            )}
          </div>
        </div>
        {/* Estimated time remaining */}
        {estimatedRemaining && (
          <div className="text-xs text-blue-600 dark:text-blue-400 mt-1 text-right">
            {estimatedRemaining}
          </div>
        )}
      </div>

      {/* Steps grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
        {steps.map((step) => (
          <div
            key={step.id}
            className={`flex flex-col p-3 rounded-lg transition-all ${
              step.status === 'done'
                ? 'bg-green-100 dark:bg-green-900/50'
                : step.status === 'active'
                ? 'bg-blue-100 dark:bg-blue-800 ring-2 ring-blue-500'
                : step.status === 'error'
                ? 'bg-red-100 dark:bg-red-900/50'
                : 'bg-white/50 dark:bg-gray-800/50'
            }`}
          >
            <div className="flex items-center gap-2 mb-1">
              {step.status === 'done' && (
                <svg className="w-4 h-4 text-green-600 dark:text-green-400" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
              )}
              {step.status === 'active' && (
                <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
              )}
              {step.status === 'error' && (
                <svg className="w-4 h-4 text-red-600 dark:text-red-400" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
              )}
              {step.status === 'pending' && (
                <div className="w-4 h-4 rounded-full border-2 border-gray-300 dark:border-gray-600" />
              )}
              <span
                className={`text-sm font-medium truncate ${
                  step.status === 'done'
                    ? 'text-green-700 dark:text-green-300'
                    : step.status === 'active'
                    ? 'text-blue-700 dark:text-blue-300'
                    : step.status === 'error'
                    ? 'text-red-700 dark:text-red-300'
                    : 'text-gray-500 dark:text-gray-400'
                }`}
              >
                {step.label}
              </span>
            </div>
            {step.detail && (
              <span className="text-xs text-gray-500 dark:text-gray-400 truncate pl-6">
                {step.detail}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

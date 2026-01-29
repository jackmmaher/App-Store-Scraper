'use client';

import { useState, useEffect, useRef } from 'react';
import { COUNTRY_CODES } from '@/lib/constants';

interface ScrapeProgress {
  country?: string;
  index?: number;
  total?: number;
  appsFound?: number;
  uniqueNew?: number;
  totalUnique?: number;
}

interface Props {
  countries: string[];
  progress: ScrapeProgress;
  isActive: boolean;
}

function formatTime(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const mins = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  return `${mins}m ${secs}s`;
}

export default function GapScrapeProgress({ countries, progress, isActive }: Props) {
  const currentIndex = progress.index ?? -1;
  const total = progress.total ?? countries.length;

  // Track elapsed time
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const startTimeRef = useRef<number | null>(null);
  const countryStartTimesRef = useRef<Record<number, number>>({});

  // Start timer when scraping begins
  useEffect(() => {
    if (isActive && startTimeRef.current === null) {
      startTimeRef.current = Date.now();
    }
    if (!isActive) {
      startTimeRef.current = null;
      setElapsedSeconds(0);
      countryStartTimesRef.current = {};
    }
  }, [isActive]);

  // Track when each country starts
  useEffect(() => {
    if (isActive && currentIndex >= 0 && !countryStartTimesRef.current[currentIndex]) {
      countryStartTimesRef.current[currentIndex] = Date.now();
    }
  }, [isActive, currentIndex]);

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

  // Calculate estimated time remaining
  const getEstimatedTimeRemaining = (): string | null => {
    if (currentIndex < 1 || !isActive) return null;

    const avgTimePerCountry = elapsedSeconds / (currentIndex + 1);
    const remainingCountries = total - currentIndex - 1;
    const estimatedRemaining = avgTimePerCountry * remainingCountries;

    if (estimatedRemaining < 5) return 'Almost done...';
    return `~${formatTime(estimatedRemaining)} remaining`;
  };

  const percentComplete = total > 0 ? ((currentIndex + 1) / total) * 100 : 0;
  const estimatedRemaining = getEstimatedTimeRemaining();

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
          Scraping Progress
        </h3>
        {isActive && (
          <div className="flex items-center gap-3">
            {/* Elapsed time */}
            <span className="text-sm text-gray-500 dark:text-gray-400">
              {formatTime(elapsedSeconds)} elapsed
            </span>
            {/* Activity indicator */}
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
        <div className="flex justify-between text-sm text-gray-600 dark:text-gray-400 mb-1">
          <span>
            {currentIndex >= 0 ? `${currentIndex + 1} of ${total} countries` : 'Starting...'}
            {currentIndex >= 0 && ` (${Math.round(percentComplete)}%)`}
          </span>
          <span>
            {progress.totalUnique !== undefined && `${progress.totalUnique} unique apps found`}
          </span>
        </div>
        <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-3 overflow-hidden">
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
          <div className="text-xs text-gray-500 dark:text-gray-400 mt-1 text-right">
            {estimatedRemaining}
          </div>
        )}
      </div>

      {/* Country grid */}
      <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-2">
        {countries.map((code, idx) => {
          let status: 'pending' | 'active' | 'done' = 'pending';
          // When scraping is not active, all processed countries are done
          if (!isActive && currentIndex >= 0) {
            status = idx <= currentIndex ? 'done' : 'pending';
          } else if (idx < currentIndex) {
            status = 'done';
          } else if (idx === currentIndex) {
            status = 'active';
          }

          return (
            <div
              key={code}
              className={`flex flex-col items-center p-2 rounded-md transition-all ${
                status === 'done'
                  ? 'bg-green-100 dark:bg-green-900'
                  : status === 'active'
                  ? 'bg-blue-100 dark:bg-blue-900 ring-2 ring-blue-500'
                  : 'bg-gray-100 dark:bg-gray-700'
              }`}
            >
              <span className="text-lg font-medium text-gray-900 dark:text-white">
                {code.toUpperCase()}
              </span>
              <span
                className={`text-xs ${
                  status === 'done'
                    ? 'text-green-600 dark:text-green-400'
                    : status === 'active'
                    ? 'text-blue-600 dark:text-blue-400'
                    : 'text-gray-400 dark:text-gray-500'
                }`}
              >
                {status === 'done' ? 'Done' : status === 'active' ? 'Active' : 'Pending'}
              </span>
            </div>
          );
        })}
      </div>

      {/* Current country details */}
      {progress.country && isActive && (
        <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-900/30 rounded-md">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-blue-800 dark:text-blue-200">
              Scraping {COUNTRY_CODES[progress.country] || progress.country}...
            </span>
            {progress.appsFound !== undefined && (
              <span className="text-sm text-blue-600 dark:text-blue-400">
                {progress.appsFound} apps found
                {progress.uniqueNew !== undefined && ` (${progress.uniqueNew} new)`}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

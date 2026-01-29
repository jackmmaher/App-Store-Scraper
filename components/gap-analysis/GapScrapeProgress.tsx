'use client';

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

export default function GapScrapeProgress({ countries, progress, isActive }: Props) {
  const currentIndex = progress.index ?? -1;
  const total = progress.total ?? countries.length;

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
          Scraping Progress
        </h3>
        {isActive && (
          <div className="flex items-center text-sm text-blue-600 dark:text-blue-400">
            <svg
              className="animate-spin mr-2 h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
            Scraping...
          </div>
        )}
      </div>

      {/* Progress bar */}
      <div className="mb-4">
        <div className="flex justify-between text-sm text-gray-600 dark:text-gray-400 mb-1">
          <span>
            {currentIndex >= 0 ? `${currentIndex + 1} of ${total} countries` : 'Starting...'}
          </span>
          <span>
            {progress.totalUnique !== undefined && `${progress.totalUnique} unique apps found`}
          </span>
        </div>
        <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-3">
          <div
            className="bg-blue-600 h-3 rounded-full transition-all duration-500"
            style={{
              width: `${total > 0 ? ((currentIndex + 1) / total) * 100 : 0}%`,
            }}
          />
        </div>
      </div>

      {/* Country grid */}
      <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-2">
        {countries.map((code, idx) => {
          let status: 'pending' | 'active' | 'done' = 'pending';
          if (idx < currentIndex) status = 'done';
          else if (idx === currentIndex) status = 'active';

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

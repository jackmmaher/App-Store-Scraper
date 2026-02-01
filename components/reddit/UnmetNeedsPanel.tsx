'use client';

import { useState, useCallback } from 'react';
import type { UnmetNeed } from '@/lib/reddit/types';
import UnmetNeedCard from './UnmetNeedCard';

interface UnmetNeedsPanelProps {
  needs: UnmetNeed[];
  onSolutionChange: (needId: string, notes: string) => void;
  onSaveSolutions: () => void;
  isSaving?: boolean;
}

export default function UnmetNeedsPanel({
  needs,
  onSolutionChange,
  onSaveSolutions,
  isSaving = false,
}: UnmetNeedsPanelProps) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const toggleExpand = useCallback((needId: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(needId)) {
        next.delete(needId);
      } else {
        next.add(needId);
      }
      return next;
    });
  }, []);

  // Sort needs by severity (high -> medium -> low)
  const sortedNeeds = [...needs].sort((a, b) => {
    const severityOrder = { high: 0, medium: 1, low: 2 };
    return severityOrder[a.severity] - severityOrder[b.severity];
  });

  const highCount = needs.filter((n) => n.severity === 'high').length;
  const mediumCount = needs.filter((n) => n.severity === 'medium').length;
  const lowCount = needs.filter((n) => n.severity === 'low').length;

  return (
    <div className="bg-gray-50 dark:bg-gray-900/50 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            Top Unmet Needs
          </h3>
          <span className="px-2 py-0.5 text-sm font-medium bg-blue-100 dark:bg-blue-900/50 text-blue-800 dark:text-blue-200 rounded-full">
            {needs.length}
          </span>
        </div>

        {/* Severity summary */}
        <div className="flex items-center gap-2 text-xs">
          {highCount > 0 && (
            <span className="px-2 py-0.5 bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-300 rounded-full">
              {highCount} High
            </span>
          )}
          {mediumCount > 0 && (
            <span className="px-2 py-0.5 bg-yellow-100 dark:bg-yellow-900/50 text-yellow-700 dark:text-yellow-300 rounded-full">
              {mediumCount} Med
            </span>
          )}
          {lowCount > 0 && (
            <span className="px-2 py-0.5 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 rounded-full">
              {lowCount} Low
            </span>
          )}
        </div>
      </div>

      {/* Needs list */}
      {needs.length === 0 ? (
        <div className="text-center py-8">
          <div className="w-12 h-12 bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center mx-auto mb-3">
            <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
            </svg>
          </div>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            No unmet needs found yet
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {sortedNeeds.map((need) => (
            <UnmetNeedCard
              key={need.id}
              need={need}
              onSolutionChange={onSolutionChange}
              isExpanded={expandedIds.has(need.id)}
              onToggleExpand={() => toggleExpand(need.id)}
            />
          ))}
        </div>
      )}

      {/* Save Solutions button */}
      {needs.length > 0 && (
        <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
          <button
            onClick={onSaveSolutions}
            disabled={isSaving}
            className="w-full px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {isSaving ? (
              <>
                <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Saving...
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                Save Solutions
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
}

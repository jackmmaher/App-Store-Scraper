'use client';

import { useState } from 'react';
import type { ReviewScrapeSession, MergeStrategy } from '@/lib/supabase';

interface MergeSessionsModalProps {
  projectId: string;
  sessionIds: string[];
  sessions: ReviewScrapeSession[];
  onClose: () => void;
  onComplete: () => void;
}

const STRATEGIES: { value: MergeStrategy; label: string; description: string }[] = [
  {
    value: 'keep_newest',
    label: 'Keep Newest',
    description: 'When duplicates found, keep the review with the most recent date',
  },
  {
    value: 'keep_oldest',
    label: 'Keep Oldest',
    description: 'When duplicates found, keep the review with the oldest date',
  },
  {
    value: 'keep_highest_rating',
    label: 'Keep Highest Rating',
    description: 'When duplicates found, keep the review with the highest rating',
  },
  {
    value: 'keep_all',
    label: 'No Deduplication',
    description: 'Keep all reviews without removing duplicates',
  },
];

export default function MergeSessionsModal({
  projectId,
  sessionIds,
  sessions,
  onClose,
  onComplete,
}: MergeSessionsModalProps) {
  const [strategy, setStrategy] = useState<MergeStrategy>('keep_newest');
  const [updateProject, setUpdateProject] = useState(true);
  const [merging, setMerging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    total_before: number;
    total_after: number;
    duplicates_removed: number;
  } | null>(null);

  const totalReviews = sessions.reduce((sum, s) => sum + s.reviews_collected, 0);

  const handleMerge = async () => {
    setMerging(true);
    setError(null);

    try {
      const res = await fetch(`/api/projects/${projectId}/scrape-sessions/merge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_ids: sessionIds,
          strategy,
          update_project_reviews: updateProject,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to merge sessions');
      }

      const data = await res.json();
      setResult(data.merged);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to merge');
    } finally {
      setMerging(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      {/* Modal */}
      <div className="relative bg-white dark:bg-gray-900 rounded-xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-auto">
        <div className="p-6">
          {/* Header */}
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
              Merge Scrape Sessions
            </h2>
            <button
              onClick={onClose}
              className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {!result ? (
            <>
              {/* Summary */}
              <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4 mb-4">
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Merging <span className="font-medium text-gray-900 dark:text-white">{sessionIds.length}</span> sessions
                  with <span className="font-medium text-gray-900 dark:text-white">{totalReviews.toLocaleString()}</span> total reviews
                </p>
              </div>

              {/* Deduplication Strategy */}
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Deduplication Strategy
                </label>
                <div className="space-y-2">
                  {STRATEGIES.map((s) => (
                    <label
                      key={s.value}
                      className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                        strategy === s.value
                          ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                          : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                      }`}
                    >
                      <input
                        type="radio"
                        name="strategy"
                        value={s.value}
                        checked={strategy === s.value}
                        onChange={() => setStrategy(s.value)}
                        className="mt-1"
                      />
                      <div>
                        <span className="font-medium text-gray-900 dark:text-white">{s.label}</span>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{s.description}</p>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              {/* Update Project Option */}
              <div className="mb-6">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={updateProject}
                    onChange={(e) => setUpdateProject(e.target.checked)}
                    className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="text-sm text-gray-700 dark:text-gray-300">
                    Update project reviews with merged result
                  </span>
                </label>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 ml-6">
                  This will replace the project&apos;s current reviews with the merged reviews
                </p>
              </div>

              {/* Error */}
              {error && (
                <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                  <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
                </div>
              )}

              {/* Actions */}
              <div className="flex justify-end gap-3">
                <button
                  onClick={onClose}
                  disabled={merging}
                  className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleMerge}
                  disabled={merging}
                  className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-lg transition-colors flex items-center gap-2"
                >
                  {merging ? (
                    <>
                      <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      Merging...
                    </>
                  ) : (
                    'Merge Sessions'
                  )}
                </button>
              </div>
            </>
          ) : (
            <>
              {/* Success Result */}
              <div className="text-center py-4">
                <div className="w-12 h-12 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
                  <svg className="w-6 h-6 text-green-600 dark:text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                  Merge Complete
                </h3>
                <div className="text-sm text-gray-600 dark:text-gray-400 space-y-1">
                  <p>Reviews before: <span className="font-medium">{result.total_before.toLocaleString()}</span></p>
                  <p>Reviews after: <span className="font-medium">{result.total_after.toLocaleString()}</span></p>
                  <p>Duplicates removed: <span className="font-medium text-green-600 dark:text-green-400">{result.duplicates_removed.toLocaleString()}</span></p>
                </div>
              </div>

              <div className="flex justify-center mt-4">
                <button
                  onClick={onComplete}
                  className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
                >
                  Done
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

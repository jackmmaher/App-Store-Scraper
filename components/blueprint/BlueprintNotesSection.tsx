'use client';

import { useState, useCallback } from 'react';
import { BlueprintMarkdown } from './BlueprintMarkdown';

interface BlueprintNotesSectionProps {
  projectNotes: string | null;
  notesSnapshot: string | null;
  notesSnapshotAt: string | null;
  onSyncNotes: () => Promise<boolean | void>;
  isFirstGeneration: boolean;
}

export default function BlueprintNotesSection({
  projectNotes,
  notesSnapshot,
  notesSnapshotAt,
  onSyncNotes,
  isFirstGeneration,
}: BlueprintNotesSectionProps) {
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);

  const hasNotes = Boolean(projectNotes?.trim());
  const hasSnapshot = Boolean(notesSnapshot?.trim());
  const notesOutOfSync = hasSnapshot && projectNotes !== notesSnapshot;

  const handleSync = useCallback(async () => {
    setIsSyncing(true);
    setSyncError(null);
    try {
      await onSyncNotes();
    } catch (err) {
      console.error('Error syncing notes:', err);
      setSyncError(err instanceof Error ? err.message : 'Failed to sync notes');
    } finally {
      setIsSyncing(false);
    }
  }, [onSyncNotes]);

  const formatDate = (dateString: string | null) => {
    if (!dateString) return null;
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  };

  return (
    <div className="space-y-6">
      {/* Info Banner */}
      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
        <div className="flex items-start gap-3">
          <svg className="w-5 h-5 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div>
            <p className="text-sm text-blue-800 dark:text-blue-200 font-medium">
              Your notes are used in generating all blueprint sections
            </p>
            <p className="text-sm text-blue-600 dark:text-blue-400 mt-1">
              Notes you add to this project are automatically included as context when generating Strategy, Identity, Design System, and all other sections. This ensures the AI considers your specific requirements and insights.
            </p>
          </div>
        </div>
      </div>

      {/* Out of Sync Warning */}
      {notesOutOfSync && (
        <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <svg className="w-5 h-5 text-yellow-600 dark:text-yellow-400 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <div className="flex-1">
              <p className="text-sm text-yellow-800 dark:text-yellow-200 font-medium">
                Your notes have changed since the blueprint was generated
              </p>
              <p className="text-sm text-yellow-600 dark:text-yellow-400 mt-1">
                The current blueprint sections were generated using an older version of your notes.
                You can sync to use your updated notes for future generations.
              </p>
              <button
                onClick={handleSync}
                disabled={isSyncing}
                className="mt-3 inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-yellow-800 dark:text-yellow-200 bg-yellow-100 dark:bg-yellow-800/30 hover:bg-yellow-200 dark:hover:bg-yellow-800/50 rounded-md transition-colors disabled:opacity-50"
              >
                {isSyncing ? (
                  <>
                    <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Syncing...
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    Sync Notes for Future Generations
                  </>
                )}
              </button>
              {syncError && (
                <p className="mt-2 text-sm text-red-600 dark:text-red-400">{syncError}</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Current Project Notes */}
      <div>
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">
          Current Project Notes
        </h3>
        {hasNotes ? (
          <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
            <BlueprintMarkdown content={projectNotes!} />
          </div>
        ) : (
          <div className="bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 border-dashed rounded-lg p-6 text-center">
            <svg className="w-8 h-8 text-gray-400 mx-auto mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              No notes added yet
            </p>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
              Add notes in the project&apos;s Notes tab to include them in blueprint generation
            </p>
          </div>
        )}
      </div>

      {/* Snapshot Section */}
      {hasSnapshot && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
              Notes Snapshot (Used in Blueprint)
            </h3>
            {notesSnapshotAt && (
              <span className="text-xs text-gray-500 dark:text-gray-400">
                Captured {formatDate(notesSnapshotAt)}
              </span>
            )}
          </div>
          <div className="bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
            <BlueprintMarkdown content={notesSnapshot!} />
          </div>
        </div>
      )}

      {/* First Generation Info */}
      {isFirstGeneration && hasNotes && !hasSnapshot && (
        <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <svg className="w-5 h-5 text-green-600 dark:text-green-400 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div>
              <p className="text-sm text-green-800 dark:text-green-200 font-medium">
                Your notes will be captured when you generate your first section
              </p>
              <p className="text-sm text-green-600 dark:text-green-400 mt-1">
                A snapshot of your notes will be saved so you can see exactly what context was used in the blueprint.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

'use client';

import { useState, useEffect, useCallback } from 'react';
import type { ReviewScrapeSession } from '@/lib/supabase';
import MergeSessionsModal from './MergeSessionsModal';

interface ScrapeSessionHistoryProps {
  projectId: string;
  onSessionsChange?: () => void;
}

export default function ScrapeSessionHistory({ projectId, onSessionsChange }: ScrapeSessionHistoryProps) {
  const [sessions, setSessions] = useState<ReviewScrapeSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedSessions, setSelectedSessions] = useState<Set<string>>(new Set());
  const [showMergeModal, setShowMergeModal] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fetchSessions = useCallback(async () => {
    try {
      const res = await fetch(`/api/projects/${projectId}/scrape-sessions`);
      if (!res.ok) throw new Error('Failed to fetch sessions');
      const data = await res.json();
      setSessions(data.sessions || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load sessions');
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  const handleDelete = async (sessionId: string) => {
    if (!confirm('Delete this scrape session?')) return;

    setDeletingId(sessionId);
    try {
      const res = await fetch(`/api/projects/${projectId}/scrape-sessions/${sessionId}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error('Failed to delete session');
      setSessions(prev => prev.filter(s => s.id !== sessionId));
      setSelectedSessions(prev => {
        const next = new Set(prev);
        next.delete(sessionId);
        return next;
      });
      onSessionsChange?.();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete');
    } finally {
      setDeletingId(null);
    }
  };

  const toggleSelection = (sessionId: string) => {
    setSelectedSessions(prev => {
      const next = new Set(prev);
      if (next.has(sessionId)) {
        next.delete(sessionId);
      } else {
        next.add(sessionId);
      }
      return next;
    });
  };

  const handleMergeComplete = () => {
    setShowMergeModal(false);
    setSelectedSessions(new Set());
    fetchSessions();
    onSessionsChange?.();
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  };

  const getStatusBadge = (status: ReviewScrapeSession['status']) => {
    const styles: Record<string, string> = {
      pending: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300',
      in_progress: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300',
      completed: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300',
      failed: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300',
      cancelled: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300',
    };
    return (
      <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${styles[status] || styles.pending}`}>
        {status.replace('_', ' ')}
      </span>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <svg className="animate-spin h-6 w-6 text-blue-600" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-8">
        <p className="text-red-600 dark:text-red-400">{error}</p>
        <button onClick={fetchSessions} className="mt-2 text-blue-600 hover:text-blue-700">
          Retry
        </button>
      </div>
    );
  }

  if (sessions.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500 dark:text-gray-400">
        <p>No scrape sessions yet.</p>
        <p className="text-sm mt-1">Use the Settings tab to start a new scrape session.</p>
      </div>
    );
  }

  const completedSessions = sessions.filter(s => s.status === 'completed');
  const canMerge = selectedSessions.size >= 1 &&
    Array.from(selectedSessions).every(id =>
      completedSessions.find(s => s.id === id)
    );

  return (
    <div className="space-y-4">
      {/* Header with merge button */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
          Scrape Sessions ({sessions.length})
        </h3>
        {canMerge && (
          <button
            onClick={() => setShowMergeModal(true)}
            className="px-3 py-1.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
          >
            Merge Selected ({selectedSessions.size})
          </button>
        )}
      </div>

      {/* Sessions table */}
      <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 dark:bg-gray-800">
            <tr>
              <th className="w-8 px-3 py-2"></th>
              <th className="text-left px-3 py-2 font-medium text-gray-700 dark:text-gray-300">Date</th>
              <th className="text-left px-3 py-2 font-medium text-gray-700 dark:text-gray-300">Status</th>
              <th className="text-right px-3 py-2 font-medium text-gray-700 dark:text-gray-300">Reviews</th>
              <th className="text-right px-3 py-2 font-medium text-gray-700 dark:text-gray-300">Avg Rating</th>
              <th className="text-left px-3 py-2 font-medium text-gray-700 dark:text-gray-300">Country</th>
              <th className="w-16 px-3 py-2"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
            {sessions.map((session) => (
              <tr key={session.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                <td className="px-3 py-2">
                  {session.status === 'completed' && (
                    <input
                      type="checkbox"
                      checked={selectedSessions.has(session.id)}
                      onChange={() => toggleSelection(session.id)}
                      className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                  )}
                </td>
                <td className="px-3 py-2 text-gray-900 dark:text-white">
                  {formatDate(session.created_at)}
                </td>
                <td className="px-3 py-2">
                  {getStatusBadge(session.status)}
                </td>
                <td className="px-3 py-2 text-right text-gray-900 dark:text-white font-medium">
                  {session.reviews_collected.toLocaleString()}
                </td>
                <td className="px-3 py-2 text-right text-gray-600 dark:text-gray-400">
                  {session.stats?.average_rating?.toFixed(1) || '-'}
                </td>
                <td className="px-3 py-2 text-gray-600 dark:text-gray-400 uppercase">
                  {session.country}
                </td>
                <td className="px-3 py-2">
                  <button
                    onClick={() => handleDelete(session.id)}
                    disabled={deletingId === session.id}
                    className="p-1 text-gray-400 hover:text-red-600 disabled:opacity-50 transition-colors"
                    title="Delete session"
                  >
                    {deletingId === session.id ? (
                      <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                    ) : (
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    )}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Total reviews info */}
      {completedSessions.length > 0 && (
        <div className="text-sm text-gray-500 dark:text-gray-400">
          Total reviews across all sessions: {completedSessions.reduce((sum, s) => sum + s.reviews_collected, 0).toLocaleString()}
        </div>
      )}

      {/* Merge Modal */}
      {showMergeModal && (
        <MergeSessionsModal
          projectId={projectId}
          sessionIds={Array.from(selectedSessions)}
          sessions={sessions.filter(s => selectedSessions.has(s.id))}
          onClose={() => setShowMergeModal(false)}
          onComplete={handleMergeComplete}
        />
      )}
    </div>
  );
}

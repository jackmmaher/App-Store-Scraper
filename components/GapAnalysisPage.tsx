'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useGapAnalysis } from '@/hooks/useGapAnalysis';
import { GapSetupForm } from '@/components/gap-analysis';
import { CATEGORY_NAMES, COUNTRY_CODES } from '@/lib/constants';

export default function GapAnalysisPage() {
  const router = useRouter();
  const {
    sessions,
    loading,
    error,
    loadSessions,
    createSession,
    deleteSession,
  } = useGapAnalysis();

  const [isCreating, setIsCreating] = useState(false);

  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  const handleCreateSession = async (data: {
    name?: string;
    category: string;
    countries: string[];
    appsPerCountry: number;
  }) => {
    setIsCreating(true);
    const session = await createSession(
      data.category,
      data.countries,
      data.name,
      data.appsPerCountry
    );
    setIsCreating(false);

    if (session) {
      router.push(`/gap-analysis/${session.id}`);
    }
  };

  const handleDeleteSession = async (id: string, name: string | null) => {
    if (!confirm(`Delete gap analysis "${name || 'Unnamed'}"?`)) return;
    await deleteSession(id);
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <header className="bg-white dark:bg-gray-800 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                Gap Analysis
              </h1>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Cross-country market intelligence
              </p>
            </div>
            <Link
              href="/"
              className="text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400"
            >
              Back to Dashboard
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Setup Form */}
          <div className="lg:col-span-1">
            <GapSetupForm onSubmit={handleCreateSession} loading={isCreating} />
          </div>

          {/* Sessions List */}
          <div className="lg:col-span-2">
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow">
              <div className="p-4 border-b border-gray-200 dark:border-gray-700">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                  Previous Analyses
                </h2>
              </div>

              {error && (
                <div className="p-4 bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400">
                  {error}
                </div>
              )}

              {loading ? (
                <div className="p-8 text-center">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto" />
                </div>
              ) : sessions.length === 0 ? (
                <div className="p-8 text-center text-gray-500 dark:text-gray-400">
                  <p>No gap analyses yet.</p>
                  <p className="text-sm mt-1">
                    Create your first analysis using the form on the left.
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-gray-200 dark:divide-gray-700">
                  {sessions.map((session) => (
                    <div
                      key={session.id}
                      className="p-4 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                    >
                      <div className="flex items-start justify-between">
                        <Link
                          href={`/gap-analysis/${session.id}`}
                          className="flex-1"
                        >
                          <div className="flex items-center gap-3">
                            <div
                              className={`w-2 h-2 rounded-full ${
                                session.scrape_status === 'completed'
                                  ? 'bg-green-500'
                                  : session.scrape_status === 'in_progress'
                                  ? 'bg-blue-500 animate-pulse'
                                  : session.scrape_status === 'failed'
                                  ? 'bg-red-500'
                                  : 'bg-gray-400'
                              }`}
                            />
                            <div>
                              <h3 className="font-medium text-gray-900 dark:text-white">
                                {session.name || 'Unnamed Analysis'}
                              </h3>
                              <div className="text-sm text-gray-500 dark:text-gray-400">
                                {CATEGORY_NAMES[session.category] || session.category}
                              </div>
                            </div>
                          </div>

                          <div className="mt-2 flex flex-wrap gap-1">
                            {session.countries.slice(0, 8).map((code) => (
                              <span
                                key={code}
                                className="text-xs px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400"
                              >
                                {code.toUpperCase()}
                              </span>
                            ))}
                            {session.countries.length > 8 && (
                              <span className="text-xs px-1.5 py-0.5 text-gray-500 dark:text-gray-400">
                                +{session.countries.length - 8} more
                              </span>
                            )}
                          </div>

                          <div className="mt-2 text-xs text-gray-400 dark:text-gray-500">
                            {new Date(session.created_at).toLocaleDateString()} at{' '}
                            {new Date(session.created_at).toLocaleTimeString()}
                            {session.scrape_progress?.unique_apps !== undefined && (
                              <span className="ml-2">
                                {session.scrape_progress.unique_apps} apps
                              </span>
                            )}
                          </div>
                        </Link>

                        <button
                          onClick={() => handleDeleteSession(session.id, session.name)}
                          className="text-gray-400 hover:text-red-500 transition-colors p-1"
                          title="Delete"
                        >
                          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

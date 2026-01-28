'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Header from './Header';
import StarRating from './StarRating';
import type { AppProject, Review } from '@/lib/supabase';
import { useKeywordRanking } from '@/hooks/useKeywordRanking';
import { useKeywordExtraction } from '@/hooks/useKeywordExtraction';
import { formatDateTime, formatNumber } from '@/lib/formatting';

interface ProjectDetailPageProps {
  projectId: string;
}

export default function ProjectDetailPage({ projectId }: ProjectDetailPageProps) {
  const router = useRouter();
  const [project, setProject] = useState<AppProject | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'analysis' | 'reviews' | 'notes' | 'keywords'>('analysis');
  const [notes, setNotes] = useState('');
  const [savingNotes, setSavingNotes] = useState(false);
  const [reAnalyzing, setReAnalyzing] = useState(false);

  // Keywords - use shared hooks (with fallback values until project loads)
  const {
    keywordInput,
    setKeywordInput,
    keywordRanks,
    checking: checkingKeyword,
    checkKeywordRank,
  } = useKeywordRanking({ appId: project?.app_store_id || '', country: project?.country || 'us' });

  const {
    extractedKeywords,
    extracting: extractingKeywords,
    extractKeywords,
  } = useKeywordExtraction({ appName: project?.app_name || '' });

  useEffect(() => {
    fetchProject();
  }, [projectId]);

  const fetchProject = async () => {
    setLoading(true);
    setError(null);
    try {
      console.log('[ProjectDetailPage] Fetching project:', projectId);
      // Use query param approach (more reliable on Vercel than dynamic routes)
      const res = await fetch(`/api/projects?id=${projectId}`);
      console.log('[ProjectDetailPage] Response status:', res.status);

      const data = await res.json();
      console.log('[ProjectDetailPage] Response data:', data);

      if (!res.ok) {
        const errorMsg = data.error || `HTTP ${res.status}: Failed to load project`;
        console.error('[ProjectDetailPage] Error:', errorMsg);
        setError(errorMsg);
        return;
      }

      if (!data.project) {
        console.error('[ProjectDetailPage] No project in response');
        setError('Project data missing from response');
        return;
      }

      setProject(data.project);
      setNotes(data.project.notes || '');
    } catch (err) {
      console.error('[ProjectDetailPage] Fetch exception:', err);
      setError(err instanceof Error ? err.message : 'Failed to load project');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm('Delete this project? This cannot be undone.')) return;

    try {
      const res = await fetch(`/api/projects?id=${projectId}`, { method: 'DELETE' });
      if (res.ok) {
        router.push('/projects');
      }
    } catch (err) {
      console.error('Error deleting project:', err);
    }
  };

  const saveNotes = async () => {
    setSavingNotes(true);
    try {
      const res = await fetch(`/api/projects?id=${projectId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes }),
      });
      if (res.ok) {
        const data = await res.json();
        setProject(data.project);
      }
    } catch (err) {
      console.error('Error saving notes:', err);
    } finally {
      setSavingNotes(false);
    }
  };

  const reRunAnalysis = async () => {
    if (!project || project.reviews.length === 0) return;

    setReAnalyzing(true);
    try {
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reviews: project.reviews, appName: project.app_name }),
      });

      if (!res.ok) {
        throw new Error('Failed to analyze');
      }

      const data = await res.json();

      // Save the new analysis
      const updateRes = await fetch(`/api/projects?id=${projectId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ai_analysis: data.analysis }),
      });

      if (updateRes.ok) {
        const updateData = await updateRes.json();
        setProject(updateData.project);
      }
    } catch (err) {
      console.error('Error re-running analysis:', err);
      alert('Failed to re-run analysis');
    } finally {
      setReAnalyzing(false);
    }
  };

  const extractKeywordsFromReviews = () => {
    if (project) extractKeywords(project.reviews);
  };

  const exportReviewsCSV = () => {
    if (!project) return;

    const headers = ['Rating', 'Title', 'Content', 'Author', 'Version', 'Country', 'Votes'];
    const rows = project.reviews.map((r: Review) => [
      r.rating,
      r.title,
      r.content.replace(/"/g, '""').replace(/\n/g, ' '),
      r.author,
      r.version,
      r.country || project.country,
      r.vote_count,
    ]);

    const csv = [
      headers.join(','),
      ...rows.map((r) => r.map((c) => `"${c}"`).join(',')),
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${project.app_name.replace(/[^a-z0-9]/gi, '-')}-reviews.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
        <Header />
        <div className="flex items-center justify-center py-20">
          <svg className="animate-spin h-8 w-8 text-blue-600" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        </div>
      </div>
    );
  }

  if (error || !project) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
        <Header />
        <div className="max-w-4xl mx-auto px-4 py-20 text-center">
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-6 mb-6">
            <h1 className="text-xl font-bold text-red-600 dark:text-red-400 mb-2">
              Failed to Load Project
            </h1>
            <p className="text-gray-700 dark:text-gray-300 mb-4">
              {error || 'Project not found'}
            </p>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Project ID: <code className="bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded">{projectId}</code>
            </p>
          </div>
          <div className="flex justify-center gap-4">
            <button
              onClick={() => fetchProject()}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg"
            >
              Retry
            </button>
            <Link href="/projects" className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800">
              Back to Projects
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const reviewStats = project.review_stats;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <Header />

      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Breadcrumb */}
        <div className="mb-4">
          <Link
            href="/projects"
            className="text-sm text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back to Projects
          </Link>
        </div>

        {/* App Header */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 mb-6">
          <div className="flex items-start gap-4">
            {project.app_icon_url ? (
              <img src={project.app_icon_url} alt="" className="w-20 h-20 rounded-2xl" />
            ) : (
              <div className="w-20 h-20 rounded-2xl bg-gray-200 dark:bg-gray-600" />
            )}
            <div className="flex-1">
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                {project.app_name}
              </h1>
              <p className="text-gray-500 dark:text-gray-400">{project.app_developer}</p>
              <div className="flex items-center gap-4 mt-2 flex-wrap">
                <div className="flex items-center gap-1">
                  <StarRating rating={Math.round(project.app_rating || 0)} />
                  <span className="text-sm text-gray-600 dark:text-gray-300 ml-1">
                    {project.app_rating?.toFixed(1)}
                  </span>
                </div>
                <span className="text-sm text-gray-500">
                  {formatNumber(project.app_review_count || 0)} total reviews
                </span>
                <span className="text-sm text-gray-500">
                  {project.app_primary_genre}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {project.app_url && (
                <a
                  href={project.app_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                  title="View on App Store"
                >
                  <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                </a>
              )}
              <button
                onClick={handleDelete}
                className="p-2 hover:bg-red-100 dark:hover:bg-red-900/30 rounded-lg transition-colors"
                title="Delete project"
              >
                <svg className="w-5 h-5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6 pt-6 border-t border-gray-200 dark:border-gray-700">
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">Saved Reviews</p>
              <p className="text-xl font-bold text-gray-900 dark:text-white">
                {formatNumber(project.review_count)}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">AI Analysis</p>
              <p className="text-xl font-bold text-gray-900 dark:text-white">
                {project.ai_analysis ? 'Yes' : 'No'}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">Created</p>
              <p className="text-sm text-gray-900 dark:text-white">
                {formatDateTime(project.created_at)}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">Last Updated</p>
              <p className="text-sm text-gray-900 dark:text-white">
                {formatDateTime(project.updated_at)}
              </p>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow">
          <div className="flex border-b border-gray-200 dark:border-gray-700">
            <button
              onClick={() => setActiveTab('analysis')}
              className={`px-6 py-3 text-sm font-medium transition-colors ${
                activeTab === 'analysis'
                  ? 'text-blue-600 border-b-2 border-blue-600'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              AI Analysis
            </button>
            <button
              onClick={() => setActiveTab('reviews')}
              className={`px-6 py-3 text-sm font-medium transition-colors ${
                activeTab === 'reviews'
                  ? 'text-blue-600 border-b-2 border-blue-600'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              Reviews ({project.review_count})
            </button>
            <button
              onClick={() => setActiveTab('notes')}
              className={`px-6 py-3 text-sm font-medium transition-colors ${
                activeTab === 'notes'
                  ? 'text-blue-600 border-b-2 border-blue-600'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              Notes
            </button>
            <button
              onClick={() => setActiveTab('keywords')}
              className={`px-6 py-3 text-sm font-medium transition-colors ${
                activeTab === 'keywords'
                  ? 'text-blue-600 border-b-2 border-blue-600'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              Keywords
            </button>
          </div>

          <div className="p-6">
            {/* Analysis Tab */}
            {activeTab === 'analysis' && (
              <div>
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-medium text-gray-900 dark:text-white">
                    AI Analysis
                  </h2>
                  <button
                    onClick={reRunAnalysis}
                    disabled={reAnalyzing || project.reviews.length === 0}
                    className="px-3 py-1.5 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors disabled:opacity-50 flex items-center gap-2"
                  >
                    {reAnalyzing ? (
                      <>
                        <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                        Re-analyzing...
                      </>
                    ) : (
                      <>
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                        </svg>
                        Re-run Analysis
                      </>
                    )}
                  </button>
                </div>

                {project.ai_analysis ? (
                  <div className="prose dark:prose-invert max-w-none">
                    <div className="whitespace-pre-wrap text-sm text-gray-700 dark:text-gray-300 bg-gray-50 dark:bg-gray-900 rounded-lg p-4">
                      {project.ai_analysis}
                    </div>
                    {project.analysis_date && (
                      <p className="text-xs text-gray-400 mt-4">
                        Analysis generated on {formatDateTime(project.analysis_date)}
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <p className="text-gray-500 dark:text-gray-400 mb-4">
                      No AI analysis available. Click "Re-run Analysis" to generate one.
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Reviews Tab */}
            {activeTab === 'reviews' && (
              <div>
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-medium text-gray-900 dark:text-white">
                    Cached Reviews
                  </h2>
                  <button
                    onClick={exportReviewsCSV}
                    className="px-3 py-1.5 text-sm bg-green-600 hover:bg-green-700 text-white rounded transition-colors"
                  >
                    Export CSV
                  </button>
                </div>

                {/* Rating Distribution */}
                {reviewStats && (
                  <div className="mb-6 p-4 bg-gray-50 dark:bg-gray-900 rounded-lg">
                    <div className="flex items-center gap-4 flex-wrap">
                      <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                        Rating Distribution:
                      </span>
                      {[5, 4, 3, 2, 1].map((rating) => (
                        <span key={rating} className="flex items-center gap-1 text-sm">
                          <span className="text-yellow-500">{rating}★</span>
                          <span className="text-gray-500">
                            {reviewStats.rating_distribution[rating] || 0}
                          </span>
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {project.reviews.length === 0 ? (
                  <p className="text-center text-gray-500 py-8">No reviews saved</p>
                ) : (
                  <div className="space-y-4 max-h-[600px] overflow-y-auto">
                    {project.reviews.map((review: Review) => (
                      <div
                        key={review.id}
                        className="p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg"
                      >
                        <div className="flex items-start justify-between mb-2">
                          <div>
                            <div className="flex items-center gap-2">
                              <StarRating rating={review.rating} />
                              <span className="font-medium text-gray-900 dark:text-white">
                                {review.title}
                              </span>
                            </div>
                            <p className="text-xs text-gray-500 mt-1">
                              by {review.author} • v{review.version}
                              {review.country && ` • ${review.country.toUpperCase()}`}
                              {review.vote_count > 0 && ` • ${review.vote_count} found helpful`}
                            </p>
                          </div>
                        </div>
                        <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
                          {review.content}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Notes Tab */}
            {activeTab === 'notes' && (
              <div>
                <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-4">
                  Your Notes
                </h2>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Add your notes about this app..."
                  className="w-full h-64 px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 resize-none"
                />
                <div className="flex justify-end mt-4">
                  <button
                    onClick={saveNotes}
                    disabled={savingNotes}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors disabled:opacity-50"
                  >
                    {savingNotes ? 'Saving...' : 'Save Notes'}
                  </button>
                </div>
              </div>
            )}

            {/* Keywords Tab */}
            {activeTab === 'keywords' && (
              <div className="space-y-6">
                {/* Keyword Rank Checker */}
                <div>
                  <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
                    Keyword Rank Checker
                  </h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                    Check where this app ranks for specific keywords in the App Store
                  </p>

                  <div className="flex gap-2 mb-4">
                    <input
                      type="text"
                      value={keywordInput}
                      onChange={(e) => setKeywordInput(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && checkKeywordRank()}
                      placeholder="Enter a keyword (e.g., fitness tracker, meditation)"
                      className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                    />
                    <button
                      onClick={() => checkKeywordRank()}
                      disabled={checkingKeyword || !keywordInput.trim()}
                      className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors disabled:opacity-50 flex items-center gap-2"
                    >
                      {checkingKeyword ? (
                        <>
                          <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                          </svg>
                          Checking...
                        </>
                      ) : (
                        'Check Rank'
                      )}
                    </button>
                  </div>

                  {/* Keyword Results */}
                  {keywordRanks.length > 0 && (
                    <div className="space-y-3">
                      {keywordRanks.map((result, idx) => (
                        <div
                          key={`${result.keyword}-${idx}`}
                          className={`p-4 rounded-lg border ${
                            result.found
                              ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800'
                              : 'bg-gray-50 dark:bg-gray-700/50 border-gray-200 dark:border-gray-600'
                          }`}
                        >
                          <div className="flex items-center justify-between mb-2">
                            <span className="font-medium text-gray-900 dark:text-white">
                              "{result.keyword}"
                            </span>
                            {result.found ? (
                              <span className="px-3 py-1 bg-green-600 text-white text-sm font-bold rounded-full">
                                #{result.ranking}
                              </span>
                            ) : (
                              <span className="px-3 py-1 bg-gray-400 text-white text-sm rounded-full">
                                Not in Top 200
                              </span>
                            )}
                          </div>

                          {result.topApps && result.topApps.length > 0 && (
                            <div className="mt-3">
                              <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">Top 5 for this keyword:</p>
                              <div className="space-y-1">
                                {result.topApps.slice(0, 5).map((topApp) => (
                                  <div
                                    key={topApp.id}
                                    className={`flex items-center gap-2 text-sm p-1 rounded ${
                                      topApp.isTarget ? 'bg-blue-100 dark:bg-blue-900/30' : ''
                                    }`}
                                  >
                                    <span className="w-6 text-center font-medium text-gray-500">
                                      #{topApp.rank}
                                    </span>
                                    {topApp.icon && (
                                      <img src={topApp.icon} alt="" className="w-6 h-6 rounded" />
                                    )}
                                    <span className={`flex-1 truncate ${topApp.isTarget ? 'font-medium text-blue-600 dark:text-blue-400' : 'text-gray-700 dark:text-gray-300'}`}>
                                      {topApp.name}
                                    </span>
                                    <span className="text-xs text-gray-500">
                                      {topApp.rating?.toFixed(1)}★
                                    </span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Extracted Keywords from Reviews */}
                <div className="border-t border-gray-200 dark:border-gray-700 pt-6">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h3 className="text-lg font-medium text-gray-900 dark:text-white">
                        Keywords from Reviews
                      </h3>
                      <p className="text-sm text-gray-500 dark:text-gray-400">
                        Common terms users mention in reviews ({project.review_count} reviews)
                      </p>
                    </div>
                    <button
                      onClick={extractKeywordsFromReviews}
                      disabled={extractingKeywords || project.reviews.length === 0}
                      className="px-3 py-1.5 text-sm bg-purple-600 hover:bg-purple-700 text-white rounded transition-colors disabled:opacity-50"
                    >
                      {extractingKeywords ? 'Extracting...' : 'Extract Keywords'}
                    </button>
                  </div>

                  {extractedKeywords.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {extractedKeywords.map((kw, idx) => (
                        <button
                          key={`${kw.keyword}-${idx}`}
                          onClick={() => checkKeywordRank(kw.keyword)}
                          className={`px-3 py-1.5 rounded-full text-sm transition-colors ${
                            kw.type === 'phrase'
                              ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 hover:bg-purple-200'
                              : 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 hover:bg-blue-200'
                          }`}
                          title={`Click to check ranking - mentioned ${kw.count} times`}
                        >
                          {kw.keyword}
                          <span className="ml-1 text-xs opacity-60">({kw.count})</span>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <p className="text-gray-500 dark:text-gray-400 text-center py-4">
                      Click "Extract Keywords" to analyze review content
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

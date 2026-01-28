'use client';

import { useState, useEffect } from 'react';
import type { AppResult } from '@/lib/supabase';
import { COUNTRY_CODES } from '@/lib/constants';

interface Review {
  id: string;
  title: string;
  content: string;
  rating: number;
  author: string;
  version: string;
  vote_count: number;
  vote_sum: number;
  country?: string;
  sort_source?: string;
}

interface ReviewStats {
  total: number;
  average_rating: number;
  rating_distribution: Record<string, number>;
  countries_scraped?: string[];
  scrape_settings?: {
    max_pages: number;
    multiple_sorts: boolean;
    countries: string[];
  };
}

interface Props {
  app: AppResult;
  country: string;
  onClose: () => void;
}

const POPULAR_COUNTRIES = ['us', 'gb', 'ca', 'au', 'de', 'fr', 'jp', 'in', 'br', 'mx'];

export default function AppDetailModal({ app, country, onClose }: Props) {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [stats, setStats] = useState<ReviewStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [activeTab, setActiveTab] = useState<'reviews' | 'analysis' | 'settings'>('settings');

  // Scraping settings
  const [useMultipleSorts, setUseMultipleSorts] = useState(true);
  const [additionalCountries, setAdditionalCountries] = useState<string[]>([]);
  const [hasScraped, setHasScraped] = useState(false);

  const toggleCountry = (code: string) => {
    if (code === country) return; // Can't toggle primary country
    setAdditionalCountries((prev) =>
      prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code].slice(0, 3)
    );
  };

  const fetchReviews = async () => {
    setLoading(true);
    setError(null);
    setActiveTab('reviews');

    try {
      const res = await fetch('/api/reviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          appId: app.id,
          country,
          maxPages: 10,
          useMultipleSorts,
          additionalCountries,
          delay: 0.5,
        }),
      });

      if (!res.ok) {
        throw new Error('Failed to fetch reviews');
      }

      const data = await res.json();
      setReviews(data.reviews);
      setStats(data.stats);
      setHasScraped(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const analyzeReviews = async () => {
    if (reviews.length === 0) return;

    setAnalyzing(true);
    setActiveTab('analysis');

    try {
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reviews, appName: app.name }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to analyze');
      }

      const data = await res.json();
      setAnalysis(data.analysis);
    } catch (err) {
      setAnalysis(`Error: ${err instanceof Error ? err.message : 'Analysis failed'}`);
    } finally {
      setAnalyzing(false);
    }
  };

  const exportReviewsCSV = () => {
    const headers = ['Rating', 'Title', 'Content', 'Author', 'Version', 'Country', 'Votes'];
    const rows = reviews.map((r) => [
      r.rating,
      r.title,
      r.content.replace(/"/g, '""').replace(/\n/g, ' '),
      r.author,
      r.version,
      r.country || country,
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
    link.download = `${app.name.replace(/[^a-z0-9]/gi, '-')}-reviews-${reviews.length}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const exportReviewsJSON = () => {
    const exportData = {
      app: {
        id: app.id,
        name: app.name,
        developer: app.developer,
        rating: app.rating,
        review_count: app.review_count,
      },
      stats,
      reviews,
      exportDate: new Date().toISOString(),
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${app.name.replace(/[^a-z0-9]/gi, '-')}-reviews-${reviews.length}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const renderStars = (rating: number) => {
    return (
      <div className="flex gap-0.5">
        {[1, 2, 3, 4, 5].map((star) => (
          <svg
            key={star}
            className={`w-4 h-4 ${star <= rating ? 'text-yellow-400' : 'text-gray-300'}`}
            fill="currentColor"
            viewBox="0 0 20 20"
          >
            <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
          </svg>
        ))}
      </div>
    );
  };

  const estimatedReviews = (useMultipleSorts ? 2 : 1) * (1 + additionalCountries.length) * 500;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="p-6 border-b border-gray-200 dark:border-gray-700 flex items-start gap-4">
          {app.icon_url && (
            <img src={app.icon_url} alt="" className="w-16 h-16 rounded-xl" />
          )}
          <div className="flex-1 min-w-0">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white truncate">
              {app.name}
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">{app.developer}</p>
            <div className="flex items-center gap-4 mt-2">
              <div className="flex items-center gap-1">
                {renderStars(Math.round(app.rating))}
                <span className="text-sm text-gray-600 dark:text-gray-300 ml-1">
                  {app.rating?.toFixed(1)}
                </span>
              </div>
              <span className="text-sm text-gray-500">
                {app.review_count?.toLocaleString()} total reviews
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
          >
            <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Stats Bar - only show after scraping */}
        {hasScraped && stats && stats.total > 0 && (
          <div className="px-6 py-3 bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-4 flex-wrap">
                <span className="text-sm font-medium text-gray-900 dark:text-white">
                  {stats.total.toLocaleString()} reviews scraped
                </span>
                <div className="flex items-center gap-2 text-xs">
                  {[5, 4, 3, 2, 1].map((rating) => (
                    <span key={rating} className="flex items-center gap-0.5">
                      <span className="text-yellow-500">{rating}★</span>
                      <span className="text-gray-500">{stats.rating_distribution[rating] || 0}</span>
                    </span>
                  ))}
                </div>
                {stats.countries_scraped && stats.countries_scraped.length > 1 && (
                  <span className="text-xs text-gray-500">
                    from {stats.countries_scraped.map(c => c.toUpperCase()).join(', ')}
                  </span>
                )}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={exportReviewsCSV}
                  className="px-3 py-1.5 text-xs bg-green-600 hover:bg-green-700 text-white rounded transition-colors"
                >
                  Export CSV
                </button>
                <button
                  onClick={exportReviewsJSON}
                  className="px-3 py-1.5 text-xs bg-purple-600 hover:bg-purple-700 text-white rounded transition-colors"
                >
                  Export JSON
                </button>
                <button
                  onClick={analyzeReviews}
                  disabled={analyzing || reviews.length === 0}
                  className="px-3 py-1.5 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors disabled:opacity-50 flex items-center gap-1"
                >
                  {analyzing ? 'Analyzing...' : 'AI Analysis'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Tabs */}
        <div className="flex border-b border-gray-200 dark:border-gray-700">
          <button
            onClick={() => setActiveTab('settings')}
            className={`px-6 py-3 text-sm font-medium transition-colors ${
              activeTab === 'settings'
                ? 'text-blue-600 border-b-2 border-blue-600'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            Scrape Settings
          </button>
          <button
            onClick={() => setActiveTab('reviews')}
            className={`px-6 py-3 text-sm font-medium transition-colors ${
              activeTab === 'reviews'
                ? 'text-blue-600 border-b-2 border-blue-600'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            Reviews {hasScraped && `(${reviews.length})`}
          </button>
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
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* Settings Tab */}
          {activeTab === 'settings' && (
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">
                  Smart Scraping Settings
                </h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                  Configure how many reviews to scrape. Apple limits to ~500 reviews per country per sort order.
                </p>

                {/* Multiple Sorts Toggle */}
                <label className="flex items-center gap-3 mb-4">
                  <input
                    type="checkbox"
                    checked={useMultipleSorts}
                    onChange={(e) => setUseMultipleSorts(e.target.checked)}
                    className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <div>
                    <span className="text-sm font-medium text-gray-900 dark:text-white">
                      Use multiple sort orders
                    </span>
                    <p className="text-xs text-gray-500">
                      Scrape both "Most Recent" and "Most Helpful" to get more unique reviews (~2x)
                    </p>
                  </div>
                </label>

                {/* Country Selection */}
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-900 dark:text-white mb-2">
                    Additional Countries (up to 3)
                  </label>
                  <p className="text-xs text-gray-500 mb-3">
                    Primary: {COUNTRY_CODES[country] || country.toUpperCase()}. Select more countries to scrape their reviews too.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {POPULAR_COUNTRIES.filter(c => c !== country).map((code) => (
                      <button
                        key={code}
                        onClick={() => toggleCountry(code)}
                        disabled={additionalCountries.length >= 3 && !additionalCountries.includes(code)}
                        className={`px-3 py-1.5 text-xs rounded-full transition-colors ${
                          additionalCountries.includes(code)
                            ? 'bg-blue-600 text-white'
                            : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                        } disabled:opacity-50 disabled:cursor-not-allowed`}
                      >
                        {COUNTRY_CODES[code]} ({code.toUpperCase()})
                      </button>
                    ))}
                  </div>
                </div>

                {/* Estimate */}
                <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4 mb-6">
                  <div className="flex items-center gap-2 text-blue-700 dark:text-blue-300">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span className="font-medium">
                      Estimated: up to {estimatedReviews.toLocaleString()} reviews
                    </span>
                  </div>
                  <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">
                    {useMultipleSorts ? '2 sort orders' : '1 sort order'} × {1 + additionalCountries.length} {1 + additionalCountries.length === 1 ? 'country' : 'countries'} × 500 max per combination
                  </p>
                </div>

                {/* Scrape Button */}
                <button
                  onClick={fetchReviews}
                  disabled={loading}
                  className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {loading ? (
                    <>
                      <svg className="animate-spin w-5 h-5" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      Scraping Reviews...
                    </>
                  ) : (
                    <>
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                      </svg>
                      Start Scraping
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* Reviews Tab */}
          {activeTab === 'reviews' && (
            <div>
              {loading && (
                <div className="flex flex-col items-center justify-center py-12">
                  <svg className="animate-spin h-8 w-8 text-blue-600 mb-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  <p className="text-gray-600 dark:text-gray-400">Scraping reviews...</p>
                  <p className="text-xs text-gray-500 mt-1">This may take a moment for large requests</p>
                </div>
              )}

              {error && (
                <div className="bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 p-4 rounded-lg">
                  {error}
                </div>
              )}

              {!loading && !error && !hasScraped && (
                <div className="text-center py-12">
                  <svg className="w-12 h-12 mx-auto text-gray-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                  </svg>
                  <p className="text-gray-500 dark:text-gray-400 mb-4">
                    Configure settings and click "Start Scraping" to fetch reviews
                  </p>
                  <button
                    onClick={() => setActiveTab('settings')}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
                  >
                    Go to Settings
                  </button>
                </div>
              )}

              {!loading && !error && hasScraped && (
                <div className="space-y-4">
                  {reviews.length === 0 ? (
                    <p className="text-center text-gray-500 py-8">No reviews found for this app.</p>
                  ) : (
                    reviews.map((review) => (
                      <div
                        key={review.id}
                        className="p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg"
                      >
                        <div className="flex items-start justify-between mb-2">
                          <div>
                            <div className="flex items-center gap-2">
                              {renderStars(review.rating)}
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
                    ))
                  )}
                </div>
              )}
            </div>
          )}

          {/* Analysis Tab */}
          {activeTab === 'analysis' && (
            <div>
              {analyzing ? (
                <div className="flex flex-col items-center justify-center py-12">
                  <svg className="animate-spin h-8 w-8 text-blue-600 mb-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  <p className="text-gray-600 dark:text-gray-400">Analyzing {reviews.length} reviews with Claude AI...</p>
                </div>
              ) : analysis ? (
                <div className="prose dark:prose-invert max-w-none">
                  <div className="whitespace-pre-wrap text-sm text-gray-700 dark:text-gray-300">
                    {analysis}
                  </div>
                </div>
              ) : (
                <div className="text-center py-12">
                  <svg className="w-12 h-12 mx-auto text-gray-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                  </svg>
                  {!hasScraped ? (
                    <>
                      <p className="text-gray-500 dark:text-gray-400 mb-4">
                        First scrape some reviews, then analyze them with AI
                      </p>
                      <button
                        onClick={() => setActiveTab('settings')}
                        className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
                      >
                        Go to Settings
                      </button>
                    </>
                  ) : (
                    <>
                      <p className="text-gray-500 dark:text-gray-400 mb-4">
                        Click below to analyze {reviews.length} reviews with Claude AI
                      </p>
                      <button
                        onClick={analyzeReviews}
                        disabled={reviews.length === 0}
                        className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors disabled:opacity-50"
                      >
                        Analyze Reviews
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

'use client';

import { useState } from 'react';
import type { AppResult } from '@/lib/supabase';
import AppDetailModal from './AppDetailModal';

function formatNumber(n: number): string {
  if (n >= 1_000_000) {
    return `${(n / 1_000_000).toFixed(1)}M`;
  } else if (n >= 1_000) {
    return `${(n / 1_000).toFixed(1)}K`;
  }
  return n.toString();
}

function formatPrice(price: number, currency: string): string {
  if (price === 0) return 'Free';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency || 'USD',
  }).format(price);
}

export default function AppLookup() {
  const [input, setInput] = useState('');
  const [app, setApp] = useState<AppResult | null>(null);
  const [country, setCountry] = useState('us');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);
  const [selectedApp, setSelectedApp] = useState<AppResult | null>(null);
  const [dbSaveStatus, setDbSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  const handleLookup = async () => {
    if (!input.trim()) return;

    setLoading(true);
    setError(null);
    setApp(null);
    setDbSaveStatus('idle');

    try {
      const res = await fetch('/api/lookup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: input }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to look up app');
      }

      const data = await res.json();
      setApp(data.app);
      setCountry(data.country);

      // Auto-save to master database
      saveToAppsDatabase(data.app, data.country);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const saveToAppsDatabase = async (appData: AppResult, appCountry: string) => {
    setDbSaveStatus('saving');
    try {
      const res = await fetch('/api/apps', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apps: [appData],
          country: appCountry,
          category: 'lookup',
        }),
      });
      if (res.ok) {
        setDbSaveStatus('saved');
      } else {
        setDbSaveStatus('error');
      }
    } catch {
      setDbSaveStatus('error');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleLookup();
    }
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

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow">
      {/* Header - Collapsible */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full px-6 py-4 flex items-center justify-between text-left hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors rounded-lg"
      >
        <div className="flex items-center gap-3">
          <svg
            className="w-5 h-5 text-blue-600"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
          <div>
            <h3 className="font-medium text-gray-900 dark:text-white">
              Look Up a Specific App
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Paste an App Store URL or enter an app ID
            </p>
          </div>
        </div>
        <svg
          className={`w-5 h-5 text-gray-400 transition-transform ${
            isExpanded ? 'rotate-180' : ''
          }`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 9l-7 7-7-7"
          />
        </svg>
      </button>

      {/* Expanded Content */}
      {isExpanded && (
        <div className="px-6 pb-6 border-t border-gray-200 dark:border-gray-700 pt-4">
          {/* Input Section */}
          <div className="flex gap-3">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="https://apps.apple.com/us/app/app-name/id123456789 or just 123456789"
              className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              onClick={handleLookup}
              disabled={loading || !input.trim()}
              className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {loading ? (
                <>
                  <svg
                    className="animate-spin w-4 h-4"
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
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                    />
                  </svg>
                  Looking up...
                </>
              ) : (
                'Look Up'
              )}
            </button>
          </div>

          {/* Examples */}
          <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
            Examples: <code className="bg-gray-100 dark:bg-gray-700 px-1 rounded">https://apps.apple.com/us/app/headspace-sleep-meditation/id493145008</code> or <code className="bg-gray-100 dark:bg-gray-700 px-1 rounded">493145008</code>
          </p>

          {/* Error */}
          {error && (
            <div className="mt-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
              <div className="flex items-center">
                <svg
                  className="w-5 h-5 text-red-500 mr-2"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path
                    fillRule="evenodd"
                    d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                    clipRule="evenodd"
                  />
                </svg>
                <span className="text-red-700 dark:text-red-400">{error}</span>
              </div>
            </div>
          )}

          {/* App Result Card */}
          {app && (
            <div className="mt-4">
              {/* Database save status */}
              {dbSaveStatus === 'saved' && (
                <div className="mb-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-2">
                  <div className="flex items-center text-sm">
                    <svg
                      className="w-4 h-4 text-green-500 mr-2"
                      fill="currentColor"
                      viewBox="0 0 20 20"
                    >
                      <path
                        fillRule="evenodd"
                        d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                        clipRule="evenodd"
                      />
                    </svg>
                    <span className="text-green-700 dark:text-green-400">
                      Added to Apps Database
                    </span>
                  </div>
                </div>
              )}

              <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4">
                <div className="flex items-start gap-4">
                  {app.icon_url && (
                    <img
                      src={app.icon_url}
                      alt=""
                      className="w-16 h-16 rounded-xl"
                    />
                  )}
                  <div className="flex-1 min-w-0">
                    <h4 className="font-semibold text-gray-900 dark:text-white text-lg">
                      {app.name}
                    </h4>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      {app.developer}
                    </p>
                    <div className="flex items-center gap-4 mt-2 flex-wrap">
                      <div className="flex items-center gap-1">
                        {renderStars(Math.round(app.rating))}
                        <span className="text-sm text-gray-600 dark:text-gray-300 ml-1">
                          {app.rating?.toFixed(1)}
                        </span>
                      </div>
                      <span className="text-sm text-gray-500">
                        {formatNumber(app.review_count)} reviews
                      </span>
                      <span className="text-sm text-gray-500">
                        {formatPrice(app.price, app.currency)}
                      </span>
                      <span className="text-xs px-2 py-0.5 bg-gray-200 dark:bg-gray-600 rounded text-gray-600 dark:text-gray-300">
                        v{app.version}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex gap-3 mt-4 pt-4 border-t border-gray-200 dark:border-gray-600">
                  <button
                    onClick={() => setSelectedApp(app)}
                    className="flex-1 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
                  >
                    <svg
                      className="w-4 h-4"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
                      />
                    </svg>
                    Scrape Reviews
                  </button>
                  <a
                    href={app.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 font-medium rounded-lg hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors flex items-center gap-2"
                  >
                    <svg
                      className="w-4 h-4"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                      />
                    </svg>
                    App Store
                  </a>
                </div>

                {/* App Details */}
                <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-600">
                  <details className="text-sm">
                    <summary className="cursor-pointer text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300">
                      More details
                    </summary>
                    <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <span className="text-gray-500 dark:text-gray-400">
                          Bundle ID:
                        </span>{' '}
                        <span className="text-gray-900 dark:text-gray-100">
                          {app.bundle_id}
                        </span>
                      </div>
                      <div>
                        <span className="text-gray-500 dark:text-gray-400">
                          App ID:
                        </span>{' '}
                        <span className="text-gray-900 dark:text-gray-100">
                          {app.id}
                        </span>
                      </div>
                      <div>
                        <span className="text-gray-500 dark:text-gray-400">
                          Category:
                        </span>{' '}
                        <span className="text-gray-900 dark:text-gray-100">
                          {app.primary_genre}
                        </span>
                      </div>
                      <div>
                        <span className="text-gray-500 dark:text-gray-400">
                          Min OS:
                        </span>{' '}
                        <span className="text-gray-900 dark:text-gray-100">
                          iOS {app.min_os_version}
                        </span>
                      </div>
                      <div>
                        <span className="text-gray-500 dark:text-gray-400">
                          Content Rating:
                        </span>{' '}
                        <span className="text-gray-900 dark:text-gray-100">
                          {app.content_rating}
                        </span>
                      </div>
                      <div>
                        <span className="text-gray-500 dark:text-gray-400">
                          Size:
                        </span>{' '}
                        <span className="text-gray-900 dark:text-gray-100">
                          {(parseInt(app.file_size_bytes) / 1_000_000).toFixed(1)} MB
                        </span>
                      </div>
                    </div>
                    {app.description && (
                      <p className="mt-3 text-gray-600 dark:text-gray-300 text-xs line-clamp-3">
                        {app.description}
                      </p>
                    )}
                  </details>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* App Detail Modal */}
      {selectedApp && (
        <AppDetailModal
          app={selectedApp}
          country={country}
          onClose={() => setSelectedApp(null)}
        />
      )}
    </div>
  );
}

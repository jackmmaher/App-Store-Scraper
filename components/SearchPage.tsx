'use client';

import { useState } from 'react';
import Header from './Header';
import SearchForm from './SearchForm';
import AppLookup from './AppLookup';
import ResultsTable from './ResultsTable';
import ExportBar from './ExportBar';
import type { AppResult, SearchParams } from '@/lib/supabase';

export default function SearchPage() {
  const [results, setResults] = useState<AppResult[]>([]);
  const [params, setParams] = useState<SearchParams | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [dbSaveStatus, setDbSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  // Auto-save apps to master database
  const saveToAppsDatabase = async (apps: AppResult[], country: string, category: string) => {
    setDbSaveStatus('saving');
    try {
      const res = await fetch('/api/apps', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apps, country, category }),
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

  const handleSearch = async (searchParams: SearchParams) => {
    setLoading(true);
    setError(null);
    setSaved(false);
    setDbSaveStatus('idle');
    setParams(searchParams);

    try {
      const res = await fetch('/py-api/scrape', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(searchParams),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to fetch results');
      }

      const data = await res.json();
      setResults(data);

      // Auto-save to master apps database
      if (data.length > 0) {
        saveToAppsDatabase(data, searchParams.country, searchParams.category);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  const handleSaved = () => {
    setSaved(true);
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <Header />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">
          New Search
        </h1>

        <div className="space-y-6">
          <SearchForm onSearch={handleSearch} loading={loading} />

          {/* App Lookup Section */}
          <AppLookup />

          {loading && (
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-8">
              <div className="flex flex-col items-center justify-center">
                <svg
                  className="animate-spin h-10 w-10 text-blue-600 mb-4"
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
                <p className="text-gray-600 dark:text-gray-400">
                  Fetching apps from the App Store...
                </p>
                <p className="text-sm text-gray-500 dark:text-gray-500 mt-1">
                  This may take 10-30 seconds
                </p>
              </div>
            </div>
          )}

          {error && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
              <div className="flex items-center">
                <svg className="w-5 h-5 text-red-500 mr-2" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
                <span className="text-red-700 dark:text-red-400">{error}</span>
              </div>
            </div>
          )}

          {!loading && results.length > 0 && params && (
            <>
              {/* Database save status */}
              {dbSaveStatus === 'saving' && (
                <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
                  <div className="flex items-center text-sm">
                    <svg className="animate-spin w-4 h-4 text-blue-500 mr-2" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    <span className="text-blue-700 dark:text-blue-400">Saving to Apps Database...</span>
                  </div>
                </div>
              )}
              {dbSaveStatus === 'saved' && (
                <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-3">
                  <div className="flex items-center text-sm">
                    <svg className="w-4 h-4 text-green-500 mr-2" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                    <span className="text-green-700 dark:text-green-400">
                      Added to Apps Database. <a href="/apps" className="underline hover:text-green-600">View all apps →</a>
                    </span>
                  </div>
                </div>
              )}
              {dbSaveStatus === 'error' && (
                <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-3">
                  <div className="flex items-center text-sm">
                    <svg className="w-4 h-4 text-yellow-500 mr-2" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                    </svg>
                    <span className="text-yellow-700 dark:text-yellow-400">Could not save to Apps Database (results still available below)</span>
                  </div>
                </div>
              )}

              {saved && (
                <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
                  <div className="flex items-center">
                    <svg className="w-5 h-5 text-green-500 mr-2" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                    <span className="text-green-700 dark:text-green-400">Search saved successfully!</span>
                  </div>
                </div>
              )}
              <ExportBar results={results} params={params} onSave={handleSaved} />
              <ResultsTable data={results} country={params.country} />
            </>
          )}

          {!loading && !error && results.length === 0 && params && (
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-8 text-center">
              <p className="text-gray-600 dark:text-gray-400">
                No apps found matching your criteria.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

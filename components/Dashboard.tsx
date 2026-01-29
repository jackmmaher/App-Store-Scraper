'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import Header from './Header';
import SavedSearchCard from './SavedSearchCard';
import type { SavedSearch } from '@/lib/supabase';

export default function Dashboard() {
  const [searches, setSearches] = useState<SavedSearch[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSearches = async () => {
    try {
      const res = await fetch('/api/searches');
      if (!res.ok) throw new Error('Failed to fetch searches');
      const data = await res.json();
      setSearches(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSearches();
  }, []);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <Header />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4 mb-6">
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">
            Saved Searches
          </h1>
          <Link
            href="/search"
            className="bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-md transition-colors flex items-center justify-center gap-2"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            New Search
          </Link>
        </div>

        {loading && (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="bg-white dark:bg-gray-800 rounded-lg shadow p-5 animate-pulse">
                <div className="h-5 bg-gray-200 dark:bg-gray-700 rounded w-3/4 mb-3" />
                <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/2 mb-4" />
                <div className="flex gap-2">
                  <div className="h-6 bg-gray-200 dark:bg-gray-700 rounded w-16" />
                  <div className="h-6 bg-gray-200 dark:bg-gray-700 rounded w-20" />
                  <div className="h-6 bg-gray-200 dark:bg-gray-700 rounded w-14" />
                </div>
              </div>
            ))}
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

        {!loading && !error && searches.length === 0 && (
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-12 text-center">
            <svg className="w-16 h-16 mx-auto text-gray-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <h2 className="text-xl font-medium text-gray-900 dark:text-white mb-2">
              No saved searches yet
            </h2>
            <p className="text-gray-600 dark:text-gray-400 mb-6">
              Run your first search to get started
            </p>
            <Link
              href="/search"
              className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-md transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              New Search
            </Link>
          </div>
        )}

        {!loading && !error && searches.length > 0 && (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {searches.map((search) => (
              <SavedSearchCard
                key={search.id}
                search={search}
                onDelete={fetchSearches}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

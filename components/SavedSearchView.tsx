'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Header from './Header';
import ResultsTable from './ResultsTable';
import ExportBar from './ExportBar';
import type { SavedSearch } from '@/lib/supabase';
import { CATEGORY_NAMES, COUNTRY_CODES } from '@/lib/constants';

interface Props {
  searchId: string;
}

export default function SavedSearchView({ searchId }: Props) {
  const [search, setSearch] = useState<SavedSearch | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    const fetchSearch = async () => {
      try {
        const res = await fetch(`/api/searches/${searchId}`);
        if (!res.ok) {
          if (res.status === 404) {
            throw new Error('Search not found');
          }
          throw new Error('Failed to fetch search');
        }
        const data = await res.json();
        setSearch(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An error occurred');
      } finally {
        setLoading(false);
      }
    };

    fetchSearch();
  }, [searchId]);

  const handleDelete = async () => {
    if (!confirm('Are you sure you want to delete this search?')) return;

    try {
      const res = await fetch(`/api/searches/${searchId}`, { method: 'DELETE' });
      if (res.ok) {
        router.push('/');
      }
    } catch {
      alert('Failed to delete search');
    }
  };

  const handleRerun = () => {
    if (!search) return;
    const params = new URLSearchParams();
    Object.entries(search.params).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        params.set(key, String(value));
      }
    });
    router.push(`/search?${params.toString()}`);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
        <Header />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="animate-pulse space-y-6">
            <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded w-1/3" />
            <div className="h-16 bg-gray-200 dark:bg-gray-700 rounded" />
            <div className="h-96 bg-gray-200 dark:bg-gray-700 rounded" />
          </div>
        </div>
      </div>
    );
  }

  if (error || !search) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
        <Header />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
            <div className="flex items-center">
              <svg className="w-5 h-5 text-red-500 mr-2" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
              <span className="text-red-700 dark:text-red-400">{error || 'Search not found'}</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const categoryName = CATEGORY_NAMES[search.params.category] || search.params.category;
  const countryName = COUNTRY_CODES[search.params.country] || search.params.country.toUpperCase();
  const date = new Date(search.created_at);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <Header />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                {search.name || `${categoryName} - ${countryName}`}
              </h1>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                Saved on {date.toLocaleDateString()} at {date.toLocaleTimeString()}
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleRerun}
                className="px-3 py-1.5 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-md transition-colors flex items-center gap-1"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                Re-run Search
              </button>
              <button
                onClick={handleDelete}
                className="px-3 py-1.5 text-sm bg-red-600 hover:bg-red-700 text-white rounded-md transition-colors flex items-center gap-1"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
                Delete
              </button>
            </div>
          </div>

          {/* Search Parameters */}
          <div className="mt-4 flex flex-wrap gap-2 text-sm">
            <span className="px-2 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded">
              {countryName}
            </span>
            <span className="px-2 py-1 bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 rounded">
              {categoryName}
            </span>
            <span className="px-2 py-1 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded">
              Limit: {search.params.limit}
            </span>
            {search.params.includePaid && (
              <span className="px-2 py-1 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 rounded">
                Incl. Paid
              </span>
            )}
            {search.params.deepSearch && (
              <span className="px-2 py-1 bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300 rounded">
                Deep Search
              </span>
            )}
            {search.params.minReviews && (
              <span className="px-2 py-1 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded">
                Min Reviews: {search.params.minReviews}
              </span>
            )}
            {search.params.maxReviews && (
              <span className="px-2 py-1 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded">
                Max Reviews: {search.params.maxReviews}
              </span>
            )}
            {search.params.minRating && (
              <span className="px-2 py-1 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded">
                Min Rating: {search.params.minRating}
              </span>
            )}
            {search.params.maxRating && search.params.maxRating < 5 && (
              <span className="px-2 py-1 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded">
                Max Rating: {search.params.maxRating}
              </span>
            )}
          </div>
        </div>

        <div className="space-y-6">
          <ExportBar results={search.results} params={search.params} showSave={false} />
          <ResultsTable data={search.results} />
        </div>
      </div>
    </div>
  );
}

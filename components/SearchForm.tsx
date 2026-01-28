'use client';

import { useState } from 'react';
import {
  CATEGORIES,
  CATEGORY_NAMES,
  COUNTRY_CODES,
  MAIN_CATEGORIES,
  GAME_SUBCATEGORIES,
} from '@/lib/constants';
import type { SearchParams } from '@/lib/supabase';

interface Props {
  onSearch: (params: SearchParams) => void;
  loading: boolean;
  initialParams?: Partial<SearchParams>;
}

export default function SearchForm({ onSearch, loading, initialParams }: Props) {
  const [country, setCountry] = useState(initialParams?.country || 'us');
  const [category, setCategory] = useState(initialParams?.category || 'health-fitness');
  const [limit, setLimit] = useState(initialParams?.limit || 100);
  const [includePaid, setIncludePaid] = useState(initialParams?.includePaid || false);
  const [deepSearch, setDeepSearch] = useState(initialParams?.deepSearch || false);
  const [minReviews, setMinReviews] = useState(initialParams?.minReviews || 0);
  const [maxReviews, setMaxReviews] = useState(initialParams?.maxReviews || 0);
  const [minRating, setMinRating] = useState(initialParams?.minRating || 0);
  const [maxRating, setMaxRating] = useState(initialParams?.maxRating || 5);
  const [showFilters, setShowFilters] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSearch({
      country,
      category,
      limit,
      includePaid,
      deepSearch,
      minReviews: minReviews > 0 ? minReviews : undefined,
      maxReviews: maxReviews > 0 ? maxReviews : undefined,
      minRating: minRating > 0 ? minRating : undefined,
      maxRating: maxRating < 5 ? maxRating : undefined,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Country */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Country
          </label>
          <select
            value={country}
            onChange={(e) => setCountry(e.target.value)}
            className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {Object.entries(COUNTRY_CODES).map(([code, name]) => (
              <option key={code} value={code}>
                {name} ({code.toUpperCase()})
              </option>
            ))}
          </select>
        </div>

        {/* Category */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Category
          </label>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <optgroup label="Main Categories">
              {MAIN_CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>
                  {CATEGORY_NAMES[cat]}
                </option>
              ))}
            </optgroup>
            <optgroup label="Game Subcategories">
              {GAME_SUBCATEGORIES.map((cat) => (
                <option key={cat} value={cat}>
                  {CATEGORY_NAMES[cat]}
                </option>
              ))}
            </optgroup>
          </select>
        </div>

        {/* Limit */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Limit (1-200)
          </label>
          <input
            type="number"
            min={1}
            max={200}
            value={limit}
            onChange={(e) => setLimit(Math.min(200, Math.max(1, parseInt(e.target.value) || 100)))}
            className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* Search Button */}
        <div className="flex items-end">
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
          >
            {loading ? (
              <>
                <svg
                  className="animate-spin -ml-1 mr-2 h-4 w-4 text-white"
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
                Searching...
              </>
            ) : (
              'Search'
            )}
          </button>
        </div>
      </div>

      {/* Toggles */}
      <div className="mt-4 flex flex-wrap gap-4">
        <label className="flex items-center">
          <input
            type="checkbox"
            checked={includePaid}
            onChange={(e) => setIncludePaid(e.target.checked)}
            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
          <span className="ml-2 text-sm text-gray-700 dark:text-gray-300">Include Paid Apps</span>
        </label>

        <label className="flex items-center">
          <input
            type="checkbox"
            checked={deepSearch}
            onChange={(e) => setDeepSearch(e.target.checked)}
            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
          <span className="ml-2 text-sm text-gray-700 dark:text-gray-300">
            Deep Search (slower, more results)
          </span>
        </label>

        <button
          type="button"
          onClick={() => setShowFilters(!showFilters)}
          className="text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400"
        >
          {showFilters ? 'Hide Filters' : 'Show Filters'}
        </button>
      </div>

      {/* Advanced Filters */}
      {showFilters && (
        <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Min Reviews
              </label>
              <input
                type="number"
                min={0}
                value={minReviews}
                onChange={(e) => setMinReviews(parseInt(e.target.value) || 0)}
                className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Max Reviews (0 = no limit)
              </label>
              <input
                type="number"
                min={0}
                value={maxReviews}
                onChange={(e) => setMaxReviews(parseInt(e.target.value) || 0)}
                className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Min Rating (0-5)
              </label>
              <input
                type="number"
                min={0}
                max={5}
                step={0.1}
                value={minRating}
                onChange={(e) => setMinRating(parseFloat(e.target.value) || 0)}
                className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Max Rating (0-5)
              </label>
              <input
                type="number"
                min={0}
                max={5}
                step={0.1}
                value={maxRating}
                onChange={(e) => setMaxRating(parseFloat(e.target.value) || 5)}
                className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
        </div>
      )}
    </form>
  );
}

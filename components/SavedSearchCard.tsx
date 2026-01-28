'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { SavedSearch } from '@/lib/supabase';
import { CATEGORY_NAMES, COUNTRY_CODES } from '@/lib/constants';

interface Props {
  search: SavedSearch;
  onDelete?: () => void;
}

export default function SavedSearchCard({ search, onDelete }: Props) {
  const router = useRouter();

  const handleDelete = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (!confirm('Are you sure you want to delete this search?')) return;

    try {
      const res = await fetch(`/api/searches/${search.id}`, { method: 'DELETE' });
      if (res.ok && onDelete) {
        onDelete();
      }
    } catch {
      alert('Failed to delete search');
    }
  };

  const handleRerun = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const params = new URLSearchParams();
    Object.entries(search.params).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        params.set(key, String(value));
      }
    });
    router.push(`/search?${params.toString()}`);
  };

  const categoryName = CATEGORY_NAMES[search.params.category] || search.params.category;
  const countryName = COUNTRY_CODES[search.params.country] || search.params.country.toUpperCase();
  const date = new Date(search.created_at);

  return (
    <Link
      href={`/search/${search.id}`}
      className="block bg-white dark:bg-gray-800 rounded-lg shadow hover:shadow-md transition-shadow p-5"
    >
      <div className="flex justify-between items-start mb-3">
        <div>
          <h3 className="font-medium text-gray-900 dark:text-white">
            {search.name || `${categoryName} - ${countryName}`}
          </h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            {date.toLocaleDateString()} at {date.toLocaleTimeString()}
          </p>
        </div>
        <div className="flex gap-1">
          <button
            onClick={handleRerun}
            className="p-1.5 text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
            title="Re-run search"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
          <button
            onClick={handleDelete}
            className="p-1.5 text-gray-400 hover:text-red-600 dark:hover:text-red-400 transition-colors"
            title="Delete search"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 text-xs">
        <span className="px-2 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded">
          {countryName}
        </span>
        <span className="px-2 py-1 bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 rounded">
          {categoryName}
        </span>
        <span className="px-2 py-1 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded">
          {search.result_count} apps
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
      </div>
    </Link>
  );
}

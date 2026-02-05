'use client';

import { useState, useEffect, useCallback } from 'react';
import { MasterApp, AppFilters as AppFiltersType } from '@/lib/supabase';
import AppFilters from './AppFilters';
import AppDetailModal from './AppDetailModal';

interface AppsMeta {
  categories: string[];
  countries: string[];
  stats: {
    totalApps: number;
    totalCategories: number;
    totalCountries: number;
    avgRating: number;
    avgReviews: number;
  };
}

export default function AppsDatabase() {
  const [apps, setApps] = useState<MasterApp[]>([]);
  const [totalApps, setTotalApps] = useState(0);
  const [filteredCount, setFilteredCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [meta, setMeta] = useState<AppsMeta | null>(null);
  const [filters, setFilters] = useState<AppFiltersType>({
    sortBy: 'reviews',
    sortOrder: 'desc',
    limit: 50,
    offset: 0,
  });

  const [selectedApp, setSelectedApp] = useState<MasterApp | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Fetch metadata (categories, countries, stats)
  useEffect(() => {
    fetch('/api/apps/meta')
      .then((res) => {
        if (!res.ok) throw new Error('Failed to load metadata');
        return res.json();
      })
      .then((data) => {
        setMeta(data);
        setTotalApps(data.stats?.totalApps || 0);
      })
      .catch((err) => {
        console.error('Error loading metadata:', err);
        setError(err instanceof Error ? err.message : 'Failed to load metadata');
      });
  }, []);

  // Fetch apps with filters
  const fetchApps = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filters.minReviews) params.set('minReviews', filters.minReviews.toString());
      if (filters.maxReviews) params.set('maxReviews', filters.maxReviews.toString());
      if (filters.minRating) params.set('minRating', filters.minRating.toString());
      if (filters.maxRating) params.set('maxRating', filters.maxRating.toString());
      if (filters.priceType && filters.priceType !== 'all') params.set('priceType', filters.priceType);
      if (filters.categories?.length) params.set('categories', filters.categories.join(','));
      if (filters.countries?.length) params.set('countries', filters.countries.join(','));
      if (filters.search) params.set('search', filters.search);
      if (filters.sortBy) params.set('sortBy', filters.sortBy);
      if (filters.sortOrder) params.set('sortOrder', filters.sortOrder);
      if (filters.limit) params.set('limit', filters.limit.toString());
      if (filters.offset) params.set('offset', filters.offset.toString());

      const res = await fetch(`/api/apps?${params.toString()}`);
      if (!res.ok) throw new Error('Failed to fetch apps');
      const data = await res.json();
      setApps(data.apps || []);
      setFilteredCount(data.total || 0);
      setError(null);
    } catch (err) {
      console.error('Error fetching apps:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch apps');
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    fetchApps();
  }, [fetchApps]);

  const formatNumber = (num: number) => {
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
    return num.toString();
  };

  const handleExport = (format: 'csv' | 'json') => {
    if (format === 'json') {
      const blob = new Blob([JSON.stringify(apps, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `apps-database-${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } else {
      const headers = ['Name', 'Developer', 'Reviews', 'Rating', 'Price', 'Category', 'URL'];
      const rows = apps.map((app) => [
        `"${app.name.replace(/"/g, '""')}"`,
        `"${(app.developer || '').replace(/"/g, '""')}"`,
        app.review_count,
        app.rating || '',
        app.price,
        app.primary_genre || '',
        app.url || '',
      ]);
      const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `apps-database-${new Date().toISOString().split('T')[0]}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    }
  };

  const currentPage = Math.floor((filters.offset || 0) / (filters.limit || 50)) + 1;
  const totalPages = Math.ceil(filteredCount / (filters.limit || 50));

  // Handle column sort click
  const handleSort = (column: string) => {
    const newOrder = filters.sortBy === column && filters.sortOrder === 'desc' ? 'asc' : 'desc';
    setFilters({ ...filters, sortBy: column as typeof filters.sortBy, sortOrder: newOrder, offset: 0 });
  };

  // Render sort indicator
  const SortIndicator = ({ column }: { column: string }) => {
    if (filters.sortBy !== column) {
      return <span className="text-gray-300 ml-1">↕</span>;
    }
    return <span className="text-blue-600 ml-1">{filters.sortOrder === 'asc' ? '↑' : '↓'}</span>;
  };

  return (
    <div className="space-y-4">
      {/* Stats Cards */}
      {meta?.stats && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <div className="text-2xl font-bold text-blue-600">{meta.stats.totalApps.toLocaleString()}</div>
            <div className="text-sm text-gray-500">Total Apps</div>
          </div>
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <div className="text-2xl font-bold text-purple-600">{meta.stats.totalCategories}</div>
            <div className="text-sm text-gray-500">Categories</div>
          </div>
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <div className="text-2xl font-bold text-green-600">{meta.stats.totalCountries}</div>
            <div className="text-sm text-gray-500">Countries</div>
          </div>
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <div className="text-2xl font-bold text-yellow-600">{meta.stats.avgRating.toFixed(1)}</div>
            <div className="text-sm text-gray-500">Avg Rating</div>
          </div>
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <div className="text-2xl font-bold text-red-600">{formatNumber(meta.stats.avgReviews)}</div>
            <div className="text-sm text-gray-500">Avg Reviews</div>
          </div>
        </div>
      )}

      {/* Filters */}
      <AppFilters
        filters={filters}
        onFiltersChange={setFilters}
        availableCategories={meta?.categories || []}
        availableCountries={meta?.countries || []}
        totalApps={totalApps}
        filteredCount={filteredCount}
      />

      {/* Export Buttons */}
      <div className="flex justify-end gap-2">
        <button
          onClick={() => handleExport('csv')}
          className="px-3 py-1.5 text-sm bg-green-500 text-white rounded hover:bg-green-600"
          disabled={apps.length === 0}
        >
          Export CSV
        </button>
        <button
          onClick={() => handleExport('json')}
          className="px-3 py-1.5 text-sm bg-blue-500 text-white rounded hover:bg-blue-600"
          disabled={apps.length === 0}
        >
          Export JSON
        </button>
      </div>

      {/* Apps Table */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-gray-500">Loading apps...</div>
        ) : apps.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            <p className="text-lg font-medium">No apps found</p>
            <p className="text-sm mt-1">Try adjusting your filters or run some scrapes to populate the database.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th
                    onClick={() => handleSort('name')}
                    className="px-2 sm:px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 select-none"
                  >
                    App<SortIndicator column="name" />
                  </th>
                  <th
                    onClick={() => handleSort('developer')}
                    className="hidden lg:table-cell px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 select-none"
                  >
                    Developer<SortIndicator column="developer" />
                  </th>
                  <th
                    onClick={() => handleSort('reviews')}
                    className="px-2 sm:px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 select-none"
                  >
                    Reviews<SortIndicator column="reviews" />
                  </th>
                  <th
                    onClick={() => handleSort('rating')}
                    className="px-2 sm:px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 select-none"
                  >
                    Rating<SortIndicator column="rating" />
                  </th>
                  <th
                    onClick={() => handleSort('price')}
                    className="hidden sm:table-cell px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 select-none"
                  >
                    Price<SortIndicator column="price" />
                  </th>
                  <th
                    onClick={() => handleSort('category')}
                    className="hidden md:table-cell px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 select-none"
                  >
                    Category<SortIndicator column="category" />
                  </th>
                  <th className="hidden lg:table-cell px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Countries
                  </th>
                  <th
                    onClick={() => handleSort('scrapes')}
                    className="hidden xl:table-cell px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 select-none"
                  >
                    Scrapes<SortIndicator column="scrapes" />
                  </th>
                  <th className="hidden lg:table-cell px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Keywords
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {apps.map((app) => (
                  <tr
                    key={app.id}
                    className="hover:bg-gray-50 cursor-pointer"
                    onClick={() => setSelectedApp(app)}
                  >
                    <td className="px-2 sm:px-4 py-3">
                      <div className="flex items-center gap-2 sm:gap-3">
                        {app.icon_url && (
                          <img
                            src={app.icon_url}
                            alt=""
                            className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg flex-shrink-0"
                          />
                        )}
                        <div className="min-w-0">
                          <div className="font-medium text-gray-900 text-xs sm:text-sm truncate max-w-[120px] sm:max-w-none">{app.name}</div>
                          <div className="text-xs text-gray-500 truncate max-w-[100px] sm:max-w-none">{app.bundle_id}</div>
                        </div>
                      </div>
                    </td>
                    <td className="hidden lg:table-cell px-4 py-3 text-sm text-gray-600 max-w-[200px] truncate">
                      {app.developer}
                    </td>
                    <td className="px-2 sm:px-4 py-3 text-xs sm:text-sm text-right font-medium">
                      {formatNumber(app.review_count)}
                    </td>
                    <td className="px-2 sm:px-4 py-3 text-xs sm:text-sm text-right">
                      {app.rating ? (
                        <span className={`font-medium ${
                          app.rating >= 4 ? 'text-green-600' :
                          app.rating >= 3 ? 'text-yellow-600' : 'text-red-600'
                        }`}>
                          {app.rating.toFixed(1)}
                        </span>
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </td>
                    <td className="hidden sm:table-cell px-4 py-3 text-sm text-right">
                      {app.price === 0 ? (
                        <span className="text-green-600">Free</span>
                      ) : (
                        <span>${app.price.toFixed(2)}</span>
                      )}
                    </td>
                    <td className="hidden md:table-cell px-4 py-3 text-sm text-gray-600">
                      {app.primary_genre || '-'}
                    </td>
                    <td className="hidden lg:table-cell px-4 py-3 text-sm text-gray-600">
                      {app.countries_found?.slice(0, 3).map(c => c.toUpperCase()).join(', ')}
                      {(app.countries_found?.length || 0) > 3 && ` +${app.countries_found!.length - 3}`}
                    </td>
                    <td className="hidden xl:table-cell px-4 py-3 text-sm text-right text-gray-500">
                      {app.scrape_count}
                    </td>
                    <td className="hidden lg:table-cell px-4 py-3 text-center">
                      <a
                        href={`/keywords?q=${encodeURIComponent(app.name.split(/[:-]/)[0].trim())}`}
                        onClick={(e) => e.stopPropagation()}
                        className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 hover:underline"
                        title={`Research keywords related to "${app.name}"`}
                      >
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                        </svg>
                        Research
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <div className="text-sm text-gray-500">
            Page {currentPage} of {totalPages}
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setFilters({ ...filters, offset: Math.max(0, (filters.offset || 0) - (filters.limit || 50)) })}
              disabled={currentPage === 1}
              className="px-3 py-1.5 text-sm border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Previous
            </button>
            <button
              onClick={() => setFilters({ ...filters, offset: (filters.offset || 0) + (filters.limit || 50) })}
              disabled={currentPage === totalPages}
              className="px-3 py-1.5 text-sm border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Next
            </button>
          </div>
        </div>
      )}

      {/* App Detail Modal */}
      {selectedApp && (
        <AppDetailModal
          app={{
            id: selectedApp.app_store_id,
            name: selectedApp.name,
            bundle_id: selectedApp.bundle_id || '',
            developer: selectedApp.developer || '',
            developer_id: selectedApp.developer_id || '',
            price: selectedApp.price,
            currency: selectedApp.currency,
            rating: selectedApp.rating || 0,
            rating_current_version: selectedApp.rating_current_version || 0,
            review_count: selectedApp.review_count,
            review_count_current_version: selectedApp.review_count_current_version,
            version: selectedApp.version || '',
            release_date: selectedApp.release_date || '',
            current_version_release_date: selectedApp.current_version_release_date || '',
            min_os_version: selectedApp.min_os_version || '',
            file_size_bytes: selectedApp.file_size_bytes?.toString() || '',
            content_rating: selectedApp.content_rating || '',
            genres: selectedApp.genres || [],
            primary_genre: selectedApp.primary_genre || '',
            primary_genre_id: selectedApp.primary_genre_id || '',
            url: selectedApp.url || '',
            icon_url: selectedApp.icon_url || '',
            description: selectedApp.description || '',
          }}
          country={selectedApp.countries_found?.[0] || 'us'}
          onClose={() => setSelectedApp(null)}
        />
      )}
    </div>
  );
}

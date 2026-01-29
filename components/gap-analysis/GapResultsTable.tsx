'use client';

import { useState, useMemo } from 'react';
import type { GapAnalysisApp } from '@/lib/supabase';
import GapClassificationBadge from './GapClassificationBadge';
import GapCountryPresenceGrid from './GapCountryPresenceGrid';

interface Props {
  apps: GapAnalysisApp[];
  countries: string[];
  onSelectApp: (app: GapAnalysisApp) => void;
  onAnalyzeApp: (appStoreId: string) => void;
  isAnalyzing: boolean;
}

type SortField = 'presence' | 'rank' | 'rating' | 'reviews' | 'name';
type FilterClassification = 'all' | 'global_leader' | 'brand' | 'local_champion' | 'unclassified';

export default function GapResultsTable({
  apps,
  countries,
  onSelectApp,
  onAnalyzeApp,
  isAnalyzing,
}: Props) {
  const [search, setSearch] = useState('');
  const [sortField, setSortField] = useState<SortField>('presence');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [filterClassification, setFilterClassification] = useState<FilterClassification>('all');

  // Filter and sort apps
  const filteredApps = useMemo(() => {
    let result = [...apps];

    // Search filter
    if (search) {
      const searchLower = search.toLowerCase();
      result = result.filter(
        (app) =>
          app.app_name.toLowerCase().includes(searchLower) ||
          app.app_developer?.toLowerCase().includes(searchLower)
      );
    }

    // Classification filter
    if (filterClassification !== 'all') {
      if (filterClassification === 'unclassified') {
        result = result.filter((app) => !app.classification);
      } else {
        result = result.filter((app) => app.classification === filterClassification);
      }
    }

    // Sort
    result.sort((a, b) => {
      let comparison = 0;

      switch (sortField) {
        case 'presence':
          comparison = a.presence_count - b.presence_count;
          break;
        case 'rank':
          comparison = (a.average_rank || 999) - (b.average_rank || 999);
          break;
        case 'rating':
          comparison = (a.app_rating || 0) - (b.app_rating || 0);
          break;
        case 'reviews':
          comparison = a.app_review_count - b.app_review_count;
          break;
        case 'name':
          comparison = a.app_name.localeCompare(b.app_name);
          break;
      }

      return sortOrder === 'asc' ? comparison : -comparison;
    });

    return result;
  }, [apps, search, sortField, sortOrder, filterClassification]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortOrder(field === 'rank' ? 'asc' : 'desc');
    }
  };

  const SortHeader = ({ field, label }: { field: SortField; label: string }) => (
    <th
      className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:text-gray-700 dark:hover:text-gray-200"
      onClick={() => handleSort(field)}
    >
      <div className="flex items-center gap-1">
        {label}
        {sortField === field && (
          <span>{sortOrder === 'asc' ? '\u2191' : '\u2193'}</span>
        )}
      </div>
    </th>
  );

  // Stats
  const stats = useMemo(() => ({
    total: apps.length,
    globalLeaders: apps.filter((a) => a.classification === 'global_leader').length,
    brands: apps.filter((a) => a.classification === 'brand').length,
    localChampions: apps.filter((a) => a.classification === 'local_champion').length,
    unclassified: apps.filter((a) => !a.classification).length,
  }), [apps]);

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow">
      {/* Header with filters */}
      <div className="p-4 border-b border-gray-200 dark:border-gray-700">
        <div className="flex flex-col sm:flex-row gap-4 justify-between">
          {/* Search */}
          <div className="relative flex-1 max-w-md">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search apps..."
              className="w-full pl-10 pr-4 py-2 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <svg
              className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400"
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
          </div>

          {/* Classification filter */}
          <div className="flex gap-2 flex-wrap">
            {[
              { value: 'all', label: `All (${stats.total})` },
              { value: 'global_leader', label: `Leaders (${stats.globalLeaders})` },
              { value: 'brand', label: `Brands (${stats.brands})` },
              { value: 'local_champion', label: `Local (${stats.localChampions})` },
              { value: 'unclassified', label: `Other (${stats.unclassified})` },
            ].map(({ value, label }) => (
              <button
                key={value}
                onClick={() => setFilterClassification(value as FilterClassification)}
                className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${
                  filterClassification === value
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-2 text-sm text-gray-500 dark:text-gray-400">
          Showing {filteredApps.length} of {apps.length} apps
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
          <thead className="bg-gray-50 dark:bg-gray-900">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                App
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Classification
              </th>
              <SortHeader field="presence" label="Presence" />
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Countries
              </th>
              <SortHeader field="rank" label="Avg Rank" />
              <SortHeader field="rating" label="Rating" />
              <SortHeader field="reviews" label="Reviews" />
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
            {filteredApps.map((app) => (
              <tr
                key={app.id}
                className="hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer"
                onClick={() => onSelectApp(app)}
              >
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    {app.app_icon_url ? (
                      <img
                        src={app.app_icon_url}
                        alt={app.app_name}
                        className="w-10 h-10 rounded-lg"
                      />
                    ) : (
                      <div className="w-10 h-10 rounded-lg bg-gray-200 dark:bg-gray-600" />
                    )}
                    <div>
                      <div className="font-medium text-gray-900 dark:text-white">
                        {app.app_name}
                      </div>
                      <div className="text-sm text-gray-500 dark:text-gray-400">
                        {app.app_developer || 'Unknown'}
                      </div>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <GapClassificationBadge
                    classification={app.classification}
                    reason={app.classification_reason}
                    size="sm"
                  />
                </td>
                <td className="px-4 py-3 text-sm text-gray-900 dark:text-white">
                  {app.presence_count}/{countries.length}
                </td>
                <td className="px-4 py-3">
                  <GapCountryPresenceGrid
                    countries={countries}
                    countriesPresent={app.countries_present}
                    countryRanks={app.country_ranks}
                    compact
                  />
                </td>
                <td className="px-4 py-3 text-sm text-gray-900 dark:text-white">
                  {app.average_rank?.toFixed(1) || '-'}
                </td>
                <td className="px-4 py-3 text-sm text-gray-900 dark:text-white">
                  {app.app_rating?.toFixed(1) || '-'}
                </td>
                <td className="px-4 py-3 text-sm text-gray-900 dark:text-white">
                  {app.app_review_count?.toLocaleString() || '0'}
                </td>
                <td className="px-4 py-3">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onAnalyzeApp(app.app_store_id);
                    }}
                    disabled={isAnalyzing}
                    className="text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 text-sm font-medium disabled:opacity-50"
                  >
                    {isAnalyzing ? 'Analyzing...' : 'Analyze'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {filteredApps.length === 0 && (
          <div className="p-8 text-center text-gray-500 dark:text-gray-400">
            No apps match your filters
          </div>
        )}
      </div>
    </div>
  );
}

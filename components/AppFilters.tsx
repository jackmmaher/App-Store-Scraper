'use client';

import { useState, useEffect } from 'react';
import { AppFilters as AppFiltersType } from '@/lib/supabase';
import { COUNTRIES, CATEGORIES } from '@/lib/constants';

interface AppFiltersProps {
  filters: AppFiltersType;
  onFiltersChange: (filters: AppFiltersType) => void;
  availableCategories: string[];
  availableCountries: string[];
  totalApps: number;
  filteredCount: number;
}

const REVIEW_PRESETS = [
  { label: 'Any', value: undefined },
  { label: '1K+', value: 1000 },
  { label: '5K+', value: 5000 },
  { label: '10K+', value: 10000 },
  { label: '50K+', value: 50000 },
  { label: '100K+', value: 100000 },
];

export default function AppFilters({
  filters,
  onFiltersChange,
  availableCategories,
  availableCountries,
  totalApps,
  filteredCount,
}: AppFiltersProps) {
  const [search, setSearch] = useState(filters.search || '');
  const [showCategoryDropdown, setShowCategoryDropdown] = useState(false);
  const [showCountryDropdown, setShowCountryDropdown] = useState(false);

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      if (search !== filters.search) {
        onFiltersChange({ ...filters, search: search || undefined, offset: 0 });
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  const updateFilter = (key: keyof AppFiltersType, value: unknown) => {
    onFiltersChange({ ...filters, [key]: value, offset: 0 });
  };

  const toggleCategory = (category: string) => {
    const current = filters.categories || [];
    const updated = current.includes(category)
      ? current.filter(c => c !== category)
      : [...current, category];
    updateFilter('categories', updated.length > 0 ? updated : undefined);
  };

  const toggleCountry = (country: string) => {
    const current = filters.countries || [];
    const updated = current.includes(country)
      ? current.filter(c => c !== country)
      : [...current, country];
    updateFilter('countries', updated.length > 0 ? updated : undefined);
  };

  const resetFilters = () => {
    setSearch('');
    onFiltersChange({
      sortBy: 'reviews',
      sortOrder: 'desc',
      limit: 50,
      offset: 0,
    });
  };

  const applyQuickFilter = (preset: 'highReviewsLowRating' | 'newThisWeek' | 'recentlyUpdated') => {
    switch (preset) {
      case 'highReviewsLowRating':
        onFiltersChange({
          ...filters,
          minReviews: 5000,
          maxRating: 2.5,
          offset: 0,
        });
        break;
      case 'newThisWeek':
        // This would need date filtering - for now just sort by newest
        onFiltersChange({
          ...filters,
          sortBy: 'newest',
          sortOrder: 'desc',
          offset: 0,
        });
        break;
      case 'recentlyUpdated':
        onFiltersChange({
          ...filters,
          sortBy: 'updated',
          sortOrder: 'desc',
          offset: 0,
        });
        break;
    }
  };

  const getCategoryLabel = (slug: string) => {
    const cat = CATEGORIES.find(c => c.id === slug);
    return cat?.name || slug;
  };

  const getCountryLabel = (code: string) => {
    const country = COUNTRIES.find(c => c.code === code);
    return country?.name || code.toUpperCase();
  };

  const hasActiveFilters =
    filters.minReviews ||
    filters.maxReviews ||
    filters.minRating ||
    filters.maxRating ||
    filters.priceType !== 'all' && filters.priceType ||
    (filters.categories && filters.categories.length > 0) ||
    (filters.countries && filters.countries.length > 0) ||
    filters.search;

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4 space-y-4">
      {/* Search */}
      <div>
        <input
          type="text"
          placeholder="Search apps, developers, bundle IDs..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
      </div>

      {/* Filters Row 1: Reviews and Rating */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Min Reviews */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Min Reviews</label>
          <select
            value={filters.minReviews || ''}
            onChange={(e) => updateFilter('minReviews', e.target.value ? parseInt(e.target.value) : undefined)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
          >
            {REVIEW_PRESETS.map(p => (
              <option key={p.label} value={p.value || ''}>{p.label}</option>
            ))}
          </select>
        </div>

        {/* Max Reviews */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Max Reviews</label>
          <input
            type="number"
            placeholder="Any"
            value={filters.maxReviews || ''}
            onChange={(e) => updateFilter('maxReviews', e.target.value ? parseInt(e.target.value) : undefined)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* Min Rating */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Min Rating</label>
          <input
            type="number"
            step="0.1"
            min="0"
            max="5"
            placeholder="0"
            value={filters.minRating || ''}
            onChange={(e) => updateFilter('minRating', e.target.value ? parseFloat(e.target.value) : undefined)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* Max Rating */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Max Rating</label>
          <input
            type="number"
            step="0.1"
            min="0"
            max="5"
            placeholder="5"
            value={filters.maxRating || ''}
            onChange={(e) => updateFilter('maxRating', e.target.value ? parseFloat(e.target.value) : undefined)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      {/* Filters Row 2: Price and Dropdowns */}
      <div className="flex flex-wrap items-center gap-4">
        {/* Price Type */}
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-gray-700">Price:</span>
          <div className="flex rounded-lg overflow-hidden border border-gray-300">
            {(['all', 'free', 'paid'] as const).map((type) => (
              <button
                key={type}
                onClick={() => updateFilter('priceType', type)}
                className={`px-3 py-1.5 text-sm capitalize ${
                  (filters.priceType || 'all') === type
                    ? 'bg-blue-500 text-white'
                    : 'bg-white text-gray-700 hover:bg-gray-50'
                }`}
              >
                {type}
              </button>
            ))}
          </div>
        </div>

        {/* Categories Dropdown */}
        <div className="relative">
          <button
            onClick={() => {
              setShowCategoryDropdown(!showCategoryDropdown);
              setShowCountryDropdown(false);
            }}
            className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg bg-white hover:bg-gray-50 flex items-center gap-2"
          >
            Categories
            {filters.categories && filters.categories.length > 0 && (
              <span className="bg-blue-500 text-white text-xs px-1.5 py-0.5 rounded-full">
                {filters.categories.length}
              </span>
            )}
          </button>
          {showCategoryDropdown && (
            <div className="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-20 w-64 max-h-64 overflow-y-auto">
              {availableCategories.length === 0 ? (
                <div className="p-3 text-sm text-gray-500">No categories found</div>
              ) : (
                availableCategories.map((cat) => (
                  <label
                    key={cat}
                    className="flex items-center gap-2 px-3 py-2 hover:bg-gray-50 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={filters.categories?.includes(cat) || false}
                      onChange={() => toggleCategory(cat)}
                      className="rounded border-gray-300 text-blue-500 focus:ring-blue-500"
                    />
                    <span className="text-sm">{getCategoryLabel(cat)}</span>
                  </label>
                ))
              )}
            </div>
          )}
        </div>

        {/* Countries Dropdown */}
        <div className="relative">
          <button
            onClick={() => {
              setShowCountryDropdown(!showCountryDropdown);
              setShowCategoryDropdown(false);
            }}
            className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg bg-white hover:bg-gray-50 flex items-center gap-2"
          >
            Countries
            {filters.countries && filters.countries.length > 0 && (
              <span className="bg-blue-500 text-white text-xs px-1.5 py-0.5 rounded-full">
                {filters.countries.length}
              </span>
            )}
          </button>
          {showCountryDropdown && (
            <div className="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-20 w-48 max-h-64 overflow-y-auto">
              {availableCountries.length === 0 ? (
                <div className="p-3 text-sm text-gray-500">No countries found</div>
              ) : (
                availableCountries.map((country) => (
                  <label
                    key={country}
                    className="flex items-center gap-2 px-3 py-2 hover:bg-gray-50 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={filters.countries?.includes(country) || false}
                      onChange={() => toggleCountry(country)}
                      className="rounded border-gray-300 text-blue-500 focus:ring-blue-500"
                    />
                    <span className="text-sm">{getCountryLabel(country)}</span>
                  </label>
                ))
              )}
            </div>
          )}
        </div>

        {/* Sort */}
        <div className="flex items-center gap-2 ml-auto">
          <span className="text-sm font-medium text-gray-700">Sort:</span>
          <select
            value={filters.sortBy || 'reviews'}
            onChange={(e) => updateFilter('sortBy', e.target.value)}
            className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
          >
            <option value="reviews">Reviews</option>
            <option value="rating">Rating</option>
            <option value="newest">Newest</option>
            <option value="updated">Recently Updated</option>
            <option value="name">Name</option>
          </select>
          <button
            onClick={() => updateFilter('sortOrder', filters.sortOrder === 'asc' ? 'desc' : 'asc')}
            className="px-2 py-1.5 text-sm border border-gray-300 rounded-lg bg-white hover:bg-gray-50"
            title={filters.sortOrder === 'asc' ? 'Ascending' : 'Descending'}
          >
            {filters.sortOrder === 'asc' ? '↑' : '↓'}
          </button>
        </div>
      </div>

      {/* Quick Filters and Active Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-gray-500">Quick:</span>
        <button
          onClick={() => applyQuickFilter('highReviewsLowRating')}
          className="px-2 py-1 text-xs bg-red-50 text-red-700 rounded hover:bg-red-100"
        >
          High Reviews, Low Rating
        </button>
        <button
          onClick={() => applyQuickFilter('newThisWeek')}
          className="px-2 py-1 text-xs bg-green-50 text-green-700 rounded hover:bg-green-100"
        >
          Newest First
        </button>
        <button
          onClick={() => applyQuickFilter('recentlyUpdated')}
          className="px-2 py-1 text-xs bg-blue-50 text-blue-700 rounded hover:bg-blue-100"
        >
          Recently Updated
        </button>

        {hasActiveFilters && (
          <button
            onClick={resetFilters}
            className="px-2 py-1 text-xs bg-gray-100 text-gray-700 rounded hover:bg-gray-200 ml-2"
          >
            Clear All Filters
          </button>
        )}
      </div>

      {/* Active Filter Chips */}
      {hasActiveFilters && (
        <div className="flex flex-wrap gap-2">
          {filters.minReviews && (
            <span className="inline-flex items-center gap-1 px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded-full">
              Reviews ≥ {filters.minReviews.toLocaleString()}
              <button onClick={() => updateFilter('minReviews', undefined)} className="hover:text-blue-600">×</button>
            </span>
          )}
          {filters.maxReviews && (
            <span className="inline-flex items-center gap-1 px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded-full">
              Reviews ≤ {filters.maxReviews.toLocaleString()}
              <button onClick={() => updateFilter('maxReviews', undefined)} className="hover:text-blue-600">×</button>
            </span>
          )}
          {filters.minRating && (
            <span className="inline-flex items-center gap-1 px-2 py-1 bg-yellow-100 text-yellow-800 text-xs rounded-full">
              Rating ≥ {filters.minRating}
              <button onClick={() => updateFilter('minRating', undefined)} className="hover:text-yellow-600">×</button>
            </span>
          )}
          {filters.maxRating && (
            <span className="inline-flex items-center gap-1 px-2 py-1 bg-yellow-100 text-yellow-800 text-xs rounded-full">
              Rating ≤ {filters.maxRating}
              <button onClick={() => updateFilter('maxRating', undefined)} className="hover:text-yellow-600">×</button>
            </span>
          )}
          {filters.priceType && filters.priceType !== 'all' && (
            <span className="inline-flex items-center gap-1 px-2 py-1 bg-green-100 text-green-800 text-xs rounded-full">
              {filters.priceType === 'free' ? 'Free Only' : 'Paid Only'}
              <button onClick={() => updateFilter('priceType', 'all')} className="hover:text-green-600">×</button>
            </span>
          )}
          {filters.categories?.map((cat) => (
            <span key={cat} className="inline-flex items-center gap-1 px-2 py-1 bg-purple-100 text-purple-800 text-xs rounded-full">
              {getCategoryLabel(cat)}
              <button onClick={() => toggleCategory(cat)} className="hover:text-purple-600">×</button>
            </span>
          ))}
          {filters.countries?.map((country) => (
            <span key={country} className="inline-flex items-center gap-1 px-2 py-1 bg-indigo-100 text-indigo-800 text-xs rounded-full">
              {getCountryLabel(country)}
              <button onClick={() => toggleCountry(country)} className="hover:text-indigo-600">×</button>
            </span>
          ))}
          {filters.search && (
            <span className="inline-flex items-center gap-1 px-2 py-1 bg-gray-100 text-gray-800 text-xs rounded-full">
              Search: &quot;{filters.search}&quot;
              <button onClick={() => { setSearch(''); updateFilter('search', undefined); }} className="hover:text-gray-600">×</button>
            </span>
          )}
        </div>
      )}

      {/* Results Count */}
      <div className="text-sm text-gray-600 border-t border-gray-200 pt-3">
        Showing <span className="font-semibold">{filteredCount.toLocaleString()}</span> of{' '}
        <span className="font-semibold">{totalApps.toLocaleString()}</span> apps
      </div>
    </div>
  );
}

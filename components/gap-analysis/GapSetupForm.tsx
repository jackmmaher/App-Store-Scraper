'use client';

import { useState } from 'react';
import {
  CATEGORY_NAMES,
  COUNTRY_CODES,
  CATEGORY_GROUPS,
} from '@/lib/constants';

interface Props {
  onSubmit: (data: {
    name?: string;
    category: string;
    countries: string[];
    appsPerCountry: number;
  }) => void;
  loading: boolean;
}

// Country flags emoji mapping
const COUNTRY_FLAGS: Record<string, string> = {
  us: '\u{1F1FA}\u{1F1F8}',
  gb: '\u{1F1EC}\u{1F1E7}',
  ca: '\u{1F1E8}\u{1F1E6}',
  au: '\u{1F1E6}\u{1F1FA}',
  de: '\u{1F1E9}\u{1F1EA}',
  fr: '\u{1F1EB}\u{1F1F7}',
  jp: '\u{1F1EF}\u{1F1F5}',
  cn: '\u{1F1E8}\u{1F1F3}',
  kr: '\u{1F1F0}\u{1F1F7}',
  in: '\u{1F1EE}\u{1F1F3}',
  br: '\u{1F1E7}\u{1F1F7}',
  mx: '\u{1F1F2}\u{1F1FD}',
  es: '\u{1F1EA}\u{1F1F8}',
  it: '\u{1F1EE}\u{1F1F9}',
  nl: '\u{1F1F3}\u{1F1F1}',
  se: '\u{1F1F8}\u{1F1EA}',
  no: '\u{1F1F3}\u{1F1F4}',
  dk: '\u{1F1E9}\u{1F1F0}',
  fi: '\u{1F1EB}\u{1F1EE}',
  ru: '\u{1F1F7}\u{1F1FA}',
  pl: '\u{1F1F5}\u{1F1F1}',
  tr: '\u{1F1F9}\u{1F1F7}',
  sa: '\u{1F1F8}\u{1F1E6}',
  ae: '\u{1F1E6}\u{1F1EA}',
  sg: '\u{1F1F8}\u{1F1EC}',
  hk: '\u{1F1ED}\u{1F1F0}',
  tw: '\u{1F1F9}\u{1F1FC}',
  nz: '\u{1F1F3}\u{1F1FF}',
  ie: '\u{1F1EE}\u{1F1EA}',
  at: '\u{1F1E6}\u{1F1F9}',
  ch: '\u{1F1E8}\u{1F1ED}',
  be: '\u{1F1E7}\u{1F1EA}',
  pt: '\u{1F1F5}\u{1F1F9}',
};

export default function GapSetupForm({ onSubmit, loading }: Props) {
  const [name, setName] = useState('');
  const [category, setCategory] = useState('health-fitness');
  const [selectedCountries, setSelectedCountries] = useState<string[]>(['us', 'gb', 'de']);
  const [appsPerCountry, setAppsPerCountry] = useState(50);
  const [expandedGroups, setExpandedGroups] = useState<string[]>(['health-lifestyle']);

  const toggleGroup = (groupId: string) => {
    setExpandedGroups((prev) =>
      prev.includes(groupId)
        ? prev.filter((g) => g !== groupId)
        : [...prev, groupId]
    );
  };

  const toggleCountry = (code: string) => {
    setSelectedCountries((prev) => {
      if (prev.includes(code)) {
        return prev.filter((c) => c !== code);
      }
      if (prev.length >= 15) {
        return prev;
      }
      return [...prev, code];
    });
  };

  const selectPreset = (preset: 'english' | 'europe' | 'asia' | 'americas') => {
    const presets = {
      english: ['us', 'gb', 'ca', 'au', 'nz', 'ie'],
      europe: ['gb', 'de', 'fr', 'es', 'it', 'nl', 'se', 'no', 'dk', 'fi', 'pl', 'at', 'ch', 'be', 'pt'],
      asia: ['jp', 'cn', 'kr', 'in', 'sg', 'hk', 'tw'],
      americas: ['us', 'ca', 'mx', 'br'],
    };
    setSelectedCountries(presets[preset].slice(0, 15));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedCountries.length < 2) {
      alert('Please select at least 2 countries');
      return;
    }
    onSubmit({
      name: name.trim() || undefined,
      category,
      countries: selectedCountries,
      appsPerCountry,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
      <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
        New Gap Analysis
      </h2>

      <div className="space-y-6">
        {/* Session Name (optional) */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Analysis Name (optional)
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g., Health & Fitness Q1 2026"
            className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* Category */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Category
          </label>
          <div className="border border-gray-300 dark:border-gray-600 rounded-lg overflow-hidden max-h-64 overflow-y-auto">
            {Object.entries(CATEGORY_GROUPS).map(([groupId, group]) => (
              <div key={groupId} className="border-b border-gray-200 dark:border-gray-700 last:border-b-0">
                {/* Group Header */}
                <button
                  type="button"
                  onClick={() => toggleGroup(groupId)}
                  className="w-full flex items-center justify-between px-3 py-2 bg-gray-50 dark:bg-gray-700/50 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <span>{group.icon}</span>
                    <span className="font-medium text-sm text-gray-700 dark:text-gray-300">
                      {group.label}
                    </span>
                    {group.categories.includes(category) && (
                      <span className="text-xs bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 px-1.5 py-0.5 rounded">
                        Selected
                      </span>
                    )}
                  </div>
                  <svg
                    className={`w-4 h-4 text-gray-500 transition-transform ${
                      expandedGroups.includes(groupId) ? 'rotate-180' : ''
                    }`}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                {/* Group Categories */}
                {expandedGroups.includes(groupId) && (
                  <div className="bg-white dark:bg-gray-800 py-1">
                    {group.categories.map((cat) => (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => setCategory(cat)}
                        className={`w-full text-left px-4 py-1.5 text-sm transition-colors ${
                          category === cat
                            ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 font-medium'
                            : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700/50'
                        }`}
                      >
                        {cat === 'games' ? '🎮 All Games' : CATEGORY_NAMES[cat]}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            Selected: {CATEGORY_NAMES[category]}
          </p>
        </div>

        {/* Country Selection */}
        <div>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Countries ({selectedCountries.length}/2-15)
            </label>
            <div className="flex flex-wrap gap-1.5 sm:gap-2 text-xs">
              <button
                type="button"
                onClick={() => selectPreset('english')}
                className="text-blue-600 hover:text-blue-700 dark:text-blue-400"
              >
                EN
              </button>
              <button
                type="button"
                onClick={() => selectPreset('europe')}
                className="text-blue-600 hover:text-blue-700 dark:text-blue-400"
              >
                EU
              </button>
              <button
                type="button"
                onClick={() => selectPreset('asia')}
                className="text-blue-600 hover:text-blue-700 dark:text-blue-400"
              >
                Asia
              </button>
              <button
                type="button"
                onClick={() => selectPreset('americas')}
                className="text-blue-600 hover:text-blue-700 dark:text-blue-400"
              >
                AM
              </button>
              <button
                type="button"
                onClick={() => setSelectedCountries([])}
                className="text-red-600 hover:text-red-700 dark:text-red-400"
              >
                Clear
              </button>
            </div>
          </div>

          <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 gap-1.5 sm:gap-2">
            {Object.entries(COUNTRY_CODES).map(([code, name]) => (
              <button
                key={code}
                type="button"
                onClick={() => toggleCountry(code)}
                className={`flex items-center justify-center gap-1 px-1.5 sm:px-2 py-1.5 rounded-md text-xs sm:text-sm transition-colors ${
                  selectedCountries.includes(code)
                    ? 'bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 border-2 border-blue-500'
                    : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 hover:bg-gray-200 dark:hover:bg-gray-600'
                }`}
              >
                <span className="hidden sm:inline">{COUNTRY_FLAGS[code] || ''}</span>
                <span className="truncate">{code.toUpperCase()}</span>
              </button>
            ))}
          </div>

          {selectedCountries.length > 0 && (
            <div className="mt-2 text-sm text-gray-600 dark:text-gray-400">
              Selected: {selectedCountries.map((c) => COUNTRY_CODES[c]).join(', ')}
            </div>
          )}
        </div>

        {/* Apps per Country */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Apps per Country
          </label>
          <div className="flex gap-2">
            {[25, 50, 100].map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setAppsPerCountry(value)}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                  appsPerCountry === value
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                }`}
              >
                {value}
              </button>
            ))}
          </div>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            More apps = more data but longer scrape time
          </p>
        </div>

        {/* Submit Button */}
        <button
          type="submit"
          disabled={loading || selectedCountries.length < 2}
          className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 px-4 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
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
              Creating...
            </>
          ) : (
            'Start Gap Analysis'
          )}
        </button>
      </div>
    </form>
  );
}

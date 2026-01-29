'use client';

import { useState } from 'react';
import type { GapAnalysisApp } from '@/lib/supabase';
import { COUNTRY_CODES } from '@/lib/constants';
import GapClassificationBadge from './GapClassificationBadge';
import GapCountryPresenceGrid from './GapCountryPresenceGrid';

interface Props {
  app: GapAnalysisApp;
  countries: string[];
  onClose: () => void;
  onAnalyze: () => void;
  isAnalyzing: boolean;
}

export default function GapAppDetailModal({
  app,
  countries,
  onClose,
  onAnalyze,
  isAnalyzing,
}: Props) {
  const [activeTab, setActiveTab] = useState<'overview' | 'presence'>('overview');

  // Calculate metrics
  const presentCountries = app.countries_present;
  const missingCountries = countries.filter((c) => !presentCountries.includes(c));
  const top10Countries = Object.entries(app.country_ranks)
    .filter(([, rank]) => rank !== null && rank <= 10)
    .sort(([, a], [, b]) => (a || 999) - (b || 999));

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex min-h-full items-center justify-center p-2 sm:p-4">
        {/* Backdrop */}
        <div
          className="fixed inset-0 bg-black/50 transition-opacity"
          onClick={onClose}
        />

        {/* Modal */}
        <div className="relative bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full sm:max-w-2xl max-h-[95vh] sm:max-h-[90vh] overflow-hidden flex flex-col">
          {/* Header */}
          <div className="flex items-start justify-between p-3 sm:p-4 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
            <div className="flex items-center gap-3 sm:gap-4 min-w-0">
              {app.app_icon_url ? (
                <img
                  src={app.app_icon_url}
                  alt={app.app_name}
                  className="w-12 h-12 sm:w-16 sm:h-16 rounded-xl flex-shrink-0"
                />
              ) : (
                <div className="w-12 h-12 sm:w-16 sm:h-16 rounded-xl bg-gray-200 dark:bg-gray-600 flex-shrink-0" />
              )}
              <div className="min-w-0">
                <h2 className="text-lg sm:text-xl font-semibold text-gray-900 dark:text-white truncate">
                  {app.app_name}
                </h2>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {app.app_developer || 'Unknown Developer'}
                </p>
                <div className="mt-1">
                  <GapClassificationBadge
                    classification={app.classification}
                    reason={app.classification_reason}
                  />
                </div>
              </div>
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-500 dark:hover:text-gray-300"
            >
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Tabs */}
          <div className="flex border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
            {[
              { id: 'overview', label: 'Overview' },
              { id: 'presence', label: 'Country Presence' },
            ].map(({ id, label }) => (
              <button
                key={id}
                onClick={() => setActiveTab(id as 'overview' | 'presence')}
                className={`px-3 sm:px-4 py-2 text-sm font-medium transition-colors whitespace-nowrap ${
                  activeTab === id
                    ? 'text-blue-600 border-b-2 border-blue-600'
                    : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Content */}
          <div className="p-3 sm:p-4 overflow-y-auto flex-1 min-h-0">
            {activeTab === 'overview' && (
              <div className="space-y-6">
                {/* Stats Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-3">
                    <div className="text-2xl font-bold text-gray-900 dark:text-white">
                      {app.presence_count}/{countries.length}
                    </div>
                    <div className="text-sm text-gray-500 dark:text-gray-400">
                      Market Presence
                    </div>
                  </div>
                  <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-3">
                    <div className="text-2xl font-bold text-gray-900 dark:text-white">
                      #{app.average_rank?.toFixed(1) || '-'}
                    </div>
                    <div className="text-sm text-gray-500 dark:text-gray-400">
                      Avg Rank
                    </div>
                  </div>
                  <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-3">
                    <div className="text-2xl font-bold text-gray-900 dark:text-white">
                      {app.app_rating?.toFixed(1) || '-'}
                    </div>
                    <div className="text-sm text-gray-500 dark:text-gray-400">
                      Rating
                    </div>
                  </div>
                  <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-3">
                    <div className="text-2xl font-bold text-gray-900 dark:text-white">
                      {app.app_review_count?.toLocaleString() || '0'}
                    </div>
                    <div className="text-sm text-gray-500 dark:text-gray-400">
                      Reviews
                    </div>
                  </div>
                </div>

                {/* Classification Reason */}
                {app.classification_reason && (
                  <div className="bg-blue-50 dark:bg-blue-900/30 rounded-lg p-4">
                    <h4 className="text-sm font-medium text-blue-800 dark:text-blue-200 mb-1">
                      Classification Reason
                    </h4>
                    <p className="text-sm text-blue-700 dark:text-blue-300">
                      {app.classification_reason}
                    </p>
                  </div>
                )}

                {/* Top Markets */}
                {top10Countries.length > 0 && (
                  <div>
                    <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Top Markets (Top 10 Rank)
                    </h4>
                    <div className="flex flex-wrap gap-2">
                      {top10Countries.map(([country, rank]) => (
                        <span
                          key={country}
                          className="inline-flex items-center px-3 py-1 rounded-full bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200 text-sm"
                        >
                          {COUNTRY_CODES[country] || country} #{rank}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Missing Markets */}
                {missingCountries.length > 0 && (
                  <div>
                    <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Missing Markets ({missingCountries.length})
                    </h4>
                    <div className="flex flex-wrap gap-2">
                      {missingCountries.map((country) => (
                        <span
                          key={country}
                          className="inline-flex items-center px-3 py-1 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 text-sm"
                        >
                          {COUNTRY_CODES[country] || country}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* App Store Link */}
                {app.app_url && (
                  <div>
                    <a
                      href={app.app_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 text-blue-600 hover:text-blue-700 dark:text-blue-400"
                    >
                      View on App Store
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                      </svg>
                    </a>
                  </div>
                )}
              </div>
            )}

            {activeTab === 'presence' && (
              <div className="space-y-4">
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Showing rank in each market. Green = Top 3, Blue = Top 10, Gray = Lower ranks.
                </p>
                <GapCountryPresenceGrid
                  countries={countries}
                  countriesPresent={app.countries_present}
                  countryRanks={app.country_ranks}
                />
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="p-3 sm:p-4 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-2 sm:gap-3 flex-shrink-0">
            <button
              onClick={onClose}
              className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md transition-colors"
            >
              Close
            </button>
            <button
              onClick={onAnalyze}
              disabled={isAnalyzing}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md transition-colors disabled:opacity-50"
            >
              {isAnalyzing ? 'Analyzing...' : 'Run Market Gap Analysis'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

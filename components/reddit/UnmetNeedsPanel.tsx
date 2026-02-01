'use client';

import { useState, useCallback, useMemo } from 'react';
import type { UnmetNeed } from '@/lib/reddit/types';
import UnmetNeedCard from './UnmetNeedCard';

interface UnmetNeedsPanelProps {
  needs: UnmetNeed[];
  onSolutionChange: (needId: string, notes: string) => void;
  onSaveSolutions: () => void;
  isSaving?: boolean;
}

type SeverityFilter = 'all' | 'high' | 'medium' | 'low';
type SortBy = 'severity' | 'confidence' | 'postCount';

export default function UnmetNeedsPanel({
  needs,
  onSolutionChange,
  onSaveSolutions,
  isSaving = false,
}: UnmetNeedsPanelProps) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [severityFilter, setSeverityFilter] = useState<SeverityFilter>('all');
  const [minConfidence, setMinConfidence] = useState<number>(0);
  const [sortBy, setSortBy] = useState<SortBy>('severity');
  const [searchQuery, setSearchQuery] = useState('');

  const toggleExpand = useCallback((needId: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(needId)) {
        next.delete(needId);
      } else {
        next.add(needId);
      }
      return next;
    });
  }, []);

  // Filter and sort needs
  const filteredAndSortedNeeds = useMemo(() => {
    let filtered = needs;

    // Filter by severity
    if (severityFilter !== 'all') {
      filtered = filtered.filter(n => n.severity === severityFilter);
    }

    // Filter by confidence
    if (minConfidence > 0) {
      filtered = filtered.filter(n => (n.confidence?.score || 0) >= minConfidence);
    }

    // Filter by search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(n =>
        n.title.toLowerCase().includes(query) ||
        n.description.toLowerCase().includes(query) ||
        n.evidence.representativeQuotes.some(q => q.toLowerCase().includes(query))
      );
    }

    // Sort
    const sorted = [...filtered].sort((a, b) => {
      switch (sortBy) {
        case 'severity': {
          const severityOrder = { high: 0, medium: 1, low: 2 };
          return severityOrder[a.severity] - severityOrder[b.severity];
        }
        case 'confidence': {
          return (b.confidence?.score || 0) - (a.confidence?.score || 0);
        }
        case 'postCount': {
          return b.evidence.postCount - a.evidence.postCount;
        }
        default:
          return 0;
      }
    });

    return sorted;
  }, [needs, severityFilter, minConfidence, sortBy, searchQuery]);

  const highCount = needs.filter((n) => n.severity === 'high').length;
  const mediumCount = needs.filter((n) => n.severity === 'medium').length;
  const lowCount = needs.filter((n) => n.severity === 'low').length;

  // Check if any needs have confidence scores
  const hasConfidenceScores = needs.some(n => n.confidence?.score !== undefined);

  return (
    <div className="bg-gray-50 dark:bg-gray-900/50 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            Top Unmet Needs
          </h3>
          <span className="px-2 py-0.5 text-sm font-medium bg-blue-100 dark:bg-blue-900/50 text-blue-800 dark:text-blue-200 rounded-full">
            {filteredAndSortedNeeds.length}/{needs.length}
          </span>
        </div>

        {/* Severity summary */}
        <div className="flex items-center gap-2 text-xs">
          {highCount > 0 && (
            <button
              onClick={() => setSeverityFilter(severityFilter === 'high' ? 'all' : 'high')}
              className={`px-2 py-0.5 rounded-full transition-all ${
                severityFilter === 'high'
                  ? 'bg-red-500 text-white ring-2 ring-red-300'
                  : 'bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-300 hover:bg-red-200'
              }`}
            >
              {highCount} High
            </button>
          )}
          {mediumCount > 0 && (
            <button
              onClick={() => setSeverityFilter(severityFilter === 'medium' ? 'all' : 'medium')}
              className={`px-2 py-0.5 rounded-full transition-all ${
                severityFilter === 'medium'
                  ? 'bg-yellow-500 text-white ring-2 ring-yellow-300'
                  : 'bg-yellow-100 dark:bg-yellow-900/50 text-yellow-700 dark:text-yellow-300 hover:bg-yellow-200'
              }`}
            >
              {mediumCount} Med
            </button>
          )}
          {lowCount > 0 && (
            <button
              onClick={() => setSeverityFilter(severityFilter === 'low' ? 'all' : 'low')}
              className={`px-2 py-0.5 rounded-full transition-all ${
                severityFilter === 'low'
                  ? 'bg-gray-500 text-white ring-2 ring-gray-300'
                  : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-200'
              }`}
            >
              {lowCount} Low
            </button>
          )}
        </div>
      </div>

      {/* Filters and Search */}
      <div className="mb-4 space-y-3">
        {/* Search */}
        <div className="relative">
          <input
            type="text"
            placeholder="Search needs..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
          <svg
            className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>

        {/* Sort and confidence filter */}
        <div className="flex flex-wrap gap-3 items-center">
          {/* Sort dropdown */}
          <div className="flex items-center gap-2">
            <label className="text-xs text-gray-500 dark:text-gray-400">Sort:</label>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortBy)}
              className="text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white px-2 py-1 focus:ring-2 focus:ring-blue-500"
            >
              <option value="severity">Severity</option>
              <option value="confidence">Confidence</option>
              <option value="postCount">Post Count</option>
            </select>
          </div>

          {/* Confidence filter (only show if needs have confidence scores) */}
          {hasConfidenceScores && (
            <div className="flex items-center gap-2">
              <label className="text-xs text-gray-500 dark:text-gray-400">Min Confidence:</label>
              <input
                type="range"
                min="0"
                max="1"
                step="0.1"
                value={minConfidence}
                onChange={(e) => setMinConfidence(parseFloat(e.target.value))}
                className="w-20 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer dark:bg-gray-700"
              />
              <span className="text-xs text-gray-600 dark:text-gray-400 w-8">
                {Math.round(minConfidence * 100)}%
              </span>
            </div>
          )}

          {/* Clear filters */}
          {(severityFilter !== 'all' || minConfidence > 0 || searchQuery) && (
            <button
              onClick={() => {
                setSeverityFilter('all');
                setMinConfidence(0);
                setSearchQuery('');
              }}
              className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
            >
              Clear filters
            </button>
          )}
        </div>
      </div>

      {/* Needs list */}
      {needs.length === 0 ? (
        <div className="text-center py-8">
          <div className="w-12 h-12 bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center mx-auto mb-3">
            <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
            </svg>
          </div>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            No unmet needs found yet
          </p>
        </div>
      ) : filteredAndSortedNeeds.length === 0 ? (
        <div className="text-center py-8">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            No needs match your filters
          </p>
          <button
            onClick={() => {
              setSeverityFilter('all');
              setMinConfidence(0);
              setSearchQuery('');
            }}
            className="mt-2 text-sm text-blue-600 dark:text-blue-400 hover:underline"
          >
            Clear filters
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredAndSortedNeeds.map((need) => (
            <UnmetNeedCard
              key={need.id}
              need={need}
              onSolutionChange={onSolutionChange}
              isExpanded={expandedIds.has(need.id)}
              onToggleExpand={() => toggleExpand(need.id)}
            />
          ))}
        </div>
      )}

      {/* Save Solutions button */}
      {needs.length > 0 && (
        <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
          <button
            onClick={onSaveSolutions}
            disabled={isSaving}
            className="w-full px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {isSaving ? (
              <>
                <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Saving...
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                Save Solutions
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
}

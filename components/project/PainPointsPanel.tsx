'use client';

import { useState, useEffect, useCallback } from 'react';
import type { PainPoint, PainPointRegistry } from '@/lib/pain-points/types';

interface PainPointsPanelProps {
  projectId: string;
}

// ============================================================================
// Severity Badge
// ============================================================================

function SeverityBadge({ severity }: { severity: PainPoint['severity'] }) {
  const config = {
    critical: {
      bg: 'bg-red-100 dark:bg-red-900/50',
      text: 'text-red-800 dark:text-red-200',
      border: 'border-red-300 dark:border-red-700',
      label: 'Critical',
    },
    high: {
      bg: 'bg-orange-100 dark:bg-orange-900/50',
      text: 'text-orange-800 dark:text-orange-200',
      border: 'border-orange-300 dark:border-orange-700',
      label: 'High',
    },
    medium: {
      bg: 'bg-yellow-100 dark:bg-yellow-900/50',
      text: 'text-yellow-800 dark:text-yellow-200',
      border: 'border-yellow-300 dark:border-yellow-700',
      label: 'Medium',
    },
    low: {
      bg: 'bg-gray-100 dark:bg-gray-700',
      text: 'text-gray-700 dark:text-gray-300',
      border: 'border-gray-300 dark:border-gray-600',
      label: 'Low',
    },
  };

  const cfg = config[severity];

  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full border ${cfg.bg} ${cfg.text} ${cfg.border}`}
    >
      {cfg.label}
    </span>
  );
}

// ============================================================================
// Category Pill
// ============================================================================

function CategoryPill({ category }: { category: PainPoint['category'] }) {
  const config: Record<
    PainPoint['category'],
    { bg: string; text: string; label: string }
  > = {
    bug: {
      bg: 'bg-red-50 dark:bg-red-950/40',
      text: 'text-red-600 dark:text-red-400',
      label: 'Bug',
    },
    missing_feature: {
      bg: 'bg-blue-50 dark:bg-blue-950/40',
      text: 'text-blue-600 dark:text-blue-400',
      label: 'Missing Feature',
    },
    ux_issue: {
      bg: 'bg-purple-50 dark:bg-purple-950/40',
      text: 'text-purple-600 dark:text-purple-400',
      label: 'UX Issue',
    },
    pricing: {
      bg: 'bg-green-50 dark:bg-green-950/40',
      text: 'text-green-600 dark:text-green-400',
      label: 'Pricing',
    },
    performance: {
      bg: 'bg-amber-50 dark:bg-amber-950/40',
      text: 'text-amber-600 dark:text-amber-400',
      label: 'Performance',
    },
  };

  const cfg = config[category];

  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 text-xs font-medium rounded ${cfg.bg} ${cfg.text}`}
    >
      {cfg.label}
    </span>
  );
}

// ============================================================================
// Source Indicators
// ============================================================================

function SourceIndicators({
  sources,
}: {
  sources: PainPoint['sources'];
}) {
  return (
    <div className="flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400">
      {sources.reviews.count > 0 && (
        <span className="flex items-center gap-1" title="From app reviews">
          <svg
            className="w-3.5 h-3.5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z"
            />
          </svg>
          {sources.reviews.count} reviews
          {sources.reviews.avgRating > 0 && (
            <span className="text-gray-400">
              ({sources.reviews.avgRating.toFixed(1)} avg)
            </span>
          )}
        </span>
      )}
      {sources.reddit.count > 0 && (
        <span className="flex items-center gap-1" title="From Reddit">
          <svg
            className="w-3.5 h-3.5"
            fill="currentColor"
            viewBox="0 0 24 24"
          >
            <path d="M12 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0zm5.01 4.744c.688 0 1.25.561 1.25 1.249a1.25 1.25 0 0 1-2.498.056l-2.597-.547-.8 3.747c1.824.07 3.48.632 4.674 1.488.308-.309.73-.491 1.207-.491.968 0 1.754.786 1.754 1.754 0 .716-.435 1.333-1.01 1.614a3.111 3.111 0 0 1 .042.52c0 2.694-3.13 4.87-7.004 4.87-3.874 0-7.004-2.176-7.004-4.87 0-.183.015-.366.043-.534A1.748 1.748 0 0 1 4.028 12c0-.968.786-1.754 1.754-1.754.463 0 .898.196 1.207.49 1.207-.883 2.878-1.43 4.744-1.487l.885-4.182a.342.342 0 0 1 .14-.197.35.35 0 0 1 .238-.042l2.906.617a1.214 1.214 0 0 1 1.108-.701zM9.25 12C8.561 12 8 12.562 8 13.25c0 .687.561 1.248 1.25 1.248.687 0 1.248-.561 1.248-1.249 0-.688-.561-1.249-1.249-1.249zm5.5 0c-.687 0-1.248.561-1.248 1.25 0 .687.561 1.248 1.249 1.248.688 0 1.249-.561 1.249-1.249 0-.687-.562-1.249-1.25-1.249zm-5.466 3.99a.327.327 0 0 0-.231.094.33.33 0 0 0 0 .463c.842.842 2.484.913 2.961.913.477 0 2.105-.056 2.961-.913a.361.361 0 0 0 .029-.463.33.33 0 0 0-.464 0c-.547.533-1.684.73-2.512.73-.828 0-1.979-.196-2.512-.73a.326.326 0 0 0-.232-.095z" />
          </svg>
          {sources.reddit.count} posts
          {sources.reddit.subreddits.length > 0 && (
            <span className="text-gray-400">
              (r/{sources.reddit.subreddits[0]}
              {sources.reddit.subreddits.length > 1 &&
                ` +${sources.reddit.subreddits.length - 1}`}
              )
            </span>
          )}
        </span>
      )}
    </div>
  );
}

// ============================================================================
// Expandable Quotes
// ============================================================================

function QuotesSection({ painPoint }: { painPoint: PainPoint }) {
  const [isOpen, setIsOpen] = useState(false);

  const allQuotes: Array<{ text: string; source: 'review' | 'reddit' }> = [];
  for (const q of painPoint.sources.reviews.quotes) {
    allQuotes.push({ text: q, source: 'review' });
  }
  for (const q of painPoint.sources.reddit.quotes) {
    allQuotes.push({ text: q, source: 'reddit' });
  }

  if (allQuotes.length === 0) return null;

  return (
    <div className="mt-2">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="text-xs text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
      >
        <svg
          className={`w-3 h-3 transition-transform ${isOpen ? 'rotate-90' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M9 5l7 7-7 7"
          />
        </svg>
        {allQuotes.length} quote{allQuotes.length !== 1 ? 's' : ''}
      </button>
      {isOpen && (
        <div className="mt-2 space-y-2 pl-4 border-l-2 border-gray-200 dark:border-gray-700">
          {allQuotes.map((q, idx) => (
            <div key={idx} className="text-xs text-gray-600 dark:text-gray-400">
              <span className="italic">&ldquo;{q.text}&rdquo;</span>
              <span
                className={`ml-2 px-1.5 py-0.5 rounded text-[10px] font-medium ${
                  q.source === 'review'
                    ? 'bg-yellow-50 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400'
                    : 'bg-orange-50 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400'
                }`}
              >
                {q.source === 'review' ? 'Review' : 'Reddit'}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Main Panel
// ============================================================================

export default function PainPointsPanel({ projectId }: PainPointsPanelProps) {
  const [registry, setRegistry] = useState<PainPointRegistry | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rebuilding, setRebuilding] = useState(false);
  const [sortBy, setSortBy] = useState<'frequency' | 'severity'>('frequency');
  const [filterCategory, setFilterCategory] = useState<
    PainPoint['category'] | 'all'
  >('all');
  const [filterSeverity, setFilterSeverity] = useState<
    PainPoint['severity'] | 'all'
  >('all');

  const fetchPainPoints = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/projects/${projectId}/pain-points`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      setRegistry(data.registry);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load pain points';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    fetchPainPoints();
  }, [fetchPainPoints]);

  const handleRebuild = useCallback(async () => {
    setRebuilding(true);
    setError(null);

    try {
      const res = await fetch(`/api/projects/${projectId}/pain-points`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'rebuild' }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `HTTP ${res.status}`);
      }

      const data = await res.json();
      setRegistry(data.registry);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to rebuild';
      setError(message);
    } finally {
      setRebuilding(false);
    }
  }, [projectId]);

  // Filtering and sorting
  const filteredPainPoints = (() => {
    if (!registry) return [];

    let points = [...registry.painPoints];

    if (filterCategory !== 'all') {
      points = points.filter((pp) => pp.category === filterCategory);
    }

    if (filterSeverity !== 'all') {
      points = points.filter((pp) => pp.severity === filterSeverity);
    }

    if (sortBy === 'severity') {
      const order = { critical: 0, high: 1, medium: 2, low: 3 };
      points.sort((a, b) => order[a.severity] - order[b.severity]);
    } else {
      points.sort((a, b) => b.frequency - a.frequency);
    }

    return points;
  })();

  // ---- Loading state ----
  if (loading) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-6 bg-gray-200 dark:bg-gray-700 rounded w-1/3" />
          <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/2" />
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="h-20 bg-gray-100 dark:bg-gray-700/50 rounded"
              />
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ---- Error state ----
  if (error) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-red-200 dark:border-red-800 p-6">
        <div className="flex items-start gap-3">
          <svg
            className="w-5 h-5 text-red-500 mt-0.5 flex-shrink-0"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          <div>
            <h3 className="text-sm font-medium text-red-800 dark:text-red-200">
              Failed to load pain points
            </h3>
            <p className="mt-1 text-sm text-red-600 dark:text-red-400">
              {error}
            </p>
            <button
              onClick={fetchPainPoints}
              className="mt-2 text-sm text-red-600 dark:text-red-400 hover:underline"
            >
              Try again
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ---- Empty state ----
  if (!registry || registry.painPoints.length === 0) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
        <div className="text-center py-8">
          <svg
            className="w-12 h-12 mx-auto text-gray-300 dark:text-gray-600"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
            />
          </svg>
          <h3 className="mt-4 text-sm font-medium text-gray-900 dark:text-gray-100">
            No pain points found
          </h3>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Run review analysis or Reddit deep dive to discover user pain points.
          </p>
          <button
            onClick={handleRebuild}
            disabled={rebuilding}
            className="mt-4 inline-flex items-center px-3 py-1.5 text-sm font-medium text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30 rounded-md hover:bg-blue-100 dark:hover:bg-blue-900/50 disabled:opacity-50"
          >
            {rebuilding ? 'Rebuilding...' : 'Rebuild from data'}
          </button>
        </div>
      </div>
    );
  }

  // ---- Main content ----
  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              Pain Points
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {registry.painPoints.length} pain point
              {registry.painPoints.length !== 1 ? 's' : ''} identified
              {registry.lastUpdated && (
                <span>
                  {' '}
                  &middot; Updated{' '}
                  {new Date(registry.lastUpdated).toLocaleDateString()}
                </span>
              )}
            </p>
          </div>
          <button
            onClick={handleRebuild}
            disabled={rebuilding}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-md hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-50 transition-colors"
          >
            <svg
              className={`w-4 h-4 ${rebuilding ? 'animate-spin' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
              />
            </svg>
            {rebuilding ? 'Rebuilding...' : 'Rebuild'}
          </button>
        </div>

        {/* Filters */}
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5">
            <label className="text-xs text-gray-500 dark:text-gray-400">
              Sort:
            </label>
            <select
              value={sortBy}
              onChange={(e) =>
                setSortBy(e.target.value as 'frequency' | 'severity')
              }
              className="text-xs border border-gray-300 dark:border-gray-600 rounded px-2 py-1 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300"
            >
              <option value="frequency">Frequency</option>
              <option value="severity">Severity</option>
            </select>
          </div>

          <div className="flex items-center gap-1.5">
            <label className="text-xs text-gray-500 dark:text-gray-400">
              Category:
            </label>
            <select
              value={filterCategory}
              onChange={(e) =>
                setFilterCategory(
                  e.target.value as PainPoint['category'] | 'all'
                )
              }
              className="text-xs border border-gray-300 dark:border-gray-600 rounded px-2 py-1 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300"
            >
              <option value="all">All</option>
              <option value="bug">Bug</option>
              <option value="missing_feature">Missing Feature</option>
              <option value="ux_issue">UX Issue</option>
              <option value="pricing">Pricing</option>
              <option value="performance">Performance</option>
            </select>
          </div>

          <div className="flex items-center gap-1.5">
            <label className="text-xs text-gray-500 dark:text-gray-400">
              Severity:
            </label>
            <select
              value={filterSeverity}
              onChange={(e) =>
                setFilterSeverity(
                  e.target.value as PainPoint['severity'] | 'all'
                )
              }
              className="text-xs border border-gray-300 dark:border-gray-600 rounded px-2 py-1 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300"
            >
              <option value="all">All</option>
              <option value="critical">Critical</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
          </div>

          {(filterCategory !== 'all' || filterSeverity !== 'all') && (
            <span className="text-xs text-gray-400 dark:text-gray-500">
              Showing {filteredPainPoints.length} of {registry.painPoints.length}
            </span>
          )}
        </div>
      </div>

      {/* Pain Points List */}
      <div className="divide-y divide-gray-100 dark:divide-gray-700/50">
        {filteredPainPoints.map((pp) => (
          <div
            key={pp.id}
            className="px-6 py-4 hover:bg-gray-50 dark:hover:bg-gray-750 transition-colors"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100">
                    {pp.title}
                  </h3>
                  <SeverityBadge severity={pp.severity} />
                  <CategoryPill category={pp.category} />
                </div>

                {pp.description && (
                  <p className="mt-1 text-sm text-gray-600 dark:text-gray-400 line-clamp-2">
                    {pp.description}
                  </p>
                )}

                <div className="mt-2 flex items-center gap-4">
                  <SourceIndicators sources={pp.sources} />

                  {pp.competitorsAffected.length > 0 && (
                    <span className="text-xs text-gray-400 dark:text-gray-500">
                      Competitors: {pp.competitorsAffected.join(', ')}
                    </span>
                  )}

                  {pp.targetFeature && (
                    <span className="text-xs text-blue-500 dark:text-blue-400">
                      Target: {pp.targetFeature}
                    </span>
                  )}
                </div>

                <QuotesSection painPoint={pp} />
              </div>

              {/* Frequency badge */}
              <div className="flex-shrink-0 text-right">
                <div className="text-lg font-bold text-gray-700 dark:text-gray-300">
                  {pp.frequency}
                </div>
                <div className="text-[10px] uppercase tracking-wider text-gray-400 dark:text-gray-500">
                  mentions
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {filteredPainPoints.length === 0 && registry.painPoints.length > 0 && (
        <div className="px-6 py-8 text-center text-sm text-gray-500 dark:text-gray-400">
          No pain points match the current filters.
        </div>
      )}
    </div>
  );
}

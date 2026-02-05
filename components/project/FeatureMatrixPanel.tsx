'use client';

import { useState, useEffect, useCallback } from 'react';
import type { FeatureMatrix, FeatureMatrixEntry } from '@/lib/pain-points/types';

interface FeatureMatrixPanelProps {
  projectId: string;
}

// ============================================================================
// Status Cell
// ============================================================================

function StatusCell({ status }: { status: 'has' | 'partial' | 'missing' }) {
  switch (status) {
    case 'has':
      return (
        <div className="flex items-center justify-center" title="Has feature">
          <svg
            className="w-5 h-5 text-green-500"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2.5}
              d="M5 13l4 4L19 7"
            />
          </svg>
        </div>
      );
    case 'partial':
      return (
        <div
          className="flex items-center justify-center"
          title="Partially has feature"
        >
          <svg
            className="w-5 h-5 text-yellow-500"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2.5}
              d="M20 12H4"
            />
          </svg>
        </div>
      );
    case 'missing':
      return (
        <div
          className="flex items-center justify-center"
          title="Missing feature"
        >
          <svg
            className="w-5 h-5 text-red-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2.5}
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </div>
      );
    default:
      return (
        <div className="flex items-center justify-center">
          <span className="text-gray-300 dark:text-gray-600">?</span>
        </div>
      );
  }
}

// ============================================================================
// Demand Badge
// ============================================================================

function DemandBadge({ demand }: { demand: FeatureMatrixEntry['userDemand'] }) {
  const config = {
    high: {
      bg: 'bg-red-100 dark:bg-red-900/40',
      text: 'text-red-700 dark:text-red-300',
      label: 'High',
    },
    medium: {
      bg: 'bg-yellow-100 dark:bg-yellow-900/40',
      text: 'text-yellow-700 dark:text-yellow-300',
      label: 'Med',
    },
    low: {
      bg: 'bg-gray-100 dark:bg-gray-700',
      text: 'text-gray-600 dark:text-gray-400',
      label: 'Low',
    },
  };

  const cfg = config[demand];

  return (
    <span
      className={`inline-flex items-center px-1.5 py-0.5 text-[10px] font-medium rounded ${cfg.bg} ${cfg.text}`}
    >
      {cfg.label}
    </span>
  );
}

// ============================================================================
// Opportunity Badge
// ============================================================================

function OpportunityBadge() {
  return (
    <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] font-bold rounded bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300">
      <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
        <path
          fillRule="evenodd"
          d="M5 2a1 1 0 011 1v1h1a1 1 0 010 2H6v1a1 1 0 01-2 0V6H3a1 1 0 010-2h1V3a1 1 0 011-1zm0 10a1 1 0 011 1v1h1a1 1 0 110 2H6v1a1 1 0 11-2 0v-1H3a1 1 0 110-2h1v-1a1 1 0 011-1zM12 2a1 1 0 01.967.744L14.146 7.2 17.5 9.134a1 1 0 010 1.732l-3.354 1.935-1.18 4.455a1 1 0 01-1.933 0L9.854 12.8 6.5 10.866a1 1 0 010-1.732l3.354-1.935 1.18-4.455A1 1 0 0112 2z"
          clipRule="evenodd"
        />
      </svg>
      OPP
    </span>
  );
}

// ============================================================================
// Main Panel
// ============================================================================

export default function FeatureMatrixPanel({
  projectId,
}: FeatureMatrixPanelProps) {
  const [matrix, setMatrix] = useState<FeatureMatrix | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [enhancing, setEnhancing] = useState(false);
  const [enhanced, setEnhanced] = useState(false);

  const fetchMatrix = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/projects/${projectId}/feature-matrix`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      setMatrix(data.matrix);
      setEnhanced(false);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to load feature matrix';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    fetchMatrix();
  }, [fetchMatrix]);

  const handleEnhance = useCallback(async () => {
    setEnhancing(true);
    setError(null);

    try {
      const res = await fetch(`/api/projects/${projectId}/feature-matrix`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `HTTP ${res.status}`);
      }

      const data = await res.json();
      setMatrix(data.matrix);
      setEnhanced(data.enhanced === true);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to enhance matrix';
      setError(message);
    } finally {
      setEnhancing(false);
    }
  }, [projectId]);

  // ---- Loading state ----
  if (loading) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-6 bg-gray-200 dark:bg-gray-700 rounded w-1/3" />
          <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/2" />
          <div className="h-48 bg-gray-100 dark:bg-gray-700/50 rounded" />
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
              Failed to load feature matrix
            </h3>
            <p className="mt-1 text-sm text-red-600 dark:text-red-400">
              {error}
            </p>
            <button
              onClick={fetchMatrix}
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
  if (!matrix || matrix.features.length === 0) {
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
              d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z"
            />
          </svg>
          <h3 className="mt-4 text-sm font-medium text-gray-900 dark:text-gray-100">
            No feature data available
          </h3>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Run review analysis with linked competitors to generate a feature
            matrix.
          </p>
        </div>
      </div>
    );
  }

  // ---- Main content ----
  const opportunityCount = matrix.features.filter((f) => f.opportunity).length;

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              Feature Matrix
              {enhanced && (
                <span className="ml-2 text-xs font-normal text-emerald-600 dark:text-emerald-400">
                  AI-Enhanced
                </span>
              )}
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {matrix.features.length} feature
              {matrix.features.length !== 1 ? 's' : ''} across{' '}
              {matrix.competitors.length} competitor
              {matrix.competitors.length !== 1 ? 's' : ''}
              {opportunityCount > 0 && (
                <span className="text-emerald-600 dark:text-emerald-400">
                  {' '}
                  &middot; {opportunityCount} opportunit
                  {opportunityCount !== 1 ? 'ies' : 'y'}
                </span>
              )}
            </p>
          </div>
          <button
            onClick={handleEnhance}
            disabled={enhancing}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-purple-700 dark:text-purple-300 bg-purple-50 dark:bg-purple-900/30 rounded-md hover:bg-purple-100 dark:hover:bg-purple-900/50 disabled:opacity-50 transition-colors"
          >
            <svg
              className={`w-4 h-4 ${enhancing ? 'animate-pulse' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M13 10V3L4 14h7v7l9-11h-7z"
              />
            </svg>
            {enhancing ? 'Enhancing...' : 'Enhance with AI'}
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 dark:bg-gray-750">
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider border-b border-gray-200 dark:border-gray-700">
                Feature
              </th>
              {matrix.competitors.map((comp) => (
                <th
                  key={comp}
                  className="text-center px-3 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider border-b border-gray-200 dark:border-gray-700 min-w-[80px]"
                >
                  <span className="truncate block max-w-[100px]" title={comp}>
                    {comp}
                  </span>
                </th>
              ))}
              <th className="text-center px-3 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider border-b border-gray-200 dark:border-gray-700">
                Demand
              </th>
              <th className="text-center px-3 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider border-b border-gray-200 dark:border-gray-700">
                Opp
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-700/50">
            {matrix.features.map((feature, idx) => (
              <tr
                key={idx}
                className={`hover:bg-gray-50 dark:hover:bg-gray-750 transition-colors ${
                  feature.opportunity
                    ? 'bg-emerald-50/50 dark:bg-emerald-900/10'
                    : ''
                }`}
              >
                <td className="px-4 py-3 text-gray-900 dark:text-gray-100 font-medium">
                  {feature.name}
                </td>
                {matrix.competitors.map((comp) => (
                  <td key={comp} className="px-3 py-3">
                    <StatusCell
                      status={feature.competitors[comp] || 'missing'}
                    />
                  </td>
                ))}
                <td className="px-3 py-3 text-center">
                  <DemandBadge demand={feature.userDemand} />
                </td>
                <td className="px-3 py-3 text-center">
                  {feature.opportunity && <OpportunityBadge />}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Legend */}
      <div className="px-6 py-3 border-t border-gray-200 dark:border-gray-700 flex items-center gap-4 text-xs text-gray-500 dark:text-gray-400">
        <span className="flex items-center gap-1">
          <svg className="w-3.5 h-3.5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
          </svg>
          Has
        </span>
        <span className="flex items-center gap-1">
          <svg className="w-3.5 h-3.5 text-yellow-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M20 12H4" />
          </svg>
          Partial
        </span>
        <span className="flex items-center gap-1">
          <svg className="w-3.5 h-3.5 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
          </svg>
          Missing
        </span>
        <span className="flex items-center gap-1 ml-2">
          <OpportunityBadge /> = High demand + most competitors lack it
        </span>
      </div>
    </div>
  );
}

'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Opportunity,
  OpportunityStats,
  RankedOpportunity,
  DailyRun,
  OpportunityRawData,
} from '@/lib/opportunity/types';
import { useRouter } from 'next/navigation';
import { CATEGORY_NAMES } from '@/lib/constants';
import { getScoreColor } from '@/lib/opportunity/constants';

// ============================================================================
// Tooltip Component
// ============================================================================

function Tooltip({ children, content }: { children: React.ReactNode; content: React.ReactNode }) {
  const [show, setShow] = useState(false);

  return (
    <span
      className="relative inline-flex items-center cursor-help"
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
    >
      {children}
      {show && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50">
          <div className="bg-gray-900 text-white text-xs rounded-lg px-3 py-2 w-72 shadow-lg">
            {content}
          </div>
          <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-1">
            <div className="border-4 border-transparent border-t-gray-900" />
          </div>
        </div>
      )}
    </span>
  );
}

// ============================================================================
// Score Badge Component
// ============================================================================

function ScoreBadge({ score, size = 'md' }: { score: number | null; size?: 'sm' | 'md' | 'lg' }) {
  if (score === null) return <span className="text-gray-400">-</span>;

  const { color, label } = getScoreColor(score);
  const sizeClasses = {
    sm: 'text-xs px-1.5 py-0.5',
    md: 'text-sm px-2 py-1',
    lg: 'text-base px-3 py-1.5',
  };

  const colorClasses: Record<string, string> = {
    emerald: 'bg-emerald-100 text-emerald-800',
    green: 'bg-green-100 text-green-800',
    yellow: 'bg-yellow-100 text-yellow-800',
    orange: 'bg-orange-100 text-orange-800',
    red: 'bg-red-100 text-red-800',
  };

  return (
    <span
      className={`inline-flex items-center rounded-full font-medium ${sizeClasses[size]} ${colorClasses[color]}`}
      title={label}
    >
      {score.toFixed(1)}
    </span>
  );
}

// ============================================================================
// Metric Tooltips
// ============================================================================

const DIMENSION_TOOLTIPS = {
  competition_gap: (
    <div className="space-y-1">
      <div className="font-semibold">Competition Gap (0-100)</div>
      <div>How beatable the current competition is. Higher = weaker competition.</div>
      <div className="pt-1 text-gray-300 text-[10px]">
        <div className="font-medium">Components:</div>
        <div>• Title keyword saturation (30%)</div>
        <div>• Review count strength (35%)</div>
        <div>• Rating penalty (20%)</div>
        <div>• Feature density (15%)</div>
      </div>
    </div>
  ),
  market_demand: (
    <div className="space-y-1">
      <div className="font-semibold">Market Demand (0-100)</div>
      <div>How many people are searching for this. Higher = more demand.</div>
      <div className="pt-1 text-gray-300 text-[10px]">
        <div className="font-medium">Components:</div>
        <div>• Autosuggest priority (40%)</div>
        <div>• Google Trends interest (30%)</div>
        <div>• Reddit mention velocity (20%)</div>
        <div>• Search result count (10%)</div>
      </div>
    </div>
  ),
  revenue_potential: (
    <div className="space-y-1">
      <div className="font-semibold">Revenue Potential (0-100)</div>
      <div>Whether money flows in this category. Higher = better monetization.</div>
      <div className="pt-1 text-gray-300 text-[10px]">
        <div className="font-medium">Components:</div>
        <div>• Category average price (25%)</div>
        <div>• IAP presence ratio (35%)</div>
        <div>• Subscription presence (25%)</div>
        <div>• Review count proxy (15%)</div>
      </div>
    </div>
  ),
  trend_momentum: (
    <div className="space-y-1">
      <div className="font-semibold">Trend Momentum (0-100)</div>
      <div>Is the market growing or dying? Higher = growing market.</div>
      <div className="pt-1 text-gray-300 text-[10px]">
        <div className="font-medium">Components:</div>
        <div>• Google Trends slope (50%)</div>
        <div>• New apps launched 90d (25%)</div>
        <div>• Reddit growth rate (25%)</div>
      </div>
    </div>
  ),
  execution_feasibility: (
    <div className="space-y-1">
      <div className="font-semibold">Execution Feasibility (0-100)</div>
      <div>How easy to build a competitive MVP. Higher = simpler to build.</div>
      <div className="pt-1 text-gray-300 text-[10px]">
        <div className="font-medium">Components:</div>
        <div>• Average feature count (40%)</div>
        <div>• API dependency score (30%)</div>
        <div>• Hardware requirement (30%)</div>
      </div>
    </div>
  ),
  opportunity_score: (
    <div className="space-y-1">
      <div className="font-semibold">Opportunity Score (0-100)</div>
      <div>Final weighted score combining all dimensions.</div>
      <div className="pt-1 text-gray-300 text-[10px]">
        <div className="font-medium">Weights:</div>
        <div>• Competition Gap: 30%</div>
        <div>• Market Demand: 25%</div>
        <div>• Revenue Potential: 20%</div>
        <div>• Trend Momentum: 15%</div>
        <div>• Execution Feasibility: 10%</div>
      </div>
    </div>
  ),
};

// ============================================================================
// Stats Cards Component
// ============================================================================

function StatsCards({ stats }: { stats: OpportunityStats | null }) {
  if (!stats) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="bg-white rounded-lg p-4 shadow animate-pulse">
            <div className="h-4 bg-gray-200 rounded w-1/2 mb-2" />
            <div className="h-8 bg-gray-200 rounded w-3/4" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
      <div className="bg-white rounded-lg p-4 shadow">
        <div className="text-sm text-gray-500">Total Opportunities</div>
        <div className="text-2xl font-bold text-gray-900">{stats.total_opportunities}</div>
      </div>
      <div className="bg-white rounded-lg p-4 shadow">
        <div className="text-sm text-gray-500">High Opportunity (60+)</div>
        <div className="text-2xl font-bold text-green-600">{stats.high_opportunity_count}</div>
      </div>
      <div className="bg-white rounded-lg p-4 shadow">
        <div className="text-sm text-gray-500">Average Score</div>
        <div className="text-2xl font-bold text-gray-900">{stats.avg_score}</div>
      </div>
      <div className="bg-white rounded-lg p-4 shadow">
        <div className="text-sm text-gray-500">Top Category</div>
        <div className="text-lg font-bold text-gray-900">
          {CATEGORY_NAMES[stats.top_category || ''] || stats.top_category || 'N/A'}
        </div>
        {stats.top_category_avg_score && (
          <div className="text-sm text-gray-500">Avg: {stats.top_category_avg_score}</div>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// Daily Winner Card Component
// ============================================================================

function DailyWinnerCard({
  winner,
  onViewDetails,
  onCreateProject,
}: {
  winner: Opportunity | null;
  onViewDetails: (opp: Opportunity) => void;
  onCreateProject: (opp: Opportunity) => void;
}) {
  if (!winner) {
    return (
      <div className="bg-gradient-to-r from-purple-500 to-indigo-600 rounded-lg p-6 text-white shadow-lg mb-6">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm opacity-80">Today&apos;s Winner</div>
            <div className="text-xl font-bold mt-1">No winner selected yet</div>
            <div className="text-sm opacity-80 mt-2">Run daily discovery to find opportunities</div>
          </div>
          <div className="text-5xl opacity-50">?</div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-gradient-to-r from-purple-500 to-indigo-600 rounded-lg p-6 text-white shadow-lg mb-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm opacity-80 flex items-center gap-2">
            Today&apos;s Winner
            {winner.status === 'blueprinted' && (
              <span className="bg-white/30 px-2 py-0.5 rounded text-xs">Blueprinted</span>
            )}
          </div>
          <div className="text-2xl font-bold mt-1">{winner.keyword}</div>
          <div className="flex items-center gap-3 mt-2">
            <span className="bg-white/20 px-2 py-1 rounded text-sm">
              {CATEGORY_NAMES[winner.category] || winner.category}
            </span>
            <span className="text-sm opacity-80">
              Status: {winner.status}
            </span>
          </div>
        </div>
        <div className="text-right">
          <div className="text-5xl font-bold">{winner.opportunity_score?.toFixed(1)}</div>
          <div className="text-sm opacity-80">Score</div>
        </div>
      </div>
      {winner.suggested_differentiator && (
        <div className="mt-4 pt-4 border-t border-white/20 text-sm">
          <span className="opacity-80">Strategy:</span> {winner.suggested_differentiator}
        </div>
      )}
      <div className="mt-4 pt-4 border-t border-white/20 flex gap-2">
        <button
          onClick={() => onViewDetails(winner)}
          className="px-3 py-1.5 bg-white/20 hover:bg-white/30 rounded text-sm transition-colors"
        >
          View Details
        </button>
        {winner.status !== 'blueprinted' && (
          <button
            onClick={() => onCreateProject(winner)}
            className="px-3 py-1.5 bg-white hover:bg-gray-100 text-purple-700 rounded text-sm transition-colors font-medium"
          >
            Create Blueprint
          </button>
        )}
        {winner.status === 'blueprinted' && winner.blueprint_id && (
          <a
            href={`/projects?blueprint=${winner.blueprint_id}`}
            className="px-3 py-1.5 bg-white hover:bg-gray-100 text-purple-700 rounded text-sm transition-colors font-medium"
          >
            View Blueprint
          </a>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// Category Heatmap Component
// ============================================================================

function CategoryHeatmap({ categoryStats }: { categoryStats: { category: string; count: number; avg_score: number }[] }) {
  if (!categoryStats || categoryStats.length === 0) {
    return null;
  }

  return (
    <div className="bg-white rounded-lg p-4 shadow mb-6">
      <h3 className="font-semibold mb-3">Opportunity Density by Category</h3>
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-2">
        {categoryStats.map((cat) => {
          const { color } = getScoreColor(cat.avg_score);
          const bgClass =
            color === 'emerald' ? 'bg-emerald-100' :
            color === 'green' ? 'bg-green-100' :
            color === 'yellow' ? 'bg-yellow-100' :
            color === 'orange' ? 'bg-orange-100' : 'bg-red-100';

          return (
            <div
              key={cat.category}
              className={`${bgClass} rounded p-2 text-center`}
            >
              <div className="text-xs font-medium truncate">
                {CATEGORY_NAMES[cat.category] || cat.category}
              </div>
              <div className="text-lg font-bold">{cat.avg_score.toFixed(0)}</div>
              <div className="text-xs text-gray-600">{cat.count} opps</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ============================================================================
// Opportunities Table Component
// ============================================================================

function OpportunitiesTable({
  opportunities,
  loading,
  onSelect,
  selectedId,
}: {
  opportunities: Opportunity[];
  loading: boolean;
  onSelect: (opp: Opportunity) => void;
  selectedId?: string;
}) {
  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="animate-pulse p-4 space-y-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-12 bg-gray-200 rounded" />
          ))}
        </div>
      </div>
    );
  }

  if (opportunities.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow p-8 text-center">
        <div className="text-gray-400 text-lg mb-2">No opportunities found</div>
        <div className="text-sm text-gray-500">
          Run discovery to find new opportunities
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow overflow-hidden">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Keyword
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Category
              </th>
              <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">
                <Tooltip content={DIMENSION_TOOLTIPS.opportunity_score}>
                  <span>Score</span>
                </Tooltip>
              </th>
              <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">
                <Tooltip content={DIMENSION_TOOLTIPS.competition_gap}>
                  <span>Gap</span>
                </Tooltip>
              </th>
              <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">
                <Tooltip content={DIMENSION_TOOLTIPS.market_demand}>
                  <span>Demand</span>
                </Tooltip>
              </th>
              <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">
                <Tooltip content={DIMENSION_TOOLTIPS.revenue_potential}>
                  <span>Revenue</span>
                </Tooltip>
              </th>
              <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">
                <Tooltip content={DIMENSION_TOOLTIPS.trend_momentum}>
                  <span>Trend</span>
                </Tooltip>
              </th>
              <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">
                <Tooltip content={DIMENSION_TOOLTIPS.execution_feasibility}>
                  <span>Easy</span>
                </Tooltip>
              </th>
              <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">
                Status
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {opportunities.map((opp) => (
              <tr
                key={opp.id}
                className={`hover:bg-gray-50 cursor-pointer ${
                  selectedId === opp.id ? 'bg-blue-50' : ''
                }`}
                onClick={() => onSelect(opp)}
              >
                <td className="px-4 py-3">
                  <div className="font-medium text-gray-900">{opp.keyword}</div>
                </td>
                <td className="px-4 py-3 text-sm text-gray-500">
                  {CATEGORY_NAMES[opp.category] || opp.category}
                </td>
                <td className="px-4 py-3 text-center">
                  <ScoreBadge score={opp.opportunity_score} size="md" />
                </td>
                <td className="px-4 py-3 text-center">
                  <ScoreBadge score={opp.competition_gap_score} size="sm" />
                </td>
                <td className="px-4 py-3 text-center">
                  <ScoreBadge score={opp.market_demand_score} size="sm" />
                </td>
                <td className="px-4 py-3 text-center">
                  <ScoreBadge score={opp.revenue_potential_score} size="sm" />
                </td>
                <td className="px-4 py-3 text-center">
                  <ScoreBadge score={opp.trend_momentum_score} size="sm" />
                </td>
                <td className="px-4 py-3 text-center">
                  <ScoreBadge score={opp.execution_feasibility_score} size="sm" />
                </td>
                <td className="px-4 py-3 text-center">
                  <span
                    className={`inline-flex px-2 py-1 text-xs rounded-full ${
                      opp.status === 'blueprinted'
                        ? 'bg-purple-100 text-purple-800'
                        : opp.status === 'selected'
                        ? 'bg-blue-100 text-blue-800'
                        : 'bg-gray-100 text-gray-800'
                    }`}
                  >
                    {opp.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ============================================================================
// Top Apps Table Component (for Opportunity Modal)
// ============================================================================

interface TopAppData {
  id: string;
  name: string;
  rating: number;
  reviews: number;
  price: number;
  currency: string;
  has_keyword_in_title: boolean;
  has_iap: boolean;
  has_subscription: boolean;
  icon_url: string;
  release_date: string;
  description_length: number;
  feature_count: number;
  requires_hardware: string[];
}

function TopAppsTable({
  apps,
  keyword,
  onSelectApp,
  selectedAppId,
}: {
  apps: TopAppData[];
  keyword: string;
  onSelectApp: (app: TopAppData) => void;
  selectedAppId: string | null;
}) {
  if (!apps || apps.length === 0) {
    return (
      <div className="text-sm text-gray-500 text-center py-4">
        No ranking apps data available
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="border-b">
            <th className="text-left py-2 px-2 font-medium text-gray-600">#</th>
            <th className="text-left py-2 px-2 font-medium text-gray-600">App</th>
            <th className="text-center py-2 px-2 font-medium text-gray-600">Rating</th>
            <th className="text-center py-2 px-2 font-medium text-gray-600">Reviews</th>
            <th className="text-center py-2 px-2 font-medium text-gray-600">Price</th>
            <th className="text-center py-2 px-2 font-medium text-gray-600">Signals</th>
            <th className="text-center py-2 px-2 font-medium text-gray-600">Action</th>
          </tr>
        </thead>
        <tbody>
          {apps.map((app, idx) => (
            <tr
              key={app.id}
              className={`border-b hover:bg-gray-50 ${
                selectedAppId === app.id ? 'bg-purple-50' : ''
              }`}
            >
              <td className="py-2 px-2 text-gray-500">{idx + 1}</td>
              <td className="py-2 px-2">
                <div className="flex items-center gap-2">
                  {app.icon_url && (
                    <img
                      src={app.icon_url}
                      alt=""
                      className="w-8 h-8 rounded-lg"
                    />
                  )}
                  <div className="min-w-0">
                    <div className="font-medium text-gray-900 truncate max-w-[180px]" title={app.name}>
                      {app.name}
                    </div>
                    {app.has_keyword_in_title && (
                      <span className="text-xs text-orange-600">
                        Has "{keyword}" in title
                      </span>
                    )}
                  </div>
                </div>
              </td>
              <td className="py-2 px-2 text-center">
                <span className={app.rating >= 4.5 ? 'text-green-600' : app.rating >= 4.0 ? 'text-yellow-600' : 'text-red-600'}>
                  {app.rating?.toFixed(1) || '-'}
                </span>
              </td>
              <td className="py-2 px-2 text-center text-gray-600">
                {app.reviews?.toLocaleString() || '-'}
              </td>
              <td className="py-2 px-2 text-center">
                {app.price === 0 ? (
                  <span className="text-green-600">Free</span>
                ) : (
                  <span>${app.price}</span>
                )}
              </td>
              <td className="py-2 px-2 text-center">
                <div className="flex gap-1 justify-center">
                  {app.has_iap && (
                    <span className="px-1.5 py-0.5 bg-blue-100 text-blue-700 text-xs rounded" title="Has In-App Purchases">
                      IAP
                    </span>
                  )}
                  {app.has_subscription && (
                    <span className="px-1.5 py-0.5 bg-purple-100 text-purple-700 text-xs rounded" title="Has Subscription">
                      SUB
                    </span>
                  )}
                  {app.requires_hardware && app.requires_hardware.length > 0 && (
                    <span className="px-1.5 py-0.5 bg-gray-100 text-gray-700 text-xs rounded" title={`Requires: ${app.requires_hardware.join(', ')}`}>
                      HW
                    </span>
                  )}
                </div>
              </td>
              <td className="py-2 px-2 text-center">
                <button
                  onClick={() => onSelectApp(app)}
                  className={`px-2 py-1 text-xs rounded transition-colors ${
                    selectedAppId === app.id
                      ? 'bg-purple-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {selectedAppId === app.id ? 'Selected' : 'Select'}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ============================================================================
// Opportunity Detail Modal
// ============================================================================

function OpportunityDetailModal({
  opportunity,
  onClose,
  onGenerateBlueprint,
  onExportCSV,
}: {
  opportunity: Opportunity;
  onClose: () => void;
  onGenerateBlueprint: (competitorApp?: TopAppData) => void;
  onExportCSV: () => void;
}) {
  const [selectedCompetitor, setSelectedCompetitor] = useState<TopAppData | null>(null);
  const [showApps, setShowApps] = useState(true);
  const [creatingProject, setCreatingProject] = useState(false);

  // Extract top apps from raw_data
  const topApps: TopAppData[] = opportunity.raw_data?.itunes?.top_10_apps || [];

  const handleGenerateBlueprint = async () => {
    setCreatingProject(true);
    try {
      await onGenerateBlueprint(selectedCompetitor || undefined);
    } finally {
      setCreatingProject(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          {/* Header */}
          <div className="flex justify-between items-start mb-4">
            <div>
              <h2 className="text-2xl font-bold text-gray-900">{opportunity.keyword}</h2>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-sm text-gray-500">
                  {CATEGORY_NAMES[opportunity.category] || opportunity.category}
                </span>
                <span className="text-sm text-gray-400">|</span>
                <span className="text-sm text-gray-500">
                  Scored {new Date(opportunity.scored_at).toLocaleDateString()}
                </span>
              </div>
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 text-2xl leading-none"
            >
              &times;
            </button>
          </div>

          {/* Main Score */}
          <div className="bg-gradient-to-r from-purple-500 to-indigo-600 rounded-lg p-4 text-white mb-6">
            <div className="flex justify-between items-center">
              <div>
                <div className="text-sm opacity-80">Opportunity Score</div>
                <div className="text-4xl font-bold">
                  {opportunity.opportunity_score?.toFixed(1)}
                </div>
              </div>
              <div className="text-right">
                <span
                  className={`px-3 py-1 rounded-full text-sm ${
                    opportunity.status === 'blueprinted'
                      ? 'bg-purple-400/30'
                      : opportunity.status === 'selected'
                      ? 'bg-blue-400/30'
                      : 'bg-white/20'
                  }`}
                >
                  {opportunity.status}
                </span>
              </div>
            </div>
          </div>

          {/* Dimension Scores */}
          <div className="grid grid-cols-5 gap-3 mb-6">
            {[
              { key: 'competition_gap', label: 'Competition Gap', score: opportunity.competition_gap_score },
              { key: 'market_demand', label: 'Market Demand', score: opportunity.market_demand_score },
              { key: 'revenue_potential', label: 'Revenue', score: opportunity.revenue_potential_score },
              { key: 'trend_momentum', label: 'Trend', score: opportunity.trend_momentum_score },
              { key: 'execution_feasibility', label: 'Feasibility', score: opportunity.execution_feasibility_score },
            ].map(({ key, label, score }) => (
              <div key={key} className="bg-gray-50 rounded-lg p-3 text-center">
                <div className="text-xs text-gray-500 mb-1">{label}</div>
                <ScoreBadge score={score} size="lg" />
              </div>
            ))}
          </div>

          {/* Data Source Indicator */}
          {opportunity.raw_data?.google_trends && (
            <div className="mb-4 flex items-center gap-2 text-xs text-gray-500">
              <span>Data sources:</span>
              <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded">iTunes API</span>
              <span className={`px-2 py-0.5 rounded ${
                opportunity.raw_data.google_trends.source === 'serpapi'
                  ? 'bg-green-100 text-green-700'
                  : 'bg-yellow-100 text-yellow-700'
              }`}>
                Trends: {opportunity.raw_data.google_trends.source === 'serpapi' ? 'Real' : 'Estimated'}
              </span>
              {opportunity.raw_data.reddit && (
                <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded">Reddit API</span>
              )}
            </div>
          )}

          {/* Top Ranking Apps Section */}
          <div className="mb-6">
            <button
              onClick={() => setShowApps(!showApps)}
              className="flex items-center justify-between w-full text-left"
            >
              <h3 className="font-semibold text-gray-900">
                Apps Ranking for "{opportunity.keyword}" ({topApps.length})
              </h3>
              <span className="text-gray-400">{showApps ? '▼' : '▶'}</span>
            </button>
            {showApps && (
              <div className="mt-3 border rounded-lg p-3">
                <div className="text-xs text-gray-500 mb-2">
                  Select a competitor app to analyze for blueprint generation:
                </div>
                <TopAppsTable
                  apps={topApps}
                  keyword={opportunity.keyword}
                  onSelectApp={setSelectedCompetitor}
                  selectedAppId={selectedCompetitor?.id || null}
                />
              </div>
            )}
          </div>

          {/* Reasoning */}
          {opportunity.reasoning && (
            <div className="mb-6">
              <h3 className="font-semibold text-gray-900 mb-2">Analysis</h3>
              <p className="text-sm text-gray-600">{opportunity.reasoning}</p>
            </div>
          )}

          {/* Competitor Weaknesses */}
          {opportunity.top_competitor_weaknesses && opportunity.top_competitor_weaknesses.length > 0 && (
            <div className="mb-6">
              <h3 className="font-semibold text-gray-900 mb-2">Competitor Weaknesses</h3>
              <ul className="space-y-1">
                {opportunity.top_competitor_weaknesses.map((weakness, idx) => (
                  <li key={idx} className="text-sm text-gray-600 flex items-start">
                    <span className="text-green-500 mr-2">+</span>
                    {weakness}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Suggested Differentiator */}
          {opportunity.suggested_differentiator && (
            <div className="mb-6 bg-blue-50 rounded-lg p-4">
              <h3 className="font-semibold text-blue-900 mb-1">Suggested Strategy</h3>
              <p className="text-sm text-blue-800">{opportunity.suggested_differentiator}</p>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-4 border-t">
            <button
              onClick={handleGenerateBlueprint}
              disabled={creatingProject}
              className="flex-1 bg-purple-600 text-white px-4 py-2 rounded-lg hover:bg-purple-700 disabled:opacity-50 transition-colors"
            >
              {creatingProject ? 'Creating Project...' : selectedCompetitor ? `Blueprint from "${selectedCompetitor.name}"` : 'Generate Blueprint'}
            </button>
            <button
              onClick={onExportCSV}
              className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              title="Export opportunity data"
            >
              Export
            </button>
            <button
              onClick={onClose}
              className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Recent Runs Component
// ============================================================================

function RecentRuns({ runs }: { runs: DailyRun[] }) {
  if (!runs || runs.length === 0) {
    return null;
  }

  return (
    <div className="bg-white rounded-lg p-4 shadow">
      <h3 className="font-semibold mb-3">Recent Daily Runs</h3>
      <div className="space-y-2">
        {runs.map((run) => (
          <div
            key={run.id}
            className="flex items-center justify-between py-2 border-b last:border-0"
          >
            <div>
              <div className="text-sm font-medium">
                {new Date(run.run_date).toLocaleDateString()}
              </div>
              {run.winner_keyword && (
                <div className="text-xs text-gray-500">
                  Winner: {run.winner_keyword}
                </div>
              )}
            </div>
            <div className="flex items-center gap-2">
              {run.winner_score && (
                <ScoreBadge score={run.winner_score} size="sm" />
              )}
              <span
                className={`text-xs px-2 py-0.5 rounded ${
                  run.status === 'completed'
                    ? 'bg-green-100 text-green-800'
                    : run.status === 'failed'
                    ? 'bg-red-100 text-red-800'
                    : 'bg-yellow-100 text-yellow-800'
                }`}
              >
                {run.status}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================================================================
// Main Dashboard Component
// ============================================================================

interface DashboardFilters {
  category: string;
  country: string;
  minScore: number | undefined;
  sort: string;
}

export default function OpportunityDashboard() {
  // State
  const [stats, setStats] = useState<OpportunityStats | null>(null);
  const [todaysWinner, setTodaysWinner] = useState<Opportunity | null>(null);
  const [recentRuns, setRecentRuns] = useState<DailyRun[]>([]);
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedOpportunity, setSelectedOpportunity] = useState<Opportunity | null>(null);

  // Discovery state
  const [discovering, setDiscovering] = useState(false);
  const [discoveryCategory, setDiscoveryCategory] = useState('productivity');
  const [discoveryProgress, setDiscoveryProgress] = useState<{
    stage: 'idle' | 'discovering' | 'scoring' | 'saving' | 'complete';
    message: string;
    keywordsFound?: number;
    keywordsScored?: number;
    totalToScore?: number;
  }>({ stage: 'idle', message: '' });
  const [runningDailyRun, setRunningDailyRun] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Filters
  const [filters, setFilters] = useState<DashboardFilters>({
    category: '',
    country: 'us',
    minScore: undefined,
    sort: 'opportunity_score',
  });

  // Fetch stats and overview data
  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch(`/api/opportunity/stats?country=${filters.country}`);
      const data = await res.json();

      if (data.success) {
        setStats(data.data.stats);
        setTodaysWinner(data.data.todays_winner);
        setRecentRuns(data.data.recent_runs || []);
      }
    } catch (error) {
      console.error('Error fetching stats:', error);
    }
  }, [filters.country]);

  // Fetch opportunities list
  const fetchOpportunities = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('country', filters.country);
      params.set('sort', filters.sort);
      params.set('sort_dir', 'desc');
      if (filters.category) params.set('category', filters.category);
      if (filters.minScore) params.set('min_score', filters.minScore.toString());
      params.set('limit', '50');

      const res = await fetch(`/api/opportunity/search?${params.toString()}`);
      const data = await res.json();

      if (data.success) {
        setOpportunities(data.data.opportunities || []);
      }
    } catch (error) {
      console.error('Error fetching opportunities:', error);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  // Initial load
  useEffect(() => {
    fetchStats();
    fetchOpportunities();
  }, [fetchStats, fetchOpportunities]);

  // Discover opportunities for a category
  const handleDiscover = async () => {
    // Capture current values to avoid closure issues
    const categoryToDiscover = discoveryCategory;
    const countryToUse = filters.country;
    const sortToUse = filters.sort;

    setDiscovering(true);
    setError(null);
    setSuccessMessage(null);
    setDiscoveryProgress({
      stage: 'discovering',
      message: `Discovering keywords for ${CATEGORY_NAMES[categoryToDiscover] || categoryToDiscover}...`
    });

    try {
      // Stage 1: Start discovery - show we're working
      setDiscoveryProgress({
        stage: 'discovering',
        message: 'Expanding seed keywords via autosuggest...'
      });

      // Small delay to show the UI update before the long fetch
      await new Promise(resolve => setTimeout(resolve, 50));

      setDiscoveryProgress({
        stage: 'scoring',
        message: 'Scoring discovered keywords (this may take 30-60 seconds)...'
      });

      const res = await fetch('/api/opportunity/discover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category: categoryToDiscover,
          country: countryToUse,
          limit: 20,
        }),
      });

      const data = await res.json();

      if (data.success) {
        // Stage 3: Saving/Complete
        setDiscoveryProgress({
          stage: 'complete',
          message: `Found ${data.data.total_scored} opportunities!`,
          keywordsScored: data.data.total_scored,
        });

        setSuccessMessage(`✓ Discovered ${data.data.total_scored} opportunities in ${CATEGORY_NAMES[categoryToDiscover] || categoryToDiscover}`);

        // Update filter to show discovered category
        setFilters(f => ({ ...f, category: categoryToDiscover }));

        // Refresh stats
        await fetchStats();

        // Fetch opportunities for the discovered category
        setLoading(true);
        try {
          const params = new URLSearchParams();
          params.set('country', countryToUse);
          params.set('sort', sortToUse);
          params.set('sort_dir', 'desc');
          params.set('category', categoryToDiscover);
          params.set('limit', '50');
          params.set('_t', Date.now().toString()); // Cache bust

          const searchRes = await fetch(`/api/opportunity/search?${params.toString()}`);
          const result = await searchRes.json();

          if (result.success) {
            setOpportunities(result.data.opportunities || []);
          }
        } finally {
          setLoading(false);
        }

        // Keep the complete state visible for a moment, then reset
        setTimeout(() => {
          setDiscoveryProgress({ stage: 'idle', message: '' });
        }, 3000);
      } else {
        setDiscoveryProgress({ stage: 'idle', message: '' });
        setError(data.error || 'Discovery failed');
        console.error('Discovery failed:', data.error);
      }
    } catch (err) {
      setDiscoveryProgress({ stage: 'idle', message: '' });
      const message = err instanceof Error ? err.message : 'Network error';
      setError(`Error: ${message}`);
      console.error('Error discovering opportunities:', err);
    } finally {
      setDiscovering(false);
    }
  };

  // Run daily autonomous discovery
  const handleDailyRun = async () => {
    setRunningDailyRun(true);
    setError(null);
    setSuccessMessage(null);
    try {
      const res = await fetch('/api/opportunity/daily-run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          country: filters.country,
        }),
      });

      const data = await res.json();

      if (data.success) {
        if (data.data.status === 'already_completed') {
          // Already completed today - show appropriate message
          if (data.data.winner) {
            setSuccessMessage(`Already completed today! Winner: "${data.data.winner.keyword}" (${data.data.winner.opportunity_score})`);
          } else {
            setSuccessMessage('Daily run already completed today');
          }
        } else if (data.data.winner) {
          // New run completed with winner
          setSuccessMessage(`Daily run complete! Winner: "${data.data.winner.keyword}" (${data.data.winner.opportunity_score})`);
        } else {
          // Scored opportunities but no clear winner
          setSuccessMessage(`Scored ${data.data.total_scored} opportunities`);
        }
        // Clear category filter to show all results and refresh data
        setFilters(f => ({ ...f, category: '' }));
        // Refresh data after a brief delay to allow state updates
        await fetchStats();
        await fetchOpportunities();
      } else {
        setError(data.error || 'Daily run failed');
        console.error('Daily run failed:', data.error, data);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Network error';
      setError(`Error: ${message}`);
      console.error('Error running daily discovery:', err);
    } finally {
      setRunningDailyRun(false);
    }
  };

  // Router for navigation
  const router = useRouter();

  // Generate blueprint for opportunity
  const handleGenerateBlueprint = async (competitorApp?: TopAppData) => {
    if (!selectedOpportunity) return;

    try {
      // Call API to create project from opportunity
      const res = await fetch(`/api/opportunity/${selectedOpportunity.id}/create-project`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          competitor_app_id: competitorApp?.id,
        }),
      });

      const data = await res.json();

      if (data.success && data.data.project_id) {
        // Navigate to the project blueprint page
        setSelectedOpportunity(null);
        router.push(`/projects/${data.data.project_id}/blueprint`);
      } else {
        setError(data.error || 'Failed to create project from opportunity');
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Network error';
      setError(`Error: ${message}`);
      console.error('Error creating project from opportunity:', err);
    }
  };

  // Export opportunity to CSV
  const handleExportCSV = () => {
    if (!selectedOpportunity) return;

    const opp = selectedOpportunity;
    const topApps = opp.raw_data?.itunes?.top_10_apps || [];

    // Build CSV content
    let csv = 'Opportunity Report\n';
    csv += `Keyword,${opp.keyword}\n`;
    csv += `Category,${CATEGORY_NAMES[opp.category] || opp.category}\n`;
    csv += `Country,${opp.country}\n`;
    csv += `Scored At,${new Date(opp.scored_at).toLocaleDateString()}\n\n`;

    csv += 'Scores\n';
    csv += `Opportunity Score,${opp.opportunity_score}\n`;
    csv += `Competition Gap,${opp.competition_gap_score}\n`;
    csv += `Market Demand,${opp.market_demand_score}\n`;
    csv += `Revenue Potential,${opp.revenue_potential_score}\n`;
    csv += `Trend Momentum,${opp.trend_momentum_score}\n`;
    csv += `Execution Feasibility,${opp.execution_feasibility_score}\n\n`;

    csv += 'Analysis\n';
    csv += `"${opp.reasoning?.replace(/"/g, '""') || ''}"\n\n`;

    csv += 'Suggested Strategy\n';
    csv += `"${opp.suggested_differentiator?.replace(/"/g, '""') || ''}"\n\n`;

    if (opp.top_competitor_weaknesses && opp.top_competitor_weaknesses.length > 0) {
      csv += 'Competitor Weaknesses\n';
      opp.top_competitor_weaknesses.forEach((w) => {
        csv += `"${w.replace(/"/g, '""')}"\n`;
      });
      csv += '\n';
    }

    if (topApps.length > 0) {
      csv += 'Top Ranking Apps\n';
      csv += 'Rank,Name,Rating,Reviews,Price,Has IAP,Has Subscription\n';
      topApps.forEach((app, idx) => {
        csv += `${idx + 1},"${app.name.replace(/"/g, '""')}",${app.rating},${app.reviews},${app.price},${app.has_iap},${app.has_subscription}\n`;
      });
    }

    // Download
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `opportunity-${opp.keyword.replace(/\s+/g, '-')}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Export all visible opportunities to CSV
  const handleExportAllCSV = () => {
    if (opportunities.length === 0) return;

    let csv = 'Keyword,Category,Score,Competition Gap,Market Demand,Revenue Potential,Trend Momentum,Feasibility,Status,Scored At,Strategy\n';

    opportunities.forEach((opp) => {
      csv += [
        `"${opp.keyword.replace(/"/g, '""')}"`,
        CATEGORY_NAMES[opp.category] || opp.category,
        opp.opportunity_score?.toFixed(1) || '',
        opp.competition_gap_score?.toFixed(1) || '',
        opp.market_demand_score?.toFixed(1) || '',
        opp.revenue_potential_score?.toFixed(1) || '',
        opp.trend_momentum_score?.toFixed(1) || '',
        opp.execution_feasibility_score?.toFixed(1) || '',
        opp.status,
        new Date(opp.scored_at).toLocaleDateString(),
        `"${(opp.suggested_differentiator || '').replace(/"/g, '""')}"`,
      ].join(',') + '\n';
    });

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `opportunities-${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Opportunity Ranker</h1>
          <p className="text-gray-500">Discover and rank app opportunities autonomously</p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={handleExportAllCSV}
            disabled={opportunities.length === 0}
            className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-colors"
            title="Export all visible opportunities to CSV"
          >
            Export All
          </button>
          <button
            onClick={handleDailyRun}
            disabled={runningDailyRun || discovering}
            className="bg-purple-600 text-white px-4 py-2 rounded-lg hover:bg-purple-700 disabled:opacity-50 transition-colors"
          >
            {runningDailyRun ? 'Running... (this takes a few minutes)' : 'Run Daily Discovery'}
          </button>
        </div>
      </div>

      {/* Error/Success Messages */}
      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg flex justify-between items-center">
          <span className="text-red-800">{error}</span>
          <button onClick={() => setError(null)} className="text-red-600 hover:text-red-800">&times;</button>
        </div>
      )}
      {successMessage && (
        <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-lg flex justify-between items-center">
          <span className="text-green-800">{successMessage}</span>
          <button onClick={() => setSuccessMessage(null)} className="text-green-600 hover:text-green-800">&times;</button>
        </div>
      )}

      {/* Stats Cards */}
      <StatsCards stats={stats} />

      {/* Today's Winner */}
      <DailyWinnerCard
        winner={todaysWinner}
        onViewDetails={(opp) => setSelectedOpportunity(opp)}
        onCreateProject={async (opp) => {
          try {
            const res = await fetch(`/api/opportunity/${opp.id}/create-project`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({}),
            });
            const data = await res.json();
            if (data.success && data.data.project_id) {
              router.push(`/projects/${data.data.project_id}/blueprint`);
            } else {
              setError(data.error || 'Failed to create project');
            }
          } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to create project');
          }
        }}
      />

      {/* Category Heatmap */}
      {stats && <CategoryHeatmap categoryStats={stats.by_category} />}

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Filters & Discovery - Sidebar */}
        <div className="space-y-4">
          {/* Filters */}
          <div className="bg-white rounded-lg p-4 shadow">
            <h3 className="font-semibold mb-3">Filters</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-sm text-gray-600 mb-1">Category</label>
                <select
                  value={filters.category}
                  onChange={(e) => setFilters((f) => ({ ...f, category: e.target.value }))}
                  className="w-full border rounded px-3 py-2"
                >
                  <option value="">All Categories</option>
                  {Object.entries(CATEGORY_NAMES).map(([key, name]) => (
                    <option key={key} value={key}>
                      {name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">Min Score</label>
                <input
                  type="number"
                  value={filters.minScore || ''}
                  onChange={(e) =>
                    setFilters((f) => ({
                      ...f,
                      minScore: e.target.value ? parseInt(e.target.value) : undefined,
                    }))
                  }
                  placeholder="0"
                  className="w-full border rounded px-3 py-2"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">Sort By</label>
                <select
                  value={filters.sort}
                  onChange={(e) => setFilters((f) => ({ ...f, sort: e.target.value }))}
                  className="w-full border rounded px-3 py-2"
                >
                  <option value="opportunity_score">Opportunity Score</option>
                  <option value="competition_gap">Competition Gap</option>
                  <option value="market_demand">Market Demand</option>
                  <option value="revenue_potential">Revenue Potential</option>
                  <option value="trend_momentum">Trend Momentum</option>
                  <option value="scored_at">Recently Scored</option>
                </select>
              </div>
            </div>
          </div>

          {/* Quick Discover */}
          <div className="bg-white rounded-lg p-4 shadow">
            <h3 className="font-semibold mb-3">Quick Discover</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-sm text-gray-600 mb-1">Category</label>
                <select
                  value={discoveryCategory}
                  onChange={(e) => setDiscoveryCategory(e.target.value)}
                  disabled={discovering}
                  className="w-full border rounded px-3 py-2 disabled:bg-gray-100"
                >
                  {Object.entries(CATEGORY_NAMES)
                    .filter(([key]) => !key.includes('games'))
                    .map(([key, name]) => (
                      <option key={key} value={key}>
                        {name}
                      </option>
                    ))}
                </select>
              </div>

              {/* Progress indicator - show during discovery or when complete */}
              {(discovering || discoveryProgress.stage === 'complete') && discoveryProgress.stage !== 'idle' && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                  <div className="flex items-center gap-2 mb-2">
                    {discoveryProgress.stage === 'complete' ? (
                      <div className="w-4 h-4 rounded-full bg-green-500 flex items-center justify-center">
                        <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                        </svg>
                      </div>
                    ) : (
                      <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                    )}
                    <span className={`text-sm font-medium ${discoveryProgress.stage === 'complete' ? 'text-green-700' : 'text-blue-700'}`}>
                      {discoveryProgress.stage === 'discovering' && 'Step 1/3: Discovering'}
                      {discoveryProgress.stage === 'scoring' && 'Step 2/3: Scoring'}
                      {discoveryProgress.stage === 'saving' && 'Step 3/3: Saving'}
                      {discoveryProgress.stage === 'complete' && 'Complete!'}
                    </span>
                  </div>
                  <p className="text-xs text-gray-600">{discoveryProgress.message}</p>
                  {discoveryProgress.keywordsScored && (
                    <p className="text-xs text-green-600 mt-1 font-medium">
                      {discoveryProgress.keywordsScored} opportunities scored
                    </p>
                  )}

                  {/* Progress bar */}
                  {discoveryProgress.stage !== 'complete' && (
                    <div className="mt-2 h-1.5 bg-blue-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-blue-500 rounded-full transition-all duration-500"
                        style={{
                          width: discoveryProgress.stage === 'discovering' ? '33%' :
                                 discoveryProgress.stage === 'scoring' ? '66%' :
                                 discoveryProgress.stage === 'saving' ? '90%' : '100%'
                        }}
                      />
                    </div>
                  )}
                </div>
              )}

              <button
                onClick={handleDiscover}
                disabled={discovering || runningDailyRun}
                className={`w-full px-4 py-2 rounded-lg transition-colors ${
                  discoveryProgress.stage === 'complete'
                    ? 'bg-green-600 text-white'
                    : 'bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50'
                }`}
              >
                {discovering ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Working...
                  </span>
                ) : discoveryProgress.stage === 'complete' ? (
                  'Discover More'
                ) : (
                  'Discover Opportunities'
                )}
              </button>
            </div>
          </div>

          {/* Recent Runs */}
          <RecentRuns runs={recentRuns} />
        </div>

        {/* Opportunities Table - Main Content */}
        <div className="lg:col-span-3">
          <OpportunitiesTable
            opportunities={opportunities}
            loading={loading}
            onSelect={setSelectedOpportunity}
            selectedId={selectedOpportunity?.id}
          />
        </div>
      </div>

      {/* Detail Modal */}
      {selectedOpportunity && (
        <OpportunityDetailModal
          opportunity={selectedOpportunity}
          onClose={() => setSelectedOpportunity(null)}
          onGenerateBlueprint={handleGenerateBlueprint}
          onExportCSV={handleExportCSV}
        />
      )}
    </div>
  );
}

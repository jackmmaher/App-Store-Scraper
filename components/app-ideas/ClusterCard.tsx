'use client';

import { useState } from 'react';
import { Cluster, ClusterScore } from '@/lib/app-ideas/types';

interface ClusterCardProps {
  cluster: Cluster;
  score?: ClusterScore;
  onEdit?: (cluster: Cluster, newName: string) => void;
  onRemove?: (clusterId: string) => void;
  isSelected?: boolean;
  onSelect?: (clusterId: string) => void;
  showScores?: boolean;
  isExpanded?: boolean;
  onToggleExpand?: () => void;
}

function getScoreColor(score: number): string {
  if (score >= 70) return 'text-emerald-600 bg-emerald-50';
  if (score >= 50) return 'text-yellow-600 bg-yellow-50';
  if (score >= 30) return 'text-orange-600 bg-orange-50';
  return 'text-red-600 bg-red-50';
}

function getScoreBgColor(score: number): string {
  if (score >= 70) return 'bg-emerald-500';
  if (score >= 50) return 'bg-yellow-500';
  if (score >= 30) return 'bg-orange-500';
  return 'bg-red-500';
}

export default function ClusterCard({
  cluster,
  score,
  onEdit,
  onRemove,
  isSelected,
  onSelect,
  showScores = false,
  isExpanded = false,
  onToggleExpand,
}: ClusterCardProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(cluster.name);

  const handleSaveEdit = () => {
    if (editName.trim() && onEdit) {
      onEdit(cluster, editName.trim());
    }
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSaveEdit();
    } else if (e.key === 'Escape') {
      setEditName(cluster.name);
      setIsEditing(false);
    }
  };

  return (
    <div
      className={`bg-white dark:bg-gray-800 rounded-lg border ${
        isSelected
          ? 'border-blue-500 ring-2 ring-blue-200 dark:ring-blue-800'
          : 'border-gray-200 dark:border-gray-700'
      } p-4 transition-all hover:shadow-md`}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1 min-w-0">
          {isEditing ? (
            <input
              type="text"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              onBlur={handleSaveEdit}
              onKeyDown={handleKeyDown}
              className="w-full px-2 py-1 text-lg font-semibold border border-blue-500 rounded focus:outline-none focus:ring-2 focus:ring-blue-200 dark:bg-gray-700 dark:text-white"
              autoFocus
            />
          ) : (
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white truncate">
              {cluster.name}
            </h3>
          )}
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            {cluster.theme}
          </p>
        </div>

        <div className="flex items-center gap-2 ml-4">
          {/* Keyword count badge */}
          <span className="px-2 py-1 text-xs font-medium bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded">
            {cluster.keywordCount} keywords
          </span>

          {/* Actions */}
          {onSelect && (
            <button
              onClick={() => onSelect(cluster.id)}
              className={`p-1.5 rounded ${
                isSelected
                  ? 'bg-blue-100 text-blue-600 dark:bg-blue-900 dark:text-blue-400'
                  : 'hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400'
              }`}
              title={isSelected ? 'Selected' : 'Select'}
            >
              {isSelected ? (
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
              ) : (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              )}
            </button>
          )}

          {onEdit && !isEditing && (
            <button
              onClick={() => setIsEditing(true)}
              className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded text-gray-400 hover:text-gray-600"
              title="Edit name"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
            </button>
          )}

          {onRemove && (
            <button
              onClick={() => onRemove(cluster.id)}
              className="p-1.5 hover:bg-red-50 dark:hover:bg-red-900/20 rounded text-gray-400 hover:text-red-500"
              title="Remove cluster"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Score bar (if showing scores) */}
      {showScores && score && (
        <div className="mb-3">
          <div className="flex items-center justify-between mb-1">
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Opportunity Score
            </span>
            <span className={`text-sm font-bold px-2 py-0.5 rounded ${getScoreColor(score.opportunityScore)}`}>
              {score.opportunityScore}
            </span>
          </div>
          <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
            <div
              className={`h-2 rounded-full transition-all ${getScoreBgColor(score.opportunityScore)}`}
              style={{ width: `${score.opportunityScore}%` }}
            />
          </div>

          {/* Dimension breakdown */}
          <div className="grid grid-cols-5 gap-2 mt-3">
            {[
              { label: 'Comp', value: score.competitionGap, title: 'Competition Gap' },
              { label: 'Demand', value: score.marketDemand, title: 'Market Demand' },
              { label: 'Rev', value: score.revenuePotential, title: 'Revenue Potential' },
              { label: 'Trend', value: score.trendMomentum, title: 'Trend Momentum' },
              { label: 'Exec', value: score.executionFeasibility, title: 'Execution Feasibility' },
            ].map((dim) => (
              <div key={dim.label} className="text-center" title={dim.title}>
                <div className="text-xs text-gray-500 dark:text-gray-400">{dim.label}</div>
                <div className={`text-xs font-medium ${getScoreColor(dim.value).split(' ')[0]}`}>
                  {dim.value}
                </div>
              </div>
            ))}
          </div>

          {/* Reasoning */}
          {score.reasoning && (
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-2 italic">
              {score.reasoning}
            </p>
          )}
        </div>
      )}

      {/* Keywords preview */}
      <div className="flex flex-wrap gap-1.5">
        {cluster.keywords.slice(0, isExpanded ? undefined : 6).map((keyword) => (
          <span
            key={keyword}
            className="px-2 py-0.5 text-xs bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded"
          >
            {keyword}
          </span>
        ))}
        {!isExpanded && cluster.keywords.length > 6 && (
          <button
            onClick={onToggleExpand}
            className="px-2 py-0.5 text-xs bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded hover:bg-gray-200 dark:hover:bg-gray-600"
          >
            +{cluster.keywords.length - 6} more
          </button>
        )}
        {isExpanded && cluster.keywords.length > 6 && (
          <button
            onClick={onToggleExpand}
            className="px-2 py-0.5 text-xs bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded hover:bg-gray-200 dark:hover:bg-gray-600"
          >
            Show less
          </button>
        )}
      </div>
    </div>
  );
}

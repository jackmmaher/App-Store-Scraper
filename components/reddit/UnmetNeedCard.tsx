'use client';

import { useState } from 'react';
import type { UnmetNeed } from '@/lib/reddit/types';

interface UnmetNeedCardProps {
  need: UnmetNeed;
  onSolutionChange: (needId: string, notes: string) => void;
  isExpanded?: boolean;
  onToggleExpand?: () => void;
}

function SeverityBadge({ severity }: { severity: 'high' | 'medium' | 'low' }) {
  const config = {
    high: {
      bg: 'bg-red-100 dark:bg-red-900/50',
      text: 'text-red-800 dark:text-red-200',
      border: 'border-red-300 dark:border-red-700',
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

export default function UnmetNeedCard({
  need,
  onSolutionChange,
  isExpanded = false,
  onToggleExpand,
}: UnmetNeedCardProps) {
  const [solutionNotes, setSolutionNotes] = useState(need.solutionNotes || '');

  const handleBlur = () => {
    if (solutionNotes !== need.solutionNotes) {
      onSolutionChange(need.id, solutionNotes);
    }
  };

  const topSubreddit = need.evidence.topSubreddits[0] || 'various';
  const evidenceLine = `${need.evidence.postCount} posts • Avg ${need.evidence.avgUpvotes} upvotes • r/${topSubreddit}`;

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 transition-all hover:shadow-md">
      {/* Header with title and severity */}
      <div className="flex items-start justify-between gap-3 mb-2">
        <h4 className="text-base font-semibold text-gray-900 dark:text-white flex-1">
          {need.title}
        </h4>
        <SeverityBadge severity={need.severity} />
      </div>

      {/* Description */}
      <p className="text-sm text-gray-600 dark:text-gray-300 mb-2">
        {need.description}
      </p>

      {/* Evidence line */}
      <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
        {evidenceLine}
      </p>

      {/* Solution Notes */}
      <div className="mb-3">
        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
          Solution Notes
        </label>
        <textarea
          value={solutionNotes}
          onChange={(e) => setSolutionNotes(e.target.value)}
          onBlur={handleBlur}
          placeholder="How could your app address this need?"
          rows={2}
          className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-700/50 text-gray-900 dark:text-white resize-none focus:ring-2 focus:ring-blue-500 focus:border-transparent placeholder-gray-400"
        />
      </div>

      {/* Expand/Collapse for quotes */}
      {need.evidence.representativeQuotes.length > 0 && (
        <div>
          <button
            onClick={onToggleExpand}
            className="flex items-center gap-1 text-sm text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 transition-colors"
          >
            <svg
              className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
            {isExpanded ? 'Hide' : 'Show'} Representative Quotes ({need.evidence.representativeQuotes.length})
          </button>

          {isExpanded && (
            <div className="mt-3 space-y-2 pl-4 border-l-2 border-gray-200 dark:border-gray-600">
              {need.evidence.representativeQuotes.map((quote, index) => (
                <blockquote
                  key={index}
                  className="text-sm text-gray-600 dark:text-gray-400 italic"
                >
                  "{quote}"
                </blockquote>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

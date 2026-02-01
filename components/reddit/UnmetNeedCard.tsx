'use client';

import { useState } from 'react';
import type { UnmetNeed, ConfidenceScore, AttributedQuote } from '@/lib/reddit/types';

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

function ConfidenceBadge({ confidence }: { confidence: ConfidenceScore }) {
  const config = {
    high: {
      bg: 'bg-green-100 dark:bg-green-900/50',
      text: 'text-green-700 dark:text-green-300',
      icon: '✓',
    },
    medium: {
      bg: 'bg-blue-100 dark:bg-blue-900/50',
      text: 'text-blue-700 dark:text-blue-300',
      icon: '~',
    },
    low: {
      bg: 'bg-orange-100 dark:bg-orange-900/50',
      text: 'text-orange-700 dark:text-orange-300',
      icon: '?',
    },
    speculative: {
      bg: 'bg-gray-100 dark:bg-gray-700',
      text: 'text-gray-600 dark:text-gray-400',
      icon: '⚡',
    },
  };

  const cfg = config[confidence.label];
  const percentage = Math.round(confidence.score * 100);

  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full ${cfg.bg} ${cfg.text}`}
      title={`Confidence: ${percentage}%\nPost volume: ${Math.round(confidence.factors.postVolume * 100)}%\nCross-subreddit: ${Math.round(confidence.factors.crossSubreddit * 100)}%\nSentiment consistency: ${Math.round(confidence.factors.sentimentConsistency * 100)}%`}
    >
      <span>{cfg.icon}</span>
      <span>{percentage}%</span>
    </span>
  );
}

function AttributedQuoteItem({ quote }: { quote: AttributedQuote }) {
  const redditUrl = quote.permalink.startsWith('http')
    ? quote.permalink
    : `https://reddit.com${quote.permalink}`;

  return (
    <blockquote className="text-sm text-gray-600 dark:text-gray-400 italic border-l-2 border-gray-300 dark:border-gray-600 pl-3 py-1">
      <p>"{quote.text}"</p>
      <footer className="mt-1 text-xs text-gray-500 dark:text-gray-500 not-italic flex items-center gap-2">
        <span className="flex items-center gap-1">
          <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
            <path d="M2 10.5a1.5 1.5 0 113 0v6a1.5 1.5 0 01-3 0v-6zM6 10.333v5.43a2 2 0 001.106 1.79l.05.025A4 4 0 008.943 18h5.416a2 2 0 001.962-1.608l1.2-6A2 2 0 0015.56 8H12V4a2 2 0 00-2-2 1 1 0 00-1 1v.667a4 4 0 01-.8 2.4L6.8 7.933a4 4 0 00-.8 2.4z" />
          </svg>
          {quote.score}
        </span>
        <span>r/{quote.subreddit}</span>
        <a
          href={redditUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-500 hover:text-blue-600 hover:underline"
        >
          view →
        </a>
      </footer>
    </blockquote>
  );
}

export default function UnmetNeedCard({
  need,
  onSolutionChange,
  isExpanded = false,
  onToggleExpand,
}: UnmetNeedCardProps) {
  const [solutionNotes, setSolutionNotes] = useState(need.solutionNotes || '');
  const [showWorkarounds, setShowWorkarounds] = useState(false);

  const handleBlur = () => {
    if (solutionNotes !== need.solutionNotes) {
      onSolutionChange(need.id, solutionNotes);
    }
  };

  const topSubreddit = need.evidence.topSubreddits[0] || 'various';
  const evidenceLine = `${need.evidence.postCount} posts • Avg ${need.evidence.avgUpvotes} upvotes • r/${topSubreddit}`;

  // Check if we have attributed quotes
  const hasAttributedQuotes = need.evidence.attributedQuotes && need.evidence.attributedQuotes.length > 0;

  // Check if we have workarounds/competitors
  const hasWorkarounds = need.workarounds && need.workarounds.length > 0;
  const hasCompetitors = need.competitorsMentioned && need.competitorsMentioned.length > 0;
  const hasIdealSolution = need.idealSolutionQuotes && need.idealSolutionQuotes.length > 0;

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 transition-all hover:shadow-md">
      {/* Header with title, severity, and confidence */}
      <div className="flex items-start justify-between gap-3 mb-2">
        <h4 className="text-base font-semibold text-gray-900 dark:text-white flex-1">
          {need.title}
        </h4>
        <div className="flex items-center gap-2">
          {need.confidence && <ConfidenceBadge confidence={need.confidence} />}
          <SeverityBadge severity={need.severity} />
        </div>
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
      {(need.evidence.representativeQuotes.length > 0 || hasAttributedQuotes) && (
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
            {isExpanded ? 'Hide' : 'Show'} Quotes ({hasAttributedQuotes ? need.evidence.attributedQuotes!.length : need.evidence.representativeQuotes.length})
          </button>

          {isExpanded && (
            <div className="mt-3 space-y-3">
              {/* Attributed quotes (with links) */}
              {hasAttributedQuotes ? (
                need.evidence.attributedQuotes!.map((quote, index) => (
                  <AttributedQuoteItem key={index} quote={quote} />
                ))
              ) : (
                /* Fallback to plain quotes */
                <div className="space-y-2 pl-4 border-l-2 border-gray-200 dark:border-gray-600">
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
      )}

      {/* Workarounds and Competitors section */}
      {(hasWorkarounds || hasCompetitors || hasIdealSolution) && (
        <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-700">
          <button
            onClick={() => setShowWorkarounds(!showWorkarounds)}
            className="flex items-center gap-1 text-sm text-purple-600 dark:text-purple-400 hover:text-purple-700 dark:hover:text-purple-300 transition-colors"
          >
            <svg
              className={`w-4 h-4 transition-transform ${showWorkarounds ? 'rotate-90' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
            Solutions & Workarounds
          </button>

          {showWorkarounds && (
            <div className="mt-2 space-y-2 text-sm">
              {/* Current workarounds */}
              {hasWorkarounds && (
                <div>
                  <p className="font-medium text-gray-700 dark:text-gray-300 mb-1">Current workarounds:</p>
                  <ul className="list-disc list-inside text-gray-600 dark:text-gray-400 space-y-1">
                    {need.workarounds!.map((w, i) => (
                      <li key={i}>{w}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Competitors mentioned */}
              {hasCompetitors && (
                <div>
                  <p className="font-medium text-gray-700 dark:text-gray-300 mb-1">Competitors mentioned:</p>
                  <div className="flex flex-wrap gap-1">
                    {need.competitorsMentioned!.map((c, i) => (
                      <span
                        key={i}
                        className="px-2 py-0.5 text-xs bg-purple-100 dark:bg-purple-900/50 text-purple-700 dark:text-purple-300 rounded"
                      >
                        {c}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Ideal solution quotes */}
              {hasIdealSolution && (
                <div>
                  <p className="font-medium text-gray-700 dark:text-gray-300 mb-1">What users want:</p>
                  <ul className="space-y-1 text-gray-600 dark:text-gray-400 italic">
                    {need.idealSolutionQuotes!.map((q, i) => (
                      <li key={i}>"{q}"</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

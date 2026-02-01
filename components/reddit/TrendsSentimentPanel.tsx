'use client';

import type { TrendAnalysis, SentimentBreakdown, SubredditSummary } from '@/lib/reddit/types';

interface TrendsSentimentPanelProps {
  trends: TrendAnalysis;
  sentiment: SentimentBreakdown;
  languagePatterns: string[];
  topSubreddits: SubredditSummary[];
}

function TrendArrow({ direction }: { direction: 'rising' | 'stable' | 'declining' }) {
  const config = {
    rising: {
      arrow: '\u2197',
      color: 'text-green-600 dark:text-green-400',
      bg: 'bg-green-100 dark:bg-green-900/50',
    },
    stable: {
      arrow: '\u2192',
      color: 'text-gray-600 dark:text-gray-400',
      bg: 'bg-gray-100 dark:bg-gray-700',
    },
    declining: {
      arrow: '\u2198',
      color: 'text-red-600 dark:text-red-400',
      bg: 'bg-red-100 dark:bg-red-900/50',
    },
  };

  const cfg = config[direction];

  return (
    <span className={`inline-flex items-center justify-center w-8 h-8 rounded-full ${cfg.bg} ${cfg.color} text-xl font-bold`}>
      {cfg.arrow}
    </span>
  );
}

function SentimentBar({ sentiment }: { sentiment: SentimentBreakdown }) {
  const total = sentiment.frustrated + sentiment.seekingHelp + sentiment.successStories;

  if (total === 0) {
    return (
      <div className="text-sm text-gray-500 dark:text-gray-400">
        No sentiment data available
      </div>
    );
  }

  const frustratedPercent = Math.round((sentiment.frustrated / total) * 100);
  const seekingHelpPercent = Math.round((sentiment.seekingHelp / total) * 100);
  const successPercent = Math.round((sentiment.successStories / total) * 100);

  return (
    <div>
      {/* Stacked bar */}
      <div className="flex h-4 rounded-full overflow-hidden bg-gray-200 dark:bg-gray-700">
        {frustratedPercent > 0 && (
          <div
            className="bg-red-500 dark:bg-red-600"
            style={{ width: `${frustratedPercent}%` }}
            title={`Frustrated: ${frustratedPercent}%`}
          />
        )}
        {seekingHelpPercent > 0 && (
          <div
            className="bg-yellow-400 dark:bg-yellow-500"
            style={{ width: `${seekingHelpPercent}%` }}
            title={`Seeking Help: ${seekingHelpPercent}%`}
          />
        )}
        {successPercent > 0 && (
          <div
            className="bg-green-500 dark:bg-green-600"
            style={{ width: `${successPercent}%` }}
            title={`Success Stories: ${successPercent}%`}
          />
        )}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-4 mt-2 text-xs">
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-sm bg-red-500 dark:bg-red-600" />
          <span className="text-gray-600 dark:text-gray-300">Frustrated ({frustratedPercent}%)</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-sm bg-yellow-400 dark:bg-yellow-500" />
          <span className="text-gray-600 dark:text-gray-300">Seeking Help ({seekingHelpPercent}%)</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-sm bg-green-500 dark:bg-green-600" />
          <span className="text-gray-600 dark:text-gray-300">Success ({successPercent}%)</span>
        </div>
      </div>
    </div>
  );
}

export default function TrendsSentimentPanel({
  trends,
  sentiment,
  languagePatterns,
  topSubreddits,
}: TrendsSentimentPanelProps) {
  const changeSign = trends.percentChange >= 0 ? '+' : '';
  const changeColor = trends.trendDirection === 'rising'
    ? 'text-green-600 dark:text-green-400'
    : trends.trendDirection === 'declining'
      ? 'text-red-600 dark:text-red-400'
      : 'text-gray-600 dark:text-gray-400';

  return (
    <div className="bg-gray-50 dark:bg-gray-900/50 rounded-lg border border-gray-200 dark:border-gray-700 p-4 space-y-6">
      {/* Discussion Volume */}
      <div>
        <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          Discussion Volume
        </h4>
        <div className="flex items-center gap-3">
          <div className="flex-1 h-3 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-500 dark:bg-blue-600 rounded-full transition-all"
              style={{ width: `${Math.min(100, (trends.discussionVolume / 1000) * 100)}%` }}
            />
          </div>
          <span className="text-lg font-bold text-gray-900 dark:text-white min-w-[100px] text-right">
            {trends.discussionVolume.toLocaleString()} posts/mo
          </span>
        </div>
      </div>

      {/* Trend Direction */}
      <div>
        <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          Trend Direction
        </h4>
        <div className="flex items-center gap-3">
          <TrendArrow direction={trends.trendDirection} />
          <div>
            <span className="text-base font-semibold text-gray-900 dark:text-white capitalize">
              {trends.trendDirection}
            </span>
            <span className={`ml-2 text-sm font-medium ${changeColor}`}>
              ({changeSign}{trends.percentChange}%)
            </span>
          </div>
        </div>
      </div>

      {/* Sentiment Breakdown */}
      <div>
        <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          Sentiment Breakdown
        </h4>
        <SentimentBar sentiment={sentiment} />
      </div>

      {/* Language Patterns */}
      {languagePatterns.length > 0 && (
        <div>
          <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Common Language Patterns
          </h4>
          <div className="space-y-1.5">
            {languagePatterns.slice(0, 6).map((pattern, index) => (
              <p key={index} className="text-sm text-gray-600 dark:text-gray-400 italic">
                "{pattern}"
              </p>
            ))}
          </div>
        </div>
      )}

      {/* Top Subreddits */}
      {topSubreddits.length > 0 && (
        <div>
          <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Top Subreddits
          </h4>
          <div className="space-y-2">
            {topSubreddits.slice(0, 5).map((subreddit) => (
              <div
                key={subreddit.name}
                className="flex items-center justify-between py-1.5 px-2 bg-white dark:bg-gray-800 rounded border border-gray-200 dark:border-gray-700"
              >
                <a
                  href={`https://reddit.com/r/${subreddit.name}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
                >
                  r/{subreddit.name}
                </a>
                <div className="flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400">
                  <span>{subreddit.postCount} posts</span>
                  <span title="Average engagement">
                    {subreddit.avgEngagement.toFixed(1)} avg
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

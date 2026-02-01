// Reddit Deep Dive Types
// TypeScript interfaces for Reddit analysis feature

// ============================================================================
// Search Configuration
// ============================================================================

export interface RedditSearchConfig {
  competitorId: string;
  problemDomain: string;
  searchTopics: string[];
  subreddits: string[];
  timeRange: 'week' | 'month' | 'year';
}

// ============================================================================
// Analysis Results
// ============================================================================

export interface RedditAnalysisResult {
  id: string;
  competitorId: string;
  searchConfig: RedditSearchConfig;
  unmetNeeds: UnmetNeed[];
  trends: TrendAnalysis;
  sentiment: SentimentBreakdown;
  languagePatterns: string[];
  topSubreddits: SubredditSummary[];
  rawData: {
    postsAnalyzed: number;
    commentsAnalyzed: number;
    dateRange: {
      start: string;
      end: string;
    };
  };
  createdAt: string;
}

// ============================================================================
// Unmet Needs
// ============================================================================

export interface UnmetNeed {
  id: string;
  title: string;
  description: string;
  severity: 'high' | 'medium' | 'low';
  evidence: {
    postCount: number;
    avgUpvotes: number;
    topSubreddits: string[];
    representativeQuotes: string[];
  };
  solutionNotes: string | null;
}

// ============================================================================
// Trend Analysis
// ============================================================================

export interface TrendAnalysis {
  discussionVolume: number;
  trendDirection: 'rising' | 'stable' | 'declining';
  percentChange: number;
}

// ============================================================================
// Sentiment Breakdown
// ============================================================================

export interface SentimentBreakdown {
  frustrated: number;
  seekingHelp: number;
  successStories: number;
}

// ============================================================================
// Subreddit Summary
// ============================================================================

export interface SubredditSummary {
  name: string;
  postCount: number;
  avgEngagement: number;
}

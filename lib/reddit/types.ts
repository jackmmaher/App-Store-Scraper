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
// Subreddit Validation
// ============================================================================

export interface SubredditInfo {
  name: string;
  subscribers: number;
  active_users: number;
  public: boolean;
  over18: boolean;
  description?: string;
}

export interface SubredditValidationResult {
  valid: SubredditInfo[];
  invalid: string[];
  discovered: string[];
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
// Confidence Scoring
// ============================================================================

export interface ConfidenceFactors {
  postVolume: number;       // 0-1: More posts = higher confidence
  crossSubreddit: number;   // 0-1: Mentioned in multiple subs = higher
  quoteVerified: boolean;   // Quotes actually found in posts
  sentimentConsistency: number; // 0-1: Agreement across posts
}

export interface ConfidenceScore {
  score: number;            // 0-1 scale
  factors: ConfidenceFactors;
  label: 'high' | 'medium' | 'low' | 'speculative';
}

// ============================================================================
// Quote Attribution
// ============================================================================

export interface AttributedQuote {
  text: string;
  postId: string;
  postTitle: string;
  subreddit: string;
  score: number;
  permalink: string;        // Direct link to comment/post
  isFromComment: boolean;
  author?: string;
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
    // New: Attributed quotes with links
    attributedQuotes?: AttributedQuote[];
  };
  // New: Confidence scoring
  confidence?: ConfidenceScore;
  // New: Solution/workaround extraction (Phase 3.2)
  workarounds?: string[];
  competitorsMentioned?: string[];
  idealSolutionQuotes?: string[];
  // Existing
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

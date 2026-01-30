// Opportunity Ranker System Types

// ============================================================================
// Core Opportunity Types
// ============================================================================

export interface Opportunity {
  id: string;
  keyword: string;
  category: string;
  country: string;

  // Dimension scores (0-100)
  competition_gap_score: number | null;
  market_demand_score: number | null;
  revenue_potential_score: number | null;
  trend_momentum_score: number | null;
  execution_feasibility_score: number | null;

  // Final weighted score
  opportunity_score: number | null;

  // Score component breakdowns
  competition_gap_breakdown: CompetitionGapBreakdown | null;
  market_demand_breakdown: MarketDemandBreakdown | null;
  revenue_potential_breakdown: RevenuePotentialBreakdown | null;
  trend_momentum_breakdown: TrendMomentumBreakdown | null;
  execution_feasibility_breakdown: ExecutionFeasibilityBreakdown | null;

  // Raw data from external sources
  raw_data: OpportunityRawData | null;

  // AI-generated insights
  reasoning: string | null;
  top_competitor_weaknesses: string[] | null;
  suggested_differentiator: string | null;

  // Tracking
  scored_at: string;
  status: OpportunityStatus;

  // Blueprint link
  blueprint_id: string | null;
  selected_at: string | null;
  blueprinted_at: string | null;
}

export type OpportunityStatus = 'scored' | 'selected' | 'blueprinted' | 'published';

// ============================================================================
// Dimension Score Breakdowns
// ============================================================================

export interface CompetitionGapBreakdown {
  title_keyword_saturation: number;   // % of top 10 with keyword in title
  avg_review_count_normalized: number; // logarithmic scale
  avg_rating_penalty: number;          // 4.5+ rating = harder
  feature_density: number;             // extracted from descriptions
  total: number;
}

export interface MarketDemandBreakdown {
  autosuggest_priority: number;        // Apple's internal signal
  google_trends_interest: number;      // 0-100 from trends
  reddit_mention_velocity: number;     // posts/week
  search_result_count: number;         // iTunes API total
  total: number;
}

export interface RevenuePotentialBreakdown {
  category_avg_price: number;          // paid apps signal
  iap_presence_ratio: number;          // % with IAP
  subscription_presence: number;       // recurring revenue
  review_count_as_proxy: number;       // more reviews = more $
  total: number;
}

export interface TrendMomentumBreakdown {
  google_trends_slope: number;         // rising/falling 12m
  new_apps_launched_90d: number;       // market activity
  reddit_growth_rate: number;          // subscriber velocity
  total: number;
}

export interface ExecutionFeasibilityBreakdown {
  avg_feature_count: number;           // more features = harder
  api_dependency_score: number;        // external APIs
  hardware_requirement: number;        // camera/GPS/etc
  total: number;
}

// ============================================================================
// Raw Data Types
// ============================================================================

export interface OpportunityRawData {
  // iTunes data
  itunes: {
    total_results: number;
    top_10_apps: TopAppData[];
    autosuggest_priority: number | null;
    autosuggest_position: number | null;
  };

  // Google Trends data
  google_trends: {
    interest_over_time: number[];
    average_interest: number;
    slope: number;  // positive = growing
    related_queries: string[];
  } | null;

  // Reddit data
  reddit: {
    posts_per_week: number;
    total_posts_30d: number;
    avg_upvotes: number;
    avg_comments: number;
    top_subreddits: string[];
    sentiment_score: number;  // -1 to 1
  } | null;

  // Category metadata
  category_data: {
    avg_price: number;
    paid_app_count: number;
    iap_app_count: number;
    subscription_app_count: number;
    new_apps_90d: number;
  };
}

export interface TopAppData {
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
  feature_count: number;  // extracted features
  requires_hardware: string[];  // ['camera', 'gps', etc]
}

// ============================================================================
// Scoring Result Types
// ============================================================================

export interface OpportunityScoreResult {
  keyword: string;
  category: string;
  country: string;

  // Final score
  opportunity_score: number;

  // Dimension scores
  dimensions: {
    competition_gap: number;
    market_demand: number;
    revenue_potential: number;
    trend_momentum: number;
    execution_feasibility: number;
  };

  // Breakdowns
  breakdowns: {
    competition_gap: CompetitionGapBreakdown;
    market_demand: MarketDemandBreakdown;
    revenue_potential: RevenuePotentialBreakdown;
    trend_momentum: TrendMomentumBreakdown;
    execution_feasibility: ExecutionFeasibilityBreakdown;
  };

  // AI insights
  reasoning: string;
  top_competitor_weaknesses: string[];
  suggested_differentiator: string;

  // Raw data
  raw_data: OpportunityRawData;
}

// ============================================================================
// Job Types
// ============================================================================

export type OpportunityJobType = 'score_single' | 'discover_category' | 'daily_run';
export type OpportunityJobStatus = 'pending' | 'running' | 'completed' | 'failed';

export interface OpportunityJob {
  id: string;
  job_type: OpportunityJobType;
  status: OpportunityJobStatus;
  params: OpportunityJobParams;
  total_items: number | null;
  processed_items: number;
  opportunities_scored: number;
  winner_id: string | null;
  winner_keyword: string | null;
  winner_score: number | null;
  error_message: string | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
}

export interface OpportunityJobParams {
  // For single scoring
  keyword?: string;
  category?: string;

  // For category discovery
  categories?: string[];

  // For daily run
  keywords_per_category?: number;

  // Common
  country: string;
}

// ============================================================================
// Daily Run Types
// ============================================================================

export interface DailyRun {
  id: string;
  run_date: string;
  categories_processed: string[];
  total_keywords_discovered: number;
  total_keywords_scored: number;
  winner_opportunity_id: string | null;
  winner_keyword: string | null;
  winner_category: string | null;
  winner_score: number | null;
  blueprint_triggered: boolean;
  blueprint_id: string | null;
  status: 'running' | 'completed' | 'failed';
  error_message: string | null;
  started_at: string;
  completed_at: string | null;
}

// ============================================================================
// History Types
// ============================================================================

export interface OpportunityHistory {
  id: string;
  opportunity_id: string;
  opportunity_score: number;
  competition_gap_score: number;
  market_demand_score: number;
  revenue_potential_score: number;
  trend_momentum_score: number;
  execution_feasibility_score: number;
  recorded_at: string;
}

// ============================================================================
// API Request/Response Types
// ============================================================================

export interface ScoreOpportunityRequest {
  keyword: string;
  category: string;
  country?: string;
}

export interface ScoreOpportunityResponse {
  success: boolean;
  data?: OpportunityScoreResult;
  error?: string;
}

export interface DiscoverOpportunitiesRequest {
  category: string;
  country?: string;
  limit?: number;
}

export interface DiscoverOpportunitiesResponse {
  success: boolean;
  data?: {
    category: string;
    total_scored: number;
    opportunities: RankedOpportunity[];
  };
  error?: string;
}

export interface RankedOpportunity {
  rank: number;
  keyword: string;
  opportunity_score: number;
  dimensions: {
    competition_gap: number;
    market_demand: number;
    revenue_potential: number;
    trend_momentum: number;
    execution_feasibility: number;
  };
  one_liner: string;
}

export interface DailyRunResponse {
  success: boolean;
  data?: {
    run_id: string;
    categories_processed: string[];
    total_scored: number;
    winner: {
      keyword: string;
      category: string;
      opportunity_score: number;
      blueprint_triggered: boolean;
    } | null;
  };
  error?: string;
}

// ============================================================================
// Search/Filter Types
// ============================================================================

export interface SearchOpportunitiesParams {
  q?: string;
  category?: string;
  country?: string;
  status?: OpportunityStatus;
  sort?: 'opportunity_score' | 'competition_gap' | 'market_demand' | 'revenue_potential' | 'trend_momentum' | 'scored_at';
  sort_dir?: 'asc' | 'desc';
  min_score?: number;
  max_score?: number;
  page?: number;
  limit?: number;
}

export interface SearchOpportunitiesResponse {
  opportunities: Opportunity[];
  total: number;
  page: number;
  limit: number;
  has_more: boolean;
}

// ============================================================================
// Progress Event Types (for streaming)
// ============================================================================

export interface OpportunityProgressEvent {
  type: 'progress' | 'opportunity' | 'complete' | 'error' | 'heartbeat';
  status?: OpportunityJobStatus;
  progress?: number;
  processed?: number;
  total?: number;
  scored?: number;
  opportunity?: OpportunityScoreResult;
  winner?: RankedOpportunity;
  message?: string;
  timestamp?: number;
}

// ============================================================================
// Stats Types
// ============================================================================

export interface OpportunityStats {
  total_opportunities: number;
  avg_score: number;
  high_opportunity_count: number;
  selected_count: number;
  blueprinted_count: number;
  top_category: string | null;
  top_category_avg_score: number | null;
  by_category: CategoryStats[];
}

export interface CategoryStats {
  category: string;
  count: number;
  avg_score: number;
  high_opportunity_count: number;
}

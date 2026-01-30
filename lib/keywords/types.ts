// Keyword Research System Types

// ============================================================================
// Core Keyword Types
// ============================================================================

export interface Keyword {
  id: string;
  keyword: string;
  country: string;

  // Scores (0-100)
  volume_score: number | null;
  difficulty_score: number | null;
  opportunity_score: number | null;

  // Raw metrics for transparency
  autosuggest_priority: number | null;
  autosuggest_position: number | null;
  trigger_chars: number | null;
  total_results: number | null;
  top10_avg_reviews: number | null;
  top10_avg_rating: number | null;
  top10_title_matches: number | null;

  // Discovery metadata
  discovered_via: DiscoveryMethod | null;
  source_app_id: string | null;
  source_category: string | null;
  source_seed: string | null;

  // Timestamps
  created_at: string;
  scored_at: string | null;
}

export type DiscoveryMethod = 'autosuggest' | 'competitor' | 'category_crawl' | 'manual';

// ============================================================================
// Keyword Rankings (Apps that rank for keywords)
// ============================================================================

export interface KeywordRanking {
  id: string;
  keyword_id: string;
  app_id: string;
  rank_position: number;
  has_keyword_in_title: boolean;
  app_name: string;
  app_review_count: number;
  app_rating: number;
  app_icon_url: string | null;
  scraped_at: string;
}

// ============================================================================
// Keyword History (for trend tracking)
// ============================================================================

export interface KeywordHistory {
  id: string;
  keyword_id: string;
  volume_score: number;
  difficulty_score: number;
  opportunity_score: number;
  recorded_at: string;
}

// ============================================================================
// Job Queue Types
// ============================================================================

export type KeywordJobType =
  | 'discover_seed'
  | 'discover_competitor'
  | 'discover_category'
  | 'score_bulk'
  | 'rescore_stale';

export type KeywordJobStatus = 'pending' | 'running' | 'completed' | 'failed';

export interface KeywordJob {
  id: string;
  job_type: KeywordJobType;
  status: KeywordJobStatus;
  params: KeywordJobParams;
  total_items: number | null;
  processed_items: number;
  keywords_discovered: number;
  keywords_scored: number;
  error_message: string | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
}

export interface KeywordJobParams {
  // For seed expansion
  seed?: string;
  depth?: number;

  // For competitor extraction
  app_id?: string;

  // For category crawl
  category?: string;

  // For bulk scoring
  keywords?: string[];

  // Common
  country: string;
}

// ============================================================================
// Autosuggest Types
// ============================================================================

export interface AutosuggestHint {
  term: string;
  priority: number;
  position: number;
}

export interface AutosuggestResult {
  term: string;
  priority: number;
  position: number | null;
  trigger_chars: number;
  found: boolean;
}

// ============================================================================
// Scoring Types
// ============================================================================

export interface VolumeScoreComponents {
  priority_score: number;
  position_score: number;
  market_score: number;
  trigger_score: number;
  total: number;
}

export interface DifficultyScoreComponents {
  title_score: number;
  review_score: number;
  rating_score: number;
  saturation_score: number;
  maturity_score: number;
  total: number;
}

export interface KeywordScoreResult {
  keyword: string;
  country: string;
  volume_score: number;
  difficulty_score: number;
  opportunity_score: number;

  // Component breakdowns
  volume_components: VolumeScoreComponents;
  difficulty_components: DifficultyScoreComponents;

  // Raw data
  raw: {
    autosuggest_priority: number | null;
    autosuggest_position: number | null;
    trigger_chars: number;
    total_results: number;
    top10_avg_reviews: number;
    top10_avg_rating: number;
    top10_title_matches: number;
  };

  // Top competing apps
  top_10_apps: RankedApp[];
}

export interface RankedApp {
  id: string;
  name: string;
  rating: number;
  reviews: number;
  icon_url: string;
  has_keyword_in_title: boolean;
}

// ============================================================================
// Discovery Types
// ============================================================================

export interface DiscoveredKeyword {
  keyword: string;
  priority?: number;
  position?: number;
  trigger_chars?: number;
  discovered_via: DiscoveryMethod;
  source_seed?: string;
  source_app_id?: string;
  source_category?: string;
}

// ============================================================================
// API Request/Response Types
// ============================================================================

export interface DiscoverRequest {
  method: DiscoveryMethod;
  seed?: string;
  app_id?: string;
  category?: string;
  country: string;
  depth?: number;
}

export interface ScoreRequest {
  keyword: string;
  country: string;
}

export interface SearchKeywordsParams {
  q?: string;
  country?: string;
  sort?: 'opportunity' | 'volume' | 'difficulty' | 'created_at';
  sort_dir?: 'asc' | 'desc';
  min_volume?: number;
  max_volume?: number;
  min_difficulty?: number;
  max_difficulty?: number;
  min_opportunity?: number;
  discovered_via?: DiscoveryMethod;
  page?: number;
  limit?: number;
}

export interface SearchKeywordsResponse {
  keywords: Keyword[];
  total: number;
  page: number;
  limit: number;
  has_more: boolean;
}

export interface JobProgressEvent {
  type: 'progress' | 'keyword' | 'complete' | 'error' | 'heartbeat';
  status?: KeywordJobStatus;
  progress?: number;
  processed?: number;
  total?: number;
  discovered?: number;
  scored?: number;
  keyword?: DiscoveredKeyword;
  score?: KeywordScoreResult;
  message?: string;
  timestamp?: number;
}

/**
 * TypeScript types for Crawl4AI integration
 */

// ============================================================================
// Request Types
// ============================================================================

export interface AppStoreReviewRequest {
  app_id: string;
  country?: string;
  max_reviews?: number;
  min_rating?: number;
  max_rating?: number;
  force_refresh?: boolean;
}

export interface AppStoreWhatsNewRequest {
  app_id: string;
  country?: string;
  max_versions?: number;
  force_refresh?: boolean;
}

export interface AppStorePrivacyRequest {
  app_id: string;
  country?: string;
  force_refresh?: boolean;
}

export interface RedditCrawlRequest {
  keywords: string[];
  subreddits?: string[];
  max_posts?: number;
  max_comments_per_post?: number;
  time_filter?: 'hour' | 'day' | 'week' | 'month' | 'year' | 'all';
  sort?: 'relevance' | 'hot' | 'new' | 'top';
  force_refresh?: boolean;
}

export interface WebsiteCrawlRequest {
  url: string;
  max_pages?: number;
  include_subpages?: boolean;
  extract_pricing?: boolean;
  extract_features?: boolean;
  force_refresh?: boolean;
}

export interface BatchCrawlRequest {
  app_store_reviews?: AppStoreReviewRequest[];
  reddit?: RedditCrawlRequest[];
  websites?: WebsiteCrawlRequest[];
}

// ============================================================================
// Response Types
// ============================================================================

export interface ExtendedReview {
  id: string;
  title: string;
  content: string;
  rating: number;
  author: string;
  date: string;
  version?: string;
  helpful_count: number;
  app_id: string;
  country: string;
}

export interface AppStoreReviewResponse {
  app_id: string;
  app_name?: string;
  country: string;
  total_reviews: number;
  reviews: ExtendedReview[];
  rating_distribution: Record<string, number>;
  crawled_at: string;
  cached: boolean;
  cache_expires_at?: string;
}

export interface WhatsNewEntry {
  version: string;
  release_date: string;
  release_notes: string;
  size_bytes?: number;
}

export interface AppStoreWhatsNewResponse {
  app_id: string;
  app_name?: string;
  country: string;
  total_versions: number;
  versions: WhatsNewEntry[];
  crawled_at: string;
  cached: boolean;
}

export interface PrivacyLabel {
  category: string;
  data_types: string[];
  purposes: string[];
}

export interface AppStorePrivacyResponse {
  app_id: string;
  app_name?: string;
  country: string;
  privacy_labels: PrivacyLabel[];
  privacy_policy_url?: string;
  crawled_at: string;
  cached: boolean;
}

export interface RedditComment {
  id: string;
  author: string;
  content: string;
  score: number;
  created_at: string;
  is_op: boolean;
}

export interface RedditPost {
  id: string;
  title: string;
  content: string;
  url: string;
  subreddit: string;
  author: string;
  score: number;
  upvote_ratio: number;
  num_comments: number;
  created_at: string;
  flair?: string;
  is_self: boolean;
  comments: RedditComment[];
}

export interface RedditDiscussion {
  keyword: string;
  subreddit: string;
  post: RedditPost;
  relevance_score: number;
}

export interface RedditCrawlResponse {
  keywords: string[];
  subreddits_searched: string[];
  total_posts: number;
  discussions: RedditDiscussion[];
  crawled_at: string;
  cached: boolean;
}

export interface WebsiteContent {
  url: string;
  title: string;
  description: string;
  main_content: string;
  features: string[];
  pricing_info?: {
    plans: Array<{
      name?: string;
      price_text?: string;
      features: string[];
    }>;
    has_free_tier: boolean;
    currency: string;
  };
  screenshots: string[];
  testimonials: string[];
  technology_stack: string[];
  social_links: Record<string, string>;
  crawled_pages: number;
}

export interface WebsiteCrawlResponse {
  url: string;
  content: WebsiteContent;
  crawled_at: string;
  cached: boolean;
}

export interface BatchCrawlResponse {
  job_id: string;
  status: CrawlJobStatus;
  total_tasks: number;
  completed_tasks: number;
  created_at: string;
}

export interface CrawlJob {
  id: string;
  type: CrawlType;
  status: CrawlJobStatus;
  request: Record<string, unknown>;
  result?: Record<string, unknown>;
  error?: string;
  progress: number;
  created_at: string;
  started_at?: string;
  completed_at?: string;
}

export interface HealthResponse {
  status: string;
  version: string;
  crawl4ai_ready: boolean;
  supabase_connected: boolean;
  uptime_seconds: number;
}

// ============================================================================
// Enums
// ============================================================================

export type CrawlJobStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';

export type CrawlType = 'app_store_reviews' | 'app_store_whats_new' | 'app_store_privacy' | 'reddit' | 'website';

// ============================================================================
// Enrichment Types
// ============================================================================

export interface EnrichmentContext {
  appStoreIds?: string[];
  keywords?: string[];
  competitorUrls?: string[];
  country?: string;
  options?: {
    includeReviews?: boolean;
    includeReddit?: boolean;
    includeWebsites?: boolean;
    maxReviewsPerApp?: number;
    maxRedditPosts?: number;
    forceRefresh?: boolean;
  };
}

export interface EnrichmentResult {
  reviews?: {
    appId: string;
    appName?: string;
    totalReviews: number;
    sampleReviews: ExtendedReview[];
    ratingDistribution: Record<string, number>;
    topComplaints: string[];
    topPraises: string[];
  }[];
  reddit?: {
    totalDiscussions: number;
    discussions: RedditDiscussion[];
    keyInsights: string[];
    userSentiment: 'positive' | 'neutral' | 'negative' | 'mixed';
  };
  websites?: {
    url: string;
    content: WebsiteContent;
  }[];
  formatted: string; // Markdown-formatted enrichment for prompt injection
}

// ============================================================================
// Cache Types
// ============================================================================

export interface CacheEntry<T> {
  data: T;
  cachedAt: string;
  expiresAt: string;
  hitCount: number;
}

export interface CacheStats {
  memory_cache_size: number;
  memory_cache_max_size: number;
  supabase_total_entries?: number;
  entries_by_type?: Record<string, number>;
}

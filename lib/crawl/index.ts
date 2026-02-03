/**
 * Crawl4AI Deep Integration Module
 *
 * Main entry point for the crawl orchestration layer.
 * Provides access to:
 * - CrawlOrchestrator for direct API calls
 * - Enrichment functions for AI prompt injection
 * - Cache utilities for Supabase caching
 * - Rate limiter for request management
 */

// Re-export orchestrator
export { CrawlOrchestrator, getCrawlOrchestrator } from './orchestrator';

// Re-export enrichment functions
export {
  getEnrichmentForPrompt,
  getEnrichmentData,
  getReviewEnrichmentForGapAnalysis,
  getRedditEnrichmentForTrends,
  getWebsiteEnrichmentForCompetitors,
  getEnrichmentForBlueprint,
  getColorPalettesForDesignSystem,
  getStructuredColorPalettes,
  getFontsForDesignSystem,
  getFontPairingsForDesignSystem,
  getColorSpectrumForPrimary,
  extractKeyComplaints,
  extractFeatureRequests,
  extractRedditThemes,
  getMentionedApps,
  compareCompetitorFeatures,
  summarizeCompetitorPricing,
  formatAsCollapsible,
  createEnrichmentHeader,
} from './enrichment';

// Re-export palette and font types
export type {
  ColorPalette,
  PaletteResponse,
  StructuredPaletteResponse,
  GoogleFontData,
  FontPairingData,
  FontsResponse,
  FontPairsResponse,
  ColorShades,
  ColorSpectrumData,
  ColorSpectrumResponse,
} from './enrichment';

// Re-export cache utilities
export {
  getCachedCrawl,
  setCachedCrawl,
  invalidateCacheEntry,
  invalidateCacheType,
  cleanupExpiredCache,
  getCacheStats,
} from './cache';

// Re-export rate limiter
export {
  RateLimiter,
  getDefaultRateLimiter,
  rateLimited,
} from './rate-limiter';

// Re-export types
export type {
  // Request types
  AppStoreReviewRequest,
  AppStoreWhatsNewRequest,
  AppStorePrivacyRequest,
  RedditCrawlRequest,
  WebsiteCrawlRequest,
  BatchCrawlRequest,
  // Response types
  ExtendedReview,
  AppStoreReviewResponse,
  WhatsNewEntry,
  AppStoreWhatsNewResponse,
  PrivacyLabel,
  AppStorePrivacyResponse,
  RedditComment,
  RedditPost,
  RedditDiscussion,
  RedditCrawlResponse,
  WebsiteContent,
  WebsiteCrawlResponse,
  BatchCrawlResponse,
  CrawlJob,
  HealthResponse,
  // Enrichment types
  EnrichmentContext,
  EnrichmentResult,
  // Other types
  CrawlJobStatus,
  CrawlType,
  CacheStats,
} from './types';

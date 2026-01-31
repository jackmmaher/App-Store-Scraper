/**
 * Crawl Orchestrator
 *
 * Main orchestrator class for managing crawl requests with:
 * - Deduplication (same URL in-flight)
 * - Cache checking (Supabase)
 * - Rate limiting
 * - Parallel fetching
 */

import type {
  AppStoreReviewRequest,
  AppStoreReviewResponse,
  AppStoreWhatsNewRequest,
  AppStoreWhatsNewResponse,
  AppStorePrivacyRequest,
  AppStorePrivacyResponse,
  RedditCrawlRequest,
  RedditCrawlResponse,
  WebsiteCrawlRequest,
  WebsiteCrawlResponse,
  BatchCrawlRequest,
  BatchCrawlResponse,
  CrawlJob,
  EnrichmentContext,
  EnrichmentResult,
  ExtendedReview,
} from './types';
import { RateLimiter } from './rate-limiter';

// ============================================================================
// Configuration
// ============================================================================

const CRAWL_SERVICE_URL = process.env.CRAWL_SERVICE_URL || 'http://localhost:8000';
const CRAWL_SERVICE_API_KEY = process.env.CRAWL_SERVICE_API_KEY || '';

// ============================================================================
// Orchestrator Class
// ============================================================================

export class CrawlOrchestrator {
  private rateLimiter: RateLimiter;
  private inFlightRequests: Map<string, Promise<unknown>> = new Map();
  private enabled: boolean;

  constructor() {
    this.rateLimiter = new RateLimiter({
      requestsPerMinute: parseInt(process.env.CRAWL_REQUESTS_PER_MINUTE || '30', 10),
      maxConcurrent: parseInt(process.env.CRAWL_MAX_CONCURRENT || '5', 10),
    });
    this.enabled = process.env.CRAWL_ENABLED !== 'false';
  }

  /**
   * Check if crawl service is available
   */
  async isAvailable(): Promise<boolean> {
    if (!this.enabled) return false;

    try {
      const response = await fetch(`${CRAWL_SERVICE_URL}/health`, {
        headers: this.getHeaders(),
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  // ==========================================================================
  // App Store Methods
  // ==========================================================================

  /**
   * Crawl extended reviews for an app
   */
  async crawlAppReviews(request: AppStoreReviewRequest): Promise<AppStoreReviewResponse | null> {
    if (!this.enabled) return null;

    const cacheKey = `reviews:${request.app_id}:${request.country || 'us'}`;

    return this.deduplicatedRequest(cacheKey, async () => {
      return this.makeRequest<AppStoreReviewResponse>(
        '/crawl/app-store/reviews',
        'POST',
        request
      );
    });
  }

  /**
   * Crawl What's New / version history
   */
  async crawlWhatsNew(request: AppStoreWhatsNewRequest): Promise<AppStoreWhatsNewResponse | null> {
    if (!this.enabled) return null;

    const cacheKey = `whats_new:${request.app_id}:${request.country || 'us'}`;

    return this.deduplicatedRequest(cacheKey, async () => {
      return this.makeRequest<AppStoreWhatsNewResponse>(
        '/crawl/app-store/whats-new',
        'POST',
        request
      );
    });
  }

  /**
   * Crawl privacy labels
   */
  async crawlPrivacyLabels(request: AppStorePrivacyRequest): Promise<AppStorePrivacyResponse | null> {
    if (!this.enabled) return null;

    const cacheKey = `privacy:${request.app_id}:${request.country || 'us'}`;

    return this.deduplicatedRequest(cacheKey, async () => {
      return this.makeRequest<AppStorePrivacyResponse>(
        '/crawl/app-store/privacy',
        'POST',
        request
      );
    });
  }

  // ==========================================================================
  // Reddit Methods
  // ==========================================================================

  /**
   * Crawl Reddit discussions
   */
  async crawlReddit(request: RedditCrawlRequest): Promise<RedditCrawlResponse | null> {
    if (!this.enabled) return null;

    const cacheKey = `reddit:${request.keywords.slice(0, 3).sort().join(',')}`;

    return this.deduplicatedRequest(cacheKey, async () => {
      return this.makeRequest<RedditCrawlResponse>(
        '/crawl/reddit',
        'POST',
        request
      );
    });
  }

  // ==========================================================================
  // Website Methods
  // ==========================================================================

  /**
   * Crawl a competitor website
   */
  async crawlWebsite(request: WebsiteCrawlRequest): Promise<WebsiteCrawlResponse | null> {
    if (!this.enabled) return null;

    const domain = new URL(request.url).hostname;
    const cacheKey = `website:${domain}`;

    return this.deduplicatedRequest(cacheKey, async () => {
      return this.makeRequest<WebsiteCrawlResponse>(
        '/crawl/website',
        'POST',
        request
      );
    });
  }

  // ==========================================================================
  // Batch Methods
  // ==========================================================================

  /**
   * Start a batch crawl job
   */
  async startBatchCrawl(request: BatchCrawlRequest): Promise<BatchCrawlResponse | null> {
    if (!this.enabled) return null;

    return this.makeRequest<BatchCrawlResponse>(
      '/crawl/batch',
      'POST',
      request
    );
  }

  /**
   * Get batch job status
   */
  async getJobStatus(jobId: string): Promise<CrawlJob | null> {
    if (!this.enabled) return null;

    return this.makeRequest<CrawlJob>(
      `/job/${jobId}`,
      'GET'
    );
  }

  /**
   * Wait for a job to complete with polling
   */
  async waitForJob(jobId: string, pollInterval = 2000, timeout = 300000): Promise<CrawlJob | null> {
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      const job = await this.getJobStatus(jobId);

      if (!job) return null;

      if (job.status === 'completed' || job.status === 'failed') {
        return job;
      }

      await new Promise(resolve => setTimeout(resolve, pollInterval));
    }

    return null; // Timeout
  }

  // ==========================================================================
  // Enrichment Methods
  // ==========================================================================

  /**
   * Get enrichment data for AI prompts
   */
  async getEnrichment(context: EnrichmentContext): Promise<EnrichmentResult | null> {
    if (!this.enabled) return null;

    const {
      appStoreIds,
      keywords,
      competitorUrls,
      country = 'us',
      options = {},
    } = context;

    const {
      includeReviews = true,
      includeReddit = true,
      includeWebsites = true,
      maxReviewsPerApp = 100,
      maxRedditPosts = 30,
      forceRefresh = false,
    } = options;

    const result: EnrichmentResult = {
      formatted: '',
    };

    const enrichmentParts: string[] = [];

    // Fetch reviews in parallel
    if (includeReviews && appStoreIds && appStoreIds.length > 0) {
      const reviewPromises = appStoreIds.slice(0, 5).map(appId =>
        this.crawlAppReviews({
          app_id: appId,
          country,
          max_reviews: maxReviewsPerApp,
          force_refresh: forceRefresh,
        })
      );

      const reviewResults = await Promise.all(reviewPromises);
      result.reviews = [];

      for (const reviewResponse of reviewResults) {
        if (reviewResponse && reviewResponse.reviews.length > 0) {
          const complaints = this.extractComplaints(reviewResponse.reviews);
          const praises = this.extractPraises(reviewResponse.reviews);

          result.reviews.push({
            appId: reviewResponse.app_id,
            appName: reviewResponse.app_name,
            totalReviews: reviewResponse.total_reviews,
            sampleReviews: reviewResponse.reviews.slice(0, 10),
            ratingDistribution: reviewResponse.rating_distribution,
            topComplaints: complaints,
            topPraises: praises,
          });

          // Format for prompt
          enrichmentParts.push(this.formatReviewsForPrompt(reviewResponse, complaints, praises));
        }
      }
    }

    // Fetch Reddit discussions
    if (includeReddit && keywords && keywords.length > 0) {
      const redditResponse = await this.crawlReddit({
        keywords,
        max_posts: maxRedditPosts,
        max_comments_per_post: 10,
        force_refresh: forceRefresh,
      });

      if (redditResponse && redditResponse.discussions.length > 0) {
        const insights = this.extractRedditInsights(redditResponse);
        const sentiment = this.analyzeRedditSentiment(redditResponse);

        result.reddit = {
          totalDiscussions: redditResponse.total_posts,
          discussions: redditResponse.discussions,
          keyInsights: insights,
          userSentiment: sentiment,
        };

        // Format for prompt
        enrichmentParts.push(this.formatRedditForPrompt(redditResponse, insights));
      }
    }

    // Fetch website content
    if (includeWebsites && competitorUrls && competitorUrls.length > 0) {
      const websitePromises = competitorUrls.slice(0, 3).map(url =>
        this.crawlWebsite({
          url,
          max_pages: 5,
          force_refresh: forceRefresh,
        })
      );

      const websiteResults = await Promise.all(websitePromises);
      result.websites = [];

      for (const websiteResponse of websiteResults) {
        if (websiteResponse) {
          result.websites.push({
            url: websiteResponse.url,
            content: websiteResponse.content,
          });

          // Format for prompt
          enrichmentParts.push(this.formatWebsiteForPrompt(websiteResponse));
        }
      }
    }

    // Combine all enrichment into formatted markdown
    result.formatted = enrichmentParts.join('\n\n---\n\n');

    return result;
  }

  // ==========================================================================
  // Private Helpers
  // ==========================================================================

  private getHeaders(): HeadersInit {
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
    };

    if (CRAWL_SERVICE_API_KEY) {
      headers['X-API-Key'] = CRAWL_SERVICE_API_KEY;
    }

    return headers;
  }

  private async makeRequest<T>(
    endpoint: string,
    method: 'GET' | 'POST',
    body?: unknown
  ): Promise<T | null> {
    await this.rateLimiter.acquire(endpoint);

    try {
      const response = await fetch(`${CRAWL_SERVICE_URL}${endpoint}`, {
        method,
        headers: this.getHeaders(),
        body: body ? JSON.stringify(body) : undefined,
      });

      if (!response.ok) {
        console.error(`Crawl request failed: ${response.status} ${response.statusText}`);
        return null;
      }

      return await response.json();
    } catch (error) {
      console.error(`Crawl request error: ${error}`);
      return null;
    } finally {
      this.rateLimiter.release();
    }
  }

  private async deduplicatedRequest<T>(
    key: string,
    requestFn: () => Promise<T | null>
  ): Promise<T | null> {
    // Check if same request is already in-flight
    const existing = this.inFlightRequests.get(key);
    if (existing) {
      return existing as Promise<T | null>;
    }

    // Execute and cache the promise
    const promise = requestFn().finally(() => {
      this.inFlightRequests.delete(key);
    });

    this.inFlightRequests.set(key, promise);
    return promise;
  }

  private extractComplaints(reviews: ExtendedReview[]): string[] {
    const complaints: string[] = [];
    const lowRatedReviews = reviews.filter(r => r.rating <= 2);

    // Pattern-based extraction
    const patterns = [
      /crash/i, /bug/i, /slow/i, /expensive/i, /subscription/i,
      /ads/i, /sync/i, /lost data/i, /confusing/i, /broken/i,
    ];

    for (const review of lowRatedReviews.slice(0, 20)) {
      const text = `${review.title} ${review.content}`;
      for (const pattern of patterns) {
        if (pattern.test(text)) {
          complaints.push(review.content.slice(0, 200));
          break;
        }
      }
    }

    return complaints.slice(0, 5);
  }

  private extractPraises(reviews: ExtendedReview[]): string[] {
    const praises: string[] = [];
    const highRatedReviews = reviews.filter(r => r.rating >= 4);

    for (const review of highRatedReviews.slice(0, 10)) {
      if (review.content.length > 50) {
        praises.push(review.content.slice(0, 200));
      }
    }

    return praises.slice(0, 5);
  }

  private extractRedditInsights(response: RedditCrawlResponse): string[] {
    const insights: string[] = [];

    // Get top-voted posts
    const topPosts = [...response.discussions]
      .sort((a, b) => b.post.score - a.post.score)
      .slice(0, 5);

    for (const disc of topPosts) {
      if (disc.post.title.length > 20) {
        insights.push(`r/${disc.subreddit}: ${disc.post.title}`);
      }
    }

    return insights;
  }

  private analyzeRedditSentiment(response: RedditCrawlResponse): 'positive' | 'neutral' | 'negative' | 'mixed' {
    let positive = 0;
    let negative = 0;

    const negativePatterns = [/hate/i, /terrible/i, /worst/i, /avoid/i, /scam/i, /disappointed/i];
    const positivePatterns = [/love/i, /great/i, /best/i, /recommend/i, /amazing/i, /perfect/i];

    for (const disc of response.discussions) {
      const text = `${disc.post.title} ${disc.post.content}`;

      for (const pattern of negativePatterns) {
        if (pattern.test(text)) {
          negative++;
          break;
        }
      }

      for (const pattern of positivePatterns) {
        if (pattern.test(text)) {
          positive++;
          break;
        }
      }
    }

    if (positive > negative * 2) return 'positive';
    if (negative > positive * 2) return 'negative';
    if (positive > 0 && negative > 0) return 'mixed';
    return 'neutral';
  }

  private formatReviewsForPrompt(
    response: AppStoreReviewResponse,
    complaints: string[],
    praises: string[]
  ): string {
    const parts = [
      `## Extended Reviews: ${response.app_name || response.app_id}`,
      `*${response.total_reviews} total reviews crawled*\n`,
    ];

    if (complaints.length > 0) {
      parts.push('### Top User Complaints');
      complaints.forEach((c, i) => parts.push(`${i + 1}. "${c}"`));
    }

    if (praises.length > 0) {
      parts.push('\n### What Users Love');
      praises.forEach((p, i) => parts.push(`${i + 1}. "${p}"`));
    }

    // Add sample reviews
    parts.push('\n### Sample Reviews');
    for (const review of response.reviews.slice(0, 5)) {
      parts.push(`- **${review.rating}★** "${review.title}": ${review.content.slice(0, 150)}...`);
    }

    return parts.join('\n');
  }

  private formatRedditForPrompt(response: RedditCrawlResponse, insights: string[]): string {
    const parts = [
      `## Reddit Discussions`,
      `*${response.total_posts} discussions found for: ${response.keywords.join(', ')}*\n`,
    ];

    if (insights.length > 0) {
      parts.push('### Key Discussions');
      insights.forEach(insight => parts.push(`- ${insight}`));
    }

    // Add top discussions with comments
    parts.push('\n### Top Posts with User Feedback');
    for (const disc of response.discussions.slice(0, 5)) {
      parts.push(`\n**r/${disc.subreddit}**: ${disc.post.title} (${disc.post.score} upvotes)`);
      if (disc.post.content) {
        parts.push(`> ${disc.post.content.slice(0, 200)}...`);
      }
      if (disc.post.comments.length > 0) {
        parts.push('Top comments:');
        for (const comment of disc.post.comments.slice(0, 2)) {
          parts.push(`  - "${comment.content.slice(0, 100)}..." (${comment.score} pts)`);
        }
      }
    }

    return parts.join('\n');
  }

  private formatWebsiteForPrompt(response: WebsiteCrawlResponse): string {
    const { content } = response;

    const parts = [
      `## Competitor Website: ${content.title || response.url}`,
      `*${content.crawled_pages} pages analyzed*\n`,
    ];

    if (content.description) {
      parts.push(`**Description:** ${content.description}\n`);
    }

    if (content.features.length > 0) {
      parts.push('### Features');
      content.features.slice(0, 10).forEach(f => parts.push(`- ${f}`));
    }

    if (content.pricing_info) {
      parts.push('\n### Pricing');
      parts.push(`Currency: ${content.pricing_info.currency}`);
      parts.push(`Free tier: ${content.pricing_info.has_free_tier ? 'Yes' : 'No'}`);
      for (const plan of content.pricing_info.plans.slice(0, 3)) {
        parts.push(`- **${plan.name || 'Plan'}**: ${plan.price_text || 'Contact for pricing'}`);
      }
    }

    if (content.testimonials.length > 0) {
      parts.push('\n### Testimonials');
      content.testimonials.slice(0, 3).forEach(t => parts.push(`> "${t.slice(0, 150)}..."`));
    }

    return parts.join('\n');
  }
}

// Singleton instance
let orchestratorInstance: CrawlOrchestrator | null = null;

/**
 * Get the shared orchestrator instance
 */
export function getCrawlOrchestrator(): CrawlOrchestrator {
  if (!orchestratorInstance) {
    orchestratorInstance = new CrawlOrchestrator();
  }
  return orchestratorInstance;
}

/**
 * Enrichment Module
 *
 * Provides functions to enrich AI prompts with crawled data.
 * Used by all 11 AI components to inject relevant context.
 */

import { getCrawlOrchestrator } from './orchestrator';
import type {
  EnrichmentContext,
  EnrichmentResult,
  ExtendedReview,
  RedditDiscussion,
  WebsiteContent,
} from './types';

// ============================================================================
// Main Enrichment Function
// ============================================================================

/**
 * Get enrichment data formatted for prompt injection
 *
 * @param context - What data to fetch (app IDs, keywords, URLs)
 * @returns Formatted markdown string to inject into prompts
 */
export async function getEnrichmentForPrompt(
  context: EnrichmentContext
): Promise<string> {
  const orchestrator = getCrawlOrchestrator();

  // Check if crawl service is available
  const isAvailable = await orchestrator.isAvailable();
  if (!isAvailable) {
    return '<!-- Crawl enrichment unavailable -->';
  }

  try {
    const result = await orchestrator.getEnrichment(context);
    return result?.formatted || '';
  } catch (error) {
    console.error('Enrichment error:', error);
    return '';
  }
}

/**
 * Get full enrichment result with structured data
 */
export async function getEnrichmentData(
  context: EnrichmentContext
): Promise<EnrichmentResult | null> {
  const orchestrator = getCrawlOrchestrator();

  const isAvailable = await orchestrator.isAvailable();
  if (!isAvailable) {
    return null;
  }

  return orchestrator.getEnrichment(context);
}

// ============================================================================
// Specialized Enrichment Functions
// ============================================================================

/**
 * Get review enrichment for gap analysis
 */
export async function getReviewEnrichmentForGapAnalysis(
  appStoreIds: string[],
  country: string = 'us'
): Promise<string> {
  return getEnrichmentForPrompt({
    appStoreIds,
    country,
    options: {
      includeReviews: true,
      includeReddit: false,
      includeWebsites: false,
      maxReviewsPerApp: 200,
    },
  });
}

/**
 * Get Reddit enrichment for trend validation
 */
export async function getRedditEnrichmentForTrends(
  keywords: string[]
): Promise<string> {
  return getEnrichmentForPrompt({
    keywords,
    options: {
      includeReviews: false,
      includeReddit: true,
      includeWebsites: false,
      maxRedditPosts: 50,
    },
  });
}

/**
 * Get competitor website enrichment
 */
export async function getWebsiteEnrichmentForCompetitors(
  urls: string[]
): Promise<string> {
  return getEnrichmentForPrompt({
    competitorUrls: urls,
    options: {
      includeReviews: false,
      includeReddit: false,
      includeWebsites: true,
    },
  });
}

/**
 * Get full enrichment for Blueprint generation
 */
export async function getEnrichmentForBlueprint(
  appId: string,
  keywords: string[],
  competitorUrl?: string,
  country: string = 'us'
): Promise<string> {
  return getEnrichmentForPrompt({
    appStoreIds: [appId],
    keywords,
    competitorUrls: competitorUrl ? [competitorUrl] : undefined,
    country,
    options: {
      includeReviews: true,
      includeReddit: true,
      includeWebsites: !!competitorUrl,
      maxReviewsPerApp: 500,
      maxRedditPosts: 30,
    },
  });
}

// ============================================================================
// Review Analysis Helpers
// ============================================================================

/**
 * Extract key complaints from reviews
 */
export function extractKeyComplaints(reviews: ExtendedReview[]): string[] {
  const complaints: Map<string, number> = new Map();

  const complaintPatterns = [
    { pattern: /crash(es|ed|ing)?/i, label: 'Crashes' },
    { pattern: /bug(s|gy)?/i, label: 'Bugs' },
    { pattern: /slow|lag(s|gy)?/i, label: 'Performance Issues' },
    { pattern: /expensive|price|cost/i, label: 'Pricing Concerns' },
    { pattern: /subscription|monthly|yearly/i, label: 'Subscription Model' },
    { pattern: /ads?|advertis(e|ing|ements?)/i, label: 'Too Many Ads' },
    { pattern: /sync|cloud|backup/i, label: 'Sync Issues' },
    { pattern: /confus(e|ing)|complicated|difficult/i, label: 'Usability Issues' },
    { pattern: /support|customer service|response/i, label: 'Poor Support' },
    { pattern: /update|version|broke/i, label: 'Update Problems' },
    { pattern: /battery|drain/i, label: 'Battery Drain' },
    { pattern: /miss(ing|ed)? feature/i, label: 'Missing Features' },
  ];

  for (const review of reviews.filter(r => r.rating <= 2)) {
    const text = `${review.title} ${review.content}`.toLowerCase();

    for (const { pattern, label } of complaintPatterns) {
      if (pattern.test(text)) {
        complaints.set(label, (complaints.get(label) || 0) + 1);
      }
    }
  }

  // Sort by frequency and return top complaints
  return Array.from(complaints.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([label, count]) => `${label} (${count} mentions)`);
}

/**
 * Extract feature requests from reviews
 */
export function extractFeatureRequests(reviews: ExtendedReview[]): string[] {
  const requests: string[] = [];

  const requestPatterns = [
    /wish (?:you|it|they) (would|could)/i,
    /please add/i,
    /would (?:love|like) (?:to see|if)/i,
    /should have/i,
    /needs? (?:a |an |to )/i,
    /missing (?:a |an |the )/i,
  ];

  for (const review of reviews) {
    const sentences = review.content.split(/[.!?]+/);

    for (const sentence of sentences) {
      for (const pattern of requestPatterns) {
        if (pattern.test(sentence) && sentence.length > 20 && sentence.length < 200) {
          requests.push(sentence.trim());
          break;
        }
      }
    }
  }

  // Deduplicate and return top requests
  return [...new Set(requests)].slice(0, 10);
}

// ============================================================================
// Reddit Analysis Helpers
// ============================================================================

/**
 * Extract key themes from Reddit discussions
 */
export function extractRedditThemes(discussions: RedditDiscussion[]): string[] {
  const themes: Map<string, number> = new Map();

  for (const disc of discussions) {
    const text = `${disc.post.title} ${disc.post.content}`.toLowerCase();

    // Extract common themes
    const themePatterns = [
      { pattern: /recommend|suggestion/i, label: 'Recommendations' },
      { pattern: /alternative|instead of|replace/i, label: 'Looking for Alternatives' },
      { pattern: /problem|issue|trouble/i, label: 'User Problems' },
      { pattern: /best|top|favorite/i, label: 'Best Of Discussions' },
      { pattern: /free|paid|price/i, label: 'Pricing Discussions' },
      { pattern: /feature|functionality/i, label: 'Feature Discussions' },
      { pattern: /privacy|security|data/i, label: 'Privacy Concerns' },
    ];

    for (const { pattern, label } of themePatterns) {
      if (pattern.test(text)) {
        themes.set(label, (themes.get(label) || 0) + 1);
      }
    }
  }

  return Array.from(themes.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([label, count]) => `${label} (${count} posts)`);
}

/**
 * Get most mentioned apps from Reddit
 */
export function getMentionedApps(discussions: RedditDiscussion[]): string[] {
  const appMentions: Map<string, number> = new Map();

  // Common app name patterns
  const appPattern = /(?:^|\s)([A-Z][a-zA-Z0-9]+(?:\s[A-Z][a-zA-Z0-9]+)?)(?:\s|$|,|\.)/g;

  for (const disc of discussions) {
    const text = `${disc.post.title} ${disc.post.content}`;
    let match;

    while ((match = appPattern.exec(text)) !== null) {
      const appName = match[1].trim();
      if (appName.length > 2 && appName.length < 30) {
        appMentions.set(appName, (appMentions.get(appName) || 0) + 1);
      }
    }
  }

  return Array.from(appMentions.entries())
    .filter(([, count]) => count >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([name]) => name);
}

// ============================================================================
// Website Analysis Helpers
// ============================================================================

/**
 * Compare features across competitor websites
 */
export function compareCompetitorFeatures(
  websites: Array<{ url: string; content: WebsiteContent }>
): Record<string, string[]> {
  const featuresByCompetitor: Record<string, string[]> = {};

  for (const { url, content } of websites) {
    const domain = new URL(url).hostname.replace('www.', '');
    featuresByCompetitor[domain] = content.features.slice(0, 10);
  }

  return featuresByCompetitor;
}

/**
 * Summarize pricing across competitors
 */
export function summarizeCompetitorPricing(
  websites: Array<{ url: string; content: WebsiteContent }>
): string {
  const pricingInfo: string[] = [];

  for (const { url, content } of websites) {
    if (content.pricing_info) {
      const domain = new URL(url).hostname.replace('www.', '');
      const plans = content.pricing_info.plans
        .map(p => p.price_text || 'Unknown')
        .join(', ');
      pricingInfo.push(`**${domain}**: ${plans}`);
    }
  }

  return pricingInfo.length > 0
    ? pricingInfo.join('\n')
    : 'No pricing information available';
}

// ============================================================================
// Formatting Helpers
// ============================================================================

/**
 * Format enrichment as a collapsible section
 */
export function formatAsCollapsible(
  title: string,
  content: string
): string {
  return `<details>
<summary>${title}</summary>

${content}

</details>`;
}

/**
 * Create a summary header for enrichment
 */
export function createEnrichmentHeader(
  reviewCount: number,
  redditCount: number,
  websiteCount: number
): string {
  const parts: string[] = [];

  if (reviewCount > 0) {
    parts.push(`${reviewCount} extended reviews`);
  }
  if (redditCount > 0) {
    parts.push(`${redditCount} Reddit discussions`);
  }
  if (websiteCount > 0) {
    parts.push(`${websiteCount} competitor websites`);
  }

  return parts.length > 0
    ? `## Enriched Context\n*Data sources: ${parts.join(', ')}*\n`
    : '';
}

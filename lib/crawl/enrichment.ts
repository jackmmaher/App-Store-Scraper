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

// ============================================================================
// Color Palette Enrichment
// ============================================================================

export interface ColorPalette {
  colors: string[];
  name?: string;
  mood?: string;
  likes?: number;
  source_url?: string;
}

export interface PaletteResponse {
  palettes: ColorPalette[];
  prompt_text: string;
  total_cached?: number;
  category?: string;
  mood?: string;
}

/**
 * Fetch curated color palettes for Design System generation
 *
 * @param category - App Store category (e.g., "Health & Fitness")
 * @param mood - Optional explicit mood (professional, playful, calm, bold, warm, cool)
 * @param maxPalettes - Number of palettes to return
 * @returns Formatted markdown string with palette options
 */
export async function getColorPalettesForDesignSystem(
  category?: string,
  mood?: string,
  maxPalettes: number = 5
): Promise<string> {
  const orchestrator = getCrawlOrchestrator();

  // Check if crawl service is available
  const isAvailable = await orchestrator.isAvailable();
  if (!isAvailable) {
    console.log('Crawl service unavailable, using fallback palettes');
    return getFallbackPalettes(category);
  }

  try {
    const baseUrl = orchestrator.getBaseUrl();
    const response = await fetch(`${baseUrl}/crawl/palettes`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        category,
        mood,
        max_palettes: maxPalettes,
        force_refresh: false,
      }),
    });

    if (!response.ok) {
      console.error('Palette fetch failed:', response.status);
      return getFallbackPalettes(category);
    }

    const data: PaletteResponse = await response.json();

    if (data.prompt_text) {
      return data.prompt_text;
    }

    // Format palettes manually if prompt_text not provided
    return formatPalettesForPrompt(data.palettes, maxPalettes);
  } catch (error) {
    console.error('Error fetching palettes:', error);
    return getFallbackPalettes(category);
  }
}

/**
 * Format palette data for prompt inclusion
 */
function formatPalettesForPrompt(palettes: ColorPalette[], max: number): string {
  if (!palettes || palettes.length === 0) {
    return '';
  }

  const lines = ['## Curated Color Palettes (from Coolors.co Trending)', ''];
  lines.push(
    'Select ONE palette below or derive colors inspired by these. Do NOT invent generic colors.'
  );
  lines.push('');

  for (let i = 0; i < Math.min(palettes.length, max); i++) {
    const p = palettes[i];
    const colorsStr = p.colors.map((c) => `\`#${c}\``).join(' | ');
    const moodStr = p.mood ? ` (${p.mood})` : '';
    lines.push(`**Palette ${i + 1}**${moodStr}: ${colorsStr}`);
    if (p.source_url) {
      lines.push(`  Source: ${p.source_url}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Fallback palettes when crawl service is unavailable
 * Curated high-quality palettes with category matching
 */
function getFallbackPalettes(category?: string): string {
  // Curated palettes organized by mood
  const palettes: Record<string, ColorPalette[]> = {
    professional: [
      { colors: ['264653', '2A9D8F', 'E9C46A', 'F4A261', 'E76F51'], mood: 'professional' },
      { colors: ['003049', 'D62828', 'F77F00', 'FCBF49', 'EAE2B7'], mood: 'professional' },
      { colors: ['1D3557', '457B9D', 'A8DADC', 'F1FAEE', 'E63946'], mood: 'professional' },
    ],
    calm: [
      { colors: ['606C38', '283618', 'FEFAE0', 'DDA15E', 'BC6C25'], mood: 'calm' },
      { colors: ['CCD5AE', 'E9EDC9', 'FEFAE0', 'FAEDCD', 'D4A373'], mood: 'calm' },
      { colors: ['F8F9FA', 'E9ECEF', 'DEE2E6', 'CED4DA', 'ADB5BD'], mood: 'calm' },
    ],
    playful: [
      { colors: ['FF6B6B', '4ECDC4', '45B7D1', '96CEB4', 'FFEAA7'], mood: 'playful' },
      { colors: ['F72585', 'B5179E', '7209B7', '560BAD', '480CA8'], mood: 'playful' },
      { colors: ['FFBE0B', 'FB5607', 'FF006E', '8338EC', '3A86FF'], mood: 'playful' },
    ],
    dark: [
      { colors: ['0D1B2A', '1B263B', '415A77', '778DA9', 'E0E1DD'], mood: 'dark' },
      { colors: ['14213D', 'FCA311', 'E5E5E5', '000000', 'FFFFFF'], mood: 'dark' },
      { colors: ['212529', '343A40', '495057', '6C757D', 'ADB5BD'], mood: 'dark' },
    ],
    warm: [
      { colors: ['D4A373', 'CCD5AE', 'E9EDC9', 'FEFAE0', 'FAEDCD'], mood: 'warm' },
      { colors: ['BC6C25', 'DDA15E', 'FEFAE0', '283618', '606C38'], mood: 'warm' },
    ],
    cool: [
      { colors: ['03045E', '0077B6', '00B4D8', '90E0EF', 'CAF0F8'], mood: 'cool' },
      { colors: ['184E77', '1E6091', '1A759F', '168AAD', '34A0A4'], mood: 'cool' },
    ],
  };

  // Map category to preferred moods
  const categoryMoodMap: Record<string, string[]> = {
    Finance: ['professional', 'dark'],
    Business: ['professional', 'dark'],
    Productivity: ['professional', 'calm'],
    'Health & Fitness': ['calm', 'cool'],
    Medical: ['calm', 'professional'],
    Entertainment: ['playful', 'warm'],
    Games: ['playful', 'dark'],
    'Social Networking': ['playful', 'warm'],
    Education: ['calm', 'cool'],
    Utilities: ['professional', 'dark'],
    Shopping: ['warm', 'playful'],
    'Food & Drink': ['warm', 'playful'],
    Travel: ['warm', 'playful'],
  };

  // Select palettes based on category
  const preferredMoods = category
    ? categoryMoodMap[category] || ['professional', 'calm']
    : ['professional', 'calm', 'playful'];

  const selected: ColorPalette[] = [];
  for (const mood of preferredMoods) {
    if (palettes[mood]) {
      selected.push(...palettes[mood].slice(0, 2));
    }
  }

  if (selected.length === 0) {
    selected.push(...palettes.professional, ...palettes.calm.slice(0, 2));
  }

  return formatPalettesForPrompt(selected.slice(0, 5), 5);
}

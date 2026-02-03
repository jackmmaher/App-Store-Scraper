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
  // Filter out empty appIds to avoid calling crawl service with invalid data
  const validAppIds = appId && appId.trim() ? [appId] : [];

  return getEnrichmentForPrompt({
    appStoreIds: validAppIds.length > 0 ? validAppIds : undefined,
    keywords,
    competitorUrls: competitorUrl ? [competitorUrl] : undefined,
    country,
    options: {
      includeReviews: validAppIds.length > 0, // Only include reviews if we have valid appId
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
 * Palettes are accumulated over time from Coolors.co trending.
 * Each call returns a randomized selection for variety.
 *
 * @param category - App Store category (e.g., "Health & Fitness")
 * @param mood - Optional explicit mood (professional, playful, calm, bold, warm, cool)
 * @param maxPalettes - Number of palettes to return (default 12 for good variety)
 * @returns Formatted markdown string with palette options
 */
export async function getColorPalettesForDesignSystem(
  category?: string,
  mood?: string,
  maxPalettes: number = 12
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
        force_refresh: false,  // Let cache accumulate, Python side handles refresh timing
      }),
      signal: AbortSignal.timeout(10000), // 10 second timeout - fail fast to fallback
    });

    if (!response.ok) {
      console.error('Palette fetch failed:', response.status);
      return getFallbackPalettes(category);
    }

    const data: PaletteResponse = await response.json();
    console.log(`Received ${data.palettes?.length || 0} palettes (total cached: ${data.total_cached || 'unknown'})`);

    if (data.palettes && data.palettes.length > 0) {
      // Shuffle for variety on each request
      const shuffled = shuffleArray([...data.palettes]);
      return formatPalettesForPrompt(shuffled, maxPalettes, data.total_cached);
    }

    if (data.prompt_text) {
      return data.prompt_text;
    }

    return getFallbackPalettes(category);
  } catch (error) {
    console.error('Error fetching palettes:', error);
    return getFallbackPalettes(category);
  }
}

/**
 * Fisher-Yates shuffle for randomizing palette order
 */
function shuffleArray<T>(array: T[]): T[] {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

/**
 * Format palette data for prompt inclusion
 */
function formatPalettesForPrompt(palettes: ColorPalette[], max: number, totalCached?: number): string {
  if (!palettes || palettes.length === 0) {
    return '';
  }

  const lines = ['## Curated Color Palettes (from Coolors.co Trending)', ''];
  if (totalCached && totalCached > max) {
    lines.push(`*Showing ${Math.min(palettes.length, max)} of ${totalCached} accumulated palettes*`);
    lines.push('');
  }
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

// ============================================================================
// Font Enrichment
// ============================================================================

export interface GoogleFontData {
  family: string;
  category: string; // serif, sans-serif, display, handwriting, monospace
  variants: string[];
  subsets: string[];
  version: string;
  popularity: number;
}

export interface FontPairingData {
  heading_font: string;
  body_font: string;
  heading_category: string;
  body_category: string;
  style?: string; // modern, professional, editorial, friendly, technical
  source_url?: string;
}

export interface FontsResponse {
  fonts: GoogleFontData[];
  prompt_text: string;
  total_fonts?: number;
  category?: string;
}

export interface FontPairsResponse {
  pairings: FontPairingData[];
  prompt_text: string;
  total_pairings?: number;
  style?: string;
  category?: string;
}

/**
 * Fetch curated Google Fonts for Design System generation
 *
 * @param category - App Store category (e.g., "Health & Fitness")
 * @param maxFonts - Number of fonts to return (default 20)
 * @returns Formatted markdown string with font options
 */
export async function getFontsForDesignSystem(
  category?: string,
  maxFonts: number = 20
): Promise<string> {
  const orchestrator = getCrawlOrchestrator();

  const isAvailable = await orchestrator.isAvailable();
  if (!isAvailable) {
    console.log('Crawl service unavailable, using fallback fonts');
    return getFallbackFonts(category);
  }

  try {
    const baseUrl = orchestrator.getBaseUrl();
    const response = await fetch(`${baseUrl}/crawl/fonts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        category,
        max_fonts: maxFonts,
        force_refresh: false,
      }),
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      console.error('Fonts fetch failed:', response.status);
      return getFallbackFonts(category);
    }

    const data: FontsResponse = await response.json();
    console.log(`Received ${data.fonts?.length || 0} fonts`);

    if (data.fonts && data.fonts.length > 0) {
      return formatFontsForPrompt(data.fonts, maxFonts);
    }

    if (data.prompt_text) {
      return data.prompt_text;
    }

    return getFallbackFonts(category);
  } catch (error) {
    console.error('Error fetching fonts:', error);
    return getFallbackFonts(category);
  }
}

/**
 * Fetch font pairing suggestions for Design System generation
 *
 * @param category - App Store category (e.g., "Health & Fitness")
 * @param style - Optional style preference (modern, professional, editorial, etc.)
 * @param maxPairings - Number of pairings to return (default 10)
 * @returns Formatted markdown string with pairing options
 */
export async function getFontPairingsForDesignSystem(
  category?: string,
  style?: string,
  maxPairings: number = 10
): Promise<string> {
  const orchestrator = getCrawlOrchestrator();

  const isAvailable = await orchestrator.isAvailable();
  if (!isAvailable) {
    console.log('Crawl service unavailable, using fallback font pairings');
    return getFallbackFontPairings(category, style);
  }

  try {
    const baseUrl = orchestrator.getBaseUrl();
    const response = await fetch(`${baseUrl}/crawl/font-pairs`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        category,
        style,
        max_pairings: maxPairings,
        force_refresh: false,
      }),
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      console.error('Font pairings fetch failed:', response.status);
      return getFallbackFontPairings(category, style);
    }

    const data: FontPairsResponse = await response.json();
    console.log(`Received ${data.pairings?.length || 0} font pairings`);

    if (data.pairings && data.pairings.length > 0) {
      return formatFontPairingsForPrompt(data.pairings, maxPairings);
    }

    if (data.prompt_text) {
      return data.prompt_text;
    }

    return getFallbackFontPairings(category, style);
  } catch (error) {
    console.error('Error fetching font pairings:', error);
    return getFallbackFontPairings(category, style);
  }
}

/**
 * Format fonts for prompt inclusion
 */
function formatFontsForPrompt(fonts: GoogleFontData[], max: number): string {
  if (!fonts || fonts.length === 0) {
    return '';
  }

  const lines = ['## Curated Google Fonts', ''];
  lines.push('Select fonts from this list for the design system typography.');
  lines.push('');

  // Group by category
  const byCategory: Record<string, GoogleFontData[]> = {};
  for (const font of fonts.slice(0, max)) {
    const cat = font.category || 'sans-serif';
    if (!byCategory[cat]) {
      byCategory[cat] = [];
    }
    byCategory[cat].push(font);
  }

  for (const [category, categoryFonts] of Object.entries(byCategory)) {
    lines.push(`### ${category.charAt(0).toUpperCase() + category.slice(1)}`);
    for (const font of categoryFonts) {
      const weights = font.variants
        .filter(v => /^\d+$/.test(v) || v === 'regular')
        .map(v => v === 'regular' ? '400' : v)
        .slice(0, 5)
        .join(', ');
      lines.push(`- **${font.family}** (weights: ${weights})`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Format font pairings for prompt inclusion
 */
function formatFontPairingsForPrompt(pairings: FontPairingData[], max: number): string {
  if (!pairings || pairings.length === 0) {
    return '';
  }

  const lines = ['## Font Pairing Suggestions', ''];
  lines.push('Recommended heading + body font combinations:');
  lines.push('');

  for (let i = 0; i < Math.min(pairings.length, max); i++) {
    const p = pairings[i];
    const styleStr = p.style ? ` [${p.style}]` : '';
    lines.push(`**Pairing ${i + 1}**${styleStr}:`);
    lines.push(`  - Heading: **${p.heading_font}** (${p.heading_category})`);
    lines.push(`  - Body: **${p.body_font}** (${p.body_category})`);
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Fallback fonts when crawl service is unavailable
 */
function getFallbackFonts(category?: string): string {
  const fonts: GoogleFontData[] = [
    // Sans-serif (UI-focused)
    { family: 'Inter', category: 'sans-serif', variants: ['300', '400', '500', '600', '700'], subsets: ['latin'], version: '', popularity: 100 },
    { family: 'Roboto', category: 'sans-serif', variants: ['300', '400', '500', '700'], subsets: ['latin'], version: '', popularity: 99 },
    { family: 'Open Sans', category: 'sans-serif', variants: ['300', '400', '600', '700'], subsets: ['latin'], version: '', popularity: 98 },
    { family: 'Poppins', category: 'sans-serif', variants: ['300', '400', '500', '600', '700'], subsets: ['latin'], version: '', popularity: 97 },
    { family: 'Montserrat', category: 'sans-serif', variants: ['300', '400', '500', '600', '700'], subsets: ['latin'], version: '', popularity: 96 },
    { family: 'DM Sans', category: 'sans-serif', variants: ['400', '500', '700'], subsets: ['latin'], version: '', popularity: 92 },
    { family: 'Space Grotesk', category: 'sans-serif', variants: ['300', '400', '500', '600', '700'], subsets: ['latin'], version: '', popularity: 89 },
    // Serif
    { family: 'Playfair Display', category: 'serif', variants: ['400', '500', '600', '700'], subsets: ['latin'], version: '', popularity: 85 },
    { family: 'Merriweather', category: 'serif', variants: ['300', '400', '700'], subsets: ['latin'], version: '', popularity: 84 },
    { family: 'Lora', category: 'serif', variants: ['400', '500', '600', '700'], subsets: ['latin'], version: '', popularity: 83 },
    // Monospace
    { family: 'JetBrains Mono', category: 'monospace', variants: ['300', '400', '500', '700'], subsets: ['latin'], version: '', popularity: 75 },
    { family: 'Fira Code', category: 'monospace', variants: ['300', '400', '500', '700'], subsets: ['latin'], version: '', popularity: 74 },
  ];

  return formatFontsForPrompt(fonts, 12);
}

/**
 * Fallback font pairings when crawl service is unavailable
 */
function getFallbackFontPairings(category?: string, style?: string): string {
  const pairings: FontPairingData[] = [
    { heading_font: 'Inter', body_font: 'Inter', heading_category: 'sans-serif', body_category: 'sans-serif', style: 'modern' },
    { heading_font: 'Space Grotesk', body_font: 'Inter', heading_category: 'sans-serif', body_category: 'sans-serif', style: 'modern' },
    { heading_font: 'Poppins', body_font: 'Open Sans', heading_category: 'sans-serif', body_category: 'sans-serif', style: 'professional' },
    { heading_font: 'Montserrat', body_font: 'Roboto', heading_category: 'sans-serif', body_category: 'sans-serif', style: 'professional' },
    { heading_font: 'Playfair Display', body_font: 'Lato', heading_category: 'serif', body_category: 'sans-serif', style: 'editorial' },
    { heading_font: 'Merriweather', body_font: 'Open Sans', heading_category: 'serif', body_category: 'sans-serif', style: 'editorial' },
    { heading_font: 'DM Sans', body_font: 'DM Sans', heading_category: 'sans-serif', body_category: 'sans-serif', style: 'modern' },
    { heading_font: 'Space Grotesk', body_font: 'JetBrains Mono', heading_category: 'sans-serif', body_category: 'monospace', style: 'technical' },
  ];

  // Filter by style if provided
  let filtered = pairings;
  if (style) {
    filtered = pairings.filter(p => p.style === style);
    if (filtered.length === 0) {
      filtered = pairings;
    }
  }

  return formatFontPairingsForPrompt(filtered, 8);
}

// ============================================================================
// Color Spectrum Enrichment
// ============================================================================

export interface ColorShades {
  [shade: string]: string; // e.g., "50": "#F5F5F5", "100": "#E0E0E0", etc.
}

export interface ColorSpectrumData {
  primary: {
    hex: string;
    shades: ColorShades;
  };
  semantic: {
    success: string;
    warning: string;
    error: string;
    info: string;
  };
  complementary?: {
    complementary: string;
    analogous1: string;
    analogous2: string;
    triadic1: string;
    triadic2: string;
  };
}

export interface ColorSpectrumResponse {
  spectrum: ColorSpectrumData;
  prompt_text: string;
}

/**
 * Generate a color spectrum from a primary hex color
 *
 * @param primaryHex - Primary color in hex format (with or without #)
 * @param includeComplementary - Whether to include complementary colors
 * @returns Formatted markdown string with color spectrum
 */
export async function getColorSpectrumForPrimary(
  primaryHex: string,
  includeComplementary: boolean = true
): Promise<string> {
  const orchestrator = getCrawlOrchestrator();

  // Normalize hex
  const normalizedHex = primaryHex.replace('#', '').toUpperCase();

  const isAvailable = await orchestrator.isAvailable();
  if (!isAvailable) {
    console.log('Crawl service unavailable, using local spectrum generation');
    return generateLocalColorSpectrum(normalizedHex, includeComplementary);
  }

  try {
    const baseUrl = orchestrator.getBaseUrl();
    const response = await fetch(`${baseUrl}/crawl/color-spectrum`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        primary_hex: normalizedHex,
        include_complementary: includeComplementary,
      }),
      signal: AbortSignal.timeout(5000), // Fast - local generation
    });

    if (!response.ok) {
      console.error('Color spectrum fetch failed:', response.status);
      return generateLocalColorSpectrum(normalizedHex, includeComplementary);
    }

    const data: ColorSpectrumResponse = await response.json();

    if (data.spectrum) {
      return formatColorSpectrumForPrompt(data.spectrum);
    }

    if (data.prompt_text) {
      return data.prompt_text;
    }

    return generateLocalColorSpectrum(normalizedHex, includeComplementary);
  } catch (error) {
    console.error('Error fetching color spectrum:', error);
    return generateLocalColorSpectrum(normalizedHex, includeComplementary);
  }
}

/**
 * Format color spectrum for prompt inclusion
 */
function formatColorSpectrumForPrompt(spectrum: ColorSpectrumData): string {
  const lines = ['## Generated Color Spectrum', ''];

  lines.push(`### Primary Color: \`${spectrum.primary.hex}\``);
  lines.push('');

  // Shades
  lines.push('**Shade Spectrum:**');
  const sortedShades = Object.entries(spectrum.primary.shades)
    .sort((a, b) => parseInt(a[0]) - parseInt(b[0]));

  for (const [shade, hex] of sortedShades) {
    lines.push(`- ${shade}: \`${hex}\``);
  }
  lines.push('');

  // Semantic colors
  lines.push('**Semantic Colors:**');
  lines.push(`- Success: \`${spectrum.semantic.success}\``);
  lines.push(`- Warning: \`${spectrum.semantic.warning}\``);
  lines.push(`- Error: \`${spectrum.semantic.error}\``);
  lines.push(`- Info: \`${spectrum.semantic.info}\``);
  lines.push('');

  // Complementary colors if available
  if (spectrum.complementary) {
    lines.push('**Color Relationships:**');
    lines.push(`- Complementary: \`${spectrum.complementary.complementary}\``);
    lines.push(`- Analogous: \`${spectrum.complementary.analogous1}\`, \`${spectrum.complementary.analogous2}\``);
    lines.push(`- Triadic: \`${spectrum.complementary.triadic1}\`, \`${spectrum.complementary.triadic2}\``);
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Local color spectrum generation (fallback)
 * Uses HSL color space for shade calculation
 */
function generateLocalColorSpectrum(hexColor: string, includeComplementary: boolean): string {
  // Convert hex to HSL
  const hex = hexColor.replace('#', '');
  const r = parseInt(hex.slice(0, 2), 16) / 255;
  const g = parseInt(hex.slice(2, 4), 16) / 255;
  const b = parseInt(hex.slice(4, 6), 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);

    if (max === r) {
      h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
    } else if (max === g) {
      h = ((b - r) / d + 2) / 6;
    } else {
      h = ((r - g) / d + 4) / 6;
    }
  }

  h *= 360;
  s *= 100;
  const lPercent = l * 100;

  // Generate shades
  const shades: ColorShades = {};
  const shadeLevels = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950];

  for (const shade of shadeLevels) {
    let newL: number;
    if (shade < 500) {
      const ratio = (500 - shade) / 500;
      newL = lPercent + (95 - lPercent) * ratio;
    } else if (shade > 500) {
      const ratio = (shade - 500) / 450;
      newL = lPercent - (lPercent - 5) * ratio;
    } else {
      newL = lPercent;
    }

    // Adjust saturation at extremes
    let newS = s;
    if (shade <= 100) newS = s * 0.7;
    else if (shade >= 800) newS = s * 0.8;

    shades[String(shade)] = hslToHex(h, newS, newL);
  }

  const spectrum: ColorSpectrumData = {
    primary: {
      hex: `#${hex.toUpperCase()}`,
      shades,
    },
    semantic: {
      success: hslToHex(142, 70, 45),
      warning: hslToHex(38, 90, 50),
      error: hslToHex(0, 75, 55),
      info: hslToHex(217, 80, 50),
    },
  };

  if (includeComplementary) {
    spectrum.complementary = {
      complementary: hslToHex((h + 180) % 360, s, lPercent),
      analogous1: hslToHex((h + 30) % 360, s, lPercent),
      analogous2: hslToHex((h - 30 + 360) % 360, s, lPercent),
      triadic1: hslToHex((h + 120) % 360, s, lPercent),
      triadic2: hslToHex((h + 240) % 360, s, lPercent),
    };
  }

  return formatColorSpectrumForPrompt(spectrum);
}

/**
 * Convert HSL to hex color
 */
function hslToHex(h: number, s: number, l: number): string {
  h = h / 360;
  s = s / 100;
  l = l / 100;

  let r: number, g: number, b: number;

  if (s === 0) {
    r = g = b = l;
  } else {
    const hueToRgb = (p: number, q: number, t: number) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1/6) return p + (q - p) * 6 * t;
      if (t < 1/2) return q;
      if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
      return p;
    };

    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;

    r = hueToRgb(p, q, h + 1/3);
    g = hueToRgb(p, q, h);
    b = hueToRgb(p, q, h - 1/3);
  }

  const toHex = (x: number) => {
    const hex = Math.round(x * 255).toString(16);
    return hex.length === 1 ? '0' + hex : hex;
  };

  return `#${toHex(r)}${toHex(g)}${toHex(b)}`.toUpperCase();
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

// Review Sentiment Analyzer for Opportunity Scoring
// Fetches critical reviews from top competitors and extracts common complaints
// Enhanced with Crawl4AI for extended review fetching (thousands vs RSS 50-100)

import { TopAppData } from './types';
import { getCrawlOrchestrator, ExtendedReview } from '@/lib/crawl';

// ============================================================================
// Types
// ============================================================================

export interface CriticalReview {
  id: string;
  title: string;
  content: string;
  rating: number;
  author: string;
  date: string;
  app_id: string;
  app_name: string;
}

export interface ComplaintTheme {
  theme: string;
  count: number;
  examples: string[];
  severity: 'high' | 'medium' | 'low';
}

export interface ReviewSentimentResult {
  total_critical_reviews: number;
  apps_analyzed: number;
  complaint_themes: ComplaintTheme[];
  top_complaints: string[];
  common_words: Array<{ word: string; count: number }>;
  sample_reviews: CriticalReview[];
  opportunity_signals: string[];
}

// ============================================================================
// Constants
// ============================================================================

// Complaint theme patterns - keywords that indicate specific issues
const COMPLAINT_PATTERNS: Record<string, { keywords: string[]; severity: 'high' | 'medium' | 'low' }> = {
  'Crashes & Bugs': {
    keywords: ['crash', 'bug', 'freeze', 'stuck', 'broken', 'glitch', 'error', 'not working', 'doesn\'t work', 'won\'t load'],
    severity: 'high',
  },
  'Poor Performance': {
    keywords: ['slow', 'lag', 'laggy', 'battery', 'drain', 'memory', 'heavy', 'resource'],
    severity: 'high',
  },
  'Missing Features': {
    keywords: ['wish', 'need', 'missing', 'should have', 'would be nice', 'please add', 'no option', 'can\'t do'],
    severity: 'medium',
  },
  'Bad UX/UI': {
    keywords: ['confusing', 'complicated', 'hard to use', 'unintuitive', 'cluttered', 'ugly', 'design', 'navigate'],
    severity: 'medium',
  },
  'Subscription/Pricing': {
    keywords: ['expensive', 'price', 'subscription', 'pay', 'cost', 'money', 'free', 'premium', 'paywall'],
    severity: 'medium',
  },
  'Ads': {
    keywords: ['ads', 'advertisement', 'ad', 'popup', 'pop-up', 'annoying ads', 'too many ads'],
    severity: 'medium',
  },
  'Sync Issues': {
    keywords: ['sync', 'lost data', 'data loss', 'backup', 'restore', 'cloud', 'icloud'],
    severity: 'high',
  },
  'Support Issues': {
    keywords: ['support', 'response', 'help', 'contact', 'customer service', 'no reply'],
    severity: 'low',
  },
  'Recent Update Problems': {
    keywords: ['update', 'latest version', 'new version', 'after update', 'since update', 'downgrade'],
    severity: 'high',
  },
};

// Words to ignore in frequency analysis
const STOP_WORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with',
  'by', 'from', 'as', 'is', 'was', 'are', 'were', 'been', 'be', 'have', 'has', 'had',
  'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might', 'must',
  'shall', 'can', 'need', 'dare', 'ought', 'used', 'this', 'that', 'these', 'those',
  'i', 'you', 'he', 'she', 'it', 'we', 'they', 'what', 'which', 'who', 'whom',
  'app', 'apps', 'very', 'really', 'just', 'even', 'also', 'only', 'more', 'most',
  'other', 'some', 'such', 'no', 'nor', 'not', 'so', 'than', 'too', 'very', 'can',
  'will', 'just', 'don', 'now', 'get', 'got', 'use', 'using', 'one', 'two', 'like',
  'good', 'great', 'nice', 'love', 'best', 'much', 'many', 'every', 'all', 'any',
]);

// ============================================================================
// Review Fetching
// ============================================================================

interface RSSReview {
  id: { label: string };
  title: { label: string };
  content: { label: string };
  'im:rating': { label: string };
  author: { name: { label: string } };
  updated: { label: string };
}

interface RSSFeed {
  feed: {
    entry?: RSSReview[];
  };
}

/**
 * Fetch critical (1-2 star) reviews using Crawl4AI extended reviews
 * Falls back to RSS if crawl service is unavailable
 */
async function fetchCriticalReviews(
  appId: string,
  appName: string,
  country: string = 'us',
  maxPages: number = 3
): Promise<CriticalReview[]> {
  // Try Crawl4AI first for extended reviews (thousands vs RSS 50-100)
  const orchestrator = getCrawlOrchestrator();
  const isAvailable = await orchestrator.isAvailable();

  if (isAvailable) {
    try {
      console.log(`[Crawl4AI] Fetching extended reviews for ${appId}...`);
      const response = await orchestrator.crawlAppReviews({
        app_id: appId,
        country,
        max_reviews: 500, // Fetch many more than RSS allows
        max_rating: 2, // Only 1-2 star reviews
      });

      if (response && response.reviews.length > 0) {
        console.log(`[Crawl4AI] Found ${response.total_reviews} reviews for ${appId}`);
        return response.reviews.map((r: ExtendedReview) => ({
          id: r.id,
          title: r.title,
          content: r.content,
          rating: r.rating,
          author: r.author,
          date: r.date,
          app_id: appId,
          app_name: appName,
        }));
      }
    } catch (error) {
      console.error(`[Crawl4AI] Error fetching reviews for ${appId}:`, error);
      // Fall through to RSS fallback
    }
  }

  // Fallback to RSS feed
  console.log(`[RSS Fallback] Fetching reviews for ${appId}...`);
  return fetchCriticalReviewsFromRSS(appId, appName, country, maxPages);
}

/**
 * Legacy RSS-based review fetching (fallback when Crawl4AI unavailable)
 */
async function fetchCriticalReviewsFromRSS(
  appId: string,
  appName: string,
  country: string = 'us',
  maxPages: number = 3
): Promise<CriticalReview[]> {
  const reviews: CriticalReview[] = [];

  for (let page = 1; page <= maxPages; page++) {
    try {
      const url = `https://itunes.apple.com/${country}/rss/customerreviews/page=${page}/id=${appId}/sortBy=mostCritical/json`;

      const response = await fetch(url, {
        headers: { 'User-Agent': 'AppStoreScraper/1.0' },
      });

      if (!response.ok) {
        console.log(`Failed to fetch reviews for ${appId} page ${page}: ${response.status}`);
        break;
      }

      const data: RSSFeed = await response.json();
      const entries = data.feed?.entry || [];

      if (entries.length === 0) break;

      for (const entry of entries) {
        const rating = parseInt(entry['im:rating']?.label || '5', 10);

        // Only include 1-2 star reviews
        if (rating <= 2) {
          reviews.push({
            id: entry.id?.label || '',
            title: entry.title?.label || '',
            content: entry.content?.label || '',
            rating,
            author: entry.author?.name?.label || 'Anonymous',
            date: entry.updated?.label || '',
            app_id: appId,
            app_name: appName,
          });
        }
      }

      // Rate limiting
      await delay(500);
    } catch (error) {
      console.error(`Error fetching reviews for ${appId}:`, error);
      break;
    }
  }

  return reviews;
}

// ============================================================================
// Sentiment Analysis
// ============================================================================

/**
 * Detect complaint themes in review text
 */
function detectComplaintThemes(reviews: CriticalReview[]): ComplaintTheme[] {
  const themeCounts: Record<string, { count: number; examples: string[] }> = {};

  for (const review of reviews) {
    const text = `${review.title} ${review.content}`.toLowerCase();

    for (const [theme, { keywords }] of Object.entries(COMPLAINT_PATTERNS)) {
      const hasKeyword = keywords.some(kw => text.includes(kw));
      if (hasKeyword) {
        if (!themeCounts[theme]) {
          themeCounts[theme] = { count: 0, examples: [] };
        }
        themeCounts[theme].count++;
        if (themeCounts[theme].examples.length < 3) {
          // Add a snippet as example
          const snippet = review.content.slice(0, 150) + (review.content.length > 150 ? '...' : '');
          themeCounts[theme].examples.push(snippet);
        }
      }
    }
  }

  // Convert to array and sort by count
  return Object.entries(themeCounts)
    .map(([theme, data]) => ({
      theme,
      count: data.count,
      examples: data.examples,
      severity: COMPLAINT_PATTERNS[theme]?.severity || 'medium',
    }))
    .sort((a, b) => b.count - a.count);
}

/**
 * Extract common words from reviews (excluding stop words)
 */
function extractCommonWords(reviews: CriticalReview[]): Array<{ word: string; count: number }> {
  const wordCounts: Record<string, number> = {};

  for (const review of reviews) {
    const text = `${review.title} ${review.content}`.toLowerCase();
    const words = text.split(/\W+/).filter(w => w.length >= 3 && !STOP_WORDS.has(w));

    for (const word of words) {
      wordCounts[word] = (wordCounts[word] || 0) + 1;
    }
  }

  return Object.entries(wordCounts)
    .map(([word, count]) => ({ word, count }))
    .filter(w => w.count >= 2)
    .sort((a, b) => b.count - a.count)
    .slice(0, 20);
}

/**
 * Generate opportunity signals from complaint analysis
 */
function generateOpportunitySignals(
  themes: ComplaintTheme[],
  commonWords: Array<{ word: string; count: number }>
): string[] {
  const signals: string[] = [];

  // High severity themes = strong opportunity signals
  const highSeverityThemes = themes.filter(t => t.severity === 'high' && t.count >= 2);
  for (const theme of highSeverityThemes.slice(0, 3)) {
    signals.push(`${theme.count} users complain about "${theme.theme}" - opportunity to differentiate`);
  }

  // Subscription complaints = lifetime pricing opportunity
  const subTheme = themes.find(t => t.theme === 'Subscription/Pricing');
  if (subTheme && subTheme.count >= 3) {
    signals.push(`${subTheme.count} pricing complaints - consider lifetime purchase option`);
  }

  // Ad complaints = ad-free premium opportunity
  const adTheme = themes.find(t => t.theme === 'Ads');
  if (adTheme && adTheme.count >= 3) {
    signals.push(`${adTheme.count} ad complaints - ad-free experience could win users`);
  }

  // Missing features = roadmap ideas
  const featureTheme = themes.find(t => t.theme === 'Missing Features');
  if (featureTheme && featureTheme.count >= 2) {
    signals.push(`${featureTheme.count} feature requests - competitors leaving gaps`);
  }

  // UX complaints = design opportunity
  const uxTheme = themes.find(t => t.theme === 'Bad UX/UI');
  if (uxTheme && uxTheme.count >= 3) {
    signals.push(`${uxTheme.count} UX complaints - simpler design could win`);
  }

  // If no specific signals, generate generic ones
  if (signals.length === 0 && themes.length > 0) {
    signals.push(`Users report ${themes[0].count}+ issues with "${themes[0].theme}"`);
  }

  return signals.slice(0, 5);
}

// ============================================================================
// Main Export Functions
// ============================================================================

/**
 * Analyze reviews for top competitor apps to extract sentiment and complaints
 */
export async function analyzeCompetitorReviews(
  topApps: TopAppData[],
  country: string = 'us',
  maxAppsToAnalyze: number = 3
): Promise<ReviewSentimentResult> {
  const allReviews: CriticalReview[] = [];

  // Fetch reviews from top apps (limit to avoid rate limiting)
  const appsToAnalyze = topApps.slice(0, maxAppsToAnalyze);

  for (const app of appsToAnalyze) {
    try {
      const reviews = await fetchCriticalReviews(app.id, app.name, country, 2);
      allReviews.push(...reviews);

      // Rate limiting between apps
      await delay(1000);
    } catch (error) {
      console.error(`Error analyzing reviews for ${app.name}:`, error);
    }
  }

  if (allReviews.length === 0) {
    return {
      total_critical_reviews: 0,
      apps_analyzed: appsToAnalyze.length,
      complaint_themes: [],
      top_complaints: [],
      common_words: [],
      sample_reviews: [],
      opportunity_signals: ['No critical reviews found - competitors may have good ratings'],
    };
  }

  // Analyze the collected reviews
  const complaintThemes = detectComplaintThemes(allReviews);
  const commonWords = extractCommonWords(allReviews);
  const opportunitySignals = generateOpportunitySignals(complaintThemes, commonWords);

  // Generate top complaints summary
  const topComplaints = complaintThemes.slice(0, 5).map(t =>
    `${t.theme}: ${t.count} complaints (${t.severity} severity)`
  );

  return {
    total_critical_reviews: allReviews.length,
    apps_analyzed: appsToAnalyze.length,
    complaint_themes: complaintThemes,
    top_complaints: topComplaints,
    common_words: commonWords,
    sample_reviews: allReviews.slice(0, 10), // Limit sample reviews
    opportunity_signals: opportunitySignals,
  };
}

/**
 * Quick check if review analysis is worth doing
 * (returns true if top apps have enough reviews to analyze)
 */
export function shouldAnalyzeReviews(topApps: TopAppData[]): boolean {
  // Only analyze if we have apps with significant review counts
  const appsWithReviews = topApps.filter(app => app.reviews >= 100);
  return appsWithReviews.length >= 2;
}

// ============================================================================
// Utilities
// ============================================================================

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

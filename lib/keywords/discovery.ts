// Keyword Discovery Functions
// Three methods: Seed expansion, Competitor extraction, Category crawling

import { DiscoveredKeyword, DiscoveryMethod, AutosuggestHint } from './types';
import { expandSeedKeyword } from './autosuggest';

// ============================================================================
// Stop Words (shared with existing keyword extraction)
// ============================================================================

// Stop words for filtering - ONLY truly meaningless words
// Note: We intentionally KEEP words like "free", "pro", "best" as they are valuable search modifiers
const STOP_WORDS = new Set([
  // Articles and basic connectors
  'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with',
  'by', 'from', 'as', 'is', 'was', 'are', 'were', 'been', 'be', 'have', 'has', 'had',
  // Auxiliary verbs
  'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might', 'must',
  'shall', 'can', 'need',
  // Pronouns
  'it', 'its', 'this', 'that', 'these', 'those', 'i', 'me', 'my', 'we', 'our',
  'you', 'your', 'he', 'him', 'his', 'she', 'her', 'they', 'them', 'their',
  // Question words (but keep for phrases)
  'what', 'which', 'who', 'when', 'where', 'why', 'how',
  // Quantity words
  'all', 'each', 'every', 'both', 'few', 'more', 'most', 'other', 'some', 'such',
  'no', 'nor', 'not', 'only', 'own', 'same', 'so', 'than', 'too', 'very', 'just',
  'also', 'now', 'here', 'there', 'then', 'once', 'any',
  // Common verbs that don't add meaning alone
  'really', 'much', 'many', 'get', 'got', 'use', 'used', 'using', 'like',
  'dont', 'doesnt', 'cant', 'wont',
  // Numbers (but keep for specific phrases)
  'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
  // Time words (generic)
  'year', 'years', 'day', 'days', 'time', 'times', 'week', 'weeks', 'month', 'months',
  // Filler words
  'thing', 'things', 'lot', 'way', 'point', 'please', 'thank', 'thanks', 'sorry',
  'okay', 'ok', 'yes', 'yeah', 'sure',
  // REMOVED: 'free', 'best', 'good', 'great', 'new', 'top', 'pro', 'lite', 'plus', 'premium', 'version'
  // These are valuable ASO modifiers that users actually search for!
]);

// ============================================================================
// 1. Seed Keyword Expansion
// ============================================================================

/**
 * Expand a seed keyword using Apple's autosuggest API
 */
export async function discoverFromSeed(
  seed: string,
  country: string = 'us',
  depth: number = 2,
  onKeyword?: (keyword: DiscoveredKeyword) => void
): Promise<DiscoveredKeyword[]> {
  const hints = await expandSeedKeyword(
    seed,
    country,
    depth,
    onKeyword
      ? (hint: AutosuggestHint) => {
          onKeyword({
            keyword: hint.term.toLowerCase(),
            priority: hint.priority,
            position: hint.position,
            discovered_via: 'autosuggest',
            source_seed: seed,
          });
        }
      : undefined
  );

  return hints.map((hint) => ({
    keyword: hint.term.toLowerCase(),
    priority: hint.priority,
    position: hint.position,
    discovered_via: 'autosuggest' as DiscoveryMethod,
    source_seed: seed,
  }));
}

// ============================================================================
// 2. Competitor Keyword Extraction (via Claude)
// ============================================================================

interface AppData {
  name: string;
  subtitle?: string;
  description?: string;
  reviews?: Array<{ title: string; content: string }>;
}

/**
 * Extract keywords from an app's metadata and reviews using Claude
 */
export async function discoverFromCompetitor(
  appId: string,
  appData: AppData,
  apiKey: string,
  onKeyword?: (keyword: DiscoveredKeyword) => void
): Promise<DiscoveredKeyword[]> {
  // Format reviews for the prompt
  const reviewsText = appData.reviews
    ? appData.reviews
        .slice(0, 30)
        .map((r, i) => `[${i + 1}] "${r.title}" - ${r.content}`)
        .join('\n')
    : '';

  const prompt = `Extract App Store search keywords from this app's data.

App Name: ${appData.name}
${appData.subtitle ? `Subtitle: ${appData.subtitle}` : ''}
${appData.description ? `Description: ${appData.description.slice(0, 2000)}` : ''}

${reviewsText ? `Sample Reviews:\n${reviewsText}` : ''}

Extract keywords that users would search to find this app or similar apps.
Focus on:
- Feature keywords (e.g., "photo editor", "background remover")
- Use-case keywords (e.g., "edit selfies", "passport photo")
- Problem keywords (e.g., "remove watermark", "fix blurry photos")
- Comparison keywords (e.g., "photoshop alternative", "free lightroom")
- Category keywords (e.g., "photo app", "camera app")

Return ONLY a JSON array of 20-50 keyword strings, ordered by likely search volume.
No explanations, just the JSON array.

Example format: ["keyword one", "keyword two", "keyword three"]`;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1500,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!response.ok) {
      console.error('Claude API error:', response.status);
      return [];
    }

    const data = await response.json();
    const content = data.content?.[0]?.text || '';

    // Parse JSON array from response
    const jsonMatch = content.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      console.error('No JSON array found in Claude response');
      return [];
    }

    const keywords: string[] = JSON.parse(jsonMatch[0]);
    const discovered: DiscoveredKeyword[] = [];

    for (const kw of keywords) {
      const normalized = kw.toLowerCase().trim();
      if (normalized.length >= 2 && normalized.length <= 50) {
        const item: DiscoveredKeyword = {
          keyword: normalized,
          discovered_via: 'competitor',
          source_app_id: appId,
        };
        discovered.push(item);

        if (onKeyword) {
          onKeyword(item);
        }
      }
    }

    return discovered;
  } catch (error) {
    console.error('Error extracting keywords from competitor:', error);
    return [];
  }
}

// ============================================================================
// 3. Category Crawl (via iTunes RSS)
// ============================================================================

interface RSSApp {
  id: string;
  name: string;
  summary?: string;
}

interface EnrichedApp {
  id: string;
  name: string;
  subtitle?: string;
  description?: string;
}

// Map category name to genre ID
const CATEGORY_IDS: Record<string, number> = {
  'books': 6018,
  'business': 6000,
  'developer-tools': 6026,
  'education': 6017,
  'entertainment': 6016,
  'finance': 6015,
  'food-drink': 6023,
  'games': 6014,
  'graphics-design': 6027,
  'health-fitness': 6013,
  'lifestyle': 6012,
  'medical': 6020,
  'music': 6011,
  'navigation': 6010,
  'news': 6009,
  'photo-video': 6008,
  'productivity': 6007,
  'reference': 6006,
  'shopping': 6024,
  'social-networking': 6005,
  'sports': 6004,
  'travel': 6003,
  'utilities': 6002,
  'weather': 6001,
};

/**
 * Fetch top apps from a category via iTunes RSS
 */
async function fetchCategoryApps(
  category: string,
  country: string = 'us',
  limit: number = 200
): Promise<RSSApp[]> {
  const genreId = CATEGORY_IDS[category.toLowerCase()];
  if (!genreId) {
    console.error(`Unknown category: ${category}`);
    return [];
  }

  const url = `https://itunes.apple.com/${country}/rss/topfreeapplications/limit=${Math.min(limit, 200)}/genre=${genreId}/json`;

  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': 'AppStoreScraper/1.0' },
    });

    if (!response.ok) {
      console.error(`RSS feed error: ${response.status}`);
      return [];
    }

    const data = await response.json();
    const entries = data?.feed?.entry || [];

    return entries.map((entry: Record<string, unknown>) => {
      const idObj = entry.id as Record<string, unknown> | undefined;
      const attrs = idObj?.attributes as Record<string, unknown> | undefined;
      const nameObj = entry['im:name'] as Record<string, unknown> | undefined;
      const summaryObj = entry.summary as Record<string, unknown> | undefined;

      return {
        id: (attrs?.['im:id'] as string) || '',
        name: (nameObj?.label as string) || '',
        summary: (summaryObj?.label as string) || '',
      };
    });
  } catch (error) {
    console.error('Error fetching category apps:', error);
    return [];
  }
}

/**
 * Enrich apps with iTunes lookup data (subtitle, description)
 */
async function enrichAppsWithiTunes(
  appIds: string[],
  country: string = 'us'
): Promise<Map<string, EnrichedApp>> {
  const enriched = new Map<string, EnrichedApp>();

  // Batch lookup (iTunes allows up to 200 IDs)
  const batchSize = 100;
  for (let i = 0; i < appIds.length; i += batchSize) {
    const batch = appIds.slice(i, i + batchSize);
    const url = `https://itunes.apple.com/lookup?id=${batch.join(',')}&country=${country}`;

    try {
      const response = await fetch(url);
      if (!response.ok) continue;

      const data = await response.json();
      for (const app of data.results || []) {
        enriched.set(app.trackId.toString(), {
          id: app.trackId.toString(),
          name: app.trackName || '',
          subtitle: app.subtitle || '',
          description: (app.description || '').slice(0, 500), // First 500 chars
        });
      }

      // Rate limiting
      await new Promise(r => setTimeout(r, 200));
    } catch (error) {
      console.error('Error enriching apps:', error);
    }
  }

  return enriched;
}

/**
 * Extract n-grams from text
 */
function extractNgrams(text: string, maxN: number = 3): string[] {
  const normalized = text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const words = normalized.split(' ').filter((w) => w.length >= 2);
  const ngrams: string[] = [];

  for (let n = 1; n <= maxN; n++) {
    for (let i = 0; i <= words.length - n; i++) {
      const ngram = words.slice(i, i + n).join(' ');
      // Filter out ngrams that are all stop words
      const ngramWords = ngram.split(' ');
      const hasNonStopWord = ngramWords.some((w) => !STOP_WORDS.has(w));
      if (hasNonStopWord) {
        ngrams.push(ngram);
      }
    }
  }

  return ngrams;
}

/**
 * Extract keywords from text (names, subtitles, descriptions)
 * More lenient version for category crawl
 */
function extractKeywordsFromText(text: string): string[] {
  const normalized = text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const words = normalized.split(' ').filter((w) => w.length >= 2);
  const keywords: string[] = [];

  // Single meaningful words (3+ chars, not stop words)
  for (const word of words) {
    if (word.length >= 3 && !STOP_WORDS.has(word)) {
      keywords.push(word);
    }
  }

  // Bigrams (skip if both words are stop words)
  for (let i = 0; i < words.length - 1; i++) {
    const w1 = words[i];
    const w2 = words[i + 1];
    if (!STOP_WORDS.has(w1) || !STOP_WORDS.has(w2)) {
      const bigram = `${w1} ${w2}`;
      if (bigram.length >= 5) {
        keywords.push(bigram);
      }
    }
  }

  // Trigrams
  for (let i = 0; i < words.length - 2; i++) {
    const w1 = words[i];
    const w2 = words[i + 1];
    const w3 = words[i + 2];
    // At least one non-stop word
    if (!STOP_WORDS.has(w1) || !STOP_WORDS.has(w2) || !STOP_WORDS.has(w3)) {
      const trigram = `${w1} ${w2} ${w3}`;
      if (trigram.length >= 7) {
        keywords.push(trigram);
      }
    }
  }

  return keywords;
}

/**
 * Discover keywords by crawling top apps in a category
 * Enhanced version with multiple data sources and smarter filtering
 */
export async function discoverFromCategory(
  category: string,
  country: string = 'us',
  apiKey?: string,
  onKeyword?: (keyword: DiscoveredKeyword) => void
): Promise<DiscoveredKeyword[]> {
  // Fetch top apps from RSS
  const rssApps = await fetchCategoryApps(category, country, 200);

  if (rssApps.length === 0) {
    console.log(`No apps found for category: ${category}`);
    return [];
  }

  console.log(`Found ${rssApps.length} apps in ${category}, enriching with iTunes data...`);

  // Enrich with iTunes lookup data (subtitles, descriptions)
  const appIds = rssApps.map(a => a.id).filter(Boolean);
  const enrichedApps = await enrichAppsWithiTunes(appIds, country);

  // Extract keywords from all sources
  const keywordCounts = new Map<string, number>();
  const keywordSources = new Map<string, Set<string>>(); // Track which apps use each keyword

  for (const rssApp of rssApps) {
    const enriched = enrichedApps.get(rssApp.id);

    // Combine all text sources with different weights
    const textSources = [
      { text: rssApp.name, weight: 3 },           // App name is most important
      { text: enriched?.subtitle || '', weight: 2 }, // Subtitle is ASO-optimized
      { text: rssApp.summary || '', weight: 1 },    // RSS summary
      { text: enriched?.description?.slice(0, 200) || '', weight: 1 }, // First 200 chars of description
    ];

    for (const source of textSources) {
      if (!source.text) continue;

      const keywords = extractKeywordsFromText(source.text);
      for (const keyword of keywords) {
        keywordCounts.set(keyword, (keywordCounts.get(keyword) || 0) + source.weight);

        // Track which apps use this keyword
        if (!keywordSources.has(keyword)) {
          keywordSources.set(keyword, new Set());
        }
        keywordSources.get(keyword)!.add(rssApp.id);
      }
    }
  }

  // Dynamic threshold based on category size
  // For small categories, accept keywords appearing once
  // For large categories, require more frequency
  const minFrequency = rssApps.length > 100 ? 2 : 1;
  const minApps = 1; // Keyword must appear in at least 1 app

  // Filter and sort by weighted frequency
  let candidateKeywords = Array.from(keywordCounts.entries())
    .filter(([keyword, count]) => {
      const appCount = keywordSources.get(keyword)?.size || 0;
      return count >= minFrequency && appCount >= minApps && keyword.length >= 3;
    })
    .sort((a, b) => b[1] - a[1])
    .slice(0, 300) // Take top 300 candidates
    .map(([keyword]) => keyword);

  console.log(`Extracted ${candidateKeywords.length} candidate keywords from ${category}`);

  // Claude filtering is now OPTIONAL and LESS AGGRESSIVE
  // Only use if we have too many candidates (>100) and API key is available
  if (apiKey && candidateKeywords.length > 100) {
    console.log(`Filtering ${candidateKeywords.length} keywords with Claude...`);
    const filtered = await filterWithClaudeLenient(candidateKeywords.slice(0, 150), category, apiKey);
    if (filtered.length > 0) {
      candidateKeywords = filtered;
    }
    // If Claude returns empty, keep original candidates
  }

  // Limit final output
  const finalKeywords = candidateKeywords.slice(0, 100);

  console.log(`Final ${finalKeywords.length} keywords for ${category}`);

  // Convert to discovered keywords
  const discovered: DiscoveredKeyword[] = [];

  for (const kw of finalKeywords) {
    const item: DiscoveredKeyword = {
      keyword: kw,
      discovered_via: 'category_crawl',
      source_category: category,
    };
    discovered.push(item);

    if (onKeyword) {
      onKeyword(item);
    }
  }

  return discovered;
}

/**
 * Use Claude to filter n-grams to valid search keywords (LENIENT version)
 * Only removes obvious non-keywords, keeps most terms
 */
async function filterWithClaudeLenient(
  terms: string[],
  category: string,
  apiKey: string
): Promise<string[]> {
  const prompt = `You are filtering potential App Store search keywords for the "${category}" category.

BE LENIENT - when in doubt, KEEP the keyword. Users search for all kinds of terms.

ONLY remove terms that are:
- Obviously a specific brand name (e.g., "Facebook", "Instagram") - but keep generic brand-like terms
- Completely meaningless (random letters, single characters)
- Clearly incomplete fragments that no one would search for

KEEP everything else including:
- Feature keywords (e.g., "photo editor", "scanner")
- Generic descriptors (e.g., "free", "pro", "best") when combined with other words
- Use-case phrases (e.g., "track expenses", "edit photos")
- Single meaningful words (e.g., "calculator", "timer", "notes")
- Compound terms even if unusual

Input keywords (${terms.length} total):
${JSON.stringify(terms)}

Return a JSON array with the FILTERED keywords. Keep at least 70% of the input if they are reasonable search terms.
Return ONLY the JSON array, no explanations.`;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4000,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!response.ok) {
      console.error('Claude API error:', response.status);
      return terms; // Return all terms on error
    }

    const data = await response.json();
    const content = data.content?.[0]?.text || '';

    const jsonMatch = content.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      console.error('No JSON array in Claude response');
      return terms;
    }

    const filtered = JSON.parse(jsonMatch[0]);

    // If Claude filtered too aggressively (less than 30% remaining), return original
    if (filtered.length < terms.length * 0.3) {
      console.warn(`Claude filtered too aggressively (${filtered.length}/${terms.length}), using original`);
      return terms;
    }

    return filtered;
  } catch (error) {
    console.error('Error filtering with Claude:', error);
    return terms;
  }
}

/**
 * Use Claude to filter n-grams to valid search keywords (STRICT version - legacy)
 */
async function filterWithClaude(
  terms: string[],
  category: string,
  apiKey: string
): Promise<string[]> {
  // Use lenient version by default
  return filterWithClaudeLenient(terms, category, apiKey);
}

// ============================================================================
// Unified Discovery Function
// ============================================================================

export interface DiscoveryOptions {
  method: DiscoveryMethod;
  seed?: string;
  appId?: string;
  appData?: AppData;
  category?: string;
  country?: string;
  depth?: number;
  apiKey?: string;
  onKeyword?: (keyword: DiscoveredKeyword) => void;
}

/**
 * Discover keywords using the specified method
 */
export async function discoverKeywords(
  options: DiscoveryOptions
): Promise<DiscoveredKeyword[]> {
  const { method, country = 'us', onKeyword } = options;

  switch (method) {
    case 'autosuggest':
      if (!options.seed) {
        throw new Error('Seed keyword is required for autosuggest discovery');
      }
      return discoverFromSeed(options.seed, country, options.depth || 2, onKeyword);

    case 'competitor':
      if (!options.appId || !options.appData || !options.apiKey) {
        throw new Error(
          'App ID, app data, and API key are required for competitor discovery'
        );
      }
      return discoverFromCompetitor(
        options.appId,
        options.appData,
        options.apiKey,
        onKeyword
      );

    case 'category_crawl':
      if (!options.category) {
        throw new Error('Category is required for category crawl discovery');
      }
      return discoverFromCategory(
        options.category,
        country,
        options.apiKey,
        onKeyword
      );

    default:
      throw new Error(`Unknown discovery method: ${method}`);
  }
}

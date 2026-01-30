// Keyword Discovery Functions
// Three methods: Seed expansion, Competitor extraction, Category crawling

import { DiscoveredKeyword, DiscoveryMethod, AutosuggestHint } from './types';
import { expandSeedKeyword } from './autosuggest';

// ============================================================================
// Stop Words (shared with existing keyword extraction)
// ============================================================================

const STOP_WORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with',
  'by', 'from', 'as', 'is', 'was', 'are', 'were', 'been', 'be', 'have', 'has', 'had',
  'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might', 'must',
  'shall', 'can', 'need', 'it', 'its', 'this', 'that', 'these', 'those', 'i', 'me',
  'my', 'we', 'our', 'you', 'your', 'he', 'him', 'his', 'she', 'her', 'they', 'them',
  'their', 'what', 'which', 'who', 'when', 'where', 'why', 'how', 'all', 'each',
  'every', 'both', 'few', 'more', 'most', 'other', 'some', 'such', 'no', 'nor', 'not',
  'only', 'own', 'same', 'so', 'than', 'too', 'very', 'just', 'also', 'now', 'here',
  'there', 'then', 'once', 'any', 'app', 'apps', 'really', 'much', 'many', 'get',
  'got', 'use', 'used', 'using', 'like', 'dont', 'doesnt', 'cant', 'wont', 'one',
  'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'year',
  'years', 'day', 'days', 'time', 'times', 'week', 'weeks', 'month', 'months',
  'thing', 'things', 'lot', 'way', 'point', 'please', 'thank', 'thanks', 'sorry',
  'okay', 'ok', 'yes', 'no', 'yeah', 'sure', 'free', 'best', 'good', 'great', 'new',
  'top', 'pro', 'lite', 'plus', 'premium', 'version',
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
}

/**
 * Fetch top apps from a category via iTunes RSS
 */
async function fetchCategoryApps(
  category: string,
  country: string = 'us',
  limit: number = 200
): Promise<RSSApp[]> {
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

      return {
        id: (attrs?.['im:id'] as string) || '',
        name: (nameObj?.label as string) || '',
      };
    });
  } catch (error) {
    console.error('Error fetching category apps:', error);
    return [];
  }
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
 * Discover keywords by crawling top apps in a category
 */
export async function discoverFromCategory(
  category: string,
  country: string = 'us',
  apiKey?: string,
  onKeyword?: (keyword: DiscoveredKeyword) => void
): Promise<DiscoveredKeyword[]> {
  // Fetch top apps
  const apps = await fetchCategoryApps(category, country, 200);

  if (apps.length === 0) {
    return [];
  }

  // Extract n-grams from all app names
  const ngramCounts = new Map<string, number>();

  for (const app of apps) {
    const ngrams = extractNgrams(app.name);
    for (const ngram of ngrams) {
      ngramCounts.set(ngram, (ngramCounts.get(ngram) || 0) + 1);
    }
  }

  // Filter to n-grams that appear at least twice
  const frequentNgrams = Array.from(ngramCounts.entries())
    .filter(([, count]) => count >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 200)
    .map(([ngram]) => ngram);

  // If we have Claude API key, filter to valid search keywords
  let validKeywords = frequentNgrams;

  if (apiKey && frequentNgrams.length > 0) {
    validKeywords = await filterWithClaude(frequentNgrams, category, apiKey);
  }

  // Convert to discovered keywords
  const discovered: DiscoveredKeyword[] = [];

  for (const kw of validKeywords) {
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
 * Use Claude to filter n-grams to valid search keywords
 */
async function filterWithClaude(
  terms: string[],
  category: string,
  apiKey: string
): Promise<string[]> {
  const prompt = `Filter this list to only valid App Store search keywords for the "${category}" category.

Remove:
- Brand names and trademarked terms
- Single letters or very short words
- Common words that aren't search keywords
- Nonsense or incomplete phrases

Keep:
- Feature keywords (e.g., "photo editor")
- Use-case keywords (e.g., "budget tracker")
- App type keywords (e.g., "calculator app")
- Action keywords (e.g., "scan documents")

Terms to filter:
${JSON.stringify(terms)}

Return ONLY a JSON array of valid keywords. No explanations.`;

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
        max_tokens: 2000,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!response.ok) {
      console.error('Claude API error:', response.status);
      return terms.slice(0, 50); // Fallback to top 50 unfiltered
    }

    const data = await response.json();
    const content = data.content?.[0]?.text || '';

    const jsonMatch = content.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      return terms.slice(0, 50);
    }

    return JSON.parse(jsonMatch[0]);
  } catch (error) {
    console.error('Error filtering with Claude:', error);
    return terms.slice(0, 50);
  }
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

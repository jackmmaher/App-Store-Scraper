// iTunes Autosuggest API Client
// Fetches keyword suggestions and priority scores from Apple's hints API

import { AutosuggestHint, AutosuggestResult } from './types';

const AUTOSUGGEST_BASE_URL =
  'https://search.itunes.apple.com/WebObjects/MZSearchHints.woa/wa/hints';

const ITUNES_SEARCH_URL = 'https://itunes.apple.com/search';

// Rate limiting - be nice to Apple
const RATE_LIMIT_MS = 200;
let lastRequestTime = 0;

async function rateLimitedFetch(url: string, retries = 3): Promise<Response> {
  const now = Date.now();
  const timeSinceLastRequest = now - lastRequestTime;

  if (timeSinceLastRequest < RATE_LIMIT_MS) {
    await new Promise((resolve) =>
      setTimeout(resolve, RATE_LIMIT_MS - timeSinceLastRequest)
    );
  }

  lastRequestTime = Date.now();

  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const response = await fetch(url);
      if (response.ok) return response;

      // If rate limited (429) or server error (5xx), retry with backoff
      if (response.status === 429 || response.status >= 500) {
        await new Promise(r => setTimeout(r, RATE_LIMIT_MS * Math.pow(2, attempt)));
        continue;
      }
      return response;
    } catch (error) {
      if (attempt === retries - 1) throw error;
      await new Promise(r => setTimeout(r, RATE_LIMIT_MS * Math.pow(2, attempt)));
    }
  }

  return fetch(url); // Final attempt
}

/**
 * Fetch autosuggest hints for a search term
 */
export async function fetchAutosuggestHints(
  term: string,
  country: string = 'us'
): Promise<AutosuggestHint[]> {
  const url = `${AUTOSUGGEST_BASE_URL}?term=${encodeURIComponent(term)}&country=${country}&media=software`;

  try {
    const response = await rateLimitedFetch(url);

    if (!response.ok) {
      console.error(`Autosuggest API error: ${response.status}`);
      return [];
    }

    // Check content type - Apple sometimes returns XML error pages
    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('xml') || contentType.includes('html')) {
      console.warn(`Autosuggest returned non-JSON (${contentType}) for term: ${term}`);
      return [];
    }

    const text = await response.text();

    // Check if response looks like XML/HTML
    if (text.startsWith('<?xml') || text.startsWith('<!DOCTYPE') || text.startsWith('<html')) {
      console.warn(`Autosuggest returned XML/HTML for term: ${term}`);
      return [];
    }

    let data;
    try {
      data = JSON.parse(text);
    } catch {
      console.warn(`Autosuggest returned invalid JSON for term: ${term}`);
      return [];
    }

    // Apple returns { hints: [{ term, priority?, ... }, ...] }
    const hints = data?.hints || [];

    return hints.map((hint: { term: string; priority?: number }, index: number) => ({
      term: hint.term,
      priority: hint.priority || 0,
      position: index + 1,
    }));
  } catch (error) {
    console.error('Error fetching autosuggest:', error);
    return [];
  }
}

/**
 * Get autosuggest data for a specific keyword
 * Tests progressively shorter prefixes to find the trigger length
 */
export async function getAutosuggestData(
  keyword: string,
  country: string = 'us'
): Promise<AutosuggestResult> {
  const normalizedKeyword = keyword.toLowerCase().trim();

  // Test progressively longer prefixes to find when keyword appears
  for (let i = 1; i <= normalizedKeyword.length; i++) {
    const prefix = normalizedKeyword.slice(0, i);
    const hints = await fetchAutosuggestHints(prefix, country);

    // Check if our keyword appears in the suggestions
    for (const hint of hints) {
      if (hint.term.toLowerCase() === normalizedKeyword) {
        return {
          term: hint.term,
          priority: hint.priority,
          position: hint.position,
          trigger_chars: i,
          found: true,
        };
      }

      // Also check for partial matches (keyword contained in suggestion)
      if (hint.term.toLowerCase().includes(normalizedKeyword)) {
        return {
          term: hint.term,
          priority: hint.priority,
          position: hint.position,
          trigger_chars: i,
          found: true,
        };
      }
    }
  }

  // Keyword not found in autosuggest - still try to get some data
  const fullHints = await fetchAutosuggestHints(normalizedKeyword, country);
  const exactMatch = fullHints.find(
    (h) => h.term.toLowerCase() === normalizedKeyword
  );

  if (exactMatch) {
    return {
      term: exactMatch.term,
      priority: exactMatch.priority,
      position: exactMatch.position,
      trigger_chars: normalizedKeyword.length,
      found: true,
    };
  }

  return {
    term: normalizedKeyword,
    priority: 0,
    position: null,
    trigger_chars: normalizedKeyword.length,
    found: false,
  };
}

/**
 * Fallback: Extract keywords from iTunes search results
 * When autosuggest fails, we can still get related keywords from app metadata
 */
export async function extractKeywordsFromiTunesSearch(
  term: string,
  country: string = 'us',
  limit: number = 50
): Promise<AutosuggestHint[]> {
  const url = `${ITUNES_SEARCH_URL}?term=${encodeURIComponent(term)}&country=${country}&media=software&entity=software&limit=${limit}`;

  try {
    const response = await rateLimitedFetch(url);
    if (!response.ok) return [];

    const text = await response.text();
    if (text.startsWith('<?xml') || text.startsWith('<!DOCTYPE') || text.startsWith('<html')) {
      console.warn('iTunes search returned XML/HTML instead of JSON');
      return [];
    }

    let data;
    try {
      data = JSON.parse(text);
    } catch {
      console.warn('iTunes search returned invalid JSON');
      return [];
    }

    const apps = data.results || [];

    // Extract keywords from app names and subtitles
    const keywordCounts = new Map<string, number>();
    const stopWords = new Set([
      'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of',
      'with', 'by', 'from', 'as', 'is', 'app', 'apps', '-', '–', '&', '|', ':'
    ]);

    for (const app of apps) {
      // Extract from track name
      const name = (app.trackName || '').toLowerCase();
      const subtitle = (app.subtitle || '').toLowerCase();

      // Get meaningful phrases (2-3 words)
      const text = `${name} ${subtitle}`.replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim();
      const words = text.split(' ').filter((w: string) => w.length >= 2 && !stopWords.has(w));

      // Single words
      for (const word of words) {
        if (word.length >= 3) {
          keywordCounts.set(word, (keywordCounts.get(word) || 0) + 1);
        }
      }

      // Bigrams
      for (let i = 0; i < words.length - 1; i++) {
        const bigram = `${words[i]} ${words[i + 1]}`;
        if (bigram.length >= 5) {
          keywordCounts.set(bigram, (keywordCounts.get(bigram) || 0) + 1);
        }
      }

      // Trigrams
      for (let i = 0; i < words.length - 2; i++) {
        const trigram = `${words[i]} ${words[i + 1]} ${words[i + 2]}`;
        if (trigram.length >= 8) {
          keywordCounts.set(trigram, (keywordCounts.get(trigram) || 0) + 1);
        }
      }
    }

    // Sort by frequency and convert to hints
    const keywords = Array.from(keywordCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 30)
      .map(([keyword], index) => ({
        term: keyword,
        priority: Math.max(0, 10000 - index * 300), // Synthetic priority
        position: index + 1,
      }));

    return keywords;
  } catch (error) {
    console.error('Error extracting keywords from iTunes search:', error);
    return [];
  }
}

/**
 * Get alphabet variations of a seed for more suggestions
 */
function getAlphabetVariations(seed: string): string[] {
  const variations: string[] = [];
  const letters = 'abcdefghijklmnopqrstuvwxyz';

  // Add space + letter variations (e.g., "photo a", "photo b")
  for (const letter of letters) {
    variations.push(`${seed} ${letter}`);
  }

  return variations;
}

/**
 * Expand a seed keyword by recursively fetching suggestions
 * With fallback to iTunes search when autosuggest returns empty
 */
export async function expandSeedKeyword(
  seed: string,
  country: string = 'us',
  depth: number = 2,
  onKeyword?: (keyword: AutosuggestHint) => void
): Promise<AutosuggestHint[]> {
  const discovered = new Map<string, AutosuggestHint>();
  const normalizedSeed = seed.toLowerCase().trim();
  const queue: string[] = [normalizedSeed];
  const processed = new Set<string>();

  // First, try standard autosuggest expansion
  for (let d = 0; d < depth; d++) {
    const nextQueue: string[] = [];

    for (const term of queue) {
      if (processed.has(term)) continue;
      processed.add(term);

      const hints = await fetchAutosuggestHints(term, country);

      for (const hint of hints) {
        const normalizedTerm = hint.term.toLowerCase();

        if (!discovered.has(normalizedTerm)) {
          discovered.set(normalizedTerm, hint);
          nextQueue.push(normalizedTerm);

          if (onKeyword) {
            onKeyword(hint);
          }
        }
      }
    }

    queue.length = 0;
    queue.push(...nextQueue);

    if (nextQueue.length === 0) break;
  }

  // FALLBACK 1: If no results, try alphabet variations
  if (discovered.size === 0) {
    console.log(`Autosuggest empty for "${seed}", trying alphabet variations...`);
    const variations = getAlphabetVariations(normalizedSeed);

    for (const variation of variations.slice(0, 10)) { // Limit to first 10 letters
      const hints = await fetchAutosuggestHints(variation, country);

      for (const hint of hints) {
        const normalizedTerm = hint.term.toLowerCase();
        if (!discovered.has(normalizedTerm)) {
          discovered.set(normalizedTerm, hint);
          if (onKeyword) {
            onKeyword(hint);
          }
        }
      }

      // Stop if we found enough
      if (discovered.size >= 20) break;
    }
  }

  // FALLBACK 2: If still no results, use iTunes search extraction
  if (discovered.size === 0) {
    console.log(`Alphabet variations empty, falling back to iTunes search for "${seed}"...`);
    const searchKeywords = await extractKeywordsFromiTunesSearch(normalizedSeed, country);

    for (const hint of searchKeywords) {
      const normalizedTerm = hint.term.toLowerCase();
      if (!discovered.has(normalizedTerm)) {
        discovered.set(normalizedTerm, hint);
        if (onKeyword) {
          onKeyword(hint);
        }
      }
    }

    // Also add the original seed if it's not already there
    if (!discovered.has(normalizedSeed) && normalizedSeed.length >= 2) {
      const seedHint = { term: normalizedSeed, priority: 5000, position: discovered.size + 1 };
      discovered.set(normalizedSeed, seedHint);
      if (onKeyword) {
        onKeyword(seedHint);
      }
    }
  }

  return Array.from(discovered.values());
}

/**
 * Get related keywords for a seed (single-level expansion)
 */
export async function getRelatedKeywords(
  seed: string,
  country: string = 'us'
): Promise<AutosuggestHint[]> {
  return fetchAutosuggestHints(seed, country);
}

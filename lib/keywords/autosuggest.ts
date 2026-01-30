// iTunes Autosuggest API Client
// Fetches keyword suggestions and priority scores from Apple's hints API

import { AutosuggestHint, AutosuggestResult } from './types';

const AUTOSUGGEST_BASE_URL =
  'https://search.itunes.apple.com/WebObjects/MZSearchHints.woa/wa/hints';

// Rate limiting - be nice to Apple
const RATE_LIMIT_MS = 200;
let lastRequestTime = 0;

async function rateLimitedFetch(url: string): Promise<Response> {
  const now = Date.now();
  const timeSinceLastRequest = now - lastRequestTime;

  if (timeSinceLastRequest < RATE_LIMIT_MS) {
    await new Promise((resolve) =>
      setTimeout(resolve, RATE_LIMIT_MS - timeSinceLastRequest)
    );
  }

  lastRequestTime = Date.now();
  return fetch(url);
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

    const data = await response.json();

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
 * Expand a seed keyword by recursively fetching suggestions
 */
export async function expandSeedKeyword(
  seed: string,
  country: string = 'us',
  depth: number = 2,
  onKeyword?: (keyword: AutosuggestHint) => void
): Promise<AutosuggestHint[]> {
  const discovered = new Map<string, AutosuggestHint>();
  const queue: string[] = [seed.toLowerCase().trim()];
  const processed = new Set<string>();

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

    // Stop if no new keywords found
    if (nextQueue.length === 0) break;
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

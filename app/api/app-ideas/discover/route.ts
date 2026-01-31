import { NextRequest, NextResponse } from 'next/server';
import { isAuthenticated } from '@/lib/auth';
import { expandSeedKeyword, fetchAutosuggestHints } from '@/lib/keywords/autosuggest';
import { clusterKeywords } from '@/lib/app-ideas/cluster';
import { CATEGORY_NAMES } from '@/lib/constants';
import { DiscoveredKeyword, Cluster, DiscoverRequest } from '@/lib/app-ideas/types';

// iTunes Search API
const ITUNES_SEARCH_URL = 'https://itunes.apple.com/search';

interface iTunesApp {
  trackId: number;
  trackName: string;
  primaryGenreName: string;
  description: string;
}

/**
 * Get keywords from an app's metadata
 */
async function getKeywordsFromApp(
  appId: string,
  country: string
): Promise<DiscoveredKeyword[]> {
  try {
    const lookupUrl = `https://itunes.apple.com/lookup?id=${appId}&country=${country}`;
    const response = await fetch(lookupUrl);

    if (!response.ok) {
      throw new Error(`iTunes lookup failed: ${response.status}`);
    }

    const data = await response.json();
    const app = data.results?.[0];

    if (!app) {
      throw new Error('App not found');
    }

    // Extract keywords from app name and description
    const keywords: DiscoveredKeyword[] = [];
    const seen = new Set<string>();

    // Get app name words
    const nameWords = app.trackName
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter((w: string) => w.length >= 3);

    for (const word of nameWords) {
      if (!seen.has(word)) {
        seen.add(word);
        keywords.push({ term: word, priority: 8000, position: keywords.length + 1 });
      }
    }

    // Expand each name word to get related keywords
    for (const word of nameWords.slice(0, 3)) {
      const hints = await fetchAutosuggestHints(word, country);
      for (const hint of hints.slice(0, 10)) {
        const term = hint.term.toLowerCase();
        if (!seen.has(term)) {
          seen.add(term);
          keywords.push({
            term,
            priority: hint.priority,
            position: keywords.length + 1,
          });
        }
      }
      await new Promise(resolve => setTimeout(resolve, 200));
    }

    // Also expand by app category
    if (app.primaryGenreName) {
      const categoryHints = await fetchAutosuggestHints(
        app.primaryGenreName.toLowerCase(),
        country
      );
      for (const hint of categoryHints.slice(0, 10)) {
        const term = hint.term.toLowerCase();
        if (!seen.has(term)) {
          seen.add(term);
          keywords.push({
            term,
            priority: hint.priority,
            position: keywords.length + 1,
          });
        }
      }
    }

    return keywords;
  } catch (error) {
    console.error('Error getting keywords from app:', error);
    throw error;
  }
}

/**
 * Get keywords for a category
 */
async function getKeywordsForCategory(
  category: string,
  country: string
): Promise<DiscoveredKeyword[]> {
  const categoryName = CATEGORY_NAMES[category] || category;

  // First get suggestions for the category name
  const hints = await expandSeedKeyword(categoryName.toLowerCase(), country, 2);

  // Convert to DiscoveredKeyword format
  return hints.map((hint, index) => ({
    term: hint.term.toLowerCase(),
    priority: hint.priority,
    position: index + 1,
  }));
}

/**
 * Get keywords for a seed keyword
 */
async function getKeywordsForKeyword(
  keyword: string,
  country: string
): Promise<DiscoveredKeyword[]> {
  const hints = await expandSeedKeyword(keyword.toLowerCase(), country, 2);

  return hints.map((hint, index) => ({
    term: hint.term.toLowerCase(),
    priority: hint.priority,
    position: index + 1,
  }));
}

// POST /api/app-ideas/discover - Discover keywords and cluster them
export async function POST(request: NextRequest) {
  const authed = await isAuthenticated();
  if (!authed) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'Claude API key not configured' }, { status: 500 });
  }

  try {
    const body: DiscoverRequest = await request.json();
    const { entryType, entryValue, country = 'us' } = body;

    if (!entryType || !entryValue) {
      return NextResponse.json(
        { error: 'Entry type and value required' },
        { status: 400 }
      );
    }

    // Step 1: Discover keywords based on entry type
    let keywords: DiscoveredKeyword[];

    switch (entryType) {
      case 'category':
        keywords = await getKeywordsForCategory(entryValue, country);
        break;
      case 'keyword':
        keywords = await getKeywordsForKeyword(entryValue, country);
        break;
      case 'app':
        keywords = await getKeywordsFromApp(entryValue, country);
        break;
      default:
        return NextResponse.json(
          { error: 'Invalid entry type' },
          { status: 400 }
        );
    }

    if (keywords.length === 0) {
      return NextResponse.json(
        { error: 'No keywords discovered. Try a different input.' },
        { status: 400 }
      );
    }

    // Step 2: Cluster keywords using Claude
    let clusters: Cluster[];

    try {
      clusters = await clusterKeywords(keywords, apiKey);
    } catch (clusterError) {
      console.error('Clustering failed:', clusterError);
      return NextResponse.json(
        { error: 'Failed to cluster keywords. Please try again.' },
        { status: 500 }
      );
    }

    // Generate a session ID (in production, save to database)
    const sessionId = `session_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

    return NextResponse.json({
      success: true,
      data: {
        sessionId,
        keywords,
        clusters,
      },
    });
  } catch (error) {
    console.error('[POST /api/app-ideas/discover] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { isAuthenticated } from '@/lib/auth';
import { expandSeedKeyword, fetchAutosuggestHints } from '@/lib/keywords/autosuggest';
import { clusterKeywords } from '@/lib/app-ideas/cluster';
import { CATEGORY_NAMES } from '@/lib/constants';
import { DiscoveredKeyword, Cluster, DiscoverRequest } from '@/lib/app-ideas/types';
import {
  createAppIdeaSession,
  updateAppIdeaSession,
  getAppIdeaSessions,
  getAppIdeaSession,
} from '@/lib/supabase';

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
    const response = await fetch(lookupUrl, { signal: AbortSignal.timeout(10000) });

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

// GET /api/app-ideas/discover - Get all sessions or a specific session
export async function GET(request: NextRequest) {
  const authed = await isAuthenticated();
  if (!authed) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const sessionId = request.nextUrl.searchParams.get('id');

  try {
    if (sessionId) {
      // Get specific session
      const session = await getAppIdeaSession(sessionId);
      if (!session) {
        return NextResponse.json({ error: 'Session not found' }, { status: 404 });
      }
      return NextResponse.json({ success: true, data: session });
    } else {
      // Get all sessions
      const sessions = await getAppIdeaSessions(50);
      return NextResponse.json({ success: true, data: sessions });
    }
  } catch (error) {
    console.error('[GET /api/app-ideas/discover] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
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

    // Create a new session in the database
    const session = await createAppIdeaSession(entryType, entryValue, country);
    if (!session) {
      return NextResponse.json(
        { error: 'Failed to create session' },
        { status: 500 }
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
      // Update session with failure
      await updateAppIdeaSession(session.id, {
        status: 'complete',
        discovered_keywords: [],
      });
      return NextResponse.json(
        { error: 'No keywords discovered. Try a different input.' },
        { status: 400 }
      );
    }

    // Update session with discovered keywords
    await updateAppIdeaSession(session.id, {
      status: 'clustering',
      discovered_keywords: keywords,
    });

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

    // Update session with clusters
    await updateAppIdeaSession(session.id, {
      status: 'scoring',
      clusters: clusters,
    });

    return NextResponse.json({
      success: true,
      data: {
        sessionId: session.id,
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

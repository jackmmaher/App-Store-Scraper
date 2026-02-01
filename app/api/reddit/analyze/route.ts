import { NextRequest, NextResponse } from 'next/server';
import { isAuthenticated } from '@/lib/auth';
import { analyzeRedditData, RedditPost, RedditStats } from '@/lib/reddit/analyzer';
import { RedditSearchConfig } from '@/lib/reddit/types';
import {
  createRedditAnalysis,
  linkRedditAnalysisToCompetitor,
} from '@/lib/supabase';

// POST /api/reddit/analyze - Orchestrate full Reddit deep dive analysis
export async function POST(request: NextRequest) {
  const authed = await isAuthenticated();
  if (!authed) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const config = body as RedditSearchConfig;

    // Validate required fields
    if (!config.competitorId || typeof config.competitorId !== 'string') {
      return NextResponse.json(
        { error: 'Missing or invalid competitorId' },
        { status: 400 }
      );
    }

    if (!config.problemDomain || typeof config.problemDomain !== 'string') {
      return NextResponse.json(
        { error: 'Missing or invalid problemDomain' },
        { status: 400 }
      );
    }

    if (!Array.isArray(config.searchTopics) || config.searchTopics.length === 0) {
      return NextResponse.json(
        { error: 'searchTopics must be a non-empty array' },
        { status: 400 }
      );
    }

    if (!Array.isArray(config.subreddits) || config.subreddits.length === 0) {
      return NextResponse.json(
        { error: 'subreddits must be a non-empty array' },
        { status: 400 }
      );
    }

    const validTimeRanges = ['week', 'month', 'year'];
    if (!config.timeRange || !validTimeRanges.includes(config.timeRange)) {
      return NextResponse.json(
        { error: 'timeRange must be one of: week, month, year' },
        { status: 400 }
      );
    }

    console.log('[Reddit Analyze] Starting deep dive for competitor:', config.competitorId);
    console.log('[Reddit Analyze] Config:', {
      topics: config.searchTopics.length,
      subreddits: config.subreddits.length,
      timeRange: config.timeRange,
    });

    // Step 1: Call crawl-service to fetch Reddit data
    const crawlServiceUrl = process.env.CRAWL_SERVICE_URL || 'http://localhost:8000';
    const crawlResponse = await fetch(`${crawlServiceUrl}/crawl/reddit/deep-dive`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': process.env.CRAWL_SERVICE_API_KEY || '',
      },
      body: JSON.stringify({
        search_topics: config.searchTopics,
        subreddits: config.subreddits,
        time_filter: config.timeRange,
      }),
      signal: AbortSignal.timeout(300000), // 5 minute timeout
    });

    if (!crawlResponse.ok) {
      const errorText = await crawlResponse.text();
      console.error('[Reddit Analyze] Crawl service error:', errorText);
      return NextResponse.json(
        { error: `Crawl service error: ${crawlResponse.status}` },
        { status: 502 }
      );
    }

    const crawlData = await crawlResponse.json();
    console.log('[Reddit Analyze] Crawl complete:', {
      posts: crawlData.stats?.total_posts || 0,
      comments: crawlData.stats?.total_comments || 0,
    });

    // Transform crawl data to analyzer format
    const posts: RedditPost[] = crawlData.posts || [];
    const stats: RedditStats = crawlData.stats || {
      total_posts: 0,
      total_comments: 0,
      subreddits_searched: config.subreddits,
      topics_searched: config.searchTopics,
      date_range: { start: null, end: null },
    };

    // Check if we have data to analyze
    if (posts.length === 0) {
      return NextResponse.json(
        { error: 'No Reddit posts found matching the search criteria' },
        { status: 404 }
      );
    }

    // Step 2: Analyze the data with Claude
    console.log('[Reddit Analyze] Starting AI analysis...');
    const analysisOutput = await analyzeRedditData(posts, stats, config.problemDomain);
    console.log('[Reddit Analyze] AI analysis complete:', {
      unmetNeeds: analysisOutput.unmetNeeds.length,
      languagePatterns: analysisOutput.languagePatterns.length,
    });

    // Step 3: Store results in database
    const result = await createRedditAnalysis(config.competitorId, config, {
      unmetNeeds: analysisOutput.unmetNeeds,
      trends: analysisOutput.trends,
      sentiment: analysisOutput.sentiment,
      languagePatterns: analysisOutput.languagePatterns,
      topSubreddits: analysisOutput.topSubreddits,
      rawData: {
        postsAnalyzed: stats.total_posts,
        commentsAnalyzed: stats.total_comments,
        dateRange: {
          start: stats.date_range.start || new Date().toISOString(),
          end: stats.date_range.end || new Date().toISOString(),
        },
      },
    });

    if (!result) {
      return NextResponse.json(
        { error: 'Failed to store analysis results' },
        { status: 500 }
      );
    }

    console.log('[Reddit Analyze] Stored analysis:', result.id);

    // Step 4: Link analysis to competitor (best effort - don't fail if this fails)
    try {
      await linkRedditAnalysisToCompetitor(config.competitorId, result.id);
      console.log('[Reddit Analyze] Linked to competitor');
    } catch (linkError) {
      console.warn('[Reddit Analyze] Failed to link to competitor:', linkError);
      // Continue anyway - the analysis is still stored and accessible
    }

    return NextResponse.json({
      success: true,
      analysis: result,
    });
  } catch (error) {
    console.error('[Reddit Analyze] Error:', error);

    // Handle timeout specifically
    if (error instanceof Error && error.name === 'TimeoutError') {
      return NextResponse.json(
        { error: 'Reddit analysis timed out. Try reducing search scope.' },
        { status: 504 }
      );
    }

    const message = error instanceof Error ? error.message : 'Failed to analyze Reddit data';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

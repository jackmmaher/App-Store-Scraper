import { NextRequest, NextResponse } from 'next/server';
import { isAuthenticated } from '@/lib/auth';
import { analyzeRedditData, RedditPost, RedditStats, mineLanguageFromPosts, generateSearchTerms } from '@/lib/reddit/analyzer';
import { RedditSearchConfig } from '@/lib/reddit/types';
import {
  createRedditAnalysis,
  linkRedditAnalysisToCompetitor,
} from '@/lib/supabase';
import {
  recordSubredditPerformance,
  recordTopicPerformance,
  recordAnalysisPerformance,
} from '@/lib/reddit/yield-tracker';

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

    const crawlServiceUrl = process.env.CRAWL_SERVICE_URL || 'http://localhost:8000';

    // =========================================================================
    // PASS 1: Initial crawl with AI-generated terms
    // =========================================================================
    console.log('[Reddit Analyze] Pass 1: Crawling with AI-generated terms...');

    const pass1Response = await fetch(`${crawlServiceUrl}/crawl/reddit/deep-dive`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': process.env.CRAWL_SERVICE_API_KEY || '',
      },
      body: JSON.stringify({
        search_topics: config.searchTopics,
        subreddits: config.subreddits,
        time_filter: config.timeRange,
        validate_subreddits: true,
        use_adaptive_thresholds: true,
      }),
      signal: AbortSignal.timeout(300000), // 5 minute timeout for pass 1
    });

    if (!pass1Response.ok) {
      const errorText = await pass1Response.text();
      console.error('[Reddit Analyze] Pass 1 crawl service error:', errorText);
      return NextResponse.json(
        { error: `Crawl service error: ${pass1Response.status}` },
        { status: 502 }
      );
    }

    const pass1Data = await pass1Response.json();
    let posts: RedditPost[] = pass1Data.posts || [];
    const validatedSubreddits = pass1Data.validation?.valid || config.subreddits;

    console.log('[Reddit Analyze] Pass 1 complete:', {
      posts: posts.length,
      comments: pass1Data.stats?.total_comments || 0,
      validSubreddits: validatedSubreddits.length,
      invalidSubreddits: pass1Data.validation?.invalid?.length || 0,
      discoveredSubreddits: pass1Data.validation?.discovered?.length || 0,
    });

    // =========================================================================
    // PASS 2: Mine language from Pass 1 results, search with new terms
    // =========================================================================
    if (posts.length > 10) {
      console.log('[Reddit Analyze] Pass 2: Mining language from Pass 1 results...');

      // Extract authentic language patterns from Pass 1 posts
      const languageExtraction = mineLanguageFromPosts(posts);
      const minedSearchTerms = generateSearchTerms(languageExtraction);

      // Filter to only new terms not in original search
      const originalTermsLower = new Set(config.searchTopics.map(t => t.toLowerCase()));
      const newTerms = minedSearchTerms.filter(term =>
        !originalTermsLower.has(term.toLowerCase()) &&
        !Array.from(originalTermsLower).some(orig =>
          orig.includes(term.toLowerCase()) || term.toLowerCase().includes(orig)
        )
      );

      if (newTerms.length > 0) {
        console.log('[Reddit Analyze] Pass 2: Searching with mined terms:', newTerms);

        try {
          const pass2Response = await fetch(`${crawlServiceUrl}/crawl/reddit/deep-dive`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-API-Key': process.env.CRAWL_SERVICE_API_KEY || '',
            },
            body: JSON.stringify({
              search_topics: newTerms.slice(0, 5), // Limit to 5 new terms
              subreddits: validatedSubreddits, // Use validated subreddits from Pass 1
              time_filter: config.timeRange,
              validate_subreddits: false, // Already validated
              use_adaptive_thresholds: true,
            }),
            signal: AbortSignal.timeout(180000), // 3 minute timeout for pass 2
          });

          if (pass2Response.ok) {
            const pass2Data = await pass2Response.json();
            const pass2Posts: RedditPost[] = pass2Data.posts || [];

            // Merge Pass 2 posts, deduplicating by ID
            const existingIds = new Set(posts.map(p => p.id));
            const newPosts = pass2Posts.filter(p => !existingIds.has(p.id));

            console.log('[Reddit Analyze] Pass 2 complete:', {
              newPosts: newPosts.length,
              totalPosts: posts.length + newPosts.length,
            });

            posts = [...posts, ...newPosts];
          } else {
            console.warn('[Reddit Analyze] Pass 2 failed, continuing with Pass 1 results');
          }
        } catch (pass2Error) {
          console.warn('[Reddit Analyze] Pass 2 error, continuing with Pass 1 results:', pass2Error);
        }
      } else {
        console.log('[Reddit Analyze] No new terms discovered in Pass 2, skipping');
      }
    }

    // Final stats
    const stats: RedditStats = {
      total_posts: posts.length,
      total_comments: posts.reduce((sum, p) => sum + (p.comments?.length || 0), 0),
      subreddits_searched: validatedSubreddits,
      topics_searched: config.searchTopics,
      date_range: pass1Data.stats?.date_range || { start: null, end: null },
    };

    console.log('[Reddit Analyze] Combined crawl complete:', {
      posts: stats.total_posts,
      comments: stats.total_comments,
    });

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

    // Step 5: Record performance for yield tracking (best effort)
    try {
      // Get app category from the search context
      const appCategory = config.problemDomain.split(' ')[0] || 'general';

      await recordSubredditPerformance(
        {
          ...result,
          unmetNeeds: analysisOutput.unmetNeeds,
          topSubreddits: analysisOutput.topSubreddits,
        },
        config,
        appCategory
      );

      await recordTopicPerformance(
        config,
        appCategory,
        analysisOutput.topSubreddits,
        analysisOutput.unmetNeeds
      );

      // Calculate avg confidence score
      const avgConfidence = analysisOutput.unmetNeeds.length > 0
        ? analysisOutput.unmetNeeds.reduce((sum, n) => sum + (n.confidence?.score || 0.5), 0) / analysisOutput.unmetNeeds.length
        : 0;

      const quotesAttributed = analysisOutput.unmetNeeds.reduce(
        (sum, n) => sum + (n.evidence.attributedQuotes?.length || 0),
        0
      );

      await recordAnalysisPerformance(result.id, {
        subredditsSearched: stats.subreddits_searched.length,
        topicsSearched: stats.topics_searched.length,
        postsCrawled: stats.total_posts,
        commentsCrawled: stats.total_comments,
        needsDiscovered: analysisOutput.unmetNeeds.length,
        avgConfidenceScore: avgConfidence,
        quotesAttributed,
        crawlDurationSeconds: 0, // Would need timing to calculate
        analysisDurationSeconds: 0,
      });

      console.log('[Reddit Analyze] Recorded yield performance data');
    } catch (yieldError) {
      console.warn('[Reddit Analyze] Failed to record yield data:', yieldError);
      // Continue anyway - yield tracking is optional
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

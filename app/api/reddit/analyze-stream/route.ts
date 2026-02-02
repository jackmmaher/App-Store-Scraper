import { NextRequest } from 'next/server';
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

// Allow up to 5 minutes for this long-running streaming operation
export const maxDuration = 300;

// Types for SSE events
interface SSEEvent {
  event: string;
  data: Record<string, unknown>;
}

// POST /api/reddit/analyze-stream - Streaming Reddit analysis with real-time progress
export async function POST(request: NextRequest) {
  const authed = await isAuthenticated();
  if (!authed) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  let config: RedditSearchConfig;
  try {
    const body = await request.json();
    config = body as RedditSearchConfig;

    // Validate required fields
    if (!config.competitorId || typeof config.competitorId !== 'string') {
      throw new Error('Missing or invalid competitorId');
    }
    if (!config.problemDomain || typeof config.problemDomain !== 'string') {
      throw new Error('Missing or invalid problemDomain');
    }
    if (!Array.isArray(config.searchTopics) || config.searchTopics.length === 0) {
      throw new Error('searchTopics must be a non-empty array');
    }
    if (!Array.isArray(config.subreddits) || config.subreddits.length === 0) {
      throw new Error('subreddits must be a non-empty array');
    }
    const validTimeRanges = ['week', 'month', 'year'];
    if (!config.timeRange || !validTimeRanges.includes(config.timeRange)) {
      throw new Error('timeRange must be one of: week, month, year');
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Invalid request body';
    return new Response(JSON.stringify({ error: message }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Create streaming response
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      // Track if stream has been closed to prevent double-close errors
      let streamClosed = false;

      const send = (event: string, data: Record<string, unknown>) => {
        if (streamClosed) return;
        try {
          const sseEvent = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
          controller.enqueue(encoder.encode(sseEvent));
        } catch {
          // Controller might be closed
        }
      };

      const closeStream = () => {
        if (streamClosed) return;
        streamClosed = true;
        try {
          closeStream();
        } catch {
          // Already closed
        }
      };

      const crawlServiceUrl = process.env.CRAWL_SERVICE_URL || 'http://localhost:8000';

      try {
        // =====================================================================
        // Stage 1: Validating Subreddits
        // =====================================================================
        send('stage', {
          stage: 'validating',
          message: 'Validating subreddits...',
          progress: 0,
        });

        // Validate subreddits first
        const validateResponse = await fetch(`${crawlServiceUrl}/crawl/reddit/validate-subreddits`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-API-Key': process.env.CRAWL_SERVICE_API_KEY || '',
          },
          body: JSON.stringify({ subreddits: config.subreddits }),
          signal: AbortSignal.timeout(60000),
        });

        let validatedSubreddits = config.subreddits;
        let invalidSubreddits: string[] = [];
        let discoveredSubreddits: string[] = [];

        if (validateResponse.ok) {
          const validationResult = await validateResponse.json();
          validatedSubreddits = validationResult.valid?.map((s: { name: string }) => s.name) || config.subreddits;
          invalidSubreddits = validationResult.invalid || [];
          discoveredSubreddits = validationResult.discovered || [];

          send('progress', {
            stage: 'validating',
            progress: 100,
            validCount: validatedSubreddits.length,
            invalidCount: invalidSubreddits.length,
            discoveredCount: discoveredSubreddits.length,
            invalid: invalidSubreddits,
            discovered: discoveredSubreddits.slice(0, 5),
          });
        } else {
          send('progress', {
            stage: 'validating',
            progress: 100,
            validCount: config.subreddits.length,
            message: 'Validation skipped - using all provided subreddits',
          });
        }

        if (validatedSubreddits.length === 0) {
          send('error', { message: 'No valid subreddits found' });
          closeStream();
          return;
        }

        // =====================================================================
        // Stage 2: Crawling (Pass 1)
        // =====================================================================
        send('stage', {
          stage: 'crawling',
          message: 'Searching Reddit (Pass 1)...',
          progress: 0,
          subredditsTotal: validatedSubreddits.length,
        });

        const pass1Response = await fetch(`${crawlServiceUrl}/crawl/reddit/deep-dive`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-API-Key': process.env.CRAWL_SERVICE_API_KEY || '',
          },
          body: JSON.stringify({
            search_topics: config.searchTopics,
            subreddits: validatedSubreddits,
            time_filter: config.timeRange,
            validate_subreddits: false, // Already validated
            use_adaptive_thresholds: true,
          }),
          signal: AbortSignal.timeout(180000),
        });

        if (!pass1Response.ok) {
          const errorText = await pass1Response.text();
          send('error', { message: `Crawl service error: ${pass1Response.status}`, details: errorText });
          closeStream();
          return;
        }

        const pass1Data = await pass1Response.json();
        let posts: RedditPost[] = pass1Data.posts || [];

        send('progress', {
          stage: 'crawling',
          progress: 60,
          postsFound: posts.length,
          commentsFound: pass1Data.stats?.total_comments || 0,
          message: `Pass 1 complete: ${posts.length} posts found`,
        });

        // =====================================================================
        // Stage 2b: Crawling (Pass 2 - Language Mining)
        // =====================================================================
        if (posts.length > 10) {
          send('progress', {
            stage: 'crawling',
            progress: 65,
            message: 'Mining language patterns...',
          });

          const languageExtraction = mineLanguageFromPosts(posts);
          const minedSearchTerms = generateSearchTerms(languageExtraction);

          // Filter to new terms only
          const originalTermsLower = new Set(config.searchTopics.map(t => t.toLowerCase()));
          const newTerms = minedSearchTerms.filter(term =>
            !originalTermsLower.has(term.toLowerCase()) &&
            !Array.from(originalTermsLower).some(orig =>
              orig.includes(term.toLowerCase()) || term.toLowerCase().includes(orig)
            )
          );

          if (newTerms.length > 0) {
            send('progress', {
              stage: 'crawling',
              progress: 70,
              message: `Pass 2: Searching with ${newTerms.length} mined terms...`,
              minedTerms: newTerms.slice(0, 5),
            });

            try {
              const pass2Response = await fetch(`${crawlServiceUrl}/crawl/reddit/deep-dive`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'X-API-Key': process.env.CRAWL_SERVICE_API_KEY || '',
                },
                body: JSON.stringify({
                  search_topics: newTerms.slice(0, 5),
                  subreddits: validatedSubreddits,
                  time_filter: config.timeRange,
                  validate_subreddits: false,
                  use_adaptive_thresholds: true,
                }),
                signal: AbortSignal.timeout(120000),
              });

              if (pass2Response.ok) {
                const pass2Data = await pass2Response.json();
                const pass2Posts: RedditPost[] = pass2Data.posts || [];
                const existingIds = new Set(posts.map(p => p.id));
                const newPosts = pass2Posts.filter(p => !existingIds.has(p.id));

                posts = [...posts, ...newPosts];

                send('progress', {
                  stage: 'crawling',
                  progress: 90,
                  postsFound: posts.length,
                  newPostsFromPass2: newPosts.length,
                  message: `Pass 2 complete: +${newPosts.length} new posts`,
                });
              } else {
                // Pass 2 failed but we can continue with Pass 1 results
                console.warn('[Reddit Analyze Stream] Pass 2 returned non-ok status:', pass2Response.status);
                send('progress', {
                  stage: 'crawling',
                  progress: 90,
                  pass2Failed: true,
                  message: 'Language mining skipped - continuing with initial results',
                });
              }
            } catch (pass2Error) {
              console.warn('[Reddit Analyze Stream] Pass 2 error:', pass2Error);
              // Notify frontend that Pass 2 failed but analysis continues
              send('progress', {
                stage: 'crawling',
                progress: 90,
                pass2Failed: true,
                message: 'Language mining encountered an issue - continuing with initial results',
              });
            }
          }
        }

        send('progress', {
          stage: 'crawling',
          progress: 100,
          postsFound: posts.length,
          message: `Crawling complete: ${posts.length} total posts`,
        });

        if (posts.length === 0) {
          send('error', { message: 'No Reddit posts found matching the search criteria' });
          closeStream();
          return;
        }

        // =====================================================================
        // Stage 3: AI Analysis
        // =====================================================================
        send('stage', {
          stage: 'analyzing',
          message: 'AI analyzing posts...',
          progress: 0,
          postsToAnalyze: Math.min(posts.length, 50),
        });

        const stats: RedditStats = {
          total_posts: posts.length,
          total_comments: posts.reduce((sum, p) => sum + (p.comments?.length || 0), 0),
          subreddits_searched: validatedSubreddits,
          topics_searched: config.searchTopics,
          date_range: pass1Data.stats?.date_range || { start: null, end: null },
        };

        send('progress', {
          stage: 'analyzing',
          progress: 30,
          message: 'Extracting unmet needs...',
        });

        const analysisOutput = await analyzeRedditData(posts, stats, config.problemDomain);

        send('progress', {
          stage: 'analyzing',
          progress: 100,
          needsFound: analysisOutput.unmetNeeds.length,
          highSeverity: analysisOutput.unmetNeeds.filter(n => n.severity === 'high').length,
          languagePatterns: analysisOutput.languagePatterns.length,
          message: `Analysis complete: ${analysisOutput.unmetNeeds.length} unmet needs identified`,
        });

        // =====================================================================
        // Stage 4: Storing Results
        // =====================================================================
        send('stage', {
          stage: 'storing',
          message: 'Saving results...',
          progress: 0,
        });

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
          send('error', { message: 'Failed to store analysis results' });
          closeStream();
          return;
        }

        send('progress', {
          stage: 'storing',
          progress: 50,
          message: 'Linking to competitor...',
        });

        // Link to competitor
        try {
          await linkRedditAnalysisToCompetitor(config.competitorId, result.id);
        } catch (linkError) {
          console.warn('[Reddit Analyze Stream] Failed to link:', linkError);
        }

        send('progress', {
          stage: 'storing',
          progress: 80,
          message: 'Recording performance data...',
        });

        // Record performance
        try {
          const appCategory = config.problemDomain.split(' ')[0] || 'general';

          await recordSubredditPerformance(
            { ...result, unmetNeeds: analysisOutput.unmetNeeds, topSubreddits: analysisOutput.topSubreddits },
            config,
            appCategory
          );

          await recordTopicPerformance(config, appCategory, analysisOutput.topSubreddits, analysisOutput.unmetNeeds);
        } catch (yieldError) {
          console.warn('[Reddit Analyze Stream] Failed to record yield:', yieldError);
        }

        send('progress', {
          stage: 'storing',
          progress: 100,
          message: 'Analysis saved successfully',
        });

        // =====================================================================
        // Complete
        // =====================================================================
        send('complete', {
          analysisId: result.id,
          analysis: result,
          summary: {
            postsAnalyzed: stats.total_posts,
            commentsAnalyzed: stats.total_comments,
            unmetNeedsFound: analysisOutput.unmetNeeds.length,
            highSeverityNeeds: analysisOutput.unmetNeeds.filter(n => n.severity === 'high').length,
            subredditsSearched: validatedSubreddits.length,
            topicsSearched: config.searchTopics.length,
          },
        });

      } catch (error) {
        console.error('[Reddit Analyze Stream] Error:', error);

        const message = error instanceof Error ? error.message : 'Analysis failed';
        const isTimeout = error instanceof Error && error.name === 'TimeoutError';

        send('error', {
          message: isTimeout ? 'Analysis timed out. Try reducing search scope.' : message,
          isTimeout,
        });
      } finally {
        closeStream();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no', // Disable nginx buffering
    },
  });
}

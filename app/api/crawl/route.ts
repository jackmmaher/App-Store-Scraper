/**
 * Crawl API Route
 *
 * Proxy endpoint for the Crawl4AI Python service.
 * Handles authentication and provides a unified interface.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getCrawlOrchestrator } from '@/lib/crawl';

// Disable caching for health check - always fetch fresh status
export const dynamic = 'force-dynamic';

// Check authentication
async function checkAuth(request: NextRequest): Promise<boolean> {
  const authHeader = request.headers.get('authorization');
  const appPassword = process.env.APP_PASSWORD;

  if (!appPassword) return true; // No auth required if no password set

  if (!authHeader) return false;

  const token = authHeader.replace('Bearer ', '');
  return token === appPassword;
}

/**
 * GET /api/crawl
 * Health check and service status (no auth required for status check)
 */
export async function GET() {
  try {
    const orchestrator = getCrawlOrchestrator();
    const isAvailable = await orchestrator.isAvailable();

    return NextResponse.json({
      enabled: process.env.CRAWL_ENABLED !== 'false',
      serviceAvailable: isAvailable,
      serviceUrl: process.env.CRAWL_SERVICE_URL || 'http://localhost:8000',
    });
  } catch {
    return NextResponse.json({
      enabled: false,
      serviceAvailable: false,
      serviceUrl: process.env.CRAWL_SERVICE_URL || 'http://localhost:8000',
    });
  }
}

/**
 * POST /api/crawl
 * Start a crawl operation
 *
 * Body:
 * {
 *   type: 'app_store_reviews' | 'app_store_whats_new' | 'app_store_privacy' | 'reddit' | 'website' | 'batch',
 *   ...typeSpecificParams
 * }
 */
export async function POST(request: NextRequest) {
  if (!(await checkAuth(request))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { type, ...params } = body;

    if (!type) {
      return NextResponse.json(
        { error: 'Missing crawl type' },
        { status: 400 }
      );
    }

    const orchestrator = getCrawlOrchestrator();

    let result;

    switch (type) {
      case 'app_store_reviews':
        if (!params.app_id) {
          return NextResponse.json(
            { error: 'Missing app_id for app_store_reviews' },
            { status: 400 }
          );
        }
        result = await orchestrator.crawlAppReviews({
          app_id: params.app_id,
          country: params.country || 'us',
          max_reviews: params.max_reviews || 1000,
          min_rating: params.min_rating,
          max_rating: params.max_rating,
          force_refresh: params.force_refresh || false,
        });
        break;

      case 'app_store_whats_new':
        if (!params.app_id) {
          return NextResponse.json(
            { error: 'Missing app_id for app_store_whats_new' },
            { status: 400 }
          );
        }
        result = await orchestrator.crawlWhatsNew({
          app_id: params.app_id,
          country: params.country || 'us',
          max_versions: params.max_versions || 50,
          force_refresh: params.force_refresh || false,
        });
        break;

      case 'app_store_privacy':
        if (!params.app_id) {
          return NextResponse.json(
            { error: 'Missing app_id for app_store_privacy' },
            { status: 400 }
          );
        }
        result = await orchestrator.crawlPrivacyLabels({
          app_id: params.app_id,
          country: params.country || 'us',
          force_refresh: params.force_refresh || false,
        });
        break;

      case 'reddit':
        if (!params.keywords || params.keywords.length === 0) {
          return NextResponse.json(
            { error: 'Missing keywords for reddit crawl' },
            { status: 400 }
          );
        }
        result = await orchestrator.crawlReddit({
          keywords: params.keywords,
          subreddits: params.subreddits,
          max_posts: params.max_posts || 50,
          max_comments_per_post: params.max_comments_per_post || 20,
          time_filter: params.time_filter || 'year',
          sort: params.sort || 'relevance',
          force_refresh: params.force_refresh || false,
        });
        break;

      case 'website':
        if (!params.url) {
          return NextResponse.json(
            { error: 'Missing url for website crawl' },
            { status: 400 }
          );
        }
        result = await orchestrator.crawlWebsite({
          url: params.url,
          max_pages: params.max_pages || 10,
          include_subpages: params.include_subpages ?? true,
          extract_pricing: params.extract_pricing ?? true,
          extract_features: params.extract_features ?? true,
          force_refresh: params.force_refresh || false,
        });
        break;

      case 'batch':
        result = await orchestrator.startBatchCrawl({
          app_store_reviews: params.app_store_reviews,
          reddit: params.reddit,
          websites: params.websites,
        });
        break;

      default:
        return NextResponse.json(
          { error: `Unknown crawl type: ${type}` },
          { status: 400 }
        );
    }

    if (!result) {
      return NextResponse.json(
        { error: 'Crawl service unavailable or returned no data' },
        { status: 503 }
      );
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error('Crawl API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

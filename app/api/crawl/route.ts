/**
 * Crawl API Route
 *
 * Proxy endpoint for the Crawl4AI Python service.
 * Handles authentication and provides a unified interface.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getCrawlOrchestrator } from '@/lib/crawl';
import { isAuthenticated } from '@/lib/auth';
import { checkRateLimit, getClientIP, getSecurityHeaders, constantTimeEqual } from '@/lib/security';

// Disable caching for health check - always fetch fresh status
export const dynamic = 'force-dynamic';

/**
 * Check authentication for crawl endpoints
 * SECURITY FIX: Removed bypass when APP_PASSWORD is not set
 */
async function checkAuth(request: NextRequest): Promise<boolean> {
  // First check session-based authentication (from cookie)
  const sessionAuth = await isAuthenticated();
  if (sessionAuth) {
    return true;
  }

  // Fall back to API key authentication (for programmatic access)
  const authHeader = request.headers.get('authorization');
  const appPassword = process.env.APP_PASSWORD;
  const apiKey = process.env.CRAWL_API_KEY || process.env.APP_PASSWORD;

  // SECURITY FIX: Require authentication - no bypass when password is not set
  if (!apiKey && !appPassword) {
    return false;
  }

  if (!authHeader) {
    return false;
  }

  const token = authHeader.replace('Bearer ', '');

  // Use constant-time comparison to prevent timing attacks
  const passwordToCheck = apiKey || appPassword || '';
  return constantTimeEqual(token, passwordToCheck);
}

/**
 * GET /api/crawl
 * Health check and service status
 * SECURITY FIX: Removed internal service URL from response
 */
export async function GET(request: NextRequest) {
  const clientIP = getClientIP(request);
  const securityHeaders = getSecurityHeaders();

  // Rate limit health checks
  const rateLimit = checkRateLimit(`crawl:health:${clientIP}`, 30, 60000);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: 'Too many requests' },
      { status: 429, headers: securityHeaders }
    );
  }

  try {
    const orchestrator = getCrawlOrchestrator();
    const isAvailable = await orchestrator.isAvailable();

    return NextResponse.json(
      {
        enabled: process.env.CRAWL_ENABLED !== 'false',
        serviceAvailable: isAvailable,
        // SECURITY FIX: Removed internal service URL from response
      },
      { headers: securityHeaders }
    );
  } catch {
    return NextResponse.json(
      {
        enabled: false,
        serviceAvailable: false,
      },
      { headers: securityHeaders }
    );
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
  const clientIP = getClientIP(request);
  const securityHeaders = getSecurityHeaders();

  // Rate limit crawl requests (expensive operation)
  const rateLimit = checkRateLimit(`crawl:${clientIP}`, 20, 60000);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: 'Too many requests. Please try again later.' },
      {
        status: 429,
        headers: {
          ...securityHeaders,
          'Retry-After': String(Math.ceil(rateLimit.resetIn / 1000)),
        },
      }
    );
  }

  // Check authentication
  if (!(await checkAuth(request))) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401, headers: securityHeaders }
    );
  }

  try {
    const body = await request.json();
    const { type, ...params } = body;

    if (!type || typeof type !== 'string') {
      return NextResponse.json(
        { error: 'Missing or invalid crawl type' },
        { status: 400, headers: securityHeaders }
      );
    }

    // Validate crawl type
    const validTypes = [
      'app_store_reviews',
      'app_store_whats_new',
      'app_store_privacy',
      'reddit',
      'website',
      'batch',
    ];
    if (!validTypes.includes(type)) {
      return NextResponse.json(
        { error: 'Invalid crawl type' },
        { status: 400, headers: securityHeaders }
      );
    }

    const orchestrator = getCrawlOrchestrator();

    let result;

    switch (type) {
      case 'app_store_reviews':
        if (!params.app_id) {
          return NextResponse.json(
            { error: 'Missing app_id for app_store_reviews' },
            { status: 400, headers: securityHeaders }
          );
        }
        result = await orchestrator.crawlAppReviews({
          app_id: params.app_id,
          country: params.country || 'us',
          max_reviews: Math.min(params.max_reviews || 1000, 5000), // Cap max reviews
          min_rating: params.min_rating,
          max_rating: params.max_rating,
          force_refresh: params.force_refresh || false,
        });
        break;

      case 'app_store_whats_new':
        if (!params.app_id) {
          return NextResponse.json(
            { error: 'Missing app_id for app_store_whats_new' },
            { status: 400, headers: securityHeaders }
          );
        }
        result = await orchestrator.crawlWhatsNew({
          app_id: params.app_id,
          country: params.country || 'us',
          max_versions: Math.min(params.max_versions || 50, 200), // Cap max versions
          force_refresh: params.force_refresh || false,
        });
        break;

      case 'app_store_privacy':
        if (!params.app_id) {
          return NextResponse.json(
            { error: 'Missing app_id for app_store_privacy' },
            { status: 400, headers: securityHeaders }
          );
        }
        result = await orchestrator.crawlPrivacyLabels({
          app_id: params.app_id,
          country: params.country || 'us',
          force_refresh: params.force_refresh || false,
        });
        break;

      case 'reddit':
        if (!params.keywords || !Array.isArray(params.keywords) || params.keywords.length === 0) {
          return NextResponse.json(
            { error: 'Missing or invalid keywords for reddit crawl' },
            { status: 400, headers: securityHeaders }
          );
        }
        // Validate and sanitize keywords
        const sanitizedKeywords = params.keywords
          .filter((k: unknown) => typeof k === 'string' && k.length > 0)
          .slice(0, 10) // Max 10 keywords
          .map((k: string) => k.slice(0, 100)); // Max 100 chars per keyword

        if (sanitizedKeywords.length === 0) {
          return NextResponse.json(
            { error: 'No valid keywords provided' },
            { status: 400, headers: securityHeaders }
          );
        }

        result = await orchestrator.crawlReddit({
          keywords: sanitizedKeywords,
          subreddits: params.subreddits,
          max_posts: Math.min(params.max_posts || 50, 200), // Cap max posts
          max_comments_per_post: Math.min(params.max_comments_per_post || 20, 100),
          time_filter: params.time_filter || 'year',
          sort: params.sort || 'relevance',
          force_refresh: params.force_refresh || false,
        });
        break;

      case 'website':
        if (!params.url || typeof params.url !== 'string') {
          return NextResponse.json(
            { error: 'Missing or invalid url for website crawl' },
            { status: 400, headers: securityHeaders }
          );
        }
        // Validate URL
        try {
          const url = new URL(params.url);
          if (!['http:', 'https:'].includes(url.protocol)) {
            throw new Error('Invalid protocol');
          }
        } catch {
          return NextResponse.json(
            { error: 'Invalid URL format' },
            { status: 400, headers: securityHeaders }
          );
        }

        result = await orchestrator.crawlWebsite({
          url: params.url,
          max_pages: Math.min(params.max_pages || 10, 50), // Cap max pages
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
          { error: 'Invalid crawl type' },
          { status: 400, headers: securityHeaders }
        );
    }

    if (!result) {
      return NextResponse.json(
        { error: 'Crawl service unavailable' },
        { status: 503, headers: securityHeaders }
      );
    }

    return NextResponse.json(result, { headers: securityHeaders });
  } catch {
    // Don't expose error details to client
    return NextResponse.json(
      { error: 'An error occurred while processing your request' },
      { status: 500, headers: securityHeaders }
    );
  }
}

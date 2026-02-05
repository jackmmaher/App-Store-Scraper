import { NextRequest, NextResponse } from 'next/server';
import { isAuthenticated } from '@/lib/auth';
import {
  getAppsWithFilters,
  upsertApps,
  getUniqueCategories,
  getUniqueCountries,
  getAppsStats,
  AppFilters,
  AppResult,
} from '@/lib/supabase';

// GET /api/apps - Fetch apps with filters
export async function GET(request: NextRequest) {
  const authed = await isAuthenticated();
  if (!authed) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const searchParams = request.nextUrl.searchParams;

  // Parse filter parameters with safety limits
  const MAX_LIMIT = 500; // Prevent resource exhaustion
  const MAX_OFFSET = 100000; // Reasonable pagination limit

  const requestedLimit = searchParams.get('limit') ? parseInt(searchParams.get('limit')!, 10) : 50;
  const requestedOffset = searchParams.get('offset') ? parseInt(searchParams.get('offset')!, 10) : 0;

  const filters: AppFilters = {
    minReviews: searchParams.get('minReviews') ? parseInt(searchParams.get('minReviews')!) : undefined,
    maxReviews: searchParams.get('maxReviews') ? parseInt(searchParams.get('maxReviews')!) : undefined,
    minRating: searchParams.get('minRating') ? parseFloat(searchParams.get('minRating')!) : undefined,
    maxRating: searchParams.get('maxRating') ? parseFloat(searchParams.get('maxRating')!) : undefined,
    priceType: (searchParams.get('priceType') as 'all' | 'free' | 'paid') || 'all',
    categories: searchParams.get('categories')?.split(',').filter(Boolean) || undefined,
    countries: searchParams.get('countries')?.split(',').filter(Boolean) || undefined,
    search: searchParams.get('search') || undefined,
    sortBy: (searchParams.get('sortBy') as AppFilters['sortBy']) || 'reviews',
    sortOrder: (searchParams.get('sortOrder') as 'asc' | 'desc') || 'desc',
    limit: Math.min(Math.max(1, requestedLimit), MAX_LIMIT),
    offset: Math.min(Math.max(0, requestedOffset), MAX_OFFSET),
  };

  try {
    const result = await getAppsWithFilters(filters);
    return NextResponse.json(result);
  } catch (error) {
    console.error('Error fetching apps:', error);
    return NextResponse.json({ error: 'Failed to fetch apps' }, { status: 500 });
  }
}

// POST /api/apps - Upsert apps to master database
export async function POST(request: NextRequest) {
  const authed = await isAuthenticated();
  if (!authed) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { apps, country, category } = body as {
      apps: AppResult[];
      country: string;
      category: string;
    };

    if (!apps || !Array.isArray(apps)) {
      return NextResponse.json({ error: 'apps array is required' }, { status: 400 });
    }

    const result = await upsertApps(apps, country || 'unknown', category || 'unknown');

    return NextResponse.json({
      success: true,
      ...result,
      message: `Added ${result.inserted} new apps, updated ${result.updated} existing apps`,
    });
  } catch (error) {
    console.error('Error upserting apps:', error);
    return NextResponse.json({ error: 'Failed to save apps' }, { status: 500 });
  }
}

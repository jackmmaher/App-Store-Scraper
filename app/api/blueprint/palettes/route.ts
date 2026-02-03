import { NextRequest, NextResponse } from 'next/server';
import { isAuthenticated } from '@/lib/auth';
import { getStructuredColorPalettes } from '@/lib/crawl';

export const runtime = 'nodejs';

// POST /api/blueprint/palettes - Get color palettes for selection
export async function POST(request: NextRequest) {
  const authed = await isAuthenticated();
  if (!authed) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { category, mood, max_palettes = 50, force_refresh = false } = body;

    // Get structured palettes directly (no markdown conversion)
    const result = await getStructuredColorPalettes(
      category,
      mood,
      max_palettes,
      force_refresh
    );

    return NextResponse.json({
      palettes: result.palettes,
      totalCached: result.totalCached,
      source: result.source,
      category: result.category,
      mood: result.mood,
    });
  } catch (error) {
    console.error('Error fetching palettes:', error);

    // Return error response - let frontend handle fallback
    return NextResponse.json({
      palettes: [],
      totalCached: 0,
      source: 'error',
      error: 'Failed to fetch palettes',
    }, { status: 500 });
  }
}

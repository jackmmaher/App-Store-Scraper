/**
 * Font API Route
 *
 * GET /api/blueprint/fonts - Get curated fonts for design system (markdown, for AI prompts)
 * POST /api/blueprint/fonts - Get structured font pairings (JSON, for FontPickerModal)
 */

import { NextRequest, NextResponse } from 'next/server';
import { isAuthenticated } from '@/lib/auth';
import {
  getFontsForDesignSystem,
  getFontPairingsForDesignSystem,
  getStructuredFontPairings,
} from '@/lib/crawl/enrichment';

export const maxDuration = 30;

// GET - Returns markdown for AI prompt generation
export async function GET(request: NextRequest) {
  const authed = await isAuthenticated();
  if (!authed) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const category = searchParams.get('category') || undefined;
    const includePairings = searchParams.get('includePairings') === 'true';

    const [fontsMarkdown, pairingsMarkdown] = await Promise.all([
      getFontsForDesignSystem(category, 20),
      includePairings ? getFontPairingsForDesignSystem(category, undefined, 10) : Promise.resolve(''),
    ]);

    return NextResponse.json({
      success: true,
      fonts: fontsMarkdown,
      pairings: pairingsMarkdown || undefined,
    });
  } catch (error) {
    console.error('Error fetching fonts:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch fonts' },
      { status: 500 }
    );
  }
}

// POST - Returns structured JSON for FontPickerModal
export async function POST(request: NextRequest) {
  const authed = await isAuthenticated();
  if (!authed) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const {
      category,
      style,
      maxPairings = 12,
      forceRefresh = false,
      format = 'structured', // 'structured' | 'markdown'
    } = body;

    // If requesting markdown format (for AI prompts), use the old behavior
    if (format === 'markdown') {
      const [fontsMarkdown, pairingsMarkdown] = await Promise.all([
        getFontsForDesignSystem(category, 20),
        getFontPairingsForDesignSystem(category, style, maxPairings),
      ]);

      return NextResponse.json({
        success: true,
        fonts: fontsMarkdown,
        pairings: pairingsMarkdown || undefined,
      });
    }

    // Default: Return structured JSON for FontPickerModal
    const result = await getStructuredFontPairings(
      category,
      style,
      maxPairings,
      forceRefresh
    );

    return NextResponse.json({
      success: true,
      pairings: result.pairings,
      source: result.source,
      totalAvailable: result.totalAvailable,
      forceRefreshed: forceRefresh,
    });
  } catch (error) {
    console.error('Error fetching fonts:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch fonts' },
      { status: 500 }
    );
  }
}

/**
 * Font API Route
 *
 * GET /api/blueprint/fonts - Get curated fonts for design system
 * POST /api/blueprint/fonts - Get fonts with filtering options
 */

import { NextRequest, NextResponse } from 'next/server';
import { getFontsForDesignSystem, getFontPairingsForDesignSystem } from '@/lib/crawl/enrichment';

export const maxDuration = 30;

export async function GET(request: NextRequest) {
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

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      category,
      style,
      maxFonts = 20,
      maxPairings = 10,
      includePairings = true,
    } = body;

    const [fontsMarkdown, pairingsMarkdown] = await Promise.all([
      getFontsForDesignSystem(category, maxFonts),
      includePairings ? getFontPairingsForDesignSystem(category, style, maxPairings) : Promise.resolve(''),
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

/**
 * Color Spectrum API Route
 *
 * POST /api/blueprint/color-spectrum - Generate color spectrum from primary color
 */

import { NextRequest, NextResponse } from 'next/server';
import { isAuthenticated } from '@/lib/auth';
import { getColorSpectrumForPrimary } from '@/lib/crawl/enrichment';

export const maxDuration = 15;

export async function POST(request: NextRequest) {
  const authed = await isAuthenticated();
  if (!authed) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { primaryHex, includeComplementary = true } = body;

    if (!primaryHex) {
      return NextResponse.json(
        { success: false, error: 'primaryHex is required' },
        { status: 400 }
      );
    }

    // Validate hex format
    const hexRegex = /^#?[0-9A-Fa-f]{6}$/;
    if (!hexRegex.test(primaryHex)) {
      return NextResponse.json(
        { success: false, error: 'Invalid hex color format. Use 6-digit hex (e.g., #FF5733 or FF5733)' },
        { status: 400 }
      );
    }

    const spectrumMarkdown = await getColorSpectrumForPrimary(primaryHex, includeComplementary);

    return NextResponse.json({
      success: true,
      spectrum: spectrumMarkdown,
    });
  } catch (error) {
    console.error('Error generating color spectrum:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to generate color spectrum' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  const authed = await isAuthenticated();
  if (!authed) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const primaryHex = searchParams.get('hex');

  if (!primaryHex) {
    return NextResponse.json(
      { success: false, error: 'hex query parameter is required' },
      { status: 400 }
    );
  }

  // Validate hex format
  const hexRegex = /^#?[0-9A-Fa-f]{6}$/;
  if (!hexRegex.test(primaryHex)) {
    return NextResponse.json(
      { success: false, error: 'Invalid hex color format. Use 6-digit hex (e.g., FF5733)' },
      { status: 400 }
    );
  }

  try {
    const spectrumMarkdown = await getColorSpectrumForPrimary(primaryHex, true);

    return NextResponse.json({
      success: true,
      spectrum: spectrumMarkdown,
    });
  } catch (error) {
    console.error('Error generating color spectrum:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to generate color spectrum' },
      { status: 500 }
    );
  }
}

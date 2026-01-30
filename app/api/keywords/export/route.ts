import { NextRequest, NextResponse } from 'next/server';
import { isAuthenticated } from '@/lib/auth';
import { searchKeywords } from '@/lib/keywords/db';
import { DiscoveryMethod, Keyword } from '@/lib/keywords/types';

// GET /api/keywords/export - Export keywords as CSV or JSON
export async function GET(request: NextRequest) {
  const authed = await isAuthenticated();
  if (!authed) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const searchParams = request.nextUrl.searchParams;
    const format = searchParams.get('format') || 'csv';
    const country = searchParams.get('country') || 'us';

    // Build search params (export all matching keywords)
    const params = {
      country,
      sort: (searchParams.get('sort') as 'opportunity' | 'volume' | 'difficulty' | 'created_at') || 'opportunity',
      sort_dir: (searchParams.get('sort_dir') as 'asc' | 'desc') || 'desc',
      min_volume: searchParams.get('min_volume') ? Number(searchParams.get('min_volume')) : undefined,
      max_volume: searchParams.get('max_volume') ? Number(searchParams.get('max_volume')) : undefined,
      min_difficulty: searchParams.get('min_difficulty') ? Number(searchParams.get('min_difficulty')) : undefined,
      max_difficulty: searchParams.get('max_difficulty') ? Number(searchParams.get('max_difficulty')) : undefined,
      min_opportunity: searchParams.get('min_opportunity') ? Number(searchParams.get('min_opportunity')) : undefined,
      discovered_via: searchParams.get('discovered_via') as DiscoveryMethod | undefined,
      page: 1,
      limit: 5000, // Export up to 5000 keywords
    };

    const results = await searchKeywords(params);
    const keywords = results.keywords;

    if (format === 'json') {
      return new Response(JSON.stringify(keywords, null, 2), {
        headers: {
          'Content-Type': 'application/json',
          'Content-Disposition': `attachment; filename="keywords-${country}-${new Date().toISOString().split('T')[0]}.json"`,
        },
      });
    }

    // CSV format
    const csvRows = [
      // Header
      [
        'keyword',
        'volume_score',
        'difficulty_score',
        'opportunity_score',
        'total_results',
        'top10_avg_reviews',
        'top10_avg_rating',
        'top10_title_matches',
        'autosuggest_priority',
        'autosuggest_position',
        'discovered_via',
        'source_seed',
        'source_category',
        'country',
        'scored_at',
      ].join(','),
    ];

    for (const kw of keywords) {
      csvRows.push([
        escapeCSV(kw.keyword),
        kw.volume_score?.toString() || '',
        kw.difficulty_score?.toString() || '',
        kw.opportunity_score?.toString() || '',
        kw.total_results?.toString() || '',
        kw.top10_avg_reviews?.toString() || '',
        kw.top10_avg_rating?.toString() || '',
        kw.top10_title_matches?.toString() || '',
        kw.autosuggest_priority?.toString() || '',
        kw.autosuggest_position?.toString() || '',
        kw.discovered_via || '',
        escapeCSV(kw.source_seed || ''),
        escapeCSV(kw.source_category || ''),
        kw.country,
        kw.scored_at || '',
      ].join(','));
    }

    const csvContent = csvRows.join('\n');

    return new Response(csvContent, {
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="keywords-${country}-${new Date().toISOString().split('T')[0]}.csv"`,
      },
    });
  } catch (error) {
    console.error('Error exporting keywords:', error);
    return NextResponse.json(
      { error: 'Failed to export keywords' },
      { status: 500 }
    );
  }
}

function escapeCSV(value: string): string {
  if (!value) return '';
  // Escape quotes and wrap in quotes if contains comma, quote, or newline
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

import { NextResponse } from 'next/server';
import { isAuthenticated } from '@/lib/auth';
import {
  getUniqueCategories,
  getUniqueCountries,
  getAppsStats,
} from '@/lib/supabase';

// GET /api/apps/meta - Fetch metadata for filter dropdowns
export async function GET() {
  const authed = await isAuthenticated();
  if (!authed) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const [categories, countries, stats] = await Promise.all([
      getUniqueCategories(),
      getUniqueCountries(),
      getAppsStats(),
    ]);

    return NextResponse.json({
      categories,
      countries,
      stats,
    });
  } catch (error) {
    console.error('Error fetching apps metadata:', error);
    return NextResponse.json({ error: 'Failed to fetch metadata' }, { status: 500 });
  }
}

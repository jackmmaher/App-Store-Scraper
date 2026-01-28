import { NextResponse } from 'next/server';
import { isAuthenticated } from '@/lib/auth';
import { supabase } from '@/lib/supabase';

// GET /api/concepts/debug - Debug endpoint to check Supabase connection
export async function GET() {
  const authed = await isAuthenticated();
  if (!authed) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // Test 1: Get all concepts without any filter
    const { data: allConcepts, error: allError } = await supabase
      .from('app_concepts')
      .select('id, name');

    // Test 2: Get table info
    const { data: countData, error: countError, count } = await supabase
      .from('app_concepts')
      .select('*', { count: 'exact', head: true });

    return NextResponse.json({
      success: true,
      tests: {
        allConcepts: {
          data: allConcepts,
          error: allError?.message || null,
          count: allConcepts?.length || 0,
        },
        tableCount: {
          count: count,
          error: countError?.message || null,
        },
      },
      supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ? 'configured' : 'missing',
      supabaseKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ? 'configured' : 'missing',
    });
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: String(error),
    }, { status: 500 });
  }
}

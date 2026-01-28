import { NextResponse } from 'next/server';
import { isAuthenticated } from '@/lib/auth';
import { supabase } from '@/lib/supabase';

// GET /api/projects/debug - Debug endpoint to test Supabase connection
export async function GET() {
  const authed = await isAuthenticated();
  if (!authed) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const results: Record<string, unknown> = {
    timestamp: new Date().toISOString(),
    tests: {},
  };

  // Test 1: Check if we can connect to Supabase
  try {
    const { data: testData, error: testError } = await supabase
      .from('app_projects')
      .select('id, app_name, created_at')
      .limit(1);

    results.tests = {
      ...results.tests as object,
      connection: {
        success: !testError,
        error: testError ? {
          code: testError.code,
          message: testError.message,
          details: testError.details,
          hint: testError.hint,
        } : null,
        sampleData: testData,
      },
    };
  } catch (err) {
    results.tests = {
      ...results.tests as object,
      connection: {
        success: false,
        error: String(err),
      },
    };
  }

  // Test 2: Count all projects
  try {
    const { count, error: countError } = await supabase
      .from('app_projects')
      .select('*', { count: 'exact', head: true });

    results.tests = {
      ...results.tests as object,
      count: {
        success: !countError,
        totalProjects: count,
        error: countError ? countError.message : null,
      },
    };
  } catch (err) {
    results.tests = {
      ...results.tests as object,
      count: {
        success: false,
        error: String(err),
      },
    };
  }

  // Test 3: List all project IDs and names
  try {
    const { data: allProjects, error: listError } = await supabase
      .from('app_projects')
      .select('id, app_name, updated_at')
      .order('updated_at', { ascending: false })
      .limit(10);

    results.tests = {
      ...results.tests as object,
      projectList: {
        success: !listError,
        projects: allProjects?.map(p => ({ id: p.id, name: p.app_name, updated: p.updated_at })),
        error: listError ? listError.message : null,
      },
    };
  } catch (err) {
    results.tests = {
      ...results.tests as object,
      projectList: {
        success: false,
        error: String(err),
      },
    };
  }

  // Test 4: Check environment variables (masked)
  results.env = {
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?
      `${process.env.NEXT_PUBLIC_SUPABASE_URL.substring(0, 30)}...` : 'NOT SET',
    supabaseKeySet: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  };

  return NextResponse.json(results);
}

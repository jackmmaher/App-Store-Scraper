import { NextRequest, NextResponse } from 'next/server';
import { isAuthenticated } from '@/lib/auth';
import { supabase } from '@/lib/supabase';

// GET /api/debug/projects?id=xxx - Debug project retrieval
export async function GET(request: NextRequest) {
  const authed = await isAuthenticated();
  if (!authed) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const searchParams = request.nextUrl.searchParams;
  const id = searchParams.get('id');

  if (!id) {
    return NextResponse.json({ error: 'id query param required' }, { status: 400 });
  }

  const results: Record<string, unknown> = {
    inputId: id,
    inputIdLength: id.length,
  };

  // Test 1: Count all projects
  const { count: totalCount } = await supabase
    .from('app_projects')
    .select('*', { count: 'exact', head: true });
  results.totalProjects = totalCount;

  // Test 2: Get all project IDs
  const { data: allIds, error: allIdsError } = await supabase
    .from('app_projects')
    .select('id, app_name');
  results.allProjects = allIds;
  results.allIdsError = allIdsError;

  // Test 3: Try exact match with eq
  const { data: eqData, error: eqError } = await supabase
    .from('app_projects')
    .select('id, app_name')
    .eq('id', id);
  results.eqMatch = eqData;
  results.eqError = eqError;

  // Test 4: Try with .single()
  const { data: singleData, error: singleError } = await supabase
    .from('app_projects')
    .select('id, app_name')
    .eq('id', id)
    .single();
  results.singleMatch = singleData;
  results.singleError = singleError;

  // Test 5: Manual comparison
  if (allIds && allIds.length > 0) {
    const firstId = allIds[0].id;
    results.firstDbId = firstId;
    results.firstDbIdLength = firstId.length;
    results.idsMatch = firstId === id;
    results.idsLowerMatch = firstId.toLowerCase() === id.toLowerCase();
    results.charByCharDiff = [];
    for (let i = 0; i < Math.max(firstId.length, id.length); i++) {
      if (firstId[i] !== id[i]) {
        (results.charByCharDiff as string[]).push(
          `Position ${i}: DB='${firstId[i]}' (${firstId.charCodeAt(i)}) vs Input='${id[i]}' (${id?.charCodeAt(i)})`
        );
      }
    }
  }

  return NextResponse.json(results);
}

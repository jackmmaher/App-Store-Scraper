import { NextRequest, NextResponse } from 'next/server';
import { isAuthenticated } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import type { BlueprintTypography, ProjectBlueprint } from '@/lib/supabase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// PUT /api/blueprint/typography - Update blueprint typography
export async function PUT(request: NextRequest) {
  const authed = await isAuthenticated();
  if (!authed) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { blueprintId, typography, source } = body as {
      blueprintId: string;
      typography: BlueprintTypography;
      source?: 'auto' | 'user_selected';
    };

    if (!blueprintId || !typography) {
      return NextResponse.json({ error: 'blueprintId and typography required' }, { status: 400 });
    }

    if (!typography.heading_font || !typography.body_font) {
      return NextResponse.json({ error: 'heading_font and body_font required' }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from('project_blueprints')
      .update({
        typography: typography,
        typography_source: source || 'user_selected',
        updated_at: new Date().toISOString(),
      })
      .eq('id', blueprintId)
      .select()
      .single();

    if (error) {
      console.error('[PUT /api/blueprint/typography] Error:', error);
      return NextResponse.json({ error: error.message || 'Failed to update typography' }, { status: 500 });
    }

    return NextResponse.json({ blueprint: data as ProjectBlueprint });
  } catch (error) {
    console.error('[PUT /api/blueprint/typography] Error:', error);
    return NextResponse.json({ error: 'Failed to update typography' }, { status: 500 });
  }
}

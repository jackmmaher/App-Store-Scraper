import { NextRequest, NextResponse } from 'next/server';
import { isAuthenticated } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import type { BlueprintColorPalette, ProjectBlueprint } from '@/lib/supabase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// PUT /api/blueprint/palette - Update blueprint color palette
export async function PUT(request: NextRequest) {
  const authed = await isAuthenticated();
  if (!authed) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { blueprintId, palette, source } = body as {
      blueprintId: string;
      palette: BlueprintColorPalette;
      source?: 'auto' | 'user_selected' | 'coolors';
    };

    if (!blueprintId || !palette) {
      return NextResponse.json({ error: 'blueprintId and palette required' }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from('project_blueprints')
      .update({
        color_palette: palette,
        color_palette_source: source || 'user_selected',
        updated_at: new Date().toISOString(),
      })
      .eq('id', blueprintId)
      .select()
      .single();

    if (error) {
      console.error('[PUT /api/blueprint/palette] Error:', error);
      return NextResponse.json({ error: error.message || 'Failed to update palette' }, { status: 500 });
    }

    return NextResponse.json({ blueprint: data as ProjectBlueprint });
  } catch (error) {
    console.error('[PUT /api/blueprint/palette] Error:', error);
    return NextResponse.json({ error: 'Failed to update palette' }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { isAuthenticated } from '@/lib/auth';
import { getConcept, updateConcept, deleteConcept, WireframeData, ExportHistoryItem } from '@/lib/supabase';

// GET /api/concepts/[id] - Get a single concept
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authed = await isAuthenticated();
  if (!authed) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;

  try {
    const concept = await getConcept(id);

    if (!concept) {
      return NextResponse.json(
        { error: 'Concept not found', id, debug: 'getConcept returned null' },
        { status: 404 }
      );
    }

    return NextResponse.json({ concept });
  } catch (error) {
    console.error('Error in GET /api/concepts/[id]:', error);
    return NextResponse.json(
      { error: 'Internal server error', message: String(error) },
      { status: 500 }
    );
  }
}

// PUT /api/concepts/[id] - Update a concept
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authed = await isAuthenticated();
  if (!authed) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;

  try {
    const body = await request.json();
    const { name, description, linked_project_ids, wireframe_data, export_history } = body as {
      name?: string;
      description?: string;
      linked_project_ids?: string[];
      wireframe_data?: WireframeData;
      export_history?: ExportHistoryItem[];
    };

    const updates: Record<string, unknown> = {};
    if (name !== undefined) updates.name = name;
    if (description !== undefined) updates.description = description;
    if (linked_project_ids !== undefined) updates.linked_project_ids = linked_project_ids;
    if (wireframe_data !== undefined) updates.wireframe_data = wireframe_data;
    if (export_history !== undefined) updates.export_history = export_history;

    const concept = await updateConcept(id, updates);

    if (!concept) {
      return NextResponse.json(
        { error: 'Failed to update concept' },
        { status: 500 }
      );
    }

    return NextResponse.json({ concept, success: true });
  } catch (error) {
    console.error('Error updating concept:', error);
    return NextResponse.json(
      { error: 'Failed to update concept' },
      { status: 500 }
    );
  }
}

// DELETE /api/concepts/[id] - Delete a concept
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authed = await isAuthenticated();
  if (!authed) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const success = await deleteConcept(id);

  if (!success) {
    return NextResponse.json(
      { error: 'Failed to delete concept' },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true });
}

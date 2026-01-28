import { NextRequest, NextResponse } from 'next/server';
import { isAuthenticated } from '@/lib/auth';
import { getConcepts, createConcept, CreateConceptInput } from '@/lib/supabase';

// GET /api/concepts - List all concepts
export async function GET() {
  const authed = await isAuthenticated();
  if (!authed) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const concepts = await getConcepts();
  return NextResponse.json({ concepts });
}

// POST /api/concepts - Create a new concept
export async function POST(request: NextRequest) {
  const authed = await isAuthenticated();
  if (!authed) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { name, description, linked_project_ids } = body as CreateConceptInput;

    if (!name) {
      return NextResponse.json(
        { error: 'Name is required' },
        { status: 400 }
      );
    }

    const concept = await createConcept({
      name,
      description,
      linked_project_ids,
    });

    if (!concept) {
      return NextResponse.json(
        { error: 'Failed to create concept' },
        { status: 500 }
      );
    }

    return NextResponse.json({ concept, success: true });
  } catch (error) {
    console.error('Error creating concept:', error);
    return NextResponse.json(
      { error: 'Failed to create concept' },
      { status: 500 }
    );
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { isAuthenticated } from '@/lib/auth';
import {
  getOpportunityById,
  getOpportunityHistory,
  selectOpportunity,
  markBlueprintGenerated,
} from '@/lib/opportunity';

// GET /api/opportunity/[id] - Get opportunity by ID
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authed = await isAuthenticated();
  if (!authed) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { id } = await params;
    const searchParams = request.nextUrl.searchParams;
    const includeHistory = searchParams.get('history') === 'true';

    const opportunity = await getOpportunityById(id);

    if (!opportunity) {
      return NextResponse.json(
        { error: 'Opportunity not found' },
        { status: 404 }
      );
    }

    let history = null;
    if (includeHistory) {
      history = await getOpportunityHistory(id);
    }

    return NextResponse.json({
      success: true,
      data: {
        ...opportunity,
        history,
      },
    });
  } catch (error) {
    console.error('Error getting opportunity:', error);
    return NextResponse.json(
      { error: 'Failed to get opportunity' },
      { status: 500 }
    );
  }
}

// PATCH /api/opportunity/[id] - Update opportunity status
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authed = await isAuthenticated();
  if (!authed) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { id } = await params;
    const body = await request.json();
    const { action, blueprint_id } = body as {
      action: 'select' | 'blueprint';
      blueprint_id?: string;
    };

    if (!action) {
      return NextResponse.json(
        { error: 'action is required (select or blueprint)' },
        { status: 400 }
      );
    }

    let result = null;

    if (action === 'select') {
      result = await selectOpportunity(id);
    } else if (action === 'blueprint') {
      if (!blueprint_id) {
        return NextResponse.json(
          { error: 'blueprint_id is required for blueprint action' },
          { status: 400 }
        );
      }
      result = await markBlueprintGenerated(id, blueprint_id);
    } else {
      return NextResponse.json(
        { error: 'Invalid action. Use "select" or "blueprint"' },
        { status: 400 }
      );
    }

    if (!result) {
      return NextResponse.json(
        { error: 'Failed to update opportunity' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error('Error updating opportunity:', error);
    return NextResponse.json(
      { error: 'Failed to update opportunity' },
      { status: 500 }
    );
  }
}

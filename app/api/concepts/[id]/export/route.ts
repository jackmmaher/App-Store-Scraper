import { NextRequest, NextResponse } from 'next/server';
import { isAuthenticated } from '@/lib/auth';
import { getConcept, getProjectsByIds } from '@/lib/supabase';
import { generateExportSpec } from '@/lib/wireframe-export';

// GET /api/concepts/[id]/export - Generate export spec
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authed = await isAuthenticated();
  if (!authed) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const concept = await getConcept(id);

  if (!concept) {
    return NextResponse.json(
      { error: 'Concept not found' },
      { status: 404 }
    );
  }

  // Fetch linked projects
  const linkedProjects = await getProjectsByIds(concept.linked_project_ids);

  // Generate the export spec
  const spec = generateExportSpec({
    conceptName: concept.name,
    conceptDescription: concept.description || undefined,
    linkedProjects,
    wireframeData: concept.wireframe_data,
  });

  return NextResponse.json({
    spec,
    conceptName: concept.name,
    screensCount: Object.keys(concept.wireframe_data.screens).length,
    linkedProjectsCount: linkedProjects.length,
  });
}

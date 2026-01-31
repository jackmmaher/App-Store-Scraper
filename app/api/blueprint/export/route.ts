import { NextRequest, NextResponse } from 'next/server';
import { isAuthenticated } from '@/lib/auth';
import { getBlueprint, getProject } from '@/lib/supabase';
import JSZip from 'jszip';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET /api/blueprint/export?id=xxx - Download ZIP with markdown files + BUILD_MANIFEST
export async function GET(request: NextRequest) {
  const authed = await isAuthenticated();
  if (!authed) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const blueprintId = request.nextUrl.searchParams.get('id');
  if (!blueprintId) {
    return NextResponse.json({ error: 'Blueprint ID required' }, { status: 400 });
  }

  try {
    // Fetch blueprint
    const blueprint = await getBlueprint(blueprintId);
    if (!blueprint) {
      return NextResponse.json({ error: 'Blueprint not found' }, { status: 404 });
    }

    // Fetch project for naming
    const project = await getProject(blueprint.project_id);
    const appName = project?.app_name || 'App';
    const safeName = appName.replace(/[^a-z0-9]/gi, '-').toLowerCase();

    // Create ZIP
    const zip = new JSZip();

    // Add section files (only if content exists)
    // Section 1: Strategy
    if (blueprint.pareto_strategy) {
      const header = `# ${appName} - Strategy\n\nGenerated: ${blueprint.pareto_generated_at || 'Unknown'}\n\n---\n\n`;
      zip.file('1-strategy.md', header + blueprint.pareto_strategy);
    } else {
      zip.file('1-strategy.md', '# Strategy\n\n*Not yet generated*');
    }

    // Section 2: App Identity
    if (blueprint.app_identity) {
      const header = `# ${appName} - App Identity\n\nGenerated: ${blueprint.app_identity_generated_at || 'Unknown'}\n\n---\n\n`;
      zip.file('2-identity.md', header + blueprint.app_identity);
    } else {
      zip.file('2-identity.md', '# App Identity\n\n*Not yet generated*');
    }

    // Section 3: Design System
    if (blueprint.design_system) {
      const header = `# ${appName} - Design System\n\nGenerated: ${blueprint.design_system_generated_at || 'Unknown'}\n\n---\n\n`;
      zip.file('3-design-system.md', header + blueprint.design_system);
    } else {
      zip.file('3-design-system.md', '# Design System\n\n*Not yet generated*');
    }

    // Section 4: Wireframes
    if (blueprint.ui_wireframes) {
      const header = `# ${appName} - UI Wireframes\n\nGenerated: ${blueprint.ui_wireframes_generated_at || 'Unknown'}\n\n---\n\n`;
      zip.file('4-wireframes.md', header + blueprint.ui_wireframes);
    } else {
      zip.file('4-wireframes.md', '# UI Wireframes\n\n*Not yet generated*');
    }

    // Section 5: Tech Stack
    if (blueprint.tech_stack) {
      const header = `# ${appName} - Tech Stack\n\nGenerated: ${blueprint.tech_stack_generated_at || 'Unknown'}\n\n---\n\n`;
      zip.file('5-techstack.md', header + blueprint.tech_stack);
    } else {
      zip.file('5-techstack.md', '# Tech Stack\n\n*Not yet generated*');
    }

    // Section 6: Xcode Setup
    if (blueprint.xcode_setup) {
      const header = `# ${appName} - Xcode Setup\n\nGenerated: ${blueprint.xcode_setup_generated_at || 'Unknown'}\n\n---\n\n`;
      zip.file('6-xcode-setup.md', header + blueprint.xcode_setup);
    } else {
      zip.file('6-xcode-setup.md', '# Xcode Setup\n\n*Not yet generated*');
    }

    // Section 7: PRD
    if (blueprint.prd_content) {
      const header = `# ${appName} - Product Requirements Document\n\nGenerated: ${blueprint.prd_generated_at || 'Unknown'}\n\n---\n\n`;
      zip.file('7-prd.md', header + blueprint.prd_content);
    } else {
      zip.file('7-prd.md', '# PRD\n\n*Not yet generated*');
    }

    // Section 8: ASO
    if (blueprint.aso_content) {
      const header = `# ${appName} - App Store Optimization\n\nGenerated: ${blueprint.aso_generated_at || 'Unknown'}\n\n---\n\n`;
      zip.file('8-aso.md', header + blueprint.aso_content);
    } else {
      zip.file('8-aso.md', '# ASO\n\n*Not yet generated*');
    }

    // Section 9: BUILD_MANIFEST
    if (blueprint.build_manifest) {
      const header = `# ${appName} - BUILD MANIFEST\n\nGenerated: ${blueprint.build_manifest_generated_at || 'Unknown'}\n\n> **Instructions for AI Assistant**: Complete these tasks IN ORDER. Do not skip any task.\n> Each task should be completed fully before moving to the next.\n\n---\n\n`;
      zip.file('9-build-manifest.md', header + blueprint.build_manifest);
    } else {
      zip.file('9-build-manifest.md', '# BUILD MANIFEST\n\n*Not yet generated - generate from the Blueprint tab*');
    }

    // Add a combined document
    const combined = [
      `# ${appName} - Complete Blueprint`,
      ``,
      `Generated: ${new Date().toISOString()}`,
      ``,
      `---`,
      ``,
      `## Table of Contents`,
      `1. [Strategy](#1-strategy)`,
      `2. [App Identity](#2-app-identity)`,
      `3. [Design System](#3-design-system)`,
      `4. [UI Wireframes](#4-ui-wireframes)`,
      `5. [Tech Stack](#5-tech-stack)`,
      `6. [Xcode Setup](#6-xcode-setup)`,
      `7. [PRD](#7-product-requirements-document)`,
      `8. [ASO](#8-app-store-optimization)`,
      `9. [BUILD MANIFEST](#9-build-manifest)`,
      ``,
      `---`,
      ``,
      `# 1. Strategy`,
      ``,
      blueprint.pareto_strategy || '*Not yet generated*',
      ``,
      `---`,
      ``,
      `# 2. App Identity`,
      ``,
      blueprint.app_identity || '*Not yet generated*',
      ``,
      `---`,
      ``,
      `# 3. Design System`,
      ``,
      blueprint.design_system || '*Not yet generated*',
      ``,
      `---`,
      ``,
      `# 4. UI Wireframes`,
      ``,
      blueprint.ui_wireframes || '*Not yet generated*',
      ``,
      `---`,
      ``,
      `# 5. Tech Stack`,
      ``,
      blueprint.tech_stack || '*Not yet generated*',
      ``,
      `---`,
      ``,
      `# 6. Xcode Setup`,
      ``,
      blueprint.xcode_setup || '*Not yet generated*',
      ``,
      `---`,
      ``,
      `# 7. Product Requirements Document`,
      ``,
      blueprint.prd_content || '*Not yet generated*',
      ``,
      `---`,
      ``,
      `# 8. App Store Optimization`,
      ``,
      blueprint.aso_content || '*Not yet generated*',
      ``,
      `---`,
      ``,
      `# 9. BUILD MANIFEST`,
      ``,
      blueprint.build_manifest || '*Not yet generated - generate from the Blueprint tab*',
    ].join('\n');

    zip.file('0-complete-blueprint.md', combined);

    // Generate ZIP as blob
    const zipBlob = await zip.generateAsync({ type: 'blob' });

    // Return as download
    return new Response(zipBlob, {
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${safeName}-blueprint.zip"`,
      },
    });
  } catch (error) {
    console.error('[GET /api/blueprint/export] Error:', error);
    return NextResponse.json({ error: 'Failed to export blueprint' }, { status: 500 });
  }
}

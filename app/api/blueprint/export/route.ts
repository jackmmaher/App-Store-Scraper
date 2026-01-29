import { NextRequest, NextResponse } from 'next/server';
import { isAuthenticated } from '@/lib/auth';
import { getBlueprint, getProject } from '@/lib/supabase';
import { getBuildManifestPrompt } from '@/lib/blueprint-prompts';
import JSZip from 'jszip';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120; // 2 minutes for BUILD_MANIFEST generation

// Generate BUILD_MANIFEST using Claude API
async function generateBuildManifest(
  appName: string,
  paretoStrategy: string,
  uiWireframes: string,
  techStack: string
): Promise<string | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error('[BUILD_MANIFEST] Missing ANTHROPIC_API_KEY');
    return null;
  }

  try {
    const prompt = getBuildManifestPrompt(appName, paretoStrategy, uiWireframes, techStack);

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 16000,
        messages: [
          { role: 'user', content: prompt }
        ],
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      console.error('[BUILD_MANIFEST] Claude API error:', error);
      return null;
    }

    const data = await response.json();

    // Extract text content from response
    const textContent = data.content?.find((block: { type: string }) => block.type === 'text');
    if (textContent && textContent.text) {
      return textContent.text;
    }
    return null;
  } catch (error) {
    console.error('[BUILD_MANIFEST] Error generating manifest:', error);
    return null;
  }
}

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
    if (blueprint.pareto_strategy) {
      const header = `# ${appName} - Pareto Strategy\n\nGenerated: ${blueprint.pareto_generated_at || 'Unknown'}\n\n---\n\n`;
      zip.file('1-strategy.md', header + blueprint.pareto_strategy);
    } else {
      zip.file('1-strategy.md', '# Pareto Strategy\n\n*Not yet generated*');
    }

    if (blueprint.ui_wireframes) {
      const header = `# ${appName} - UI Wireframes\n\nGenerated: ${blueprint.ui_wireframes_generated_at || 'Unknown'}\n\n---\n\n`;
      zip.file('2-wireframes.md', header + blueprint.ui_wireframes);
    } else {
      zip.file('2-wireframes.md', '# UI Wireframes\n\n*Not yet generated*');
    }

    if (blueprint.tech_stack) {
      const header = `# ${appName} - Tech Stack\n\nGenerated: ${blueprint.tech_stack_generated_at || 'Unknown'}\n\n---\n\n`;
      zip.file('3-techstack.md', header + blueprint.tech_stack);
    } else {
      zip.file('3-techstack.md', '# Tech Stack\n\n*Not yet generated*');
    }

    if (blueprint.prd_content) {
      const header = `# ${appName} - Product Requirements Document\n\nGenerated: ${blueprint.prd_generated_at || 'Unknown'}\n\n---\n\n`;
      zip.file('4-prd.md', header + blueprint.prd_content);
    } else {
      zip.file('4-prd.md', '# PRD\n\n*Not yet generated*');
    }

    // Generate BUILD_MANIFEST if all 3 source documents exist
    let buildManifest: string | null = null;
    if (blueprint.pareto_strategy && blueprint.ui_wireframes && blueprint.tech_stack) {
      console.log('[EXPORT] Generating BUILD_MANIFEST...');
      buildManifest = await generateBuildManifest(
        appName,
        blueprint.pareto_strategy,
        blueprint.ui_wireframes,
        blueprint.tech_stack
      );

      if (buildManifest) {
        const header = `# ${appName} - BUILD MANIFEST\n\nGenerated: ${new Date().toISOString()}\n\n> **Instructions for AI Assistant**: Complete these tasks IN ORDER. Do not skip any task.\n> Each task should be completed fully before moving to the next.\n\n---\n\n`;
        zip.file('5-build-manifest.md', header + buildManifest);
        console.log('[EXPORT] BUILD_MANIFEST generated successfully');
      } else {
        zip.file('5-build-manifest.md', '# BUILD MANIFEST\n\n*Generation failed - please regenerate the source documents and try again*');
        console.log('[EXPORT] BUILD_MANIFEST generation failed');
      }
    } else {
      zip.file('5-build-manifest.md', '# BUILD MANIFEST\n\n*Requires completed Pareto Strategy, UI Wireframes, and Tech Stack sections*');
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
      `1. [Pareto Strategy](#1-pareto-strategy)`,
      `2. [UI Wireframes](#2-ui-wireframes)`,
      `3. [Tech Stack](#3-tech-stack)`,
      `4. [PRD](#4-product-requirements-document)`,
      `5. [BUILD MANIFEST](#5-build-manifest)`,
      ``,
      `---`,
      ``,
      `# 1. Pareto Strategy`,
      ``,
      blueprint.pareto_strategy || '*Not yet generated*',
      ``,
      `---`,
      ``,
      `# 2. UI Wireframes`,
      ``,
      blueprint.ui_wireframes || '*Not yet generated*',
      ``,
      `---`,
      ``,
      `# 3. Tech Stack`,
      ``,
      blueprint.tech_stack || '*Not yet generated*',
      ``,
      `---`,
      ``,
      `# 4. Product Requirements Document`,
      ``,
      blueprint.prd_content || '*Not yet generated*',
      ``,
      `---`,
      ``,
      `# 5. BUILD MANIFEST`,
      ``,
      buildManifest || '*Not yet generated - requires completed Pareto Strategy, UI Wireframes, and Tech Stack*',
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

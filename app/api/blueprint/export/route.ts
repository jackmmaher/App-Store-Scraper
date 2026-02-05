import { NextRequest, NextResponse } from 'next/server';
import { isAuthenticated } from '@/lib/auth';
import { getBlueprint, getProject, getBlueprintAttachments } from '@/lib/supabase';
import { extractAppNameFromIdentity } from '@/lib/blueprint-prompts';
import JSZip from 'jszip';
import { extractDesignTokens, extractDataModels, extractScreens, extractFeatures, extractAppConfig } from '@/lib/export/spec-generators';
import { generateDesignTokensSwift, generateAppEntrySwift } from '@/lib/export/swift-templates';
import { generateColorAssets } from '@/lib/export/asset-catalog-generator';
import { generateClaudeMd } from '@/lib/export/claude-md-generator';
import { generateProgressMd } from '@/lib/export/progress-generator';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Remove special chars and convert to lowercase-kebab for directory/file names. */
function toSafeName(name: string): string {
  return name.replace(/[^a-z0-9]/gi, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').toLowerCase();
}

/** Convert app name to PascalCase for valid Swift identifier. */
function toPascalCase(name: string): string {
  return name
    .replace(/[^a-zA-Z0-9\s]/g, '')
    .split(/\s+/)
    .filter(Boolean)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join('');
}

/** Extract the first paragraph from PRD content as a summary. */
function extractPrdSummary(prdContent: string | null): string {
  if (!prdContent) return '';
  // Skip headings and blank lines, grab the first real paragraph
  const lines = prdContent.split('\n');
  const paragraphLines: string[] = [];
  let started = false;

  for (const line of lines) {
    const trimmed = line.trim();
    // Skip headings
    if (trimmed.startsWith('#')) continue;
    // Skip empty lines before content starts
    if (!started && !trimmed) continue;
    // Break on empty line after content
    if (started && !trimmed) break;
    // Skip markdown separators
    if (/^[-=*]{3,}$/.test(trimmed)) continue;
    // Skip bold labels like **App Name:** etc.
    if (/^\*\*[^*]+:\*\*/.test(trimmed) && !started) continue;

    started = true;
    paragraphLines.push(trimmed);
  }

  return paragraphLines.join(' ').slice(0, 500);
}

// ---------------------------------------------------------------------------
// GET /api/blueprint/export?id=xxx
// ---------------------------------------------------------------------------

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
    // 1. Fetch blueprint and project
    const blueprint = await getBlueprint(blueprintId);
    if (!blueprint) {
      return NextResponse.json({ error: 'Blueprint not found' }, { status: 404 });
    }

    const project = await getProject(blueprint.project_id);

    // 2. Extract app name
    const chosenAppName = blueprint.app_identity
      ? extractAppNameFromIdentity(blueprint.app_identity)
      : null;
    const appName = chosenAppName || 'My App';
    const safeName = toSafeName(appName);
    const safePascalName = toPascalCase(appName) || 'MyApp';

    // 3. Generate specs from markdown (with fallback defaults)
    let designTokens;
    try {
      designTokens = extractDesignTokens(blueprint.design_system || '');
    } catch {
      designTokens = extractDesignTokens('');
    }

    let dataModels;
    try {
      dataModels = extractDataModels(blueprint.tech_stack || '');
    } catch {
      dataModels = extractDataModels('');
    }

    let screens;
    try {
      screens = extractScreens(blueprint.ui_wireframes || '', blueprint.tech_stack || '');
    } catch {
      screens = extractScreens('', '');
    }

    let features;
    try {
      features = extractFeatures(blueprint.prd_content || '');
    } catch {
      features = extractFeatures('');
    }

    let appConfig;
    try {
      appConfig = extractAppConfig(appName, blueprint.tech_stack || '', blueprint.xcode_setup, blueprint.app_identity || '');
    } catch {
      appConfig = extractAppConfig(appName, '', null, '');
    }

    // 4. Generate Swift files
    const designTokensSwift = generateDesignTokensSwift(designTokens, appName);
    const appEntrySwift = generateAppEntrySwift(appName, appConfig, dataModels);
    const colorAssets = generateColorAssets(designTokens);

    // 5. Generate CLAUDE.md
    const prdSummary = extractPrdSummary(blueprint.prd_content);
    const claudeMd = generateClaudeMd(appName, prdSummary, appConfig, features.features.length, screens.screens.length);

    // 6. Generate PROGRESS.md
    const progressMd = generateProgressMd(blueprint.build_manifest || '', appName);

    // 7. Build ZIP
    const zip = new JSZip();
    const rootDir = `${safeName}-blueprint`;

    // ── CLAUDE.md at root ─────────────────────────────────────────────────
    zip.file(`${rootDir}/CLAUDE.md`, claudeMd);

    // ── BUILD_MANIFEST.md ─────────────────────────────────────────────────
    const manifestHeader = `# ${appName} - BUILD MANIFEST\n\n> **Instructions for AI Assistant**: Complete these tasks IN ORDER. Do not skip any task.\n> Each task should be completed fully before moving to the next.\n> Update PROGRESS.md after completing each task.\n\n---\n\n`;
    const manifestContent = blueprint.build_manifest
      ? manifestHeader + blueprint.build_manifest
      : `# ${appName} - BUILD MANIFEST\n\n*Not yet generated - generate from the Blueprint tab in App Store Scraper.*\n`;
    zip.file(`${rootDir}/BUILD_MANIFEST.md`, manifestContent);

    // ── PROGRESS.md ───────────────────────────────────────────────────────
    zip.file(`${rootDir}/PROGRESS.md`, progressMd);

    // ── specs/*.json ──────────────────────────────────────────────────────
    zip.file(`${rootDir}/specs/app-config.json`, JSON.stringify(appConfig, null, 2));
    zip.file(`${rootDir}/specs/design-tokens.json`, JSON.stringify(designTokens, null, 2));

    // Typography subset for convenience
    const typographySubset = {
      fontFamily: designTokens.typography.fontFamily,
      scale: designTokens.typography.scale,
    };
    zip.file(`${rootDir}/specs/typography.json`, JSON.stringify(typographySubset, null, 2));

    zip.file(`${rootDir}/specs/data-models.json`, JSON.stringify(dataModels, null, 2));
    zip.file(`${rootDir}/specs/screens.json`, JSON.stringify(screens, null, 2));
    zip.file(`${rootDir}/specs/features.json`, JSON.stringify(features, null, 2));

    // Pain points & feature matrix from project data if available
    const painPointRegistry = project?.pain_point_registry as { painPoints?: unknown[]; featureMatrix?: unknown } | null | undefined;
    zip.file(
      `${rootDir}/specs/pain-points.json`,
      JSON.stringify(
        painPointRegistry?.painPoints || [],
        null,
        2
      )
    );
    zip.file(
      `${rootDir}/specs/feature-matrix.json`,
      JSON.stringify(
        painPointRegistry?.featureMatrix || { features: [], competitors: [] },
        null,
        2
      )
    );

    // ── blueprint/ markdown files ─────────────────────────────────────────
    if (blueprint.pareto_strategy) {
      zip.file(`${rootDir}/blueprint/01-strategy.md`, blueprint.pareto_strategy);
    }
    if (blueprint.app_identity) {
      zip.file(`${rootDir}/blueprint/02-identity.md`, blueprint.app_identity);
    }
    if (blueprint.design_system) {
      zip.file(`${rootDir}/blueprint/03-design-system.md`, blueprint.design_system);
    }
    if (blueprint.ui_wireframes) {
      zip.file(`${rootDir}/blueprint/04-wireframes.md`, blueprint.ui_wireframes);
    }
    if (blueprint.prd_content) {
      zip.file(`${rootDir}/blueprint/05-prd.md`, blueprint.prd_content);
    }
    if (blueprint.aso_content) {
      zip.file(`${rootDir}/blueprint/06-aso.md`, blueprint.aso_content);
    }

    // ── Swift source skeleton ─────────────────────────────────────────────
    const swiftDir = `${rootDir}/${safePascalName}`;

    // App entry point
    zip.file(`${swiftDir}/${safePascalName}App.swift`, appEntrySwift);

    // Design tokens theme file
    zip.file(`${swiftDir}/Theme/DesignTokens.swift`, designTokensSwift);

    // Asset catalog color sets
    for (const asset of colorAssets) {
      zip.file(`${swiftDir}/Assets.xcassets/${asset.path}`, asset.contents);
    }

    // Empty directories with .gitkeep
    zip.file(`${swiftDir}/Views/.gitkeep`, '');
    zip.file(`${swiftDir}/Models/.gitkeep`, '');
    zip.file(`${swiftDir}/Services/.gitkeep`, '');

    // ── Assets from storage (existing attachments) ────────────────────────
    const attachments = await getBlueprintAttachments(blueprintId);
    if (attachments.length > 0) {
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;

      for (const attachment of attachments) {
        try {
          const publicUrl = `${supabaseUrl}/storage/v1/object/public/blueprint-attachments/${attachment.storage_path}`;
          const response = await fetch(publicUrl);
          if (response.ok) {
            const arrayBuffer = await response.arrayBuffer();

            // Organize by section
            const sectionFolder = attachment.section === 'identity' ? 'icons' : attachment.section;
            zip.file(
              `${rootDir}/assets/${sectionFolder}/${attachment.file_name}`,
              arrayBuffer
            );

            console.log(`[Export] Added attachment: ${sectionFolder}/${attachment.file_name}`);
          } else {
            console.warn(`[Export] Failed to fetch attachment: ${attachment.file_name}`);
          }
        } catch (err) {
          console.error(`[Export] Error fetching attachment ${attachment.file_name}:`, err);
        }
      }
    }

    // ── Generate ZIP ──────────────────────────────────────────────────────
    const zipBlob = await zip.generateAsync({ type: 'blob' });

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

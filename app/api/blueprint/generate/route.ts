import { NextRequest, NextResponse } from 'next/server';
import { isAuthenticated } from '@/lib/auth';
import {
  getBlueprint,
  getProject,
  updateBlueprintSectionStatus,
  updateBlueprintSection,
  updateBlueprintPalette,
  getBlueprintSectionAttachments,
  type BlueprintSection,
  type BlueprintColorPalette,
} from '@/lib/supabase';
import { getBlueprintPrompt, getBlueprintPromptWithEnrichment, getBuildManifestPrompt } from '@/lib/blueprint-prompts';
import { getColorPalettesForDesignSystem, type ColorPalette } from '@/lib/crawl';

// Sections that need a color palette
const COLOR_SECTIONS: BlueprintSection[] = ['identity', 'design_system', 'wireframes', 'aso'];

// Category to palette mapping for auto-selection
const CATEGORY_PALETTES: Record<string, BlueprintColorPalette> = {
  // Professional/Business
  'Finance': { colors: ['1D3557', '457B9D', 'A8DADC', 'F1FAEE', 'E63946'], mood: 'professional' },
  'Business': { colors: ['003049', 'D62828', 'F77F00', 'FCBF49', 'EAE2B7'], mood: 'professional' },
  'Productivity': { colors: ['264653', '2A9D8F', 'E9C46A', 'F4A261', 'E76F51'], mood: 'professional' },

  // Health & Wellness
  'Health & Fitness': { colors: ['606C38', '283618', 'FEFAE0', 'DDA15E', 'BC6C25'], mood: 'calm' },
  'Medical': { colors: ['CCD5AE', 'E9EDC9', 'FEFAE0', 'FAEDCD', 'D4A373'], mood: 'calm' },
  'Lifestyle': { colors: ['D4A373', 'CCD5AE', 'E9EDC9', 'FEFAE0', 'FAEDCD'], mood: 'warm' },

  // Creative/Entertainment
  'Entertainment': { colors: ['FF6B6B', '4ECDC4', '45B7D1', '96CEB4', 'FFEAA7'], mood: 'playful' },
  'Games': { colors: ['F72585', 'B5179E', '7209B7', '560BAD', '480CA8'], mood: 'bold' },
  'Photo & Video': { colors: ['0D1B2A', '1B263B', '415A77', '778DA9', 'E0E1DD'], mood: 'dark' },
  'Music': { colors: ['14213D', 'FCA311', 'E5E5E5', '000000', 'FFFFFF'], mood: 'bold' },

  // Social
  'Social Networking': { colors: ['FFBE0B', 'FB5607', 'FF006E', '8338EC', '3A86FF'], mood: 'playful' },

  // Education
  'Education': { colors: ['03045E', '0077B6', '00B4D8', '90E0EF', 'CAF0F8'], mood: 'cool' },
  'Books': { colors: ['606C38', '283618', 'FEFAE0', 'DDA15E', 'BC6C25'], mood: 'calm' },

  // Utility
  'Utilities': { colors: ['212529', '343A40', '495057', '6C757D', 'ADB5BD'], mood: 'dark' },
  'Developer Tools': { colors: ['0D1B2A', '1B263B', '415A77', '778DA9', 'E0E1DD'], mood: 'dark' },

  // Shopping/Food
  'Shopping': { colors: ['FF6B6B', '4ECDC4', '45B7D1', '96CEB4', 'FFEAA7'], mood: 'warm' },
  'Food & Drink': { colors: ['D4A373', 'CCD5AE', 'E9EDC9', 'FEFAE0', 'FAEDCD'], mood: 'warm' },

  // Travel
  'Travel': { colors: ['FFBE0B', 'FB5607', 'FF006E', '8338EC', '3A86FF'], mood: 'playful' },
};

// Default palette if category not matched
const DEFAULT_PALETTE: BlueprintColorPalette = {
  colors: ['264653', '2A9D8F', 'E9C46A', 'F4A261', 'E76F51'],
  mood: 'professional'
};

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300; // 5 minutes for Build Manifest generation

// POST /api/blueprint/generate - Stream-generate a section
export async function POST(request: NextRequest) {
  const authed = await isAuthenticated();
  if (!authed) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'Claude API key not configured' }, { status: 500 });
  }

  try {
    const body = await request.json();
    const { blueprintId, section } = body as {
      blueprintId: string;
      section: BlueprintSection;
    };

    if (!blueprintId || !section) {
      return NextResponse.json({ error: 'blueprintId and section required' }, { status: 400 });
    }

    const validSections: BlueprintSection[] = ['pareto', 'identity', 'design_system', 'wireframes', 'tech_stack', 'xcode_setup', 'prd', 'aso', 'manifest'];
    if (!validSections.includes(section)) {
      return NextResponse.json({ error: 'Invalid section' }, { status: 400 });
    }

    // Fetch blueprint
    const blueprint = await getBlueprint(blueprintId);
    if (!blueprint) {
      return NextResponse.json({ error: 'Blueprint not found' }, { status: 404 });
    }

    // Fetch project
    const project = await getProject(blueprint.project_id);
    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    // Check dependencies
    if (section === 'identity' && !blueprint.pareto_strategy) {
      return NextResponse.json({ error: 'Generate Strategy first' }, { status: 400 });
    }
    if (section === 'design_system' && !blueprint.app_identity) {
      return NextResponse.json({ error: 'Generate App Identity first' }, { status: 400 });
    }
    if (section === 'wireframes' && (!blueprint.pareto_strategy || !blueprint.design_system)) {
      return NextResponse.json({ error: 'Generate Strategy and Design System first' }, { status: 400 });
    }
    if (section === 'tech_stack' && (!blueprint.pareto_strategy || !blueprint.ui_wireframes)) {
      return NextResponse.json({ error: 'Generate Strategy and Wireframes first' }, { status: 400 });
    }
    if (section === 'xcode_setup' && (!blueprint.tech_stack || !blueprint.app_identity)) {
      return NextResponse.json({ error: 'Generate Tech Stack and App Identity first' }, { status: 400 });
    }
    if (section === 'prd' && (!blueprint.pareto_strategy || !blueprint.ui_wireframes || !blueprint.tech_stack)) {
      return NextResponse.json({ error: 'Generate Strategy, Wireframes, and Tech Stack first' }, { status: 400 });
    }
    if (section === 'aso' && (!blueprint.prd_content || !blueprint.app_identity || !blueprint.design_system)) {
      return NextResponse.json({ error: 'Generate PRD, App Identity, and Design System first' }, { status: 400 });
    }
    if (section === 'manifest' && (!blueprint.pareto_strategy || !blueprint.ui_wireframes || !blueprint.tech_stack || !blueprint.prd_content)) {
      return NextResponse.json({ error: 'Generate Strategy, Wireframes, Tech Stack, and PRD first' }, { status: 400 });
    }

    // Get attachments for wireframes section
    const attachments = section === 'wireframes'
      ? await getBlueprintSectionAttachments(blueprintId, 'wireframes')
      : [];

    // Auto-select color palette for color-related sections if not already set
    let colorPalette = blueprint.color_palette;
    if (COLOR_SECTIONS.includes(section) && !colorPalette?.colors?.length) {
      const category = project.app_primary_genre || '';
      console.log(`[Blueprint] No palette set, auto-selecting for category "${category}"...`);

      // Try to fetch from Coolors via crawl service directly (not via API route)
      let selectedPalette: BlueprintColorPalette | null = null;
      try {
        const palettePromptText = await getColorPalettesForDesignSystem(category, undefined, 1);

        // Parse the first palette from the prompt text
        const paletteMatch = palettePromptText.match(/\*\*Palette \d+\*\*\s*\(([^)]+)\):\s*((?:`#[A-Fa-f0-9]{6}`\s*\|?\s*)+)/);
        if (paletteMatch) {
          const mood = paletteMatch[1].trim();
          const colorsStr = paletteMatch[2];
          const colors: string[] = [];
          const hexPattern = /#([A-Fa-f0-9]{6})/g;
          let hexMatch;
          while ((hexMatch = hexPattern.exec(colorsStr)) !== null) {
            colors.push(hexMatch[1].toUpperCase());
          }

          if (colors.length > 0) {
            selectedPalette = { colors, mood };
            console.log(`[Blueprint] Selected Coolors palette:`, selectedPalette.colors);
          }
        }
      } catch (error) {
        console.error('[Blueprint] Failed to fetch Coolors palettes:', error);
      }

      // Fallback to category-based palette if Coolors failed
      if (!selectedPalette) {
        selectedPalette = CATEGORY_PALETTES[category] || DEFAULT_PALETTE;
        console.log(`[Blueprint] Using fallback palette for "${category}":`, selectedPalette.colors);
      }

      // Save the auto-selected palette to the database
      const updated = await updateBlueprintPalette(blueprintId, selectedPalette, 'auto');
      if (updated) {
        colorPalette = updated.color_palette;
      } else {
        colorPalette = selectedPalette;
      }
    }

    // Build prompt - manifest uses a different prompt function
    // For pareto, design_system, and aso, use async version with enrichment (palettes, reviews, keywords)
    const sectionsNeedingEnrichment = ['pareto', 'design_system', 'aso'];
    let prompt: string;

    if (section === 'manifest') {
      prompt = getBuildManifestPrompt(
        project.app_name,
        blueprint.pareto_strategy!,
        blueprint.ui_wireframes!,
        blueprint.tech_stack!
      );
    } else if (sectionsNeedingEnrichment.includes(section)) {
      // Use async version with enrichment (color palettes for design_system, reviews for pareto)
      prompt = await getBlueprintPromptWithEnrichment(
        section as 'pareto' | 'identity' | 'design_system' | 'wireframes' | 'tech_stack' | 'xcode_setup' | 'prd' | 'aso',
        project,
        {
          paretoStrategy: blueprint.pareto_strategy || undefined,
          appIdentity: blueprint.app_identity || undefined,
          designSystem: blueprint.design_system || undefined,
          uiWireframes: blueprint.ui_wireframes || undefined,
          techStack: blueprint.tech_stack || undefined,
          prd: blueprint.prd_content || undefined,
        },
        attachments,
        colorPalette
      );
    } else {
      prompt = getBlueprintPrompt(
        section as 'pareto' | 'identity' | 'design_system' | 'wireframes' | 'tech_stack' | 'xcode_setup' | 'prd' | 'aso',
        project,
        {
          paretoStrategy: blueprint.pareto_strategy || undefined,
          appIdentity: blueprint.app_identity || undefined,
          designSystem: blueprint.design_system || undefined,
          uiWireframes: blueprint.ui_wireframes || undefined,
          techStack: blueprint.tech_stack || undefined,
          prd: blueprint.prd_content || undefined,
        },
        attachments,
        colorPalette
      );
    }

    // Update status to generating
    await updateBlueprintSectionStatus(blueprintId, section, 'generating');

    // Create SSE stream
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const sendEvent = (type: string, data: Record<string, unknown>) => {
          const event = `data: ${JSON.stringify({ type, ...data })}\n\n`;
          controller.enqueue(encoder.encode(event));
        };

        let fullContent = '';
        let lastSaveTime = Date.now();
        const SAVE_INTERVAL = 30000; // Save every 30 seconds as backup

        // Send heartbeat to keep connection alive during long Claude processing
        const heartbeatInterval = setInterval(() => {
          sendEvent('heartbeat', { timestamp: Date.now() });
        }, 10000); // Every 10 seconds

        try {
          // Call Claude API with streaming
          const response = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-api-key': apiKey,
              'anthropic-version': '2023-06-01',
            },
            body: JSON.stringify({
              model: 'claude-sonnet-4-20250514',
              max_tokens: section === 'manifest' ? 16000 : 8000,
              stream: true,
              messages: [
                { role: 'user', content: prompt }
              ],
            }),
          });

          if (!response.ok) {
            const error = await response.json();
            console.error('Claude API error:', error);
            throw new Error('Failed to get response from Claude');
          }

          // Process streaming response
          const reader = response.body?.getReader();
          if (!reader) {
            throw new Error('No response body');
          }

          const decoder = new TextDecoder();
          let buffer = '';

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
              if (line.startsWith('data: ')) {
                const data = line.slice(6);
                if (data === '[DONE]') continue;

                try {
                  const parsed = JSON.parse(data);

                  if (parsed.type === 'content_block_delta' && parsed.delta?.text) {
                    const text = parsed.delta.text;
                    fullContent += text;
                    sendEvent('chunk', { text });

                    // Periodic backup save for long generations (Build Manifest)
                    if (section === 'manifest' && Date.now() - lastSaveTime > SAVE_INTERVAL) {
                      await updateBlueprintSection(blueprintId, section, fullContent, 'generating');
                      lastSaveTime = Date.now();
                      console.log(`[Generate] Backup saved ${fullContent.length} chars for manifest`);
                    }
                  }
                } catch {
                  // Ignore parse errors for incomplete JSON
                }
              }
            }
          }

          // Save completed content
          clearInterval(heartbeatInterval);
          await updateBlueprintSection(blueprintId, section, fullContent, 'completed');

          sendEvent('complete', { content: fullContent });
        } catch (error) {
          clearInterval(heartbeatInterval);
          console.error('[Generate] Error:', error);

          await updateBlueprintSectionStatus(blueprintId, section, 'error');

          sendEvent('error', {
            message: error instanceof Error ? error.message : 'Generation failed',
          });
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
  } catch (error) {
    console.error('[POST /api/blueprint/generate] Error:', error);
    return NextResponse.json({ error: 'Failed to start generation' }, { status: 500 });
  }
}

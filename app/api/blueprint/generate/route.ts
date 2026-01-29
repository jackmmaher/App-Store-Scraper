import { NextRequest, NextResponse } from 'next/server';
import { isAuthenticated } from '@/lib/auth';
import {
  getBlueprint,
  getProject,
  updateBlueprintSectionStatus,
  updateBlueprintSection,
  getBlueprintSectionAttachments,
  type BlueprintSection,
} from '@/lib/supabase';
import { getBlueprintPrompt } from '@/lib/blueprint-prompts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120; // 2 minutes for AI generation

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

    const validSections: BlueprintSection[] = ['pareto', 'wireframes', 'tech_stack', 'prd'];
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
    if (section === 'wireframes' && !blueprint.pareto_strategy) {
      return NextResponse.json({ error: 'Generate Pareto Strategy first' }, { status: 400 });
    }
    if (section === 'tech_stack' && (!blueprint.pareto_strategy || !blueprint.ui_wireframes)) {
      return NextResponse.json({ error: 'Generate Strategy and Wireframes first' }, { status: 400 });
    }
    if (section === 'prd' && (!blueprint.pareto_strategy || !blueprint.ui_wireframes || !blueprint.tech_stack)) {
      return NextResponse.json({ error: 'Generate all previous sections first' }, { status: 400 });
    }

    // Get attachments for wireframes section
    const attachments = section === 'wireframes'
      ? await getBlueprintSectionAttachments(blueprintId, 'wireframes')
      : [];

    // Build prompt
    const prompt = getBlueprintPrompt(
      section,
      project,
      {
        paretoStrategy: blueprint.pareto_strategy || undefined,
        uiWireframes: blueprint.ui_wireframes || undefined,
        techStack: blueprint.tech_stack || undefined,
      },
      attachments
    );

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
              max_tokens: 8000,
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
                  }
                } catch {
                  // Ignore parse errors for incomplete JSON
                }
              }
            }
          }

          // Save completed content
          await updateBlueprintSection(blueprintId, section, fullContent, 'completed');

          sendEvent('complete', { content: fullContent });
        } catch (error) {
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

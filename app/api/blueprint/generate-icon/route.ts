/**
 * App Icon Generation API using DALL-E 3
 *
 * Generates an app icon based on the icon prompt from the identity section.
 * Uploads to Supabase storage and attaches to the blueprint.
 */

import { NextRequest, NextResponse } from 'next/server';
import { isAuthenticated } from '@/lib/auth';
import { getBlueprint, createBlueprintAttachment, supabase } from '@/lib/supabase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Extract icon prompt from identity markdown
function extractIconPrompt(identityContent: string): string | null {
  // Look for the Icon Mockup Prompt section
  const promptMatch = identityContent.match(/### 5\. Icon Mockup Prompt[\s\S]*?```([\s\S]*?)```/);
  if (promptMatch) {
    return promptMatch[1].trim();
  }

  // Fallback: look for any code block after "DALL-E" or "Midjourney"
  const fallbackMatch = identityContent.match(/(?:DALL-E|Midjourney|image generator)[^`]*```([\s\S]*?)```/i);
  if (fallbackMatch) {
    return fallbackMatch[1].trim();
  }

  return null;
}

// POST /api/blueprint/generate-icon - Generate app icon with DALL-E
export async function POST(request: NextRequest) {
  const authed = await isAuthenticated();
  if (!authed) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const openaiKey = process.env.OPENAI_API_KEY;
  if (!openaiKey) {
    return NextResponse.json(
      { error: 'OpenAI API key not configured. Add OPENAI_API_KEY to your environment.' },
      { status: 500 }
    );
  }

  try {
    const body = await request.json();
    const { blueprintId, customPrompt } = body as {
      blueprintId: string;
      customPrompt?: string;
    };

    if (!blueprintId) {
      return NextResponse.json({ error: 'blueprintId required' }, { status: 400 });
    }

    // Fetch blueprint
    const blueprint = await getBlueprint(blueprintId);
    if (!blueprint) {
      return NextResponse.json({ error: 'Blueprint not found' }, { status: 404 });
    }

    // Get icon prompt from identity or use custom
    let iconPrompt: string | null | undefined = customPrompt;
    if (!iconPrompt && blueprint.app_identity) {
      iconPrompt = extractIconPrompt(blueprint.app_identity);
    }

    if (!iconPrompt) {
      return NextResponse.json(
        { error: 'No icon prompt found. Generate App Identity first or provide customPrompt.' },
        { status: 400 }
      );
    }

    // Enhance prompt for DALL-E with app icon specific instructions
    const enhancedPrompt = `Create a professional iOS app icon. ${iconPrompt}

Requirements:
- Square format (1024x1024)
- Clean, simple design visible at small sizes
- No text or letters in the icon
- Solid or subtle gradient background
- Modern, professional aesthetic
- Single focal point
- iOS app icon style with appropriate corner radius consideration`;

    console.log('[Generate Icon] Calling DALL-E 3...');

    // Call DALL-E 3
    const dalleResponse = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${openaiKey}`,
      },
      body: JSON.stringify({
        model: 'dall-e-3',
        prompt: enhancedPrompt,
        n: 1,
        size: '1024x1024',
        quality: 'hd',
        response_format: 'b64_json',
      }),
    });

    if (!dalleResponse.ok) {
      const error = await dalleResponse.json();
      console.error('[Generate Icon] DALL-E error:', error);
      return NextResponse.json(
        { error: error.error?.message || 'Failed to generate icon' },
        { status: 500 }
      );
    }

    const dalleData = await dalleResponse.json();
    const imageBase64 = dalleData.data?.[0]?.b64_json;
    const revisedPrompt = dalleData.data?.[0]?.revised_prompt;

    if (!imageBase64) {
      return NextResponse.json({ error: 'No image data returned' }, { status: 500 });
    }

    console.log('[Generate Icon] Image generated, uploading to storage...');

    // Convert base64 to buffer
    const imageBuffer = Buffer.from(imageBase64, 'base64');

    // Upload to Supabase storage
    const fileName = `icon-${Date.now()}.png`;
    const storagePath = `blueprints/${blueprintId}/icons/${fileName}`;

    const { error: uploadError } = await supabase.storage
      .from('blueprint-attachments')
      .upload(storagePath, imageBuffer, {
        contentType: 'image/png',
        upsert: true,
      });

    if (uploadError) {
      console.error('[Generate Icon] Upload error:', uploadError);
      return NextResponse.json(
        { error: 'Failed to upload icon to storage' },
        { status: 500 }
      );
    }

    // Get public URL
    const { data: urlData } = supabase.storage
      .from('blueprint-attachments')
      .getPublicUrl(storagePath);

    // Create attachment record
    const attachment = await createBlueprintAttachment(
      blueprintId,
      'identity',
      'App Icon (AI Generated)',
      fileName,
      storagePath,
      imageBuffer.length,
      'image/png'
    );

    console.log('[Generate Icon] Icon generated and attached successfully');

    return NextResponse.json({
      success: true,
      attachment: attachment,
      publicUrl: urlData.publicUrl,
      revisedPrompt: revisedPrompt,
    });
  } catch (error) {
    console.error('[Generate Icon] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to generate icon' },
      { status: 500 }
    );
  }
}

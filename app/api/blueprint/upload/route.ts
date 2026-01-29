import { NextRequest, NextResponse } from 'next/server';
import { isAuthenticated } from '@/lib/auth';
import {
  supabase,
  getBlueprint,
  createBlueprintAttachment,
  deleteBlueprintAttachment,
  type BlueprintSection,
} from '@/lib/supabase';

// POST /api/blueprint/upload - Upload inspiration image
export async function POST(request: NextRequest) {
  const authed = await isAuthenticated();
  if (!authed) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const formData = await request.formData();
    const blueprintId = formData.get('blueprintId') as string;
    const section = formData.get('section') as BlueprintSection;
    const screenLabel = formData.get('screenLabel') as string | null;
    const file = formData.get('file') as File | null;

    if (!blueprintId || !section || !file) {
      return NextResponse.json({ error: 'blueprintId, section, and file required' }, { status: 400 });
    }

    const validSections: BlueprintSection[] = ['pareto', 'wireframes', 'tech_stack', 'prd'];
    if (!validSections.includes(section)) {
      return NextResponse.json({ error: 'Invalid section' }, { status: 400 });
    }

    // Validate file type
    const allowedTypes = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json({ error: 'Only PNG, JPEG, GIF, and WebP images allowed' }, { status: 400 });
    }

    // Validate file size (10MB max)
    const maxSize = 10 * 1024 * 1024;
    if (file.size > maxSize) {
      return NextResponse.json({ error: 'File size must be less than 10MB' }, { status: 400 });
    }

    // Verify blueprint exists
    const blueprint = await getBlueprint(blueprintId);
    if (!blueprint) {
      return NextResponse.json({ error: 'Blueprint not found' }, { status: 404 });
    }

    // Generate storage path
    const timestamp = Date.now();
    const extension = file.name.split('.').pop() || 'png';
    const storagePath = `${blueprintId}/${section}/${timestamp}.${extension}`;

    // Upload to Supabase Storage
    const arrayBuffer = await file.arrayBuffer();
    const { error: uploadError } = await supabase.storage
      .from('blueprint-attachments')
      .upload(storagePath, arrayBuffer, {
        contentType: file.type,
        upsert: false,
      });

    if (uploadError) {
      console.error('Storage upload error:', uploadError);
      return NextResponse.json({ error: 'Failed to upload file' }, { status: 500 });
    }

    // Create attachment record
    const attachment = await createBlueprintAttachment(
      blueprintId,
      section,
      screenLabel,
      file.name,
      storagePath,
      file.size,
      file.type
    );

    if (!attachment) {
      // Clean up uploaded file if record creation fails
      await supabase.storage.from('blueprint-attachments').remove([storagePath]);
      return NextResponse.json({ error: 'Failed to create attachment record' }, { status: 500 });
    }

    // Get public URL for the file
    const { data: urlData } = supabase.storage
      .from('blueprint-attachments')
      .getPublicUrl(storagePath);

    return NextResponse.json({
      attachment: {
        ...attachment,
        url: urlData.publicUrl,
      },
      success: true,
    });
  } catch (error) {
    console.error('[POST /api/blueprint/upload] Error:', error);
    return NextResponse.json({ error: 'Failed to upload file' }, { status: 500 });
  }
}

// DELETE /api/blueprint/upload?attachmentId=xxx - Delete attachment
export async function DELETE(request: NextRequest) {
  const authed = await isAuthenticated();
  if (!authed) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const attachmentId = request.nextUrl.searchParams.get('attachmentId');
  if (!attachmentId) {
    return NextResponse.json({ error: 'attachmentId required' }, { status: 400 });
  }

  try {
    const success = await deleteBlueprintAttachment(attachmentId);
    if (!success) {
      return NextResponse.json({ error: 'Failed to delete attachment' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[DELETE /api/blueprint/upload] Error:', error);
    return NextResponse.json({ error: 'Failed to delete attachment' }, { status: 500 });
  }
}

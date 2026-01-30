import { NextRequest, NextResponse } from 'next/server';
import { isAuthenticated } from '@/lib/auth';
import { getKeywordJob } from '@/lib/keywords/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET /api/keywords/jobs/[id]/stream - Stream job progress via SSE
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authed = await isAuthenticated();
  if (!authed) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id: jobId } = await params;

  if (!jobId) {
    return NextResponse.json({ error: 'Job ID is required' }, { status: 400 });
  }

  // Check job exists
  const job = await getKeywordJob(jobId);
  if (!job) {
    return NextResponse.json({ error: 'Job not found' }, { status: 404 });
  }

  // If job is already complete, return immediately
  if (job.status === 'completed' || job.status === 'failed') {
    return NextResponse.json({
      success: true,
      data: job,
    });
  }

  // Create SSE stream for polling job status
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const sendEvent = (data: Record<string, unknown>) => {
        const event = `data: ${JSON.stringify(data)}\n\n`;
        controller.enqueue(encoder.encode(event));
      };

      let attempts = 0;
      const maxAttempts = 300; // 5 minutes at 1 second intervals

      const pollJob = async () => {
        const currentJob = await getKeywordJob(jobId);

        if (!currentJob) {
          sendEvent({ type: 'error', message: 'Job not found' });
          controller.close();
          return;
        }

        const progress = currentJob.total_items
          ? currentJob.processed_items / currentJob.total_items
          : 0;

        sendEvent({
          type: 'progress',
          status: currentJob.status,
          progress,
          processed: currentJob.processed_items,
          total: currentJob.total_items,
          discovered: currentJob.keywords_discovered,
          scored: currentJob.keywords_scored,
        });

        if (currentJob.status === 'completed') {
          sendEvent({
            type: 'complete',
            status: 'completed',
            discovered: currentJob.keywords_discovered,
            scored: currentJob.keywords_scored,
          });
          controller.close();
          return;
        }

        if (currentJob.status === 'failed') {
          sendEvent({
            type: 'error',
            status: 'failed',
            message: currentJob.error_message || 'Job failed',
          });
          controller.close();
          return;
        }

        attempts++;
        if (attempts >= maxAttempts) {
          sendEvent({ type: 'error', message: 'Timeout waiting for job' });
          controller.close();
          return;
        }

        // Poll again after 1 second
        setTimeout(pollJob, 1000);
      };

      // Start polling
      pollJob();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}

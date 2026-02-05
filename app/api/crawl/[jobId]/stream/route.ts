/**
 * Crawl Job Stream API Route
 *
 * GET /api/crawl/[jobId]/stream - SSE stream for job progress
 */

import { NextRequest } from 'next/server';
import { getCrawlOrchestrator } from '@/lib/crawl';
import { constantTimeEqual } from '@/lib/security';

interface RouteParams {
  params: Promise<{ jobId: string }>;
}

/**
 * GET /api/crawl/[jobId]/stream
 * Stream job progress via Server-Sent Events
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  const { jobId } = await params;

  if (!jobId) {
    return new Response('Missing job ID', { status: 400 });
  }

  // Check authentication
  const authHeader = request.headers.get('authorization');
  const appPassword = process.env.APP_PASSWORD;

  if (appPassword) {
    if (!authHeader) {
      return new Response('Unauthorized', { status: 401 });
    }
    const token = authHeader.replace('Bearer ', '');
    if (!constantTimeEqual(token, appPassword)) {
      return new Response('Unauthorized', { status: 401 });
    }
  }

  const orchestrator = getCrawlOrchestrator();

  // Create SSE stream
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      let lastProgress = -1;
      let attempts = 0;
      const maxAttempts = 300; // 5 minutes at 1 second intervals

      const sendEvent = (event: string, data: unknown) => {
        const dataStr = typeof data === "string" ? data : JSON.stringify(data);
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${dataStr}\n\n`));
      };

      const poll = async () => {
        attempts++;

        try {
          const job = await orchestrator.getJobStatus(jobId);

          if (!job) {
            sendEvent('error', JSON.stringify({ error: 'Job not found' }));
            controller.close();
            return;
          }

          // Send progress update if changed
          if (job.progress !== lastProgress) {
            lastProgress = job.progress;
            sendEvent('progress', JSON.stringify({ progress: job.progress }));
          }

          // Check completion
          if (job.status === 'completed') {
            sendEvent('complete', JSON.stringify(job.result || {}));
            controller.close();
            return;
          }

          if (job.status === 'failed') {
            sendEvent('error', JSON.stringify({ error: job.error || 'Job failed' }));
            controller.close();
            return;
          }

          if (job.status === 'cancelled') {
            sendEvent('error', JSON.stringify({ error: 'Job cancelled' }));
            controller.close();
            return;
          }

          // Continue polling
          if (attempts < maxAttempts) {
            setTimeout(poll, 1000);
          } else {
            sendEvent('error', JSON.stringify({ error: 'Timeout waiting for job' }));
            controller.close();
          }
        } catch (error) {
          console.error('SSE poll error:', error);
          sendEvent('error', JSON.stringify({ error: 'Internal error' }));
          controller.close();
        }
      };

      // Start polling
      poll();
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

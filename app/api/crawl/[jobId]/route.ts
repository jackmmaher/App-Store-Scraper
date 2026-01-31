/**
 * Crawl Job Status API Route
 *
 * GET /api/crawl/[jobId] - Get job status
 */

import { NextRequest, NextResponse } from 'next/server';
import { getCrawlOrchestrator } from '@/lib/crawl';

// Check authentication
async function checkAuth(request: NextRequest): Promise<boolean> {
  const authHeader = request.headers.get('authorization');
  const appPassword = process.env.APP_PASSWORD;

  if (!appPassword) return true;
  if (!authHeader) return false;

  const token = authHeader.replace('Bearer ', '');
  return token === appPassword;
}

interface RouteParams {
  params: Promise<{ jobId: string }>;
}

/**
 * GET /api/crawl/[jobId]
 * Get the status and result of a crawl job
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  if (!(await checkAuth(request))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { jobId } = await params;

    if (!jobId) {
      return NextResponse.json(
        { error: 'Missing job ID' },
        { status: 400 }
      );
    }

    const orchestrator = getCrawlOrchestrator();
    const job = await orchestrator.getJobStatus(jobId);

    if (!job) {
      return NextResponse.json(
        { error: 'Job not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(job);
  } catch (error) {
    console.error('Job status error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

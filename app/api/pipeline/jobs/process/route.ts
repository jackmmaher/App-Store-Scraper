import { NextRequest, NextResponse } from 'next/server';
import { isAuthenticated } from '@/lib/auth';
import {
  processJobs,
  getPipelineStats,
} from '@/lib/pipeline/job-processor';

// Verify cron secret for Vercel Cron
function verifyCronAuth(request: NextRequest): boolean {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader === `Bearer ${cronSecret}`) {
    return true;
  }

  return false;
}

// POST /api/pipeline/jobs/process - Process pending jobs (cron endpoint)
export async function POST(request: NextRequest) {
  try {
    // Check authentication (cron secret or session)
    const isCron = verifyCronAuth(request);
    const isSessionAuth = await isAuthenticated();

    if (!isCron && !isSessionAuth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Parse optional config from body
    let maxJobs = 10; // Default: process up to 10 jobs per run
    let jobTypes: ('discover' | 'score_basic' | 'enrich_full')[] | undefined;

    try {
      const body = await request.json();
      if (body.max_jobs) maxJobs = Math.min(body.max_jobs, 50); // Cap at 50
      if (body.job_types) jobTypes = body.job_types;
    } catch {
      // No body or invalid JSON - use defaults
    }

    // Process jobs
    const startTime = Date.now();
    const processed = await processJobs(maxJobs, jobTypes);
    const duration = Date.now() - startTime;

    // Get current queue stats
    const stats = await getPipelineStats();

    return NextResponse.json({
      success: true,
      data: {
        jobs_processed: processed,
        duration_ms: duration,
        queue_stats: stats,
      },
    });
  } catch (error) {
    console.error('Error processing pipeline jobs:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: `Failed to process jobs: ${errorMessage}` },
      { status: 500 }
    );
  }
}

// GET /api/pipeline/jobs/process - Get queue status
export async function GET(request: NextRequest) {
  try {
    const authed = await isAuthenticated();
    if (!authed) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const stats = await getPipelineStats();

    return NextResponse.json({
      success: true,
      data: stats,
    });
  } catch (error) {
    console.error('Error getting pipeline stats:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: `Failed to get stats: ${errorMessage}` },
      { status: 500 }
    );
  }
}

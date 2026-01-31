import { NextRequest, NextResponse } from 'next/server';
import { isAuthenticated } from '@/lib/auth';
import { createJobIfNotExists, getPipelineStats } from '@/lib/pipeline/job-processor';

// POST /api/pipeline/discover - Queue a discovery job for a seed keyword
export async function POST(request: NextRequest) {
  try {
    const authed = await isAuthenticated();
    if (!authed) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { seed, category, country = 'us', priority = 5 } = body as {
      seed: string;
      category: string;
      country?: string;
      priority?: number;
    };

    if (!seed || !category) {
      return NextResponse.json(
        { error: 'seed and category are required' },
        { status: 400 }
      );
    }

    // Queue a discovery job
    const jobId = await createJobIfNotExists(
      'discover',
      { seed: seed.toLowerCase().trim(), category, country },
      priority
    );

    if (!jobId) {
      return NextResponse.json(
        { error: 'Failed to create discovery job' },
        { status: 500 }
      );
    }

    const stats = await getPipelineStats();

    return NextResponse.json({
      success: true,
      data: {
        job_id: jobId,
        message: `Queued discovery for seed "${seed}"`,
        queue_stats: stats,
      },
    });
  } catch (error) {
    console.error('Error queuing discovery job:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: `Failed to queue discovery: ${errorMessage}` },
      { status: 500 }
    );
  }
}

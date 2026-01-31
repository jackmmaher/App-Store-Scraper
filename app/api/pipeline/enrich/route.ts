import { NextRequest, NextResponse } from 'next/server';
import { isAuthenticated } from '@/lib/auth';
import { createJobIfNotExists, getPipelineStats } from '@/lib/pipeline/job-processor';

// POST /api/pipeline/enrich - Queue a full enrichment job for a keyword
export async function POST(request: NextRequest) {
  try {
    const authed = await isAuthenticated();
    if (!authed) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { keyword, category, country = 'us', priority = 10 } = body as {
      keyword: string;
      category: string;
      country?: string;
      priority?: number;
    };

    if (!keyword || !category) {
      return NextResponse.json(
        { error: 'keyword and category are required' },
        { status: 400 }
      );
    }

    // Queue a full enrichment job with high priority
    const jobId = await createJobIfNotExists(
      'enrich_full',
      { keyword: keyword.toLowerCase().trim(), category, country },
      priority
    );

    if (!jobId) {
      return NextResponse.json(
        { error: 'Failed to create enrichment job' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        job_id: jobId,
        message: `Queued full enrichment for "${keyword}"`,
      },
    });
  } catch (error) {
    console.error('Error queuing enrichment job:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: `Failed to queue enrichment: ${errorMessage}` },
      { status: 500 }
    );
  }
}

// POST /api/pipeline/enrich/batch - Queue enrichment jobs for multiple keywords
export async function PUT(request: NextRequest) {
  try {
    const authed = await isAuthenticated();
    if (!authed) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { keywords, country = 'us', priority = 5 } = body as {
      keywords: Array<{ keyword: string; category: string }>;
      country?: string;
      priority?: number;
    };

    if (!keywords || !Array.isArray(keywords) || keywords.length === 0) {
      return NextResponse.json(
        { error: 'keywords array is required' },
        { status: 400 }
      );
    }

    // Queue enrichment jobs for all keywords
    let queued = 0;
    for (const { keyword, category } of keywords) {
      if (!keyword || !category) continue;

      const jobId = await createJobIfNotExists(
        'enrich_full',
        { keyword: keyword.toLowerCase().trim(), category, country },
        priority
      );
      if (jobId) queued++;
    }

    const stats = await getPipelineStats();

    return NextResponse.json({
      success: true,
      data: {
        requested: keywords.length,
        queued,
        queue_stats: stats,
      },
    });
  } catch (error) {
    console.error('Error queuing batch enrichment:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: `Failed to queue batch enrichment: ${errorMessage}` },
      { status: 500 }
    );
  }
}

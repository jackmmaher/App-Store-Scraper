import { NextRequest, NextResponse } from 'next/server';
import { isAuthenticated } from '@/lib/auth';
import { createProjectFromIdea } from '@/lib/supabase';

interface CreateProjectRequest {
  sessionId: string;
  recommendation: {
    clusterId: string;
    clusterName: string;
    headline: string;
    reasoning: string[];
    combinedSearchVolume: string;
    competitionSummary: string;
    primaryGap: string;
    suggestedMonetization: string;
    mvpScope: string;
    differentiator: string;
    opportunityScore: number;
  };
  gapAnalysis: {
    clusterId: string;
    clusterName: string;
    existingFeatures: string[];
    userComplaints: string[];
    gaps: string[];
    monetizationInsights: string;
    analyzedApps: unknown[];
  };
  clusterScore: {
    clusterId: string;
    clusterName: string;
    keywords: string[];
    opportunityScore: number;
    competitionGap: number;
    marketDemand: number;
    revenuePotential: number;
    trendMomentum: number;
    executionFeasibility: number;
    reasoning: string;
  };
  country: string;
}

// POST /api/app-ideas/create-project - Create a project from an app idea
export async function POST(request: NextRequest) {
  const authed = await isAuthenticated();
  if (!authed) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body: CreateProjectRequest = await request.json();
    const { sessionId, recommendation, gapAnalysis, clusterScore, country } = body;

    if (!sessionId || !recommendation) {
      return NextResponse.json(
        { error: 'Session ID and recommendation required' },
        { status: 400 }
      );
    }

    // Create the project
    const project = await createProjectFromIdea({
      name: recommendation.headline,
      category: recommendation.clusterName,
      appIdeaSessionId: sessionId,
      recommendation,
      gapAnalysis,
      clusterScore,
      country: country || 'us',
    });

    if (!project) {
      return NextResponse.json(
        { error: 'Failed to create project' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        projectId: project.id,
        projectName: project.app_name,
      },
    });
  } catch (error) {
    console.error('[POST /api/app-ideas/create-project] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

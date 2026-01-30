import { NextRequest, NextResponse } from 'next/server';
import { isAuthenticated } from '@/lib/auth';
import { getOpportunityById, markBlueprintGenerated } from '@/lib/opportunity/db';
import {
  createProject,
  getOrCreateBlueprint,
  AppResult,
} from '@/lib/supabase';

// POST /api/opportunity/[id]/create-project - Create a project from an opportunity
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authed = await isAuthenticated();
  if (!authed) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const { competitor_app_id } = body as { competitor_app_id?: string };

    // Get the opportunity
    const opportunity = await getOpportunityById(id);
    if (!opportunity) {
      return NextResponse.json({ error: 'Opportunity not found' }, { status: 404 });
    }

    // Get top apps from raw data
    const topApps = opportunity.raw_data?.itunes?.top_10_apps || [];

    // Find the selected competitor app (or use the first one)
    let competitorApp = competitor_app_id
      ? topApps.find((app: { id: string }) => app.id === competitor_app_id)
      : topApps[0];

    if (!competitorApp && topApps.length > 0) {
      competitorApp = topApps[0];
    }

    // Create an AppResult-like object for the project
    // If we have a competitor app, use its data; otherwise create a placeholder
    const appData: AppResult = competitorApp
      ? {
          id: competitorApp.id,
          name: competitorApp.name,
          bundle_id: '',
          developer: 'Unknown',
          developer_id: '',
          price: competitorApp.price || 0,
          currency: competitorApp.currency || 'USD',
          rating: competitorApp.rating || 0,
          rating_current_version: competitorApp.rating || 0,
          review_count: competitorApp.reviews || 0,
          review_count_current_version: competitorApp.reviews || 0,
          version: '',
          release_date: competitorApp.release_date || '',
          current_version_release_date: '',
          min_os_version: '',
          file_size_bytes: '0',
          content_rating: '',
          genres: [],
          primary_genre: opportunity.category,
          primary_genre_id: '',
          url: '',
          icon_url: competitorApp.icon_url || '',
          description: '',
        }
      : {
          // Create a placeholder app for the opportunity keyword
          id: `opp-${opportunity.id}`,
          name: `${opportunity.keyword} App`,
          bundle_id: '',
          developer: 'New App',
          developer_id: '',
          price: 0,
          currency: 'USD',
          rating: 0,
          rating_current_version: 0,
          review_count: 0,
          review_count_current_version: 0,
          version: '1.0',
          release_date: new Date().toISOString(),
          current_version_release_date: new Date().toISOString(),
          min_os_version: '17.0',
          file_size_bytes: '0',
          content_rating: '',
          genres: [],
          primary_genre: opportunity.category,
          primary_genre_id: '',
          url: '',
          icon_url: '',
          description: '',
        };

    // Build notes from opportunity data
    const notes = buildNotesFromOpportunity(opportunity);

    // Create the project
    const project = await createProject({
      app: appData,
      reviews: [], // No reviews yet - user can scrape later
      reviewStats: null,
      country: opportunity.country,
      notes,
      aiAnalysis: buildInitialAnalysis(opportunity),
    });

    if (!project) {
      return NextResponse.json(
        { error: 'Failed to create project' },
        { status: 500 }
      );
    }

    // Create a blueprint for the project
    const blueprint = await getOrCreateBlueprint(project.id);
    if (!blueprint) {
      return NextResponse.json(
        { error: 'Failed to create blueprint' },
        { status: 500 }
      );
    }

    // Link the opportunity to the blueprint
    await markBlueprintGenerated(opportunity.id, blueprint.id);

    return NextResponse.json({
      success: true,
      data: {
        project_id: project.id,
        blueprint_id: blueprint.id,
        opportunity_id: opportunity.id,
        competitor_app: competitorApp ? {
          id: competitorApp.id,
          name: competitorApp.name,
        } : null,
      },
    });
  } catch (error) {
    console.error('[POST /api/opportunity/[id]/create-project] Error:', error);
    return NextResponse.json(
      { error: 'Failed to create project from opportunity' },
      { status: 500 }
    );
  }
}

/**
 * Build initial notes from opportunity data
 */
function buildNotesFromOpportunity(opportunity: {
  keyword: string;
  category: string;
  opportunity_score: number | null;
  reasoning: string | null;
  suggested_differentiator: string | null;
  top_competitor_weaknesses: string[] | null;
  competition_gap_score: number | null;
  market_demand_score: number | null;
  revenue_potential_score: number | null;
  trend_momentum_score: number | null;
  execution_feasibility_score: number | null;
}): string {
  const lines: string[] = [];

  lines.push(`## Opportunity: "${opportunity.keyword}"`);
  lines.push(`**Category:** ${opportunity.category}`);
  lines.push(`**Opportunity Score:** ${opportunity.opportunity_score?.toFixed(1) || 'N/A'}`);
  lines.push('');

  lines.push('### Dimension Scores');
  lines.push(`- Competition Gap: ${opportunity.competition_gap_score?.toFixed(1) || 'N/A'}`);
  lines.push(`- Market Demand: ${opportunity.market_demand_score?.toFixed(1) || 'N/A'}`);
  lines.push(`- Revenue Potential: ${opportunity.revenue_potential_score?.toFixed(1) || 'N/A'}`);
  lines.push(`- Trend Momentum: ${opportunity.trend_momentum_score?.toFixed(1) || 'N/A'}`);
  lines.push(`- Execution Feasibility: ${opportunity.execution_feasibility_score?.toFixed(1) || 'N/A'}`);
  lines.push('');

  if (opportunity.suggested_differentiator) {
    lines.push('### Suggested Strategy');
    lines.push(opportunity.suggested_differentiator);
    lines.push('');
  }

  if (opportunity.top_competitor_weaknesses && opportunity.top_competitor_weaknesses.length > 0) {
    lines.push('### Competitor Weaknesses to Exploit');
    opportunity.top_competitor_weaknesses.forEach((weakness) => {
      lines.push(`- ${weakness}`);
    });
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Build initial AI analysis from opportunity data
 */
function buildInitialAnalysis(opportunity: {
  keyword: string;
  reasoning: string | null;
  suggested_differentiator: string | null;
  top_competitor_weaknesses: string[] | null;
  raw_data: {
    itunes?: {
      top_10_apps?: Array<{
        name: string;
        rating: number;
        reviews: number;
        has_iap: boolean;
        has_subscription: boolean;
      }>;
    };
  } | null;
}): string {
  const lines: string[] = [];

  lines.push(`# Opportunity Analysis: "${opportunity.keyword}"`);
  lines.push('');

  if (opportunity.reasoning) {
    lines.push('## Market Analysis');
    lines.push(opportunity.reasoning);
    lines.push('');
  }

  // Add competitor summary
  const topApps = opportunity.raw_data?.itunes?.top_10_apps || [];
  if (topApps.length > 0) {
    lines.push('## Top Competitors');
    lines.push('');
    topApps.slice(0, 5).forEach((app, idx) => {
      lines.push(`${idx + 1}. **${app.name}** - ${app.rating?.toFixed(1) || 'N/A'}★ (${app.reviews?.toLocaleString() || 0} reviews)`);
      const signals: string[] = [];
      if (app.has_iap) signals.push('IAP');
      if (app.has_subscription) signals.push('Subscription');
      if (signals.length > 0) {
        lines.push(`   - Monetization: ${signals.join(', ')}`);
      }
    });
    lines.push('');
  }

  if (opportunity.top_competitor_weaknesses && opportunity.top_competitor_weaknesses.length > 0) {
    lines.push('## Opportunities to Differentiate');
    lines.push('');
    opportunity.top_competitor_weaknesses.forEach((weakness) => {
      lines.push(`- ${weakness}`);
    });
    lines.push('');
  }

  if (opportunity.suggested_differentiator) {
    lines.push('## Recommended Strategy');
    lines.push('');
    lines.push(opportunity.suggested_differentiator);
    lines.push('');
  }

  lines.push('---');
  lines.push('*This analysis was generated from the Opportunity Ranker. Scrape competitor reviews for deeper insights.*');

  return lines.join('\n');
}

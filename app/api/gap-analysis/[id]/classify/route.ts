import { NextRequest, NextResponse } from 'next/server';
import { isAuthenticated } from '@/lib/auth';
import {
  getGapSession,
  updateGapAppClassifications,
  type GapAnalysisApp,
} from '@/lib/supabase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface RouteParams {
  params: Promise<{ id: string }>;
}

interface BrandDetectionResult {
  app_store_id: string;
  is_brand: boolean;
  confidence: number;
  brand_name: string | null;
}

// POST /api/gap-analysis/[id]/classify - Run classification algorithm + AI brand detection
export async function POST(request: NextRequest, { params }: RouteParams) {
  const authed = await isAuthenticated();
  if (!authed) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id: sessionId } = await params;

  try {
    // Get session with apps
    const result = await getGapSession(sessionId);
    if (!result) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    const { session, apps } = result;

    if (session.scrape_status !== 'completed') {
      return NextResponse.json({ error: 'Scrape not completed' }, { status: 400 });
    }

    if (apps.length === 0) {
      return NextResponse.json({ error: 'No apps to classify' }, { status: 400 });
    }

    const totalCountries = session.countries.length;
    const classifications: Array<{
      app_store_id: string;
      classification: GapAnalysisApp['classification'];
      classification_reason: string;
    }> = [];

    // Step 1: Apply algorithmic classification rules
    for (const app of apps) {
      const presenceRatio = app.presence_count / totalCountries;
      const avgRank = app.average_rank || 999;

      let classification: GapAnalysisApp['classification'] = null;
      let reason = '';

      // Global Leader: avg rank <= 3 AND present in 80%+ of markets
      if (avgRank <= 3 && presenceRatio >= 0.8) {
        classification = 'global_leader';
        reason = `Top 3 avg rank (${avgRank.toFixed(1)}) in ${(presenceRatio * 100).toFixed(0)}% of markets`;
      }
      // Local Champion: Top 10 in at least one market AND present in 20-70% of markets
      else if (presenceRatio >= 0.2 && presenceRatio <= 0.7) {
        const hasTop10 = Object.values(app.country_ranks).some(
          (rank) => rank !== null && rank <= 10
        );
        if (hasTop10) {
          const top10Countries = Object.entries(app.country_ranks)
            .filter(([, rank]) => rank !== null && rank <= 10)
            .map(([country]) => country.toUpperCase());
          classification = 'local_champion';
          reason = `Top 10 in ${top10Countries.join(', ')}, present in ${(presenceRatio * 100).toFixed(0)}% of markets`;
        }
      }

      classifications.push({
        app_store_id: app.app_store_id,
        classification,
        classification_reason: reason,
      });
    }

    // Step 2: AI brand detection for apps not yet classified
    const unclassifiedApps = apps.filter((app) => {
      const existing = classifications.find(
        (c) => c.app_store_id === app.app_store_id
      );
      return !existing?.classification;
    });

    if (unclassifiedApps.length > 0) {
      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (apiKey) {
        try {
          const brandResults = await detectBrands(unclassifiedApps, apiKey);

          for (const result of brandResults) {
            if (result.is_brand && result.confidence >= 0.7) {
              const idx = classifications.findIndex(
                (c) => c.app_store_id === result.app_store_id
              );
              if (idx !== -1) {
                classifications[idx].classification = 'brand';
                classifications[idx].classification_reason = result.brand_name
                  ? `Recognized brand: ${result.brand_name} (${(result.confidence * 100).toFixed(0)}% confidence)`
                  : `Recognized offline brand (${(result.confidence * 100).toFixed(0)}% confidence)`;
              }
            }
          }
        } catch (err) {
          console.error('Brand detection error:', err);
          // Continue without brand detection if it fails
        }
      }
    }

    // Step 3: Save classifications to database
    const success = await updateGapAppClassifications(sessionId, classifications);

    if (!success) {
      return NextResponse.json(
        { error: 'Failed to save classifications' },
        { status: 500 }
      );
    }

    // Summary stats
    const stats = {
      total: apps.length,
      global_leaders: classifications.filter((c) => c.classification === 'global_leader').length,
      brands: classifications.filter((c) => c.classification === 'brand').length,
      local_champions: classifications.filter((c) => c.classification === 'local_champion').length,
      unclassified: classifications.filter((c) => !c.classification).length,
    };

    return NextResponse.json({
      success: true,
      classifications: classifications.filter((c) => c.classification),
      stats,
    });
  } catch (error) {
    console.error('[POST /api/gap-analysis/[id]/classify] Error:', error);
    return NextResponse.json(
      { error: 'Classification failed' },
      { status: 500 }
    );
  }
}

// AI brand detection using Claude
async function detectBrands(
  apps: GapAnalysisApp[],
  apiKey: string
): Promise<BrandDetectionResult[]> {
  // Batch apps for API call (max 50 at a time)
  const batchSize = 50;
  const results: BrandDetectionResult[] = [];

  for (let i = 0; i < apps.length; i += batchSize) {
    const batch = apps.slice(i, i + batchSize);

    const appList = batch.map((app) => ({
      id: app.app_store_id,
      name: app.app_name,
      developer: app.app_developer,
    }));

    const prompt = `Analyze these app names and developers. Identify recognizable offline consumer brands - companies that exist primarily outside of mobile apps (Nike, Peloton, Starbucks, Disney, Weight Watchers, major banks, airlines, retail stores, etc.).

Do NOT flag:
- Pure digital/app-native companies (Calm, Headspace, MyFitnessPal before acquisition)
- Generic app names that happen to match brand words
- Small/unknown developers

Apps to analyze:
${JSON.stringify(appList, null, 2)}

Return ONLY valid JSON array (no markdown, no explanation):
[{"app_store_id": "xxx", "is_brand": true/false, "confidence": 0.0-1.0, "brand_name": "Name or null"}]`;

    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 2000,
          messages: [
            {
              role: 'user',
              content: prompt,
            },
          ],
        }),
      });

      if (!response.ok) {
        throw new Error(`Claude API error: ${response.status}`);
      }

      const data = await response.json();
      const content = data.content[0]?.text || '[]';

      // Parse JSON from response
      const jsonMatch = content.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]) as BrandDetectionResult[];
        results.push(...parsed);
      }
    } catch (err) {
      console.error('Brand detection batch error:', err);
      // Add empty results for failed batch
      results.push(
        ...batch.map((app) => ({
          app_store_id: app.app_store_id,
          is_brand: false,
          confidence: 0,
          brand_name: null,
        }))
      );
    }
  }

  return results;
}

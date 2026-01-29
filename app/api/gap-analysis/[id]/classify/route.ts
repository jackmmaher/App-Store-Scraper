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

    // Initialize all apps with null classification
    for (const app of apps) {
      classifications.push({
        app_store_id: app.app_store_id,
        classification: null,
        classification_reason: '',
      });
    }

    // Step 1: AI brand detection FIRST (brands are excluded from other classifications)
    const brandAppIds = new Set<string>();
    const apiKey = process.env.ANTHROPIC_API_KEY;

    if (apiKey) {
      try {
        const brandResults = await detectBrands(apps, apiKey);

        for (const result of brandResults) {
          if (result.is_brand && result.confidence >= 0.7) {
            brandAppIds.add(result.app_store_id);
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

    // Step 2: Apply algorithmic classification rules (excluding brands)
    for (const app of apps) {
      // Skip if already classified as brand
      if (brandAppIds.has(app.app_store_id)) {
        continue;
      }

      const idx = classifications.findIndex(
        (c) => c.app_store_id === app.app_store_id
      );
      if (idx === -1) continue;

      // Get ranks for markets where the app is present
      const presentRanks = Object.entries(app.country_ranks)
        .filter(([, rank]) => rank !== null)
        .map(([country, rank]) => ({ country: country.toUpperCase(), rank: rank as number }));

      // Global Leader: Must be present in ALL markets AND rank 1-3 in ALL markets
      // The app IS the business (like Flo period tracker, not a physical brand extension)
      if (presentRanks.length === totalCountries) {
        const allTop3 = presentRanks.every((r) => r.rank <= 3);
        if (allTop3) {
          classifications[idx].classification = 'global_leader';
          classifications[idx].classification_reason = `Ranks #1-3 in all ${totalCountries} markets analyzed`;
          continue;
        }
      }

      // Local Champion: Ranks 1-10 in exactly ONE market only
      // Must be a standalone app business, not a brand, not a global leader
      const top10Markets = presentRanks.filter((r) => r.rank <= 10);
      if (top10Markets.length === 1) {
        const market = top10Markets[0];
        classifications[idx].classification = 'local_champion';
        classifications[idx].classification_reason = `Standalone app leading only in ${market.country} (rank #${market.rank})`;
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

    const prompt = `Analyze these app names and developers. Identify apps that are extensions of PHYSICAL businesses/brands - where the company exists primarily OUTSIDE of mobile apps.

FLAG as brands:
- Retail stores with apps (Walmart, Tesco, Netto Plus, IKEA)
- Consumer product companies (Coca Cola, Nike, Nestlé)
- Banks and financial institutions (Chase, HSBC, Barclays)
- Airlines, hotels, restaurants (Delta, Marriott, Starbucks, McDonald's)
- Entertainment companies with physical presence (Disney, Netflix retail)
- Fitness brands with physical gyms/equipment (Peloton, Planet Fitness)

Do NOT flag as brands:
- App-native businesses where the app IS the core product (Flo, Calm, Headspace, Duolingo, Spotify)
- Digital-first companies (even if successful) where the app is the main business
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

/**
 * Name Availability Check API
 *
 * Checks App Store, domain, and social media availability for app names.
 * Used by blueprint identity generation to auto-select available names.
 */

import { NextRequest, NextResponse } from 'next/server';
import { isAuthenticated } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

interface AvailabilityResult {
  name: string;
  normalized: string;
  checks: {
    appStore: { available: boolean; existingApps: string[]; checked: boolean };
    domainCom: { available: boolean; checked: boolean };
    domainApp: { available: boolean; checked: boolean };
    twitter: { available: boolean; checked: boolean };
    instagram: { available: boolean; checked: boolean };
  };
  score: number; // 0-5, number of checks passed
  recommendation: 'available' | 'partial' | 'taken';
}

// Normalize name for domain/handle checks
function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .slice(0, 30);
}

// Check App Store for existing apps with similar names
async function checkAppStore(name: string): Promise<{ available: boolean; existingApps: string[] }> {
  try {
    const searchUrl = `https://itunes.apple.com/search?term=${encodeURIComponent(name)}&entity=software&limit=10`;
    const response = await fetch(searchUrl, { signal: AbortSignal.timeout(5000) });

    if (!response.ok) {
      return { available: true, existingApps: [] }; // Assume available if check fails
    }

    const data = await response.json();
    const results = data.results || [];

    // Check for exact or very similar names
    const normalizedSearch = name.toLowerCase().replace(/[^a-z0-9]/g, '');
    const existingApps: string[] = [];

    for (const app of results) {
      const appName = app.trackName || '';
      const normalizedApp = appName.toLowerCase().replace(/[^a-z0-9]/g, '');

      // Check for exact match or very high similarity
      if (normalizedApp === normalizedSearch ||
          normalizedApp.includes(normalizedSearch) ||
          normalizedSearch.includes(normalizedApp)) {
        existingApps.push(appName);
      }
    }

    return {
      available: existingApps.length === 0,
      existingApps: existingApps.slice(0, 3), // Return top 3 conflicts
    };
  } catch (error) {
    console.error('App Store check failed:', error);
    return { available: true, existingApps: [] }; // Assume available if check fails
  }
}

// Check domain availability using DNS lookup approach
async function checkDomain(domain: string): Promise<boolean> {
  try {
    // Use a public DNS-over-HTTPS service to check if domain resolves
    const response = await fetch(
      `https://dns.google/resolve?name=${domain}&type=A`,
      { signal: AbortSignal.timeout(3000) }
    );

    if (!response.ok) {
      return true; // Assume available if check fails
    }

    const data = await response.json();

    // If no Answer section, domain likely doesn't resolve (potentially available)
    // Note: This isn't 100% accurate - domain could be registered but not resolving
    // For more accuracy, would need a WHOIS API service
    const hasRecords = data.Answer && data.Answer.length > 0;
    return !hasRecords;
  } catch (error) {
    console.error('Domain check failed:', error);
    return true; // Assume available if check fails
  }
}

// Check Twitter/X handle availability
async function checkTwitter(handle: string): Promise<boolean> {
  try {
    // Twitter doesn't have a public API for this, so we check if profile page exists
    // Note: This may be rate-limited and isn't 100% reliable
    const response = await fetch(`https://twitter.com/${handle}`, {
      method: 'HEAD',
      signal: AbortSignal.timeout(3000),
      redirect: 'manual',
    });

    // 404 means handle is available, 200/3xx means taken
    return response.status === 404;
  } catch (error) {
    console.error('Twitter check failed:', error);
    return true; // Assume available if check fails
  }
}

// Check Instagram handle availability
async function checkInstagram(handle: string): Promise<boolean> {
  try {
    const response = await fetch(`https://www.instagram.com/${handle}/`, {
      method: 'HEAD',
      signal: AbortSignal.timeout(3000),
      redirect: 'manual',
    });

    // 404 means handle is available
    return response.status === 404;
  } catch (error) {
    console.error('Instagram check failed:', error);
    return true; // Assume available if check fails
  }
}

// POST /api/name-availability - Check availability for one or more names
export async function POST(request: NextRequest) {
  const authed = await isAuthenticated();
  if (!authed) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { names, checks = ['appStore', 'domainCom'] } = body as {
      names: string[];
      checks?: ('appStore' | 'domainCom' | 'domainApp' | 'twitter' | 'instagram')[];
    };

    if (!names || !Array.isArray(names) || names.length === 0) {
      return NextResponse.json({ error: 'names array required' }, { status: 400 });
    }

    if (names.length > 10) {
      return NextResponse.json({ error: 'Maximum 10 names per request' }, { status: 400 });
    }

    const results: AvailabilityResult[] = [];

    for (const name of names) {
      const normalized = normalizeName(name);

      const result: AvailabilityResult = {
        name,
        normalized,
        checks: {
          appStore: { available: true, existingApps: [], checked: false },
          domainCom: { available: true, checked: false },
          domainApp: { available: true, checked: false },
          twitter: { available: true, checked: false },
          instagram: { available: true, checked: false },
        },
        score: 0,
        recommendation: 'available',
      };

      // Run requested checks in parallel
      const checkPromises: Promise<void>[] = [];

      if (checks.includes('appStore')) {
        checkPromises.push(
          checkAppStore(name).then(res => {
            result.checks.appStore = { ...res, checked: true };
          })
        );
      }

      if (checks.includes('domainCom')) {
        checkPromises.push(
          checkDomain(`${normalized}.com`).then(available => {
            result.checks.domainCom = { available, checked: true };
          })
        );
      }

      if (checks.includes('domainApp')) {
        checkPromises.push(
          checkDomain(`${normalized}.app`).then(available => {
            result.checks.domainApp = { available, checked: true };
          })
        );
      }

      if (checks.includes('twitter')) {
        checkPromises.push(
          checkTwitter(normalized).then(available => {
            result.checks.twitter = { available, checked: true };
          })
        );
      }

      if (checks.includes('instagram')) {
        checkPromises.push(
          checkInstagram(normalized).then(available => {
            result.checks.instagram = { available, checked: true };
          })
        );
      }

      await Promise.all(checkPromises);

      // Calculate score and recommendation
      let score = 0;
      const checkedCount = Object.values(result.checks).filter(c => c.checked).length;

      if (result.checks.appStore.checked && result.checks.appStore.available) score++;
      if (result.checks.domainCom.checked && result.checks.domainCom.available) score++;
      if (result.checks.domainApp.checked && result.checks.domainApp.available) score++;
      if (result.checks.twitter.checked && result.checks.twitter.available) score++;
      if (result.checks.instagram.checked && result.checks.instagram.available) score++;

      result.score = score;

      if (score === checkedCount) {
        result.recommendation = 'available';
      } else if (score >= checkedCount / 2) {
        result.recommendation = 'partial';
      } else {
        result.recommendation = 'taken';
      }

      results.push(result);
    }

    // Sort by score descending
    results.sort((a, b) => b.score - a.score);

    return NextResponse.json({
      results,
      bestMatch: results.find(r => r.recommendation === 'available') || results[0],
    });
  } catch (error) {
    console.error('Name availability check error:', error);
    return NextResponse.json(
      { error: 'Failed to check name availability' },
      { status: 500 }
    );
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { isAuthenticated } from '@/lib/auth';
import type { AppResult } from '@/lib/supabase';

interface iTunesResult {
  wrapperType?: string;  // 'software' for apps, 'track' for music, etc.
  kind?: string;         // 'software' for apps
  trackId?: number;
  trackName?: string;
  bundleId?: string;
  sellerName?: string;
  artistId?: number;
  price?: number;
  currency?: string;
  averageUserRating?: number;
  averageUserRatingForCurrentVersion?: number;
  userRatingCount?: number;
  userRatingCountForCurrentVersion?: number;
  version?: string;
  releaseDate?: string;
  currentVersionReleaseDate?: string;
  minimumOsVersion?: string;
  fileSizeBytes?: string;
  contentAdvisoryRating?: string;
  genres?: string[];
  primaryGenreName?: string;
  primaryGenreId?: number;
  trackViewUrl?: string;
  artworkUrl512?: string;
  artworkUrl100?: string;
  description?: string;
}

// Parse App Store URL to extract app ID and country code
function parseAppStoreUrl(input: string): { appId: string; country: string } | null {
  // Trim whitespace
  input = input.trim();

  // If it's just a number, assume it's an app ID
  if (/^\d+$/.test(input)) {
    return { appId: input, country: 'us' };
  }

  // Try to parse as URL
  try {
    const url = new URL(input);

    // Check if it's an Apple URL
    if (!url.hostname.includes('apple.com')) {
      return null;
    }

    // Extract country from path (e.g., /us/app/...)
    const pathParts = url.pathname.split('/').filter(Boolean);
    let country = 'us';

    // First part might be country code
    if (pathParts.length > 0 && pathParts[0].length === 2) {
      country = pathParts[0].toLowerCase();
    }

    // Extract app ID from path (format: id123456789 or just path ending in number)
    const idMatch = url.pathname.match(/id(\d+)/);
    if (idMatch) {
      return { appId: idMatch[1], country };
    }

    // Try getting from the last path segment
    const lastPart = pathParts[pathParts.length - 1];
    const numMatch = lastPart?.match(/(\d+)/);
    if (numMatch) {
      return { appId: numMatch[1], country };
    }

    return null;
  } catch {
    // Not a valid URL, check if it contains an ID pattern
    const idMatch = input.match(/id(\d+)/);
    if (idMatch) {
      return { appId: idMatch[1], country: 'us' };
    }
    return null;
  }
}

// Check if iTunes result is a valid iOS app
function isValidAppResult(item: iTunesResult): boolean {
  // Must have trackId and be a software/app type
  if (!item.trackId) return false;
  // wrapperType 'software' or kind 'software' indicates an app
  if (item.wrapperType === 'software' || item.kind === 'software') return true;
  // If no type indicators, check for app-specific fields
  if (item.bundleId && item.minimumOsVersion) return true;
  return false;
}

// Convert iTunes API result to AppResult format
function convertToAppResult(item: iTunesResult): AppResult | null {
  if (!item.trackId) {
    console.error('Invalid iTunes result: missing trackId', JSON.stringify(item).slice(0, 200));
    return null;
  }

  return {
    id: item.trackId.toString(),
    name: item.trackName || 'Unknown App',
    bundle_id: item.bundleId || '',
    developer: item.sellerName || 'Unknown Developer',
    developer_id: item.artistId?.toString() || '',
    price: item.price || 0,
    currency: item.currency || 'USD',
    rating: item.averageUserRating || 0,
    rating_current_version: item.averageUserRatingForCurrentVersion || 0,
    review_count: item.userRatingCount || 0,
    review_count_current_version: item.userRatingCountForCurrentVersion || 0,
    version: item.version || '',
    release_date: item.releaseDate || '',
    current_version_release_date: item.currentVersionReleaseDate || '',
    min_os_version: item.minimumOsVersion || '',
    file_size_bytes: item.fileSizeBytes || '0',
    content_rating: item.contentAdvisoryRating || '',
    genres: item.genres || [],
    primary_genre: item.primaryGenreName || '',
    primary_genre_id: item.primaryGenreId?.toString() || '',
    url: item.trackViewUrl || '',
    icon_url: item.artworkUrl512 || item.artworkUrl100 || '',
    description: item.description || '',
  };
}

// POST /api/lookup - Look up a single app by URL or ID
export async function POST(request: NextRequest) {
  const authed = await isAuthenticated();
  if (!authed) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { url, appId, country: requestCountry } = body as {
      url?: string;
      appId?: string;
      country?: string;
    };

    let finalAppId: string;
    let finalCountry: string;

    // Parse URL or use provided appId
    if (url) {
      const parsed = parseAppStoreUrl(url);
      if (!parsed) {
        return NextResponse.json(
          { error: 'Invalid App Store URL. Please provide a valid URL like https://apps.apple.com/us/app/app-name/id123456789' },
          { status: 400 }
        );
      }
      finalAppId = parsed.appId;
      finalCountry = requestCountry || parsed.country;
    } else if (appId) {
      finalAppId = appId;
      finalCountry = requestCountry || 'us';
    } else {
      return NextResponse.json(
        { error: 'Either url or appId is required' },
        { status: 400 }
      );
    }

    // Fetch from iTunes API
    const lookupUrl = `https://itunes.apple.com/lookup?id=${finalAppId}&country=${finalCountry}`;
    const response = await fetch(lookupUrl);

    if (!response.ok) {
      return NextResponse.json(
        { error: 'Failed to fetch app from iTunes API' },
        { status: 500 }
      );
    }

    const data = await response.json();

    if (!data.results || data.results.length === 0) {
      return NextResponse.json(
        { error: 'App not found. Please check the App Store URL or ID.' },
        { status: 404 }
      );
    }

    // Find the first valid app result (filter out non-app results like music, podcasts)
    const appResult = data.results.find((r: iTunesResult) => isValidAppResult(r));

    if (!appResult) {
      console.error('No valid app in results:', JSON.stringify(data.results.slice(0, 2)).slice(0, 500));
      return NextResponse.json(
        { error: 'The ID does not correspond to an iOS app. It may be a music track, podcast, or other content.' },
        { status: 404 }
      );
    }

    const app = convertToAppResult(appResult);

    if (!app) {
      return NextResponse.json(
        { error: 'Failed to parse app data from iTunes API' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      app,
      country: finalCountry,
      source: 'itunes_lookup',
    });
  } catch (error) {
    console.error('Error looking up app:', error);
    return NextResponse.json(
      { error: 'Failed to look up app' },
      { status: 500 }
    );
  }
}

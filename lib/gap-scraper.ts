// Gap Analysis Scraper - TypeScript implementation
// Scrapes top apps from multiple countries for cross-market analysis

const CATEGORIES: Record<string, number> = {
  "books": 6018,
  "business": 6000,
  "developer-tools": 6026,
  "education": 6017,
  "entertainment": 6016,
  "finance": 6015,
  "food-drink": 6023,
  "games": 6014,
  "graphics-design": 6027,
  "health-fitness": 6013,
  "lifestyle": 6012,
  "magazines-newspapers": 6021,
  "medical": 6020,
  "music": 6011,
  "navigation": 6010,
  "news": 6009,
  "photo-video": 6008,
  "productivity": 6007,
  "reference": 6006,
  "shopping": 6024,
  "social-networking": 6005,
  "sports": 6004,
  "travel": 6003,
  "utilities": 6002,
  "weather": 6001,
  "action-games": 7001,
  "adventure-games": 7002,
  "arcade-games": 7003,
  "board-games": 7004,
  "card-games": 7005,
  "casino-games": 7006,
  "casual-games": 7003,
  "dice-games": 7007,
  "educational-games": 7008,
  "family-games": 7009,
  "music-games": 7011,
  "puzzle-games": 7012,
  "racing-games": 7013,
  "role-playing-games": 7014,
  "simulation-games": 7015,
  "sports-games": 7016,
  "strategy-games": 7017,
  "trivia-games": 7018,
  "word-games": 7019,
};

interface RSSApp {
  id: string;
  name: string;
  category: string;
}

interface AppDetails {
  id: string;
  name: string;
  bundle_id: string;
  developer: string;
  developer_id: string;
  price: number;
  currency: string;
  rating: number;
  rating_current_version: number;
  review_count: number;
  review_count_current_version: number;
  version: string;
  release_date: string;
  current_version_release_date: string;
  min_os_version: string;
  file_size_bytes: string;
  content_rating: string;
  genres: string[];
  primary_genre: string;
  primary_genre_id: string;
  url: string;
  icon_url: string;
  description: string;
  rank?: number;
}

export interface GapScrapeResult {
  app_store_id: string;
  app_name: string;
  app_icon_url: string | null;
  app_developer: string | null;
  app_rating: number | null;
  app_review_count: number;
  app_primary_genre: string | null;
  app_url: string | null;
  countries_present: string[];
  country_ranks: Record<string, number>;
  presence_count: number;
  average_rank: number | null;
}

async function fetchJson(url: string, timeout = 30000): Promise<Record<string, unknown>> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    const response = await fetch(url, {
      headers: { 'User-Agent': 'AppStoreScraper/1.0' },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      return {};
    }

    return await response.json();
  } catch (error) {
    console.error(`Error fetching ${url}:`, error);
    return {};
  }
}

async function getRssTopApps(
  country: string,
  categoryId: number,
  feedType = 'topfreeapplications',
  limit = 100
): Promise<RSSApp[]> {
  const url = `https://itunes.apple.com/${country}/rss/${feedType}/limit=${Math.min(limit, 200)}/genre=${categoryId}/json`;
  const data = await fetchJson(url);

  const feed = data.feed as Record<string, unknown> | undefined;
  const entries = (feed?.entry || []) as Array<Record<string, unknown>>;

  if (!entries.length) {
    return [];
  }

  return entries.map((entry) => {
    const idObj = entry.id as Record<string, unknown> | undefined;
    const attrs = idObj?.attributes as Record<string, unknown> | undefined;
    const nameObj = entry['im:name'] as Record<string, unknown> | undefined;
    const catObj = entry.category as Record<string, unknown> | undefined;
    const catAttrs = catObj?.attributes as Record<string, unknown> | undefined;

    return {
      id: (attrs?.['im:id'] as string) || '',
      name: (nameObj?.label as string) || '',
      category: (catAttrs?.label as string) || '',
    };
  });
}

async function lookupAppDetails(appIds: string[], country: string): Promise<Record<string, AppDetails>> {
  if (!appIds.length) {
    return {};
  }

  const idsStr = appIds.slice(0, 200).join(',');
  const url = `https://itunes.apple.com/lookup?id=${idsStr}&country=${country}`;
  const data = await fetchJson(url, 60000);

  const results: Record<string, AppDetails> = {};
  const items = (data.results || []) as Array<Record<string, unknown>>;

  for (const item of items) {
    const appId = String(item.trackId || '');
    let description = (item.description as string) || '';
    if (description.length > 500) {
      description = description.slice(0, 500) + '...';
    }

    results[appId] = {
      id: appId,
      name: (item.trackName as string) || '',
      bundle_id: (item.bundleId as string) || '',
      developer: (item.artistName as string) || '',
      developer_id: String(item.artistId || ''),
      price: (item.price as number) || 0,
      currency: (item.currency as string) || '',
      rating: (item.averageUserRating as number) || 0,
      rating_current_version: (item.averageUserRatingForCurrentVersion as number) || 0,
      review_count: (item.userRatingCount as number) || 0,
      review_count_current_version: (item.userRatingCountForCurrentVersion as number) || 0,
      version: (item.version as string) || '',
      release_date: (item.releaseDate as string) || '',
      current_version_release_date: (item.currentVersionReleaseDate as string) || '',
      min_os_version: (item.minimumOsVersion as string) || '',
      file_size_bytes: (item.fileSizeBytes as string) || '',
      content_rating: (item.contentAdvisoryRating as string) || '',
      genres: (item.genres as string[]) || [],
      primary_genre: (item.primaryGenreName as string) || '',
      primary_genre_id: String(item.primaryGenreId || ''),
      url: (item.trackViewUrl as string) || '',
      icon_url: (item.artworkUrl512 as string) || (item.artworkUrl100 as string) || '',
      description,
    };
  }

  return results;
}

async function scrapeCountry(
  country: string,
  categoryId: number,
  limit = 50,
  includePaid = true
): Promise<AppDetails[]> {
  const allApps: Record<string, AppDetails> = {};

  const feedTypes = ['topfreeapplications'];
  if (includePaid) {
    feedTypes.push('toppaidapplications', 'topgrossingapplications');
  }

  for (const feedType of feedTypes) {
    const rssApps = await getRssTopApps(country, categoryId, feedType, Math.min(limit, 200));

    if (rssApps.length) {
      const appIds = rssApps.map((app) => app.id).filter(Boolean);

      for (let i = 0; i < appIds.length; i += 200) {
        const batchIds = appIds.slice(i, i + 200);
        const details = await lookupAppDetails(batchIds, country);

        // Track rank position for each app
        for (let rank = 0; rank < batchIds.length; rank++) {
          const appId = batchIds[rank];
          if (details[appId]) {
            if (!allApps[appId]) {
              allApps[appId] = { ...details[appId], rank: rank + 1 };
            } else if ((rank + 1) < (allApps[appId].rank || 999)) {
              allApps[appId].rank = rank + 1;
            }
          }
        }

        if (i + 200 < appIds.length) {
          await new Promise((r) => setTimeout(r, 300));
        }
      }
    }

    await new Promise((r) => setTimeout(r, 300));
  }

  // Sort by rank and limit
  const sortedApps = Object.values(allApps).sort((a, b) => (a.rank || 999) - (b.rank || 999));
  return sortedApps.slice(0, limit);
}

export function resolveCategoryId(category: string): number | null {
  const categoryLower = category.toLowerCase().replace(/ /g, '-').replace(/_/g, '-');
  const categoryId = CATEGORIES[categoryLower];

  if (categoryId !== undefined) {
    return categoryId;
  }

  const parsed = parseInt(category, 10);
  return isNaN(parsed) ? null : parsed;
}

export interface ScrapeProgressCallback {
  onCountryStart: (country: string, index: number, total: number) => void;
  onCountryProgress: (country: string, appsFound: number) => void;
  onCountryComplete: (country: string, appsFound: number, uniqueNew: number, totalUnique: number) => void;
  onComplete: (results: GapScrapeResult[], countriesScraped: string[]) => void;
  onError: (error: string) => void;
}

export async function scrapeMultipleCountries(
  category: string,
  countries: string[],
  appsPerCountry: number,
  callbacks: ScrapeProgressCallback
): Promise<GapScrapeResult[]> {
  const categoryId = resolveCategoryId(category);

  if (categoryId === null) {
    callbacks.onError(`Invalid category: ${category}`);
    return [];
  }

  // Track all unique apps across countries
  const allApps: Record<string, {
    app: AppDetails;
    countries: Record<string, number>;
  }> = {};

  const totalCountries = countries.length;

  for (let index = 0; index < countries.length; index++) {
    const country = countries[index];

    callbacks.onCountryStart(country, index, totalCountries);

    try {
      const countryApps = await scrapeCountry(country, categoryId, appsPerCountry);
      let uniqueNew = 0;

      for (const app of countryApps) {
        const appId = app.id;
        const rank = app.rank || 999;

        if (allApps[appId]) {
          allApps[appId].countries[country] = rank;
        } else {
          allApps[appId] = {
            app,
            countries: { [country]: rank },
          };
          uniqueNew++;
        }
      }

      callbacks.onCountryProgress(country, countryApps.length);
      callbacks.onCountryComplete(country, countryApps.length, uniqueNew, Object.keys(allApps).length);
    } catch (error) {
      console.error(`Error scraping ${country}:`, error);
      callbacks.onCountryProgress(country, 0);
      callbacks.onCountryComplete(country, 0, 0, Object.keys(allApps).length);
    }

    // Rate limit between countries
    if (index < totalCountries - 1) {
      await new Promise((r) => setTimeout(r, 500));
    }
  }

  // Prepare final results
  const results: GapScrapeResult[] = [];

  for (const [appId, data] of Object.entries(allApps)) {
    const { app, countries: countryRanks } = data;
    const countriesPresent = Object.keys(countryRanks);

    const ranks = Object.values(countryRanks);
    const avgRank = ranks.length > 0 ? ranks.reduce((a, b) => a + b, 0) / ranks.length : null;

    results.push({
      app_store_id: appId,
      app_name: app.name,
      app_icon_url: app.icon_url || null,
      app_developer: app.developer || null,
      app_rating: app.rating || null,
      app_review_count: app.review_count || 0,
      app_primary_genre: app.primary_genre || null,
      app_url: app.url || null,
      countries_present: countriesPresent,
      country_ranks: countryRanks,
      presence_count: countriesPresent.length,
      average_rank: avgRank,
    });
  }

  // Sort by presence count (desc), then avg rank (asc)
  results.sort((a, b) => {
    if (b.presence_count !== a.presence_count) {
      return b.presence_count - a.presence_count;
    }
    return (a.average_rank || 999) - (b.average_rank || 999);
  });

  callbacks.onComplete(results, countries);

  return results;
}

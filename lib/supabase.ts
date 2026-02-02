import { createClient, SupabaseClient, PostgrestError } from '@supabase/supabase-js';
import { RedditSearchConfig, RedditAnalysisResult } from './reddit/types';

// ============================================
// Error Types for better error handling
// ============================================

export class SupabaseError extends Error {
  code: string;
  details: string | null;
  hint: string | null;

  constructor(message: string, code: string, details: string | null = null, hint: string | null = null) {
    super(message);
    this.name = 'SupabaseError';
    this.code = code;
    this.details = details;
    this.hint = hint;
  }

  static fromPostgrestError(error: PostgrestError): SupabaseError {
    return new SupabaseError(error.message, error.code, error.details, error.hint);
  }
}

export class NotFoundError extends SupabaseError {
  constructor(resource: string, identifier: string) {
    super(`${resource} not found: ${identifier}`, 'NOT_FOUND');
    this.name = 'NotFoundError';
  }
}

export class ValidationError extends SupabaseError {
  constructor(message: string) {
    super(message, 'VALIDATION_ERROR');
    this.name = 'ValidationError';
  }
}

// Result type for operations that can fail
export type Result<T, E = SupabaseError> =
  | { success: true; data: T }
  | { success: false; error: E };

// Helper to create success/failure results
export function success<T>(data: T): Result<T> {
  return { success: true, data };
}

export function failure<E extends SupabaseError>(error: E): Result<never, E> {
  return { success: false, error };
}

// ============================================
// Security Helpers
// ============================================

/**
 * Escapes special characters in a search string to prevent SQL injection
 * when used with PostgREST's ilike filter.
 *
 * This function escapes:
 * - Backslash (escape character itself)
 * - Percent and underscore (SQL LIKE wildcards)
 * - Comma, period, parentheses (PostgREST syntax characters)
 */
export function escapeSearchString(search: string): string {
  return search
    .replace(/\\/g, '\\\\')  // Escape backslashes first
    .replace(/%/g, '\\%')    // Escape percent (SQL wildcard)
    .replace(/_/g, '\\_')    // Escape underscore (SQL wildcard)
    .replace(/,/g, '\\,')    // Escape commas (PostgREST OR separator)
    .replace(/\./g, '\\.')   // Escape periods (PostgREST field separator)
    .replace(/\(/g, '\\(')   // Escape parentheses (PostgREST grouping)
    .replace(/\)/g, '\\)');
}

// Lazy initialization to avoid build-time errors when env vars aren't available
let _supabase: SupabaseClient | null = null;
let _supabaseAdmin: SupabaseClient | null = null;

function getSupabase(): SupabaseClient {
  if (!_supabase) {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseAnonKey) {
      throw new Error('Missing Supabase environment variables');
    }

    _supabase = createClient(supabaseUrl, supabaseAnonKey);
  }
  return _supabase;
}

// Service role client for server-side operations (storage uploads, bypassing RLS)
function getSupabaseAdmin(): SupabaseClient {
  if (!_supabaseAdmin) {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_KEY;

    if (!supabaseUrl || !serviceKey) {
      throw new Error('Missing Supabase service key - add SUPABASE_SERVICE_KEY to environment');
    }

    _supabaseAdmin = createClient(supabaseUrl, serviceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });
  }
  return _supabaseAdmin;
}

// Export getter instead of direct client reference
export const supabase = new Proxy({} as SupabaseClient, {
  get(_, prop) {
    return (getSupabase() as unknown as Record<string | symbol, unknown>)[prop];
  }
});

// Admin client for server-side operations
export const supabaseAdmin = new Proxy({} as SupabaseClient, {
  get(_, prop) {
    return (getSupabaseAdmin() as unknown as Record<string | symbol, unknown>)[prop];
  }
});

// Types for saved searches
export interface SavedSearch {
  id: string;
  name: string | null;
  params: SearchParams;
  results: AppResult[];
  result_count: number;
  created_at: string;
}

export interface SearchParams {
  country: string;
  category: string;
  limit: number;
  includePaid: boolean;
  deepSearch: boolean;
  minReviews?: number;
  maxReviews?: number;
  minRating?: number;
  maxRating?: number;
}

export interface AppResult {
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
}

// Database operations
export async function saveSearch(
  name: string | null,
  params: SearchParams,
  results: AppResult[]
): Promise<SavedSearch | null> {
  const { data, error } = await supabase
    .from('saved_searches')
    .insert({
      name,
      params,
      results,
      result_count: results.length,
    })
    .select()
    .single();

  if (error) {
    console.error('Error saving search:', error);
    return null;
  }
  return data;
}

export async function getSavedSearches(limit: number = 100): Promise<SavedSearch[]> {
  const safeLimit = Math.min(Math.max(1, limit), 500); // Cap at 500

  const { data, error } = await supabase
    .from('saved_searches')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(safeLimit);

  if (error) {
    console.error('Error fetching searches:', error);
    return [];
  }
  return data || [];
}

export async function getSavedSearch(id: string): Promise<SavedSearch | null> {
  const { data, error } = await supabase
    .from('saved_searches')
    .select('*')
    .eq('id', id)
    .single();

  if (error) {
    console.error('Error fetching search:', error);
    return null;
  }
  return data;
}

export async function deleteSavedSearch(id: string): Promise<boolean> {
  const { error } = await supabase
    .from('saved_searches')
    .delete()
    .eq('id', id);

  if (error) {
    console.error('Error deleting search:', error);
    return false;
  }
  return true;
}

// ============================================
// Master Apps Database Types & Operations
// ============================================

export interface MasterApp {
  id: string;
  app_store_id: string;
  name: string;
  bundle_id: string | null;
  developer: string | null;
  developer_id: string | null;
  price: number;
  currency: string;
  rating: number | null;
  rating_current_version: number | null;
  review_count: number;
  review_count_current_version: number;
  version: string | null;
  release_date: string | null;
  current_version_release_date: string | null;
  min_os_version: string | null;
  file_size_bytes: number | null;
  content_rating: string | null;
  genres: string[];
  primary_genre: string | null;
  primary_genre_id: string | null;
  url: string | null;
  icon_url: string | null;
  description: string | null;
  countries_found: string[];
  categories_found: string[];
  first_seen_at: string;
  last_updated_at: string;
  scrape_count: number;
  // AI Analysis - centralized storage
  ai_analysis: string | null;
  analysis_date: string | null;
  reviews: Review[];
  review_stats: ReviewStats | null;
}

export interface AppFilters {
  minReviews?: number;
  maxReviews?: number;
  minRating?: number;
  maxRating?: number;
  priceType?: 'all' | 'free' | 'paid';
  categories?: string[];
  countries?: string[];
  search?: string;
  sortBy?: 'reviews' | 'rating' | 'newest' | 'updated' | 'name' | 'developer' | 'price' | 'category' | 'scrapes';
  sortOrder?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
}

export interface AppsResponse {
  apps: MasterApp[];
  total: number;
  filters: AppFilters;
}

// Upsert apps to master database - OPTIMIZED: batch operations instead of N+1 queries
export async function upsertApps(
  apps: AppResult[],
  country: string,
  category: string
): Promise<{ inserted: number; updated: number; errors?: number }> {
  if (apps.length === 0) {
    return { inserted: 0, updated: 0, errors: 0 };
  }

  let inserted = 0;
  let updated = 0;
  let errors = 0;

  // Step 1: Batch fetch all existing apps in ONE query
  const appStoreIds = apps.map(app => app.id);
  const { data: existingApps, error: fetchError } = await supabase
    .from('apps')
    .select('app_store_id, countries_found, categories_found, scrape_count')
    .in('app_store_id', appStoreIds);

  if (fetchError) {
    console.error('Error fetching existing apps:', fetchError);
    return { inserted: 0, updated: 0, errors: apps.length };
  }

  // Build lookup map for existing apps
  const existingMap = new Map<string, {
    countries_found: string[];
    categories_found: string[];
    scrape_count: number;
  }>();
  for (const existing of existingApps || []) {
    existingMap.set(existing.app_store_id, {
      countries_found: existing.countries_found || [],
      categories_found: existing.categories_found || [],
      scrape_count: existing.scrape_count || 1,
    });
  }

  // Step 2: Prepare rows for bulk upsert
  const rows = apps.map(app => {
    const existing = existingMap.get(app.id);

    // Merge countries and categories if app exists
    const countriesFound = existing
      ? [...new Set([...existing.countries_found, country])]
      : [country];
    const categoriesFound = existing
      ? [...new Set([...existing.categories_found, category])]
      : [category];

    return {
      app_store_id: app.id,
      name: app.name,
      bundle_id: app.bundle_id,
      developer: app.developer,
      developer_id: app.developer_id,
      price: app.price,
      currency: app.currency,
      rating: app.rating,
      rating_current_version: app.rating_current_version,
      review_count: app.review_count,
      review_count_current_version: app.review_count_current_version,
      version: app.version,
      release_date: app.release_date || null,
      current_version_release_date: app.current_version_release_date || null,
      min_os_version: app.min_os_version,
      file_size_bytes: parseInt(app.file_size_bytes) || null,
      content_rating: app.content_rating,
      genres: app.genres,
      primary_genre: app.primary_genre,
      primary_genre_id: app.primary_genre_id,
      url: app.url,
      icon_url: app.icon_url,
      description: app.description,
      countries_found: countriesFound,
      categories_found: categoriesFound,
      last_updated_at: new Date().toISOString(),
      scrape_count: existing ? existing.scrape_count + 1 : 1,
    };
  });

  // Step 3: Bulk upsert in batches of 100
  const batchSize = 100;
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    const { error } = await supabase
      .from('apps')
      .upsert(batch, {
        onConflict: 'app_store_id',
        ignoreDuplicates: false,
      });

    if (error) {
      console.error(`Batch ${Math.floor(i / batchSize) + 1} error:`, error);
      errors += batch.length;
    } else {
      // Count inserts vs updates based on what we knew before
      for (const row of batch) {
        if (existingMap.has(row.app_store_id)) {
          updated++;
        } else {
          inserted++;
        }
      }
    }
  }

  // Invalidate filter cache if any new apps were inserted (new categories/countries possible)
  if (inserted > 0) {
    invalidateFilterCache();
  }

  return { inserted, updated, errors };
}

// Get apps with advanced filtering
export async function getAppsWithFilters(filters: AppFilters): Promise<AppsResponse> {
  const {
    minReviews,
    maxReviews,
    minRating,
    maxRating,
    priceType = 'all',
    categories,
    countries,
    search,
    sortBy = 'reviews',
    sortOrder = 'desc',
    limit = 50,
    offset = 0,
  } = filters;

  // Start building query
  let query = supabase.from('apps').select('*', { count: 'exact' });

  // Apply filters
  if (minReviews !== undefined) {
    query = query.gte('review_count', minReviews);
  }
  if (maxReviews !== undefined) {
    query = query.lte('review_count', maxReviews);
  }
  if (minRating !== undefined) {
    query = query.gte('rating', minRating);
  }
  if (maxRating !== undefined) {
    query = query.lte('rating', maxRating);
  }
  if (priceType === 'free') {
    query = query.eq('price', 0);
  } else if (priceType === 'paid') {
    query = query.gt('price', 0);
  }
  if (categories && categories.length > 0) {
    query = query.overlaps('categories_found', categories);
  }
  if (countries && countries.length > 0) {
    query = query.overlaps('countries_found', countries);
  }
  if (search) {
    // SECURITY: Escape special characters to prevent SQL injection
    const escapedSearch = escapeSearchString(search);
    query = query.or(`name.ilike.%${escapedSearch}%,developer.ilike.%${escapedSearch}%,bundle_id.ilike.%${escapedSearch}%`);
  }

  // Apply sorting
  const sortColumn = {
    reviews: 'review_count',
    rating: 'rating',
    newest: 'first_seen_at',
    updated: 'last_updated_at',
    name: 'name',
    developer: 'developer',
    price: 'price',
    category: 'primary_genre',
    scrapes: 'scrape_count',
  }[sortBy] || 'review_count';

  query = query.order(sortColumn, { ascending: sortOrder === 'asc' });

  // Apply pagination
  query = query.range(offset, offset + limit - 1);

  const { data, error, count } = await query;

  if (error) {
    console.error('Error fetching apps:', error);
    return { apps: [], total: 0, filters };
  }

  return {
    apps: data || [],
    total: count || 0,
    filters,
  };
}

// Cache for filter values to prevent repeated full table scans
// Cache expires after 5 minutes
interface FilterCache {
  categories: string[];
  countries: string[];
  timestamp: number;
}

let _filterCache: FilterCache | null = null;
const FILTER_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// Internal function to fetch filter data efficiently - single query for both
async function fetchFiltersFromDb(): Promise<{ categories: string[]; countries: string[] }> {
  // Use a single query with pagination to reduce memory pressure
  // Fetch in batches of 1000 to handle large datasets without loading everything
  const allCategories = new Set<string>();
  const allCountries = new Set<string>();

  const batchSize = 1000;
  let offset = 0;
  let hasMore = true;

  while (hasMore) {
    const { data, error } = await supabase
      .from('apps')
      .select('categories_found, countries_found')
      .range(offset, offset + batchSize - 1);

    if (error) {
      console.error('Error fetching filter values:', error);
      break;
    }

    if (!data || data.length === 0) {
      hasMore = false;
      break;
    }

    // Process this batch
    data.forEach(app => {
      (app.categories_found || []).forEach((cat: string) => allCategories.add(cat));
      (app.countries_found || []).forEach((country: string) => allCountries.add(country));
    });

    // Check if we got a full batch (might be more data)
    if (data.length < batchSize) {
      hasMore = false;
    } else {
      offset += batchSize;
    }
  }

  return {
    categories: Array.from(allCategories).sort(),
    countries: Array.from(allCountries).sort(),
  };
}

// Get cached filters or fetch from DB
async function getCachedFilters(): Promise<FilterCache> {
  const now = Date.now();

  // Return cached data if still valid
  if (_filterCache && (now - _filterCache.timestamp) < FILTER_CACHE_TTL) {
    return _filterCache;
  }

  // Fetch fresh data
  const { categories, countries } = await fetchFiltersFromDb();

  _filterCache = {
    categories,
    countries,
    timestamp: now,
  };

  return _filterCache;
}

// Invalidate filter cache (call after bulk inserts/updates)
export function invalidateFilterCache(): void {
  _filterCache = null;
}

// Get unique categories from all apps - OPTIMIZED with caching
export async function getUniqueCategories(): Promise<string[]> {
  const cache = await getCachedFilters();
  return cache.categories;
}

// Get unique countries from all apps - OPTIMIZED with caching
export async function getUniqueCountries(): Promise<string[]> {
  const cache = await getCachedFilters();
  return cache.countries;
}

// Get both filters in a single call - more efficient for dashboard
export async function getAppsFiltersForDashboard(): Promise<{ categories: string[]; countries: string[] }> {
  const cache = await getCachedFilters();
  return {
    categories: cache.categories,
    countries: cache.countries,
  };
}

// Get apps database stats
export async function getAppsStats(): Promise<{
  totalApps: number;
  totalCategories: number;
  totalCountries: number;
  avgRating: number;
  avgReviews: number;
}> {
  const { count } = await supabase
    .from('apps')
    .select('*', { count: 'exact', head: true });

  const { data: statsData } = await supabase
    .from('apps')
    .select('rating, review_count');

  const categories = await getUniqueCategories();
  const countries = await getUniqueCountries();

  let avgRating = 0;
  let avgReviews = 0;

  if (statsData && statsData.length > 0) {
    const validRatings = statsData.filter(a => a.rating !== null);
    avgRating = validRatings.length > 0
      ? validRatings.reduce((sum, a) => sum + (a.rating || 0), 0) / validRatings.length
      : 0;
    avgReviews = statsData.reduce((sum, a) => sum + (a.review_count || 0), 0) / statsData.length;
  }

  return {
    totalApps: count || 0,
    totalCategories: categories.length,
    totalCountries: countries.length,
    avgRating: Math.round(avgRating * 100) / 100,
    avgReviews: Math.round(avgReviews),
  };
}

// Get app from master database by app_store_id
export async function getMasterApp(appStoreId: string): Promise<MasterApp | null> {
  const { data, error } = await supabase
    .from('apps')
    .select('*')
    .eq('app_store_id', appStoreId)
    .single();

  if (error) {
    if (error.code !== 'PGRST116') {
      console.error('Error fetching master app:', error);
    }
    return null;
  }

  return data;
}

// Save or update app analysis in master database
export async function saveAppAnalysis(
  appStoreId: string,
  analysis: string,
  reviews: Review[],
  reviewStats: ReviewStats | null
): Promise<MasterApp | null> {
  const { data, error } = await supabase
    .from('apps')
    .update({
      ai_analysis: analysis,
      analysis_date: new Date().toISOString(),
      reviews: reviews,
      review_stats: reviewStats,
      last_updated_at: new Date().toISOString(),
    })
    .eq('app_store_id', appStoreId)
    .select()
    .single();

  if (error) {
    console.error('Error saving app analysis:', error);
    return null;
  }

  return data;
}

// Save reviews to master database (without analysis)
export async function saveAppReviews(
  appStoreId: string,
  reviews: Review[],
  reviewStats: ReviewStats | null
): Promise<MasterApp | null> {
  const { data, error } = await supabase
    .from('apps')
    .update({
      reviews: reviews,
      review_stats: reviewStats,
      last_updated_at: new Date().toISOString(),
    })
    .eq('app_store_id', appStoreId)
    .select()
    .single();

  if (error) {
    console.error('Error saving app reviews:', error);
    return null;
  }

  return data;
}

// Create app in master database if it doesn't exist
export async function ensureAppInMasterDb(app: AppResult, country: string): Promise<MasterApp | null> {
  // Check if app exists
  const existing = await getMasterApp(app.id);
  if (existing) {
    return existing;
  }

  // Insert new app
  const { data, error } = await supabase
    .from('apps')
    .insert({
      app_store_id: app.id,
      name: app.name,
      bundle_id: app.bundle_id,
      developer: app.developer,
      developer_id: app.developer_id,
      price: app.price,
      currency: app.currency,
      rating: app.rating,
      rating_current_version: app.rating_current_version,
      review_count: app.review_count,
      review_count_current_version: app.review_count_current_version,
      version: app.version,
      release_date: app.release_date || null,
      current_version_release_date: app.current_version_release_date || null,
      min_os_version: app.min_os_version,
      file_size_bytes: parseInt(app.file_size_bytes) || null,
      content_rating: app.content_rating,
      genres: app.genres,
      primary_genre: app.primary_genre,
      primary_genre_id: app.primary_genre_id,
      url: app.url,
      icon_url: app.icon_url,
      description: app.description,
      countries_found: [country],
      categories_found: [app.primary_genre],
    })
    .select()
    .single();

  if (error) {
    console.error('Error creating app in master db:', error);
    return null;
  }

  return data;
}

// Batch add apps to master database from iTunes IDs
// Fetches full app details and adds them, avoiding duplicates
export async function batchAddAppsFromiTunes(
  appIds: string[],
  country: string = 'us'
): Promise<{ added: number; skipped: number; failed: number }> {
  const results = { added: 0, skipped: 0, failed: 0 };

  if (appIds.length === 0) return results;

  // First, check which apps already exist
  const { data: existingApps } = await supabase
    .from('apps')
    .select('app_store_id')
    .in('app_store_id', appIds);

  const existingIds = new Set((existingApps || []).map(a => a.app_store_id));
  const newAppIds = appIds.filter(id => !existingIds.has(id));

  results.skipped = existingIds.size;

  if (newAppIds.length === 0) return results;

  // Batch lookup from iTunes (max 200 per request)
  const batchSize = 100;
  for (let i = 0; i < newAppIds.length; i += batchSize) {
    const batch = newAppIds.slice(i, i + batchSize);
    const url = `https://itunes.apple.com/lookup?id=${batch.join(',')}&country=${country}`;

    try {
      const response = await fetch(url);
      if (!response.ok) {
        results.failed += batch.length;
        continue;
      }

      const data = await response.json();
      const apps = data.results || [];

      for (const itunesApp of apps) {
        try {
          const appResult: AppResult = {
            id: itunesApp.trackId.toString(),
            name: itunesApp.trackName || '',
            bundle_id: itunesApp.bundleId || '',
            developer: itunesApp.artistName || '',
            developer_id: itunesApp.artistId?.toString() || '',
            price: itunesApp.price || 0,
            currency: itunesApp.currency || 'USD',
            rating: itunesApp.averageUserRating || 0,
            rating_current_version: itunesApp.averageUserRatingForCurrentVersion || 0,
            review_count: itunesApp.userRatingCount || 0,
            review_count_current_version: itunesApp.userRatingCountForCurrentVersion || 0,
            version: itunesApp.version || '',
            release_date: itunesApp.releaseDate || '',
            current_version_release_date: itunesApp.currentVersionReleaseDate || '',
            min_os_version: itunesApp.minimumOsVersion || '',
            file_size_bytes: itunesApp.fileSizeBytes || '0',
            content_rating: itunesApp.contentAdvisoryRating || '',
            genres: itunesApp.genres || [],
            primary_genre: itunesApp.primaryGenreName || '',
            primary_genre_id: itunesApp.primaryGenreId?.toString() || '',
            url: itunesApp.trackViewUrl || '',
            icon_url: itunesApp.artworkUrl100 || '',
            description: itunesApp.description || '',
          };

          const saved = await ensureAppInMasterDb(appResult, country);
          if (saved) {
            results.added++;
          } else {
            results.failed++;
          }
        } catch (err) {
          console.error('Error saving app:', itunesApp.trackId, err);
          results.failed++;
        }
      }

      // Rate limiting between batches
      if (i + batchSize < newAppIds.length) {
        await new Promise(r => setTimeout(r, 200));
      }
    } catch (error) {
      console.error('Error fetching iTunes batch:', error);
      results.failed += batch.length;
    }
  }

  return results;
}

// ============================================
// App Projects Types & Operations
// ============================================

export interface Review {
  id: string;
  title: string;
  content: string;
  rating: number | null;
  author: string;
  version: string;
  vote_count: number;
  vote_sum: number;
  country?: string;
  sort_source?: string;
  date?: string;
}

export interface ReviewStats {
  total: number;
  average_rating: number;
  rating_distribution: Record<string, number>;
  countries_scraped?: string[];
  scrape_settings?: {
    max_pages: number;
    multiple_sorts: boolean;
    countries: string[];
  };
}

// Forward declaration for LinkedCompetitor (full definition below)
export interface LinkedCompetitor {
  app_store_id: string;
  name: string;
  icon_url?: string;
  rating?: number;
  reviews?: number;
  scraped_reviews?: Review[];
  ai_analysis?: string;
  scraped_at?: string;
  analyzed_at?: string;
  reddit_analysis_id?: string;
}

// App idea recommendation structure
export interface AppIdeaRecommendationData {
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
    analyzedApps?: Array<{
      id: string;
      name: string;
      rating: number;
      reviews: number;
      iconUrl: string;
      price: number;
      hasSubscription: boolean;
    }>;
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
}

export interface AppProject {
  id: string;
  app_store_id: string;
  app_name: string;
  app_icon_url: string | null;
  app_developer: string | null;
  app_rating: number | null;
  app_review_count: number | null;
  app_url: string | null;
  app_bundle_id: string | null;
  app_primary_genre: string | null;
  app_price: number;
  app_currency: string;
  reviews: Review[];
  review_count: number;
  review_stats: ReviewStats | null;
  scrape_settings: Record<string, unknown> | null;
  ai_analysis: string | null;
  analysis_date: string | null;
  notes: string | null;
  country: string;
  created_at: string;
  updated_at: string;
  // Original Idea project fields
  project_type?: 'competitor_research' | 'original_idea';
  app_idea_session_id?: string;
  app_idea_recommendation?: AppIdeaRecommendationData;
  linked_competitors?: LinkedCompetitor[];
}

export interface CreateProjectInput {
  app: AppResult;
  reviews: Review[];
  reviewStats: ReviewStats | null;
  scrapeSettings?: Record<string, unknown>;
  aiAnalysis?: string;
  country: string;
  notes?: string;
}

// Create a new project
export async function createProject(input: CreateProjectInput): Promise<AppProject | null> {
  const { app, reviews, reviewStats, scrapeSettings, aiAnalysis, country, notes } = input;

  const { data, error } = await supabase
    .from('app_projects')
    .insert({
      app_store_id: app.id,
      app_name: app.name,
      app_icon_url: app.icon_url,
      app_developer: app.developer,
      app_rating: app.rating,
      app_review_count: app.review_count,
      app_url: app.url,
      app_bundle_id: app.bundle_id,
      app_primary_genre: app.primary_genre,
      app_price: app.price,
      app_currency: app.currency,
      reviews: reviews,
      review_count: reviews.length,
      review_stats: reviewStats,
      scrape_settings: scrapeSettings,
      ai_analysis: aiAnalysis,
      analysis_date: aiAnalysis ? new Date().toISOString() : null,
      notes: notes,
      country: country,
    })
    .select()
    .single();

  if (error) {
    console.error('Error creating project:', error);
    return null;
  }

  return data;
}

// Update an existing project
export async function updateProject(
  id: string,
  updates: Partial<{
    reviews: Review[];
    review_stats: ReviewStats;
    ai_analysis: string;
    notes: string;
  }>
): Promise<AppProject | null> {
  const updateData: Record<string, unknown> = { ...updates };

  if (updates.reviews) {
    updateData.review_count = updates.reviews.length;
  }

  if (updates.ai_analysis) {
    updateData.analysis_date = new Date().toISOString();
  }

  const { data, error } = await supabase
    .from('app_projects')
    .update(updateData)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    console.error('Error updating project:', error);
    return null;
  }

  return data;
}

// Get all projects (with safety limit)
export async function getProjects(limit: number = 200): Promise<AppProject[]> {
  const safeLimit = Math.min(Math.max(1, limit), 500); // Cap at 500

  const { data, error } = await supabase
    .from('app_projects')
    .select('*')
    .order('updated_at', { ascending: false })
    .limit(safeLimit);

  if (error) {
    console.error('Error fetching projects:', error);
    return [];
  }

  return data || [];
}

// Get projects grouped by category
export async function getProjectsByCategory(): Promise<Record<string, AppProject[]>> {
  const projects = await getProjects();

  const grouped: Record<string, AppProject[]> = {};

  projects.forEach((project) => {
    const category = project.app_primary_genre || 'Uncategorized';
    if (!grouped[category]) {
      grouped[category] = [];
    }
    grouped[category].push(project);
  });

  return grouped;
}

// Get a single project
export async function getProject(id: string): Promise<AppProject | null> {
  const { data, error } = await supabase
    .from('app_projects')
    .select('*')
    .eq('id', id)
    .single();

  if (error) {
    if (error.code !== 'PGRST116') {
      console.error('Error fetching project:', error.message);
    }
    return null;
  }

  return data;
}

// Delete a project and clean up related records
// Note: project_blueprints and project_chat_messages cascade via FK
// Reddit analyses linked via JSONB need manual cleanup
export async function deleteProject(id: string): Promise<boolean> {
  // First, get the project to find any linked reddit analyses
  const { data: project, error: fetchError } = await supabase
    .from('app_projects')
    .select('linked_competitors')
    .eq('id', id)
    .single();

  if (fetchError && fetchError.code !== 'PGRST116') {
    console.error('[deleteProject] Error fetching project:', fetchError);
    return false;
  }

  // Clean up reddit analyses if any linked competitors have them
  if (project?.linked_competitors) {
    const competitors = project.linked_competitors as LinkedCompetitor[];
    const analysisIds = competitors
      .map(c => c.reddit_analysis_id)
      .filter((id): id is string => !!id);

    if (analysisIds.length > 0) {
      // Delete unmet_need_solutions first (FK to reddit_analyses)
      await supabaseAdmin
        .from('unmet_need_solutions')
        .delete()
        .in('reddit_analysis_id', analysisIds);

      // Delete the reddit analyses
      await supabaseAdmin
        .from('reddit_analyses')
        .delete()
        .in('id', analysisIds);
    }
  }

  // Now delete the project (cascades to blueprints, chat messages)
  const { error } = await supabase
    .from('app_projects')
    .delete()
    .eq('id', id);

  if (error) {
    console.error('[deleteProject] Error deleting project:', error);
    return false;
  }

  return true;
}

// Check if project exists for an app
export async function getProjectByAppId(appStoreId: string): Promise<AppProject | null> {
  const { data, error } = await supabase
    .from('app_projects')
    .select('*')
    .eq('app_store_id', appStoreId)
    .order('updated_at', { ascending: false })
    .limit(1)
    .single();

  if (error) {
    // Not found is expected sometimes
    if (error.code !== 'PGRST116') {
      console.error('Error checking project:', error);
    }
    return null;
  }

  return data;
}

// ============================================
// Project Chat Messages Types & Operations
// ============================================

export interface ChatMessage {
  id: string;
  project_id: string;
  role: 'user' | 'assistant';
  content: string;
  created_at: string;
}

// Get all chat messages for a project
export async function getChatMessages(projectId: string): Promise<ChatMessage[]> {
  const { data, error } = await supabase
    .from('project_chat_messages')
    .select('*')
    .eq('project_id', projectId)
    .order('created_at', { ascending: true });

  if (error) {
    console.error('Error fetching chat messages:', error);
    return [];
  }

  return data || [];
}

// Save a single chat message
export async function saveChatMessage(
  projectId: string,
  role: 'user' | 'assistant',
  content: string
): Promise<ChatMessage | null> {
  const { data, error } = await supabase
    .from('project_chat_messages')
    .insert({
      project_id: projectId,
      role,
      content,
    })
    .select()
    .single();

  if (error) {
    console.error('Error saving chat message:', error);
    return null;
  }

  return data;
}

// Clear all chat messages for a project
export async function clearChatMessages(projectId: string): Promise<boolean> {
  const { error } = await supabase
    .from('project_chat_messages')
    .delete()
    .eq('project_id', projectId);

  if (error) {
    console.error('Error clearing chat messages:', error);
    return false;
  }

  return true;
}

// ============================================
// Gap Analysis Sessions Types & Operations
// ============================================

export interface GapAnalysisSession {
  id: string;
  name: string | null;
  category: string;
  countries: string[];
  apps_per_country: number;
  scrape_status: 'pending' | 'in_progress' | 'completed' | 'failed';
  scrape_progress: {
    current_country?: string;
    current_index?: number;
    total_countries?: number;
    countries_completed?: string[];
    total_apps_found?: number;
    unique_apps?: number;
    error?: string;
  };
  created_at: string;
  updated_at: string;
}

export interface GapAnalysisApp {
  id: string;
  session_id: string;
  app_store_id: string;
  app_name: string;
  app_icon_url: string | null;
  app_developer: string | null;
  app_rating: number | null;
  app_review_count: number;
  app_primary_genre: string | null;
  app_url: string | null;
  countries_present: string[];
  country_ranks: Record<string, number | null>;
  presence_count: number;
  average_rank: number | null;
  classification: 'global_leader' | 'brand' | 'local_champion' | null;
  classification_reason: string | null;
  created_at: string;
}

export interface GapAnalysisChatMessage {
  id: string;
  session_id: string;
  role: 'user' | 'assistant';
  content: string;
  created_at: string;
}

// Create a new gap analysis session
export async function createGapSession(
  name: string | null,
  category: string,
  countries: string[],
  appsPerCountry: number = 50
): Promise<GapAnalysisSession | null> {
  const { data, error } = await supabase
    .from('gap_analysis_sessions')
    .insert({
      name,
      category,
      countries,
      apps_per_country: appsPerCountry,
    })
    .select()
    .single();

  if (error) {
    console.error('Error creating gap session:', error);
    return null;
  }

  return data;
}

// Get all gap analysis sessions (with safety limit)
export async function getGapSessions(limit: number = 100): Promise<GapAnalysisSession[]> {
  const safeLimit = Math.min(Math.max(1, limit), 200); // Cap at 200

  const { data, error } = await supabase
    .from('gap_analysis_sessions')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(safeLimit);

  if (error) {
    console.error('Error fetching gap sessions:', error);
    return [];
  }

  return data || [];
}

// Get a single gap session with its apps
export async function getGapSession(id: string): Promise<{
  session: GapAnalysisSession;
  apps: GapAnalysisApp[];
} | null> {
  const { data: session, error: sessionError } = await supabase
    .from('gap_analysis_sessions')
    .select('*')
    .eq('id', id)
    .single();

  if (sessionError) {
    if (sessionError.code !== 'PGRST116') {
      console.error('Error fetching gap session:', sessionError);
    }
    return null;
  }

  const { data: apps, error: appsError } = await supabase
    .from('gap_analysis_apps')
    .select('*')
    .eq('session_id', id)
    .order('presence_count', { ascending: false });

  if (appsError) {
    console.error('Error fetching gap apps:', appsError);
  }

  return {
    session,
    apps: apps || [],
  };
}

// Update gap session status and progress
export async function updateGapSessionStatus(
  id: string,
  status: GapAnalysisSession['scrape_status'],
  progress?: GapAnalysisSession['scrape_progress']
): Promise<boolean> {
  const updateData: Record<string, unknown> = { scrape_status: status };
  if (progress) {
    updateData.scrape_progress = progress;
  }

  const { error } = await supabase
    .from('gap_analysis_sessions')
    .update(updateData)
    .eq('id', id);

  if (error) {
    console.error('Error updating gap session:', error);
    return false;
  }

  return true;
}

// Delete a gap session (cascades to apps and chat)
export async function deleteGapSession(id: string): Promise<boolean> {
  const { error } = await supabase
    .from('gap_analysis_sessions')
    .delete()
    .eq('id', id);

  if (error) {
    console.error('Error deleting gap session:', error);
    return false;
  }

  return true;
}

// Upsert apps for a gap session (update country presence if exists)
export async function upsertGapApp(
  sessionId: string,
  app: {
    app_store_id: string;
    app_name: string;
    app_icon_url?: string;
    app_developer?: string;
    app_rating?: number;
    app_review_count?: number;
    app_primary_genre?: string;
    app_url?: string;
  },
  country: string,
  rank: number
): Promise<GapAnalysisApp | null> {
  // Check if app exists in session
  const { data: existing } = await supabase
    .from('gap_analysis_apps')
    .select('*')
    .eq('session_id', sessionId)
    .eq('app_store_id', app.app_store_id)
    .single();

  if (existing) {
    // Update existing: add country to presence
    const countriesPresent = [...new Set([...existing.countries_present, country])];
    const countryRanks = { ...existing.country_ranks, [country]: rank };
    const presenceCount = countriesPresent.length;

    // Calculate average rank from non-null values
    const rankValues = Object.values(countryRanks).filter((r): r is number => r !== null);
    const averageRank = rankValues.length > 0
      ? rankValues.reduce((a, b) => a + b, 0) / rankValues.length
      : null;

    const { data, error } = await supabase
      .from('gap_analysis_apps')
      .update({
        countries_present: countriesPresent,
        country_ranks: countryRanks,
        presence_count: presenceCount,
        average_rank: averageRank,
        // Update metadata if newer/better
        app_rating: app.app_rating ?? existing.app_rating,
        app_review_count: Math.max(app.app_review_count || 0, existing.app_review_count || 0),
      })
      .eq('id', existing.id)
      .select()
      .single();

    if (error) {
      console.error('Error updating gap app:', error);
      return null;
    }

    return data;
  } else {
    // Insert new app
    const { data, error } = await supabase
      .from('gap_analysis_apps')
      .insert({
        session_id: sessionId,
        app_store_id: app.app_store_id,
        app_name: app.app_name,
        app_icon_url: app.app_icon_url,
        app_developer: app.app_developer,
        app_rating: app.app_rating,
        app_review_count: app.app_review_count || 0,
        app_primary_genre: app.app_primary_genre,
        app_url: app.app_url,
        countries_present: [country],
        country_ranks: { [country]: rank },
        presence_count: 1,
        average_rank: rank,
      })
      .select()
      .single();

    if (error) {
      console.error('Error inserting gap app:', error);
      return null;
    }

    return data;
  }
}

// Bulk insert gap apps - much faster than individual upserts
export async function bulkInsertGapApps(
  sessionId: string,
  apps: Array<{
    app_store_id: string;
    app_name: string;
    app_icon_url?: string | null;
    app_developer?: string | null;
    app_rating?: number | null;
    app_review_count?: number;
    app_primary_genre?: string | null;
    app_url?: string | null;
    countries_present: string[];
    country_ranks: Record<string, number>;
    presence_count: number;
    average_rank: number | null;
  }>
): Promise<boolean> {
  if (apps.length === 0) return true;

  // Prepare rows for bulk insert
  const rows = apps.map((app) => ({
    session_id: sessionId,
    app_store_id: app.app_store_id,
    app_name: app.app_name,
    app_icon_url: app.app_icon_url || null,
    app_developer: app.app_developer || null,
    app_rating: app.app_rating || null,
    app_review_count: app.app_review_count || 0,
    app_primary_genre: app.app_primary_genre || null,
    app_url: app.app_url || null,
    countries_present: app.countries_present,
    country_ranks: app.country_ranks,
    presence_count: app.presence_count,
    average_rank: app.average_rank,
  }));

  // Insert in batches of 100 to avoid hitting limits
  const batchSize = 100;
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    const { error } = await supabase
      .from('gap_analysis_apps')
      .upsert(batch, {
        onConflict: 'session_id,app_store_id',
        ignoreDuplicates: false
      });

    if (error) {
      console.error('Error bulk inserting gap apps:', error);
      return false;
    }
  }

  return true;
}

// Upsert gap analysis apps to the main apps table using BULK operations
// This ensures discovered apps are saved for future use and avoids wasting API costs
export async function upsertGapAppsToMaster(
  apps: Array<{
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
  }>,
  appCountriesMap: Record<string, string[]>,
  category: string
): Promise<{ inserted: number; updated: number; errors: number }> {
  let inserted = 0;
  let updated = 0;
  let errors = 0;

  console.log(`[upsertGapAppsToMaster] Starting BULK upsert of ${apps.length} apps`);

  // Filter apps that have country data
  const appsWithCountries = apps.filter(app => {
    const countries = appCountriesMap[app.id];
    return countries && countries.length > 0;
  });

  if (appsWithCountries.length === 0) {
    console.log(`[upsertGapAppsToMaster] No apps with country data to insert`);
    return { inserted: 0, updated: 0, errors: 0 };
  }

  // Step 1: Get all existing app_store_ids in ONE query
  const appStoreIds = appsWithCountries.map(app => app.id);
  const { data: existingApps, error: fetchError } = await supabase
    .from('apps')
    .select('app_store_id, countries_found, categories_found, scrape_count')
    .in('app_store_id', appStoreIds);

  if (fetchError) {
    console.error(`[upsertGapAppsToMaster] Error fetching existing apps:`, fetchError);
    return { inserted: 0, updated: 0, errors: apps.length };
  }

  // Build lookup map for existing apps
  const existingMap = new Map<string, { countries_found: string[]; categories_found: string[]; scrape_count: number }>();
  for (const existing of existingApps || []) {
    existingMap.set(existing.app_store_id, {
      countries_found: existing.countries_found || [],
      categories_found: existing.categories_found || [],
      scrape_count: existing.scrape_count || 1,
    });
  }

  console.log(`[upsertGapAppsToMaster] Found ${existingMap.size} existing apps, ${appsWithCountries.length - existingMap.size} new apps`);

  // Step 2: Prepare rows for bulk upsert
  const rows = appsWithCountries.map(app => {
    const appCountries = appCountriesMap[app.id] || [];
    const existing = existingMap.get(app.id);

    // Merge countries and categories if app exists
    const countriesFound = existing
      ? [...new Set([...existing.countries_found, ...appCountries])]
      : appCountries;
    const categoriesFound = existing
      ? [...new Set([...existing.categories_found, category])]
      : [category];

    return {
      app_store_id: app.id,
      name: app.name,
      bundle_id: app.bundle_id,
      developer: app.developer,
      developer_id: app.developer_id,
      price: app.price,
      currency: app.currency,
      rating: app.rating,
      rating_current_version: app.rating_current_version,
      review_count: app.review_count,
      review_count_current_version: app.review_count_current_version,
      version: app.version,
      release_date: app.release_date || null,
      current_version_release_date: app.current_version_release_date || null,
      min_os_version: app.min_os_version,
      file_size_bytes: parseInt(app.file_size_bytes) || null,
      content_rating: app.content_rating,
      genres: app.genres,
      primary_genre: app.primary_genre,
      primary_genre_id: app.primary_genre_id,
      url: app.url,
      icon_url: app.icon_url,
      description: app.description,
      countries_found: countriesFound,
      categories_found: categoriesFound,
      last_updated_at: new Date().toISOString(),
      scrape_count: existing ? existing.scrape_count + 1 : 1,
    };
  });

  // Step 3: Bulk upsert in batches of 100
  const batchSize = 100;
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    const { error } = await supabase
      .from('apps')
      .upsert(batch, {
        onConflict: 'app_store_id',
        ignoreDuplicates: false,
      });

    if (error) {
      console.error(`[upsertGapAppsToMaster] Batch ${Math.floor(i / batchSize) + 1} error:`, error);
      errors += batch.length;
    } else {
      // Count inserts vs updates based on what we knew before
      for (const row of batch) {
        if (existingMap.has(row.app_store_id)) {
          updated++;
        } else {
          inserted++;
        }
      }
    }
  }

  console.log(`[upsertGapAppsToMaster] Completed: ${inserted} inserted, ${updated} updated, ${errors} errors`);
  return { inserted, updated, errors };
}

// Bulk update app classifications
export async function updateGapAppClassifications(
  sessionId: string,
  classifications: Array<{
    app_store_id: string;
    classification: GapAnalysisApp['classification'];
    classification_reason: string;
  }>
): Promise<boolean> {
  for (const { app_store_id, classification, classification_reason } of classifications) {
    const { error } = await supabase
      .from('gap_analysis_apps')
      .update({ classification, classification_reason })
      .eq('session_id', sessionId)
      .eq('app_store_id', app_store_id);

    if (error) {
      console.error('Error updating classification:', error);
      return false;
    }
  }

  return true;
}

// Get apps for a session with filtering
export async function getGapAppsFiltered(
  sessionId: string,
  filters: {
    classification?: GapAnalysisApp['classification'] | 'all';
    minPresence?: number;
    maxPresence?: number;
    search?: string;
    sortBy?: 'presence' | 'rank' | 'rating' | 'reviews' | 'name';
    sortOrder?: 'asc' | 'desc';
  }
): Promise<GapAnalysisApp[]> {
  let query = supabase
    .from('gap_analysis_apps')
    .select('*')
    .eq('session_id', sessionId);

  if (filters.classification && filters.classification !== 'all') {
    query = query.eq('classification', filters.classification);
  }

  if (filters.minPresence) {
    query = query.gte('presence_count', filters.minPresence);
  }

  if (filters.maxPresence) {
    query = query.lte('presence_count', filters.maxPresence);
  }

  if (filters.search) {
    // SECURITY: Escape special characters to prevent SQL injection
    const escapedSearch = escapeSearchString(filters.search);
    query = query.or(`app_name.ilike.%${escapedSearch}%,app_developer.ilike.%${escapedSearch}%`);
  }

  const sortColumn = {
    presence: 'presence_count',
    rank: 'average_rank',
    rating: 'app_rating',
    reviews: 'app_review_count',
    name: 'app_name',
  }[filters.sortBy || 'presence'] || 'presence_count';

  const ascending = filters.sortBy === 'rank'
    ? (filters.sortOrder !== 'desc')
    : (filters.sortOrder === 'asc');

  query = query.order(sortColumn, { ascending });

  const { data, error } = await query;

  if (error) {
    console.error('Error fetching filtered gap apps:', error);
    return [];
  }

  return data || [];
}

// Gap analysis chat operations
export async function getGapChatMessages(sessionId: string): Promise<GapAnalysisChatMessage[]> {
  const { data, error } = await supabase
    .from('gap_analysis_chat_messages')
    .select('*')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: true });

  if (error) {
    console.error('Error fetching gap chat messages:', error);
    return [];
  }

  return data || [];
}

export async function saveGapChatMessage(
  sessionId: string,
  role: 'user' | 'assistant',
  content: string
): Promise<GapAnalysisChatMessage | null> {
  const { data, error } = await supabase
    .from('gap_analysis_chat_messages')
    .insert({
      session_id: sessionId,
      role,
      content,
    })
    .select()
    .single();

  if (error) {
    console.error('Error saving gap chat message:', error);
    return null;
  }

  return data;
}

export async function clearGapChatMessages(sessionId: string): Promise<boolean> {
  const { error } = await supabase
    .from('gap_analysis_chat_messages')
    .delete()
    .eq('session_id', sessionId);

  if (error) {
    console.error('Error clearing gap chat messages:', error);
    return false;
  }

  return true;
}

// ============================================
// Project Blueprints Types & Operations
// ============================================

export type BlueprintSectionStatus = 'pending' | 'generating' | 'completed' | 'error';
export type BlueprintSection = 'pareto' | 'identity' | 'design_system' | 'wireframes' | 'tech_stack' | 'xcode_setup' | 'prd' | 'aso' | 'manifest';

// Color palette stored with blueprint - auto-selected or user-chosen
export interface BlueprintColorPalette {
  colors: string[]; // Array of hex codes without #, e.g., ["264653", "2A9D8F", "E9C46A"]
  mood?: string; // professional, playful, calm, bold, warm, cool
  source_url?: string; // Coolors URL if from there
}

export interface ProjectBlueprint {
  id: string;
  project_id: string;

  // Section 1: Pareto Strategy
  pareto_strategy: string | null;
  pareto_status: BlueprintSectionStatus;
  pareto_generated_at: string | null;

  // Section 2: App Identity
  app_identity: string | null;
  app_identity_status: BlueprintSectionStatus;
  app_identity_generated_at: string | null;

  // Section 3: Design System
  design_system: string | null;
  design_system_status: BlueprintSectionStatus;
  design_system_generated_at: string | null;

  // Section 4: UI Wireframes
  ui_wireframes: string | null;
  ui_wireframes_status: BlueprintSectionStatus;
  ui_wireframes_generated_at: string | null;

  // Section 5: Tech Stack
  tech_stack: string | null;
  tech_stack_status: BlueprintSectionStatus;
  tech_stack_generated_at: string | null;

  // Section 6: Xcode Setup
  xcode_setup: string | null;
  xcode_setup_status: BlueprintSectionStatus;
  xcode_setup_generated_at: string | null;

  // Section 7: PRD
  prd_content: string | null;
  prd_status: BlueprintSectionStatus;
  prd_generated_at: string | null;

  // Section 8: ASO
  aso_content: string | null;
  aso_status: BlueprintSectionStatus;
  aso_generated_at: string | null;

  // Section 9: Build Manifest
  build_manifest: string | null;
  build_manifest_status: BlueprintSectionStatus;
  build_manifest_generated_at: string | null;

  // Color Palette - selected for this blueprint
  color_palette: BlueprintColorPalette | null;
  color_palette_source: 'auto' | 'user_selected' | 'coolors' | null;

  created_at: string;
  updated_at: string;
}

export interface BlueprintAttachment {
  id: string;
  blueprint_id: string;
  section: BlueprintSection;
  screen_label: string | null;
  file_name: string;
  storage_path: string;
  file_size: number | null;
  mime_type: string | null;
  created_at: string;
}

// Get or create blueprint for a project
export async function getOrCreateBlueprint(projectId: string): Promise<ProjectBlueprint | null> {
  // First try to get existing
  const { data: existing, error: fetchError } = await supabase
    .from('project_blueprints')
    .select('*')
    .eq('project_id', projectId)
    .single();

  if (existing) {
    return existing;
  }

  // If not found (PGRST116), create new
  if (fetchError && fetchError.code !== 'PGRST116') {
    console.error('Error fetching blueprint:', fetchError);
    return null;
  }

  // Create new blueprint
  const { data, error } = await supabase
    .from('project_blueprints')
    .insert({
      project_id: projectId,
    })
    .select()
    .single();

  if (error) {
    console.error('Error creating blueprint:', error);
    return null;
  }

  return data;
}

// Get blueprint by ID
export async function getBlueprint(id: string): Promise<ProjectBlueprint | null> {
  const { data, error } = await supabase
    .from('project_blueprints')
    .select('*')
    .eq('id', id)
    .single();

  if (error) {
    if (error.code !== 'PGRST116') {
      console.error('Error fetching blueprint:', error);
    }
    return null;
  }

  return data;
}

// Update blueprint section content and status
export async function updateBlueprintSection(
  id: string,
  section: BlueprintSection,
  content: string,
  status: BlueprintSectionStatus = 'completed'
): Promise<ProjectBlueprint | null> {
  const columnMap: Record<BlueprintSection, { content: string; status: string; timestamp: string }> = {
    pareto: { content: 'pareto_strategy', status: 'pareto_status', timestamp: 'pareto_generated_at' },
    identity: { content: 'app_identity', status: 'app_identity_status', timestamp: 'app_identity_generated_at' },
    design_system: { content: 'design_system', status: 'design_system_status', timestamp: 'design_system_generated_at' },
    wireframes: { content: 'ui_wireframes', status: 'ui_wireframes_status', timestamp: 'ui_wireframes_generated_at' },
    tech_stack: { content: 'tech_stack', status: 'tech_stack_status', timestamp: 'tech_stack_generated_at' },
    xcode_setup: { content: 'xcode_setup', status: 'xcode_setup_status', timestamp: 'xcode_setup_generated_at' },
    prd: { content: 'prd_content', status: 'prd_status', timestamp: 'prd_generated_at' },
    aso: { content: 'aso_content', status: 'aso_status', timestamp: 'aso_generated_at' },
    manifest: { content: 'build_manifest', status: 'build_manifest_status', timestamp: 'build_manifest_generated_at' },
  };

  const columns = columnMap[section];
  const updateData: Record<string, unknown> = {
    [columns.content]: content,
    [columns.status]: status,
    updated_at: new Date().toISOString(),
  };

  if (status === 'completed') {
    updateData[columns.timestamp] = new Date().toISOString();
  }

  const { data, error } = await supabase
    .from('project_blueprints')
    .update(updateData)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    console.error('Error updating blueprint section:', error);
    return null;
  }

  return data;
}

// Update blueprint section status only
export async function updateBlueprintSectionStatus(
  id: string,
  section: BlueprintSection,
  status: BlueprintSectionStatus
): Promise<boolean> {
  const statusColumn = {
    pareto: 'pareto_status',
    identity: 'app_identity_status',
    design_system: 'design_system_status',
    wireframes: 'ui_wireframes_status',
    tech_stack: 'tech_stack_status',
    xcode_setup: 'xcode_setup_status',
    prd: 'prd_status',
    aso: 'aso_status',
    manifest: 'build_manifest_status',
  }[section];

  const { error } = await supabase
    .from('project_blueprints')
    .update({
      [statusColumn]: status,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id);

  if (error) {
    console.error('Error updating blueprint status:', error);
    return false;
  }

  return true;
}

// Update blueprint color palette
export async function updateBlueprintPalette(
  id: string,
  palette: BlueprintColorPalette,
  source: 'auto' | 'user_selected' | 'coolors' = 'user_selected'
): Promise<ProjectBlueprint | null> {
  const { data, error } = await supabase
    .from('project_blueprints')
    .update({
      color_palette: palette,
      color_palette_source: source,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select()
    .single();

  if (error) {
    console.error('Error updating blueprint palette:', error);
    return null;
  }

  return data;
}

// Delete blueprint
export async function deleteBlueprint(id: string): Promise<boolean> {
  const { error } = await supabase
    .from('project_blueprints')
    .delete()
    .eq('id', id);

  if (error) {
    console.error('Error deleting blueprint:', error);
    return false;
  }

  return true;
}

// Get attachments for a blueprint
export async function getBlueprintAttachments(blueprintId: string): Promise<BlueprintAttachment[]> {
  const { data, error } = await supabase
    .from('blueprint_attachments')
    .select('*')
    .eq('blueprint_id', blueprintId)
    .order('created_at', { ascending: true });

  if (error) {
    console.error('Error fetching blueprint attachments:', error);
    return [];
  }

  return data || [];
}

// Get attachments for a specific section
export async function getBlueprintSectionAttachments(
  blueprintId: string,
  section: BlueprintSection
): Promise<BlueprintAttachment[]> {
  const { data, error } = await supabase
    .from('blueprint_attachments')
    .select('*')
    .eq('blueprint_id', blueprintId)
    .eq('section', section)
    .order('created_at', { ascending: true });

  if (error) {
    console.error('Error fetching section attachments:', error);
    return [];
  }

  return data || [];
}

// Create attachment record
export async function createBlueprintAttachment(
  blueprintId: string,
  section: BlueprintSection,
  screenLabel: string | null,
  fileName: string,
  storagePath: string,
  fileSize: number | null,
  mimeType: string | null
): Promise<BlueprintAttachment | null> {
  const { data, error } = await supabase
    .from('blueprint_attachments')
    .insert({
      blueprint_id: blueprintId,
      section,
      screen_label: screenLabel,
      file_name: fileName,
      storage_path: storagePath,
      file_size: fileSize,
      mime_type: mimeType,
    })
    .select()
    .single();

  if (error) {
    console.error('Error creating attachment:', error);
    return null;
  }

  return data;
}

// Delete attachment
export async function deleteBlueprintAttachment(id: string): Promise<boolean> {
  // First get the attachment to know the storage path
  const { data: attachment, error: fetchError } = await supabase
    .from('blueprint_attachments')
    .select('storage_path')
    .eq('id', id)
    .single();

  if (fetchError) {
    console.error('Error fetching attachment:', fetchError);
    return false;
  }

  // Delete from storage
  if (attachment?.storage_path) {
    const { error: storageError } = await supabase.storage
      .from('blueprint-attachments')
      .remove([attachment.storage_path]);

    if (storageError) {
      console.error('Error deleting from storage:', storageError);
      // Continue to delete record anyway
    }
  }

  // Delete record
  const { error } = await supabase
    .from('blueprint_attachments')
    .delete()
    .eq('id', id);

  if (error) {
    console.error('Error deleting attachment record:', error);
    return false;
  }

  return true;
}

// ============================================
// App Idea Sessions Types & Operations
// ============================================

export type AppIdeaEntryType = 'category' | 'keyword' | 'app';
export type AppIdeaSessionStatus = 'discovering' | 'clustering' | 'scoring' | 'analyzing' | 'complete';

export interface AppIdeaSession {
  id: string;
  entry_type: AppIdeaEntryType;
  entry_value: string;
  country: string;
  status: AppIdeaSessionStatus;
  discovered_keywords: unknown[] | null;
  clusters: unknown[] | null;
  cluster_scores: unknown[] | null;
  gap_analyses: unknown[] | null;
  recommendations: unknown[] | null;
  created_at: string;
  completed_at: string | null;
}

// Create a new app idea session
export async function createAppIdeaSession(
  entryType: AppIdeaEntryType,
  entryValue: string,
  country: string = 'us'
): Promise<AppIdeaSession | null> {
  const { data, error } = await supabase
    .from('app_idea_sessions')
    .insert({
      entry_type: entryType,
      entry_value: entryValue,
      country,
      status: 'discovering',
    })
    .select()
    .single();

  if (error) {
    console.error('Error creating app idea session:', error);
    return null;
  }

  return data;
}

// Update app idea session
export async function updateAppIdeaSession(
  id: string,
  updates: Partial<{
    status: AppIdeaSessionStatus;
    discovered_keywords: unknown[];
    clusters: unknown[];
    cluster_scores: unknown[];
    gap_analyses: unknown[];
    recommendations: unknown[];
    completed_at: string;
  }>
): Promise<AppIdeaSession | null> {
  const { data, error } = await supabase
    .from('app_idea_sessions')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    console.error('Error updating app idea session:', error);
    return null;
  }

  return data;
}

// Get a single app idea session
export async function getAppIdeaSession(id: string): Promise<AppIdeaSession | null> {
  const { data, error } = await supabase
    .from('app_idea_sessions')
    .select('*')
    .eq('id', id)
    .single();

  if (error) {
    if (error.code !== 'PGRST116') {
      console.error('Error fetching app idea session:', error);
    }
    return null;
  }

  return data;
}

// Get all app idea sessions (most recent first)
export async function getAppIdeaSessions(
  limit: number = 50
): Promise<AppIdeaSession[]> {
  const safeLimit = Math.min(Math.max(1, limit), 200); // Cap at 200

  const { data, error } = await supabase
    .from('app_idea_sessions')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(safeLimit);

  if (error) {
    console.error('Error fetching app idea sessions:', error);
    return [];
  }

  return data || [];
}

// Delete an app idea session
export async function deleteAppIdeaSession(id: string): Promise<boolean> {
  const { error } = await supabase
    .from('app_idea_sessions')
    .delete()
    .eq('id', id);

  if (error) {
    console.error('Error deleting app idea session:', error);
    return false;
  }

  return true;
}

// ============================================
// Original App Project Creation (from App Ideas)
// ============================================

export interface CreateOriginalProjectInput {
  name: string;
  category: string;
  appIdeaSessionId: string;
  recommendation: unknown;
  gapAnalysis: unknown;
  clusterScore: unknown;
  country: string;
}

// Create a project from an app idea recommendation
export async function createProjectFromIdea(
  input: CreateOriginalProjectInput
): Promise<AppProject | null> {
  const { name, category, appIdeaSessionId, recommendation, gapAnalysis, clusterScore, country } = input;

  // Auto-link competitors from gap analysis
  // Transform analyzedApps to LinkedCompetitor format
  const analyzedApps = (gapAnalysis as { analyzedApps?: Array<{
    id: string;
    name: string;
    iconUrl?: string;
    rating?: number;
    reviews?: number;
  }> })?.analyzedApps || [];

  const linkedCompetitors: LinkedCompetitor[] = analyzedApps.map(app => ({
    app_store_id: app.id,
    name: app.name,
    icon_url: app.iconUrl,
    rating: app.rating,
    reviews: app.reviews,
  }));

  const { data, error } = await supabase
    .from('app_projects')
    .insert({
      // For original ideas, app_store_id is null
      app_store_id: null,
      app_name: name,
      app_icon_url: null,
      app_developer: null,
      app_rating: null,
      app_review_count: null,
      app_url: null,
      app_bundle_id: null,
      app_primary_genre: category,
      app_price: 0,
      app_currency: 'USD',
      reviews: [],
      review_count: 0,
      review_stats: null,
      scrape_settings: null,
      ai_analysis: null,
      analysis_date: null,
      notes: null,
      country: country,
      // New fields for original ideas
      project_type: 'original_idea',
      app_idea_session_id: appIdeaSessionId,
      app_idea_recommendation: {
        recommendation,
        gapAnalysis,
        clusterScore,
      },
      // Auto-link competitors from gap analysis
      linked_competitors: linkedCompetitors,
    })
    .select()
    .single();

  if (error) {
    console.error('Error creating project from idea:', error);
    return null;
  }

  // Update the session to mark it as having a project
  await updateAppIdeaSession(appIdeaSessionId, {
    status: 'complete',
    completed_at: new Date().toISOString(),
  });

  return data;
}

// Get projects by type
export async function getProjectsByType(
  projectType: 'competitor_research' | 'original_idea'
): Promise<AppProject[]> {
  const { data, error } = await supabase
    .from('app_projects')
    .select('*')
    .eq('project_type', projectType)
    .order('updated_at', { ascending: false });

  if (error) {
    console.error('Error fetching projects by type:', error);
    return [];
  }

  return data || [];
}

// ============================================
// Linked Competitors Operations
// ============================================

// Get linked competitors for a project
export async function getLinkedCompetitors(projectId: string): Promise<LinkedCompetitor[]> {
  const { data, error } = await supabase
    .from('app_projects')
    .select('linked_competitors')
    .eq('id', projectId)
    .single();

  if (error) {
    console.error('[getLinkedCompetitors] Error:', error.message);
    return [];
  }

  return (data?.linked_competitors as LinkedCompetitor[]) || [];
}

// Add a linked competitor to a project
// Uses retry pattern to handle concurrent modifications safely
export async function addLinkedCompetitor(
  projectId: string,
  competitor: LinkedCompetitor,
  maxRetries: number = 3
): Promise<LinkedCompetitor[] | null> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    // Get current state with updated_at for optimistic locking
    const { data: project, error: fetchError } = await supabase
      .from('app_projects')
      .select('linked_competitors, updated_at')
      .eq('id', projectId)
      .single();

    if (fetchError) {
      console.error('[addLinkedCompetitor] Fetch error:', fetchError.message);
      return null;
    }

    const existing = (project?.linked_competitors as LinkedCompetitor[]) || [];
    const previousUpdatedAt = project?.updated_at;

    // Check if competitor already exists
    if (existing.some(c => c.app_store_id === competitor.app_store_id)) {
      return existing;
    }

    // Add new competitor
    const updated = [...existing, competitor];
    const newUpdatedAt = new Date().toISOString();

    // Update with optimistic lock check (updated_at must match)
    const { data, error } = await supabase
      .from('app_projects')
      .update({
        linked_competitors: updated,
        updated_at: newUpdatedAt
      })
      .eq('id', projectId)
      .eq('updated_at', previousUpdatedAt) // Optimistic lock
      .select('linked_competitors')
      .single();

    if (error) {
      // Check if it's a conflict (no rows updated due to updated_at mismatch)
      if (error.code === 'PGRST116' && attempt < maxRetries - 1) {
        // Row was modified by another request, retry
        await new Promise(r => setTimeout(r, 50 * (attempt + 1))); // Backoff
        continue;
      }
      console.error('[addLinkedCompetitor] Error:', error.message);
      return null;
    }

    return (data?.linked_competitors as LinkedCompetitor[]) || [];
  }

  console.error('[addLinkedCompetitor] Max retries exceeded');
  return null;
}

// Update a linked competitor's data (e.g., after scraping or analysis)
// Uses retry pattern to handle concurrent modifications safely
export async function updateLinkedCompetitor(
  projectId: string,
  appStoreId: string,
  updates: Partial<LinkedCompetitor>,
  maxRetries: number = 3
): Promise<LinkedCompetitor[] | null> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    // Get current state with updated_at for optimistic locking
    const { data: project, error: fetchError } = await supabase
      .from('app_projects')
      .select('linked_competitors, updated_at')
      .eq('id', projectId)
      .single();

    if (fetchError) {
      console.error('[updateLinkedCompetitor] Fetch error:', fetchError.message);
      return null;
    }

    const existing = (project?.linked_competitors as LinkedCompetitor[]) || [];
    const previousUpdatedAt = project?.updated_at;

    // Find and update the competitor
    const updated = existing.map(c => {
      if (c.app_store_id === appStoreId) {
        return { ...c, ...updates };
      }
      return c;
    });

    const newUpdatedAt = new Date().toISOString();

    // Update with optimistic lock check
    const { data, error } = await supabase
      .from('app_projects')
      .update({
        linked_competitors: updated,
        updated_at: newUpdatedAt
      })
      .eq('id', projectId)
      .eq('updated_at', previousUpdatedAt) // Optimistic lock
      .select('linked_competitors')
      .single();

    if (error) {
      if (error.code === 'PGRST116' && attempt < maxRetries - 1) {
        await new Promise(r => setTimeout(r, 50 * (attempt + 1)));
        continue;
      }
      console.error('[updateLinkedCompetitor] Error:', error.message);
      return null;
    }

    return (data?.linked_competitors as LinkedCompetitor[]) || [];
  }

  console.error('[updateLinkedCompetitor] Max retries exceeded');
  return null;
}

// Remove a linked competitor from a project
// Uses retry pattern to handle concurrent modifications safely
export async function removeLinkedCompetitor(
  projectId: string,
  appStoreId: string,
  maxRetries: number = 3
): Promise<LinkedCompetitor[] | null> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    // Get current state with updated_at for optimistic locking
    const { data: project, error: fetchError } = await supabase
      .from('app_projects')
      .select('linked_competitors, updated_at')
      .eq('id', projectId)
      .single();

    if (fetchError) {
      console.error('[removeLinkedCompetitor] Fetch error:', fetchError.message);
      return null;
    }

    const existing = (project?.linked_competitors as LinkedCompetitor[]) || [];
    const previousUpdatedAt = project?.updated_at;

    // Filter out the competitor
    const updated = existing.filter(c => c.app_store_id !== appStoreId);
    const newUpdatedAt = new Date().toISOString();

    // Update with optimistic lock check
    const { data, error } = await supabase
      .from('app_projects')
      .update({
        linked_competitors: updated,
        updated_at: newUpdatedAt
      })
      .eq('id', projectId)
      .eq('updated_at', previousUpdatedAt) // Optimistic lock
      .select('linked_competitors')
      .single();

    if (error) {
      if (error.code === 'PGRST116' && attempt < maxRetries - 1) {
        await new Promise(r => setTimeout(r, 50 * (attempt + 1)));
        continue;
      }
      console.error('[removeLinkedCompetitor] Error:', error.message);
      return null;
    }

    return (data?.linked_competitors as LinkedCompetitor[]) || [];
  }

  console.error('[removeLinkedCompetitor] Max retries exceeded');
  return null;
}

// Add multiple linked competitors at once
// Uses retry pattern to handle concurrent modifications safely
export async function addLinkedCompetitors(
  projectId: string,
  competitors: LinkedCompetitor[],
  maxRetries: number = 3
): Promise<LinkedCompetitor[] | null> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    // Get current state with updated_at for optimistic locking
    const { data: project, error: fetchError } = await supabase
      .from('app_projects')
      .select('linked_competitors, updated_at')
      .eq('id', projectId)
      .single();

    if (fetchError) {
      console.error('[addLinkedCompetitors] Fetch error:', fetchError.message);
      return null;
    }

    const existing = (project?.linked_competitors as LinkedCompetitor[]) || [];
    const existingIds = new Set(existing.map(c => c.app_store_id));
    const previousUpdatedAt = project?.updated_at;

    // Filter out duplicates and add new ones
    const newCompetitors = competitors.filter(c => !existingIds.has(c.app_store_id));

    if (newCompetitors.length === 0) {
      return existing;
    }

    const updated = [...existing, ...newCompetitors];
    const newUpdatedAt = new Date().toISOString();

    // Update with optimistic lock check
    const { data, error } = await supabase
      .from('app_projects')
      .update({
        linked_competitors: updated,
        updated_at: newUpdatedAt
      })
      .eq('id', projectId)
      .eq('updated_at', previousUpdatedAt) // Optimistic lock
      .select('linked_competitors')
      .single();

    if (error) {
      if (error.code === 'PGRST116' && attempt < maxRetries - 1) {
        await new Promise(r => setTimeout(r, 50 * (attempt + 1)));
        continue;
      }
      console.error('[addLinkedCompetitors] Error:', error.message);
      return null;
    }

    return (data?.linked_competitors as LinkedCompetitor[]) || [];
  }

  console.error('[addLinkedCompetitors] Max retries exceeded');
  return null;
}

// ============================================
// Reddit Analysis Types & Operations
// ============================================

// Create a new Reddit analysis record
export async function createRedditAnalysis(
  competitorId: string,
  searchConfig: RedditSearchConfig,
  result: Omit<RedditAnalysisResult, 'id' | 'competitorId' | 'searchConfig' | 'createdAt'>
): Promise<RedditAnalysisResult | null> {
  const { data, error } = await supabaseAdmin
    .from('reddit_analyses')
    .insert({
      competitor_id: competitorId,
      search_config: searchConfig,
      unmet_needs: result.unmetNeeds,
      trends: result.trends,
      sentiment: result.sentiment,
      language_patterns: result.languagePatterns,
      top_subreddits: result.topSubreddits,
      raw_data: result.rawData,
    })
    .select()
    .single();

  if (error) {
    console.error('Error creating Reddit analysis:', error);
    return null;
  }

  // Transform database row to RedditAnalysisResult
  return {
    id: data.id,
    competitorId: data.competitor_id,
    searchConfig: data.search_config as RedditSearchConfig,
    unmetNeeds: data.unmet_needs,
    trends: data.trends,
    sentiment: data.sentiment,
    languagePatterns: data.language_patterns || [],
    topSubreddits: data.top_subreddits,
    rawData: data.raw_data,
    createdAt: data.created_at,
  };
}

// Get Reddit analysis by competitor ID (most recent)
export async function getRedditAnalysis(
  competitorId: string
): Promise<RedditAnalysisResult | null> {
  const { data, error } = await supabase
    .from('reddit_analyses')
    .select('*')
    .eq('competitor_id', competitorId)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (error) {
    if (error.code !== 'PGRST116') {
      console.error('Error fetching Reddit analysis:', error);
    }
    return null;
  }

  return {
    id: data.id,
    competitorId: data.competitor_id,
    searchConfig: data.search_config as RedditSearchConfig,
    unmetNeeds: data.unmet_needs,
    trends: data.trends,
    sentiment: data.sentiment,
    languagePatterns: data.language_patterns || [],
    topSubreddits: data.top_subreddits,
    rawData: data.raw_data,
    createdAt: data.created_at,
  };
}

// Get Reddit analysis by ID
export async function getRedditAnalysisById(
  analysisId: string
): Promise<RedditAnalysisResult | null> {
  const { data, error } = await supabase
    .from('reddit_analyses')
    .select('*')
    .eq('id', analysisId)
    .single();

  if (error) {
    if (error.code !== 'PGRST116') {
      console.error('Error fetching Reddit analysis by ID:', error);
    }
    return null;
  }

  return {
    id: data.id,
    competitorId: data.competitor_id,
    searchConfig: data.search_config as RedditSearchConfig,
    unmetNeeds: data.unmet_needs,
    trends: data.trends,
    sentiment: data.sentiment,
    languagePatterns: data.language_patterns || [],
    topSubreddits: data.top_subreddits,
    rawData: data.raw_data,
    createdAt: data.created_at,
  };
}

// Save solution notes for unmet needs
export async function saveUnmetNeedSolutions(
  analysisId: string,
  solutions: Array<{ needId: string; notes: string }>
): Promise<boolean> {
  // Upsert each solution
  for (const solution of solutions) {
    const { error } = await supabaseAdmin
      .from('unmet_need_solutions')
      .upsert(
        {
          reddit_analysis_id: analysisId,
          need_id: solution.needId,
          solution_notes: solution.notes,
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: 'reddit_analysis_id,need_id',
        }
      );

    if (error) {
      console.error('Error saving unmet need solution:', error);
      return false;
    }
  }

  return true;
}

// Get solution notes for an analysis
export async function getUnmetNeedSolutions(
  analysisId: string
): Promise<Array<{ needId: string; notes: string }>> {
  const { data, error } = await supabase
    .from('unmet_need_solutions')
    .select('need_id, solution_notes')
    .eq('reddit_analysis_id', analysisId);

  if (error) {
    console.error('Error fetching unmet need solutions:', error);
    return [];
  }

  return (data || []).map(row => ({
    needId: row.need_id,
    notes: row.solution_notes || '',
  }));
}

// Link a Reddit analysis to a competitor in linked_competitors JSONB
export async function linkRedditAnalysisToCompetitor(
  competitorId: string,
  analysisId: string
): Promise<boolean> {
  // Fetch all projects with linked_competitors and filter in TypeScript
  // This is more reliable than JSONB containment queries which can be finicky
  const { data: allProjects, error: findError } = await supabaseAdmin
    .from('app_projects')
    .select('id, linked_competitors')
    .not('linked_competitors', 'is', null);

  if (findError) {
    console.error('Error finding projects:', findError);
    return false;
  }

  // Filter projects that have this competitor
  const projects = (allProjects || []).filter(project => {
    const competitors = (project.linked_competitors as LinkedCompetitor[]) || [];
    return competitors.some(c => c.app_store_id === competitorId);
  });

  if (projects.length === 0) {
    console.warn('No projects found with competitor:', competitorId);
    return false;
  }

  // Update each project's linked_competitors to add reddit_analysis_id
  let successCount = 0;
  for (const project of projects) {
    const competitors = (project.linked_competitors as LinkedCompetitor[]) || [];
    const updated = competitors.map(c => {
      if (c.app_store_id === competitorId) {
        return { ...c, reddit_analysis_id: analysisId };
      }
      return c;
    });

    const { error: updateError } = await supabaseAdmin
      .from('app_projects')
      .update({
        linked_competitors: updated,
        updated_at: new Date().toISOString(),
      })
      .eq('id', project.id);

    if (updateError) {
      console.error('Error updating linked_competitors for project', project.id, ':', updateError);
    } else {
      successCount++;
    }
  }

  return successCount > 0;
}


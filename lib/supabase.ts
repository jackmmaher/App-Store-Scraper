import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

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

export async function getSavedSearches(): Promise<SavedSearch[]> {
  const { data, error } = await supabase
    .from('saved_searches')
    .select('*')
    .order('created_at', { ascending: false });

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
  sortBy?: 'reviews' | 'rating' | 'newest' | 'updated' | 'name';
  sortOrder?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
}

export interface AppsResponse {
  apps: MasterApp[];
  total: number;
  filters: AppFilters;
}

// Upsert apps to master database
export async function upsertApps(
  apps: AppResult[],
  country: string,
  category: string
): Promise<{ inserted: number; updated: number }> {
  let inserted = 0;
  let updated = 0;

  for (const app of apps) {
    // Check if app exists
    const { data: existing } = await supabase
      .from('apps')
      .select('id, countries_found, categories_found, scrape_count')
      .eq('app_store_id', app.id)
      .single();

    if (existing) {
      // Update existing app
      const countriesFound = [...new Set([...(existing.countries_found || []), country])];
      const categoriesFound = [...new Set([...(existing.categories_found || []), category])];

      const { error } = await supabase
        .from('apps')
        .update({
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
          scrape_count: (existing.scrape_count || 1) + 1,
        })
        .eq('id', existing.id);

      if (!error) updated++;
    } else {
      // Insert new app
      const { error } = await supabase
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
          categories_found: [category],
        });

      if (!error) inserted++;
    }
  }

  return { inserted, updated };
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
    query = query.or(`name.ilike.%${search}%,developer.ilike.%${search}%,bundle_id.ilike.%${search}%`);
  }

  // Apply sorting
  const sortColumn = {
    reviews: 'review_count',
    rating: 'rating',
    newest: 'first_seen_at',
    updated: 'last_updated_at',
    name: 'name',
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

// Get unique categories from all apps
export async function getUniqueCategories(): Promise<string[]> {
  const { data, error } = await supabase
    .from('apps')
    .select('categories_found');

  if (error || !data) return [];

  const allCategories = new Set<string>();
  data.forEach(app => {
    (app.categories_found || []).forEach((cat: string) => allCategories.add(cat));
  });

  return Array.from(allCategories).sort();
}

// Get unique countries from all apps
export async function getUniqueCountries(): Promise<string[]> {
  const { data, error } = await supabase
    .from('apps')
    .select('countries_found');

  if (error || !data) return [];

  const allCountries = new Set<string>();
  data.forEach(app => {
    (app.countries_found || []).forEach((country: string) => allCountries.add(country));
  });

  return Array.from(allCountries).sort();
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

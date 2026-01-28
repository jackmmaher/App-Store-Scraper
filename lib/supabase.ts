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

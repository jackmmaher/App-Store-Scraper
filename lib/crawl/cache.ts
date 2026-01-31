/**
 * Cache helpers for Supabase crawl caching
 */

import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import type { CacheStats } from './types';

// Cache TTL in hours
const DEFAULT_CACHE_TTL_HOURS = 24;

/**
 * Get a cached crawl result from Supabase
 */
export async function getCachedCrawl<T>(
  cacheType: string,
  identifier: string,
  params?: Record<string, unknown>
): Promise<T | null> {
  try {
    const supabase = await createSupabaseClient();
    if (!supabase) return null;

    const cacheKey = generateCacheKey(cacheType, identifier, params);

    const { data, error } = await supabase
      .from('crawled_content')
      .select('content, expires_at, hit_count')
      .eq('cache_key', cacheKey)
      .single();

    if (error || !data) {
      return null;
    }

    // Check if expired
    const expiresAt = new Date(data.expires_at);
    if (new Date() > expiresAt) {
      // Delete expired entry
      await supabase
        .from('crawled_content')
        .delete()
        .eq('cache_key', cacheKey);
      return null;
    }

    // Update hit count
    await supabase
      .from('crawled_content')
      .update({ hit_count: (data.hit_count || 0) + 1 })
      .eq('cache_key', cacheKey);

    return data.content as T;
  } catch (error) {
    console.error('Cache get error:', error);
    return null;
  }
}

/**
 * Store a crawl result in Supabase cache
 */
export async function setCachedCrawl<T>(
  cacheType: string,
  identifier: string,
  content: T,
  params?: Record<string, unknown>,
  ttlHours: number = DEFAULT_CACHE_TTL_HOURS
): Promise<string | null> {
  try {
    const supabase = await createSupabaseClient();
    if (!supabase) return null;

    const cacheKey = generateCacheKey(cacheType, identifier, params);
    const now = new Date();
    const expiresAt = new Date(now.getTime() + ttlHours * 60 * 60 * 1000);

    const { error } = await supabase
      .from('crawled_content')
      .upsert({
        cache_key: cacheKey,
        cache_type: cacheType,
        identifier: identifier,
        content: content,
        created_at: now.toISOString(),
        expires_at: expiresAt.toISOString(),
        hit_count: 0,
      });

    if (error) {
      console.error('Cache set error:', error);
      return null;
    }

    return cacheKey;
  } catch (error) {
    console.error('Cache set error:', error);
    return null;
  }
}

/**
 * Invalidate a specific cache entry
 */
export async function invalidateCacheEntry(
  cacheType: string,
  identifier: string,
  params?: Record<string, unknown>
): Promise<boolean> {
  try {
    const supabase = await createSupabaseClient();
    if (!supabase) return false;

    const cacheKey = generateCacheKey(cacheType, identifier, params);

    const { error } = await supabase
      .from('crawled_content')
      .delete()
      .eq('cache_key', cacheKey);

    return !error;
  } catch (error) {
    console.error('Cache invalidate error:', error);
    return false;
  }
}

/**
 * Invalidate all cache entries of a specific type
 */
export async function invalidateCacheType(cacheType: string): Promise<number> {
  try {
    const supabase = await createSupabaseClient();
    if (!supabase) return 0;

    const { data, error } = await supabase
      .from('crawled_content')
      .delete()
      .eq('cache_type', cacheType)
      .select('id');

    if (error) {
      console.error('Cache invalidate type error:', error);
      return 0;
    }

    return data?.length || 0;
  } catch (error) {
    console.error('Cache invalidate type error:', error);
    return 0;
  }
}

/**
 * Clean up expired cache entries
 */
export async function cleanupExpiredCache(): Promise<number> {
  try {
    const supabase = await createSupabaseClient();
    if (!supabase) return 0;

    const { data, error } = await supabase
      .from('crawled_content')
      .delete()
      .lt('expires_at', new Date().toISOString())
      .select('id');

    if (error) {
      console.error('Cache cleanup error:', error);
      return 0;
    }

    return data?.length || 0;
  } catch (error) {
    console.error('Cache cleanup error:', error);
    return 0;
  }
}

/**
 * Get cache statistics
 */
export async function getCacheStats(): Promise<CacheStats | null> {
  try {
    const supabase = await createSupabaseClient();
    if (!supabase) return null;

    // Get total count
    const { count: totalCount } = await supabase
      .from('crawled_content')
      .select('*', { count: 'exact', head: true });

    // Get count by type
    const { data: typeData } = await supabase
      .from('crawled_content')
      .select('cache_type');

    const entriesByType: Record<string, number> = {};
    if (typeData) {
      for (const row of typeData) {
        const type = row.cache_type;
        entriesByType[type] = (entriesByType[type] || 0) + 1;
      }
    }

    return {
      memory_cache_size: 0, // Client-side doesn't have memory cache
      memory_cache_max_size: 0,
      supabase_total_entries: totalCount || 0,
      entries_by_type: entriesByType,
    };
  } catch (error) {
    console.error('Cache stats error:', error);
    return null;
  }
}

// ============================================================================
// Helpers
// ============================================================================

function generateCacheKey(
  cacheType: string,
  identifier: string,
  params?: Record<string, unknown>
): string {
  const keyParts = [cacheType, identifier];

  if (params && Object.keys(params).length > 0) {
    const sortedParams = JSON.stringify(params, Object.keys(params).sort());
    const paramsHash = hashString(sortedParams).slice(0, 8);
    keyParts.push(paramsHash);
  }

  return keyParts.join(':');
}

function hashString(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash).toString(16);
}

async function createSupabaseClient() {
  try {
    const cookieStore = await cookies();

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseAnonKey) {
      return null;
    }

    return createServerClient(supabaseUrl, supabaseAnonKey, {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          } catch {
            // Ignore in Server Component
          }
        },
      },
    });
  } catch {
    return null;
  }
}

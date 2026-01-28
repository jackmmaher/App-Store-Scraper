-- Master Apps Database Schema
-- Run this in Supabase SQL Editor

-- Create the apps table for storing all scraped apps
CREATE TABLE IF NOT EXISTS apps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  app_store_id TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  bundle_id TEXT,
  developer TEXT,
  developer_id TEXT,

  -- Metrics (updated on each scrape)
  price DECIMAL(10,2) DEFAULT 0,
  currency TEXT DEFAULT 'USD',
  rating DECIMAL(3,2),
  rating_current_version DECIMAL(3,2),
  review_count INTEGER DEFAULT 0,
  review_count_current_version INTEGER DEFAULT 0,

  -- Metadata
  version TEXT,
  release_date TIMESTAMPTZ,
  current_version_release_date TIMESTAMPTZ,
  min_os_version TEXT,
  file_size_bytes BIGINT,
  content_rating TEXT,
  genres TEXT[] DEFAULT '{}',
  primary_genre TEXT,
  primary_genre_id TEXT,

  -- URLs & Assets
  url TEXT,
  icon_url TEXT,
  description TEXT,

  -- Tracking
  countries_found TEXT[] DEFAULT '{}',
  categories_found TEXT[] DEFAULT '{}',
  first_seen_at TIMESTAMPTZ DEFAULT now(),
  last_updated_at TIMESTAMPTZ DEFAULT now(),
  scrape_count INTEGER DEFAULT 1
);

-- Indexes for efficient filtering
CREATE INDEX IF NOT EXISTS idx_apps_review_count ON apps(review_count DESC);
CREATE INDEX IF NOT EXISTS idx_apps_rating ON apps(rating DESC);
CREATE INDEX IF NOT EXISTS idx_apps_price ON apps(price);
CREATE INDEX IF NOT EXISTS idx_apps_primary_genre ON apps(primary_genre);
CREATE INDEX IF NOT EXISTS idx_apps_last_updated ON apps(last_updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_apps_first_seen ON apps(first_seen_at DESC);
CREATE INDEX IF NOT EXISTS idx_apps_app_store_id ON apps(app_store_id);

-- Full-text search indexes
CREATE INDEX IF NOT EXISTS idx_apps_name_search ON apps USING gin(to_tsvector('english', name));
CREATE INDEX IF NOT EXISTS idx_apps_developer_search ON apps USING gin(to_tsvector('english', developer));

-- Enable Row Level Security (optional - disable if using service role key)
-- ALTER TABLE apps ENABLE ROW LEVEL SECURITY;

-- Policy to allow all operations (adjust as needed)
-- CREATE POLICY "Allow all operations on apps" ON apps FOR ALL USING (true);

COMMENT ON TABLE apps IS 'Master database of all scraped App Store apps';
COMMENT ON COLUMN apps.countries_found IS 'Array of country codes where this app was found';
COMMENT ON COLUMN apps.categories_found IS 'Array of category slugs where this app appeared';
COMMENT ON COLUMN apps.scrape_count IS 'Number of times this app has been scraped/updated';

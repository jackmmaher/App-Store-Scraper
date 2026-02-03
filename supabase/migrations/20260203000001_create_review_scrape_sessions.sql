-- Create review_scrape_sessions table for incremental review scraping
-- Sessions store reviews separately from the main project, allowing users to:
-- 1. Run multiple scrapes without losing previous data
-- 2. View session history with review counts
-- 3. Merge sessions with deduplication

CREATE TABLE IF NOT EXISTS review_scrape_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES app_projects(id) ON DELETE CASCADE NOT NULL,
  app_store_id TEXT NOT NULL,
  target_reviews INTEGER DEFAULT 500,
  filters JSONB DEFAULT '[]'::jsonb, -- [{sort: 'mostRecent', target: 500}]
  country TEXT DEFAULT 'us',
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'failed', 'cancelled')),
  progress JSONB, -- {current_filter, reviews_collected, current_page, message}
  reviews_collected INTEGER DEFAULT 0,
  reviews JSONB DEFAULT '[]'::jsonb,
  stats JSONB, -- {total, average_rating, rating_distribution, countries_scraped}
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fast lookups by project
CREATE INDEX IF NOT EXISTS idx_review_scrape_sessions_project_id ON review_scrape_sessions(project_id);

-- Index for status filtering
CREATE INDEX IF NOT EXISTS idx_review_scrape_sessions_status ON review_scrape_sessions(status);

-- Add comment for documentation
COMMENT ON TABLE review_scrape_sessions IS 'Stores individual review scraping sessions for incremental scraping with history and merge support';

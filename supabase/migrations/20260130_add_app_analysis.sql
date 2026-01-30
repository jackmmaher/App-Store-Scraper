-- Add AI analysis columns to apps table (master database)
-- This centralizes analysis storage so it's shared across all views

ALTER TABLE apps
  ADD COLUMN IF NOT EXISTS ai_analysis TEXT,
  ADD COLUMN IF NOT EXISTS analysis_date TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reviews JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS review_stats JSONB;

-- Index for finding apps with analysis
CREATE INDEX IF NOT EXISTS idx_apps_analysis_date ON apps(analysis_date) WHERE analysis_date IS NOT NULL;

-- Comment for documentation
COMMENT ON COLUMN apps.ai_analysis IS 'Cached AI analysis of app reviews - shared across all views';
COMMENT ON COLUMN apps.analysis_date IS 'When the AI analysis was last generated';
COMMENT ON COLUMN apps.reviews IS 'Cached scraped reviews for the app';
COMMENT ON COLUMN apps.review_stats IS 'Statistics about the scraped reviews (counts by rating, etc)';

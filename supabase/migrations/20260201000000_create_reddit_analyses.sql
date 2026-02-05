-- Reddit Deep Dive Analysis Storage
-- Migration: 20260201000000_create_reddit_analyses.sql

-- Reddit analyses table - stores analysis results for a competitor
CREATE TABLE IF NOT EXISTS reddit_analyses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  competitor_id TEXT NOT NULL,  -- app_store_id string (e.g., "com.app.example"), NOT UUID
  search_config JSONB NOT NULL,
  unmet_needs JSONB NOT NULL DEFAULT '[]',
  trends JSONB NOT NULL DEFAULT '{}',
  sentiment JSONB NOT NULL DEFAULT '{}',
  language_patterns TEXT[] DEFAULT '{}',
  top_subreddits JSONB DEFAULT '[]',
  raw_data JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for competitor lookups
CREATE INDEX IF NOT EXISTS idx_reddit_analyses_competitor_id ON reddit_analyses(competitor_id);

-- Solution annotations for unmet needs
CREATE TABLE IF NOT EXISTS unmet_need_solutions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reddit_analysis_id UUID REFERENCES reddit_analyses(id) ON DELETE CASCADE,
  need_id TEXT NOT NULL,
  solution_notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(reddit_analysis_id, need_id)
);

-- Index for analysis lookups
CREATE INDEX IF NOT EXISTS idx_unmet_need_solutions_analysis ON unmet_need_solutions(reddit_analysis_id);

-- Note: linked_competitors are stored as JSONB in app_projects.linked_competitors
-- The reddit_analysis_id field is added to the JSONB objects by the application code
-- No separate linked_competitors table exists

-- RLS policies (match existing patterns)
ALTER TABLE reddit_analyses ENABLE ROW LEVEL SECURITY;
ALTER TABLE unmet_need_solutions ENABLE ROW LEVEL SECURITY;

-- Allow all operations for authenticated users (simple auth model)
CREATE POLICY "Allow all for reddit_analyses" ON reddit_analyses FOR ALL USING (true);
CREATE POLICY "Allow all for unmet_need_solutions" ON unmet_need_solutions FOR ALL USING (true);

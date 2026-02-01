-- Reddit Deep Dive Analysis Storage
-- Migration: 20260201000000_create_reddit_analyses.sql

-- Reddit analyses table - stores analysis results for a competitor
CREATE TABLE IF NOT EXISTS reddit_analyses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  competitor_id UUID NOT NULL,
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
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  reddit_analysis_id UUID REFERENCES reddit_analyses(id) ON DELETE CASCADE,
  need_id TEXT NOT NULL,
  solution_notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(reddit_analysis_id, need_id)
);

-- Index for analysis lookups
CREATE INDEX IF NOT EXISTS idx_unmet_need_solutions_analysis ON unmet_need_solutions(reddit_analysis_id);

-- Add reddit_analysis_id to linked_competitors if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'linked_competitors' AND column_name = 'reddit_analysis_id'
  ) THEN
    ALTER TABLE linked_competitors ADD COLUMN reddit_analysis_id UUID REFERENCES reddit_analyses(id);
  END IF;
END $$;

-- RLS policies (match existing patterns)
ALTER TABLE reddit_analyses ENABLE ROW LEVEL SECURITY;
ALTER TABLE unmet_need_solutions ENABLE ROW LEVEL SECURITY;

-- Allow all operations for authenticated users (simple auth model)
CREATE POLICY "Allow all for reddit_analyses" ON reddit_analyses FOR ALL USING (true);
CREATE POLICY "Allow all for unmet_need_solutions" ON unmet_need_solutions FOR ALL USING (true);

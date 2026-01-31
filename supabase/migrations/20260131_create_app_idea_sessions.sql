-- App Idea Sessions table for the App Idea Finder wizard
-- Stores the full pipeline state: discovery → clustering → scoring → gap analysis → recommendations

CREATE TABLE IF NOT EXISTS app_idea_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Entry point
  entry_type TEXT NOT NULL, -- 'category' | 'keyword' | 'app'
  entry_value TEXT NOT NULL, -- category name, keyword, or app_id
  country TEXT DEFAULT 'us',

  -- Pipeline state
  status TEXT DEFAULT 'discovering', -- discovering | clustering | scoring | analyzing | complete

  -- Results (stored as JSONB for flexibility)
  discovered_keywords JSONB,
  clusters JSONB,
  cluster_scores JSONB,
  gap_analyses JSONB,
  recommendations JSONB,

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

-- Index for querying sessions by status
CREATE INDEX IF NOT EXISTS idx_app_idea_sessions_status ON app_idea_sessions(status);

-- Index for querying by entry type
CREATE INDEX IF NOT EXISTS idx_app_idea_sessions_entry_type ON app_idea_sessions(entry_type);

-- Index for ordering by creation time
CREATE INDEX IF NOT EXISTS idx_app_idea_sessions_created_at ON app_idea_sessions(created_at DESC);

-- Gap Analysis Sessions Table
-- Stores cross-country market analysis sessions

CREATE TABLE gap_analysis_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT,
  category TEXT NOT NULL,
  countries TEXT[] NOT NULL,
  apps_per_country INTEGER DEFAULT 50,
  scrape_status TEXT DEFAULT 'pending', -- pending, in_progress, completed, failed
  scrape_progress JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for sessions
CREATE INDEX idx_gap_sessions_category ON gap_analysis_sessions(category);
CREATE INDEX idx_gap_sessions_created_at ON gap_analysis_sessions(created_at DESC);
CREATE INDEX idx_gap_sessions_status ON gap_analysis_sessions(scrape_status);

-- Function to auto-update updated_at
CREATE OR REPLACE FUNCTION update_gap_sessions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_gap_sessions_updated_at
  BEFORE UPDATE ON gap_analysis_sessions
  FOR EACH ROW
  EXECUTE FUNCTION update_gap_sessions_updated_at();


-- Gap Analysis Apps Table
-- Stores apps discovered during gap analysis with country presence data

CREATE TABLE gap_analysis_apps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES gap_analysis_sessions(id) ON DELETE CASCADE,
  app_store_id TEXT NOT NULL,
  app_name TEXT NOT NULL,
  app_icon_url TEXT,
  app_developer TEXT,
  app_rating NUMERIC(3,2),
  app_review_count INTEGER DEFAULT 0,
  app_primary_genre TEXT,
  app_url TEXT,
  countries_present TEXT[] DEFAULT '{}',
  country_ranks JSONB DEFAULT '{}',  -- {"us": 5, "gb": 12, "de": null}
  presence_count INTEGER DEFAULT 0,
  average_rank NUMERIC(5,2),
  classification TEXT,  -- global_leader, brand, local_champion, null
  classification_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(session_id, app_store_id)
);

-- Indexes for apps
CREATE INDEX idx_gap_apps_session ON gap_analysis_apps(session_id);
CREATE INDEX idx_gap_apps_store_id ON gap_analysis_apps(app_store_id);
CREATE INDEX idx_gap_apps_classification ON gap_analysis_apps(classification);
CREATE INDEX idx_gap_apps_presence ON gap_analysis_apps(presence_count DESC);
CREATE INDEX idx_gap_apps_avg_rank ON gap_analysis_apps(average_rank);


-- Gap Analysis Chat Messages Table
-- Stores chat history for gap analysis sessions

CREATE TABLE gap_analysis_chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES gap_analysis_sessions(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_gap_chat_session ON gap_analysis_chat_messages(session_id);
CREATE INDEX idx_gap_chat_created_at ON gap_analysis_chat_messages(created_at);

-- Disable Row Level Security (single-user app with app-level auth)
ALTER TABLE gap_analysis_sessions DISABLE ROW LEVEL SECURITY;
ALTER TABLE gap_analysis_apps DISABLE ROW LEVEL SECURITY;
ALTER TABLE gap_analysis_chat_messages DISABLE ROW LEVEL SECURITY;

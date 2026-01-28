-- App Projects Table
-- Stores saved research projects with cached reviews and AI analysis

CREATE TABLE app_projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- App Information (snapshot at time of save)
  app_store_id TEXT NOT NULL,
  app_name TEXT NOT NULL,
  app_icon_url TEXT,
  app_developer TEXT,
  app_rating DECIMAL(3,2),
  app_review_count INTEGER,
  app_url TEXT,
  app_bundle_id TEXT,
  app_primary_genre TEXT,
  app_price DECIMAL(10,2) DEFAULT 0,
  app_currency TEXT DEFAULT 'USD',

  -- Scraped Data
  reviews JSONB DEFAULT '[]',
  review_count INTEGER DEFAULT 0,
  review_stats JSONB,
  scrape_settings JSONB,

  -- AI Analysis
  ai_analysis TEXT,
  analysis_date TIMESTAMPTZ,

  -- User notes
  notes TEXT,

  -- Metadata
  country TEXT DEFAULT 'us',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes
CREATE INDEX idx_projects_app_store_id ON app_projects(app_store_id);
CREATE INDEX idx_projects_primary_genre ON app_projects(app_primary_genre);
CREATE INDEX idx_projects_created_at ON app_projects(created_at DESC);
CREATE INDEX idx_projects_updated_at ON app_projects(updated_at DESC);

-- Function to auto-update updated_at
CREATE OR REPLACE FUNCTION update_app_projects_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_app_projects_updated_at
  BEFORE UPDATE ON app_projects
  FOR EACH ROW
  EXECUTE FUNCTION update_app_projects_updated_at();

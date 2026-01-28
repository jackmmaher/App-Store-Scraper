-- Create app_concepts table for storing app concept wireframes and metadata
CREATE TABLE IF NOT EXISTS app_concepts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  linked_project_ids UUID[] DEFAULT '{}',
  wireframe_data JSONB DEFAULT '{"version": "1.0", "screens": {}, "settings": {"deviceFrame": "iphone-14-pro", "gridSize": 8}}',
  export_history JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Create index on linked_project_ids for faster lookups
CREATE INDEX IF NOT EXISTS idx_app_concepts_linked_projects ON app_concepts USING GIN (linked_project_ids);

-- Create index on updated_at for sorting
CREATE INDEX IF NOT EXISTS idx_app_concepts_updated_at ON app_concepts (updated_at DESC);

-- Enable Row Level Security (if needed)
-- ALTER TABLE app_concepts ENABLE ROW LEVEL SECURITY;

-- Add trigger to auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_app_concepts_updated_at ON app_concepts;
CREATE TRIGGER update_app_concepts_updated_at
    BEFORE UPDATE ON app_concepts
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

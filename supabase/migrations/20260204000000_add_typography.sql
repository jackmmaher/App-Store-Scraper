-- Add typography storage to project_blueprints
ALTER TABLE project_blueprints
ADD COLUMN IF NOT EXISTS typography JSONB,
ADD COLUMN IF NOT EXISTS typography_source TEXT CHECK (typography_source IN ('auto', 'user_selected'));

COMMENT ON COLUMN project_blueprints.typography IS 'Stored typography settings (heading/body fonts, weights)';
COMMENT ON COLUMN project_blueprints.typography_source IS 'How typography was selected';

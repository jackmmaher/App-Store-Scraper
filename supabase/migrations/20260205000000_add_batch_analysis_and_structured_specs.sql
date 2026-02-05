-- Add batch analysis results to app_projects
-- Stores the MergedAnalysisResult from the batch review analysis pipeline
ALTER TABLE app_projects
ADD COLUMN IF NOT EXISTS batch_analysis jsonb DEFAULT NULL;

-- Add pain point registry to app_projects
-- Stores the PainPointRegistry with merged review + Reddit pain points
ALTER TABLE app_projects
ADD COLUMN IF NOT EXISTS pain_point_registry jsonb DEFAULT NULL;

-- Add structured specs to project_blueprints
-- Stores machine-parsed JSON extracted from generated blueprint sections
-- (design tokens, data models, screens, features)
ALTER TABLE project_blueprints
ADD COLUMN IF NOT EXISTS structured_specs jsonb DEFAULT NULL;

-- Index for efficient queries on projects with batch analysis
CREATE INDEX IF NOT EXISTS idx_app_projects_batch_analysis_not_null
ON app_projects ((batch_analysis IS NOT NULL))
WHERE batch_analysis IS NOT NULL;

-- Comment on columns for documentation
COMMENT ON COLUMN app_projects.batch_analysis IS 'Structured analysis from batch review processing (all reviews, not sampled)';
COMMENT ON COLUMN app_projects.pain_point_registry IS 'Unified pain point registry merging review + Reddit sources';
COMMENT ON COLUMN project_blueprints.structured_specs IS 'Machine-parsed JSON specs extracted from generated blueprint sections (design tokens, data models, screens, features)';

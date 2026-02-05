-- Add project types to distinguish competitor research from original app ideas
-- Add linkage between projects and app idea sessions

-- Add project_type column to app_projects
ALTER TABLE app_projects
ADD COLUMN IF NOT EXISTS project_type TEXT DEFAULT 'competitor_research';

-- Add app_idea_session_id to link projects to their source idea
ALTER TABLE app_projects
ADD COLUMN IF NOT EXISTS app_idea_session_id UUID REFERENCES app_idea_sessions(id) ON DELETE SET NULL;

-- Add app_idea_recommendation to store the full recommendation context
ALTER TABLE app_projects
ADD COLUMN IF NOT EXISTS app_idea_recommendation JSONB;

-- For original_idea projects, app_store_id won't be required
-- Make it nullable (if not already)
ALTER TABLE app_projects
ALTER COLUMN app_store_id DROP NOT NULL;

-- Index for querying by project type
CREATE INDEX IF NOT EXISTS idx_app_projects_project_type ON app_projects(project_type);

-- Index for querying by app idea session
CREATE INDEX IF NOT EXISTS idx_app_projects_app_idea_session_id ON app_projects(app_idea_session_id);

-- Add comment for clarity
COMMENT ON COLUMN app_projects.project_type IS 'Type of project: competitor_research (analyzing existing app) or original_idea (new app from App Idea Finder)';
COMMENT ON COLUMN app_projects.app_idea_session_id IS 'Link to the app_idea_sessions table for original_idea projects';
COMMENT ON COLUMN app_projects.app_idea_recommendation IS 'Full recommendation JSON from App Idea Finder for original_idea projects';

-- Ensure competitor_research projects always have an app_store_id
ALTER TABLE app_projects ADD CONSTRAINT check_project_type_requires_app_store_id
  CHECK (project_type != 'competitor_research' OR app_store_id IS NOT NULL);

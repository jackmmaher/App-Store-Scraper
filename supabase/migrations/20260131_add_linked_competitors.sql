-- Migration: Add linked_competitors column to app_projects
-- Purpose: Enable linking competitor apps from gap analysis for review scraping and analysis

-- Add linked_competitors column to app_projects table
-- Array of: { app_store_id, name, icon_url, rating, reviews, scraped_reviews?, ai_analysis? }
ALTER TABLE app_projects
ADD COLUMN IF NOT EXISTS linked_competitors JSONB DEFAULT '[]';

-- Add index for querying projects with linked competitors
CREATE INDEX IF NOT EXISTS idx_app_projects_linked_competitors
ON app_projects USING GIN (linked_competitors);

-- Add comment for documentation
COMMENT ON COLUMN app_projects.linked_competitors IS 'Array of linked competitor apps from gap analysis with optional scraped reviews and AI analysis';

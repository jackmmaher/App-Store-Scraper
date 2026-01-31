-- Add new blueprint sections: App Identity, Design System, Xcode Setup, ASO
-- Migration: 20260131_add_blueprint_sections.sql

-- Add App Identity columns
ALTER TABLE project_blueprints
ADD COLUMN IF NOT EXISTS app_identity TEXT,
ADD COLUMN IF NOT EXISTS app_identity_status TEXT DEFAULT 'pending' CHECK (app_identity_status IN ('pending', 'generating', 'completed', 'error')),
ADD COLUMN IF NOT EXISTS app_identity_generated_at TIMESTAMPTZ;

-- Add Design System columns
ALTER TABLE project_blueprints
ADD COLUMN IF NOT EXISTS design_system TEXT,
ADD COLUMN IF NOT EXISTS design_system_status TEXT DEFAULT 'pending' CHECK (design_system_status IN ('pending', 'generating', 'completed', 'error')),
ADD COLUMN IF NOT EXISTS design_system_generated_at TIMESTAMPTZ;

-- Add Xcode Setup columns
ALTER TABLE project_blueprints
ADD COLUMN IF NOT EXISTS xcode_setup TEXT,
ADD COLUMN IF NOT EXISTS xcode_setup_status TEXT DEFAULT 'pending' CHECK (xcode_setup_status IN ('pending', 'generating', 'completed', 'error')),
ADD COLUMN IF NOT EXISTS xcode_setup_generated_at TIMESTAMPTZ;

-- Add ASO columns
ALTER TABLE project_blueprints
ADD COLUMN IF NOT EXISTS aso_content TEXT,
ADD COLUMN IF NOT EXISTS aso_status TEXT DEFAULT 'pending' CHECK (aso_status IN ('pending', 'generating', 'completed', 'error')),
ADD COLUMN IF NOT EXISTS aso_generated_at TIMESTAMPTZ;

-- Update blueprint_attachments section constraint to include new sections
-- First drop the existing constraint if it exists
ALTER TABLE blueprint_attachments
DROP CONSTRAINT IF EXISTS blueprint_attachments_section_check;

-- Add new constraint with all sections
ALTER TABLE blueprint_attachments
ADD CONSTRAINT blueprint_attachments_section_check
CHECK (section IN ('pareto', 'identity', 'design_system', 'wireframes', 'tech_stack', 'xcode_setup', 'prd', 'aso', 'manifest'));

-- Add comment explaining the sections
COMMENT ON TABLE project_blueprints IS 'Blueprint sections: 1-Strategy(pareto), 2-Identity, 3-Design System, 4-Wireframes, 5-Tech Stack, 6-Xcode Setup, 7-PRD, 8-ASO, 9-Manifest';

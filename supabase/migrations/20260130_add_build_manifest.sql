-- Add Section 5: Build Manifest columns to project_blueprints
ALTER TABLE project_blueprints
  ADD COLUMN build_manifest TEXT,
  ADD COLUMN build_manifest_status TEXT DEFAULT 'pending' CHECK (build_manifest_status IN ('pending', 'generating', 'completed', 'error')),
  ADD COLUMN build_manifest_generated_at TIMESTAMPTZ;

-- Update blueprint_attachments section constraint to include manifest
ALTER TABLE blueprint_attachments
  DROP CONSTRAINT blueprint_attachments_section_check,
  ADD CONSTRAINT blueprint_attachments_section_check
    CHECK (section IN ('pareto', 'wireframes', 'tech_stack', 'prd', 'manifest'));

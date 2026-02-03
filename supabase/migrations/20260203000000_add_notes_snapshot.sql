-- Add notes snapshot fields to project_blueprints
-- This captures the project notes at the time of first blueprint generation
-- so users can see what context was used and detect when notes have changed

ALTER TABLE project_blueprints
ADD COLUMN IF NOT EXISTS notes_snapshot TEXT,
ADD COLUMN IF NOT EXISTS notes_snapshot_at TIMESTAMPTZ;

-- Add comment for documentation
COMMENT ON COLUMN project_blueprints.notes_snapshot IS 'Snapshot of project notes captured when blueprint generation first started';
COMMENT ON COLUMN project_blueprints.notes_snapshot_at IS 'Timestamp when notes snapshot was captured';

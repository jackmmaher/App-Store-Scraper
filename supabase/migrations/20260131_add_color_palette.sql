-- Add color palette storage to blueprints
-- Palette is auto-selected based on app category, user can change it

ALTER TABLE project_blueprints
ADD COLUMN IF NOT EXISTS color_palette JSONB DEFAULT NULL;

ALTER TABLE project_blueprints
ADD COLUMN IF NOT EXISTS color_palette_source TEXT DEFAULT NULL;

-- color_palette structure:
-- {
--   "colors": ["264653", "2A9D8F", "E9C46A", "F4A261", "E76F51"],
--   "mood": "professional",
--   "source_url": "https://coolors.co/palette/264653-2a9d8f-e9c46a-f4a261-e76f51"
-- }

-- color_palette_source: 'auto' | 'user_selected' | 'coolors'

COMMENT ON COLUMN project_blueprints.color_palette IS 'Selected color palette as JSONB with colors array, mood, and source URL';
COMMENT ON COLUMN project_blueprints.color_palette_source IS 'How palette was selected: auto, user_selected, coolors';

-- Create project_blueprints table
CREATE TABLE project_blueprints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES app_projects(id) ON DELETE CASCADE,

  -- Section 1: Pareto Strategy
  pareto_strategy TEXT,
  pareto_status TEXT DEFAULT 'pending' CHECK (pareto_status IN ('pending', 'generating', 'completed', 'error')),
  pareto_generated_at TIMESTAMPTZ,

  -- Section 2: UI Wireframes
  ui_wireframes TEXT,
  ui_wireframes_status TEXT DEFAULT 'pending' CHECK (ui_wireframes_status IN ('pending', 'generating', 'completed', 'error')),
  ui_wireframes_generated_at TIMESTAMPTZ,

  -- Section 3: Tech Stack
  tech_stack TEXT,
  tech_stack_status TEXT DEFAULT 'pending' CHECK (tech_stack_status IN ('pending', 'generating', 'completed', 'error')),
  tech_stack_generated_at TIMESTAMPTZ,

  -- Section 4: PRD
  prd_content TEXT,
  prd_status TEXT DEFAULT 'pending' CHECK (prd_status IN ('pending', 'generating', 'completed', 'error')),
  prd_generated_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(project_id)
);

CREATE INDEX idx_blueprints_project ON project_blueprints(project_id);

-- Create blueprint_attachments table for inspiration screenshots
CREATE TABLE blueprint_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  blueprint_id UUID REFERENCES project_blueprints(id) ON DELETE CASCADE,
  section TEXT NOT NULL CHECK (section IN ('pareto', 'wireframes', 'tech_stack', 'prd')),
  screen_label TEXT,  -- e.g., "Onboarding 1", "Paywall", "Profile"
  file_name TEXT NOT NULL,
  storage_path TEXT NOT NULL,  -- Supabase Storage path
  file_size INTEGER,
  mime_type TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_attachments_blueprint ON blueprint_attachments(blueprint_id);

-- Enable RLS
ALTER TABLE project_blueprints ENABLE ROW LEVEL SECURITY;
ALTER TABLE blueprint_attachments ENABLE ROW LEVEL SECURITY;

-- RLS Policies (allow all for now - adjust based on your auth setup)
CREATE POLICY "Allow all for project_blueprints" ON project_blueprints
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Allow all for blueprint_attachments" ON blueprint_attachments
  FOR ALL USING (true) WITH CHECK (true);

-- Pipeline Jobs Table and Keyword Enrichment
-- Unified opportunity pipeline for background processing

-- ============================================================================
-- Pipeline Jobs Table (background job queue)
-- ============================================================================

CREATE TABLE IF NOT EXISTS pipeline_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_type TEXT NOT NULL,  -- 'discover', 'score_basic', 'enrich_full'
    status TEXT NOT NULL DEFAULT 'pending',  -- 'pending', 'running', 'completed', 'failed'
    priority INTEGER NOT NULL DEFAULT 0,  -- Higher = more important

    -- Job parameters (JSON)
    params JSONB NOT NULL DEFAULT '{}',
    -- e.g., { keyword: "habit tracker", category: "productivity", country: "us" }

    -- Progress tracking
    total_items INTEGER,
    processed_items INTEGER DEFAULT 0,

    -- Results
    result JSONB,

    -- Error handling
    error_message TEXT,
    retry_count INTEGER DEFAULT 0,
    max_retries INTEGER DEFAULT 3,

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ
);

-- Partial unique index to prevent duplicate pending/running jobs for same params
CREATE UNIQUE INDEX IF NOT EXISTS idx_pipeline_jobs_no_duplicates
ON pipeline_jobs(job_type, params)
WHERE status IN ('pending', 'running');

CREATE INDEX IF NOT EXISTS idx_pipeline_jobs_status ON pipeline_jobs(status);
CREATE INDEX IF NOT EXISTS idx_pipeline_jobs_priority_created ON pipeline_jobs(priority DESC, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_pipeline_jobs_type_status ON pipeline_jobs(job_type, status);

-- ============================================================================
-- Add Enrichment Columns to Keywords Table
-- ============================================================================

-- Add dimension scores (like opportunities table)
ALTER TABLE keywords ADD COLUMN IF NOT EXISTS competition_gap_score NUMERIC(4,1);
ALTER TABLE keywords ADD COLUMN IF NOT EXISTS market_demand_score NUMERIC(4,1);
ALTER TABLE keywords ADD COLUMN IF NOT EXISTS revenue_potential_score NUMERIC(4,1);
ALTER TABLE keywords ADD COLUMN IF NOT EXISTS trend_momentum_score NUMERIC(4,1);
ALTER TABLE keywords ADD COLUMN IF NOT EXISTS execution_feasibility_score NUMERIC(4,1);

-- Add enrichment tracking
ALTER TABLE keywords ADD COLUMN IF NOT EXISTS enrichment_level TEXT DEFAULT 'none';  -- 'none', 'basic', 'full'
ALTER TABLE keywords ADD COLUMN IF NOT EXISTS enriched_at TIMESTAMPTZ;

-- Add raw data storage (for trends, reddit, market estimates)
ALTER TABLE keywords ADD COLUMN IF NOT EXISTS raw_data JSONB;

-- Add AI-generated insights
ALTER TABLE keywords ADD COLUMN IF NOT EXISTS reasoning TEXT;
ALTER TABLE keywords ADD COLUMN IF NOT EXISTS top_competitor_weaknesses JSONB;  -- Array of strings
ALTER TABLE keywords ADD COLUMN IF NOT EXISTS suggested_differentiator TEXT;

-- Add category for better organization
ALTER TABLE keywords ADD COLUMN IF NOT EXISTS category TEXT;

-- Add indexes for the new columns
CREATE INDEX IF NOT EXISTS idx_keywords_enrichment_level ON keywords(enrichment_level);
CREATE INDEX IF NOT EXISTS idx_keywords_category ON keywords(category);
CREATE INDEX IF NOT EXISTS idx_keywords_competition_gap ON keywords(competition_gap_score DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_keywords_market_demand ON keywords(market_demand_score DESC NULLS LAST);

-- ============================================================================
-- Row Level Security (RLS)
-- ============================================================================

ALTER TABLE pipeline_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all for pipeline_jobs" ON pipeline_jobs FOR ALL USING (true);

-- ============================================================================
-- Functions for Pipeline Job Processing
-- ============================================================================

-- Function to claim the next pending job atomically (priority-based)
CREATE OR REPLACE FUNCTION claim_pipeline_job(p_job_types TEXT[] DEFAULT NULL)
RETURNS SETOF pipeline_jobs AS $$
    UPDATE pipeline_jobs
    SET status = 'running', started_at = NOW()
    WHERE id = (
        SELECT id FROM pipeline_jobs
        WHERE status = 'pending'
          AND (p_job_types IS NULL OR job_type = ANY(p_job_types))
          AND (retry_count < max_retries OR max_retries = 0)
        ORDER BY priority DESC, created_at ASC
        LIMIT 1
        FOR UPDATE SKIP LOCKED
    )
    RETURNING *;
$$ LANGUAGE sql;

-- Function to get pipeline stats
CREATE OR REPLACE FUNCTION get_pipeline_stats()
RETURNS TABLE (
    pending_count BIGINT,
    running_count BIGINT,
    completed_today BIGINT,
    failed_today BIGINT,
    avg_processing_time_ms NUMERIC
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        COUNT(*) FILTER (WHERE status = 'pending')::BIGINT AS pending_count,
        COUNT(*) FILTER (WHERE status = 'running')::BIGINT AS running_count,
        COUNT(*) FILTER (WHERE status = 'completed' AND completed_at::DATE = CURRENT_DATE)::BIGINT AS completed_today,
        COUNT(*) FILTER (WHERE status = 'failed' AND completed_at::DATE = CURRENT_DATE)::BIGINT AS failed_today,
        ROUND(AVG(EXTRACT(EPOCH FROM (completed_at - started_at)) * 1000) FILTER (WHERE status = 'completed' AND completed_at IS NOT NULL)::NUMERIC, 0) AS avg_processing_time_ms
    FROM pipeline_jobs
    WHERE created_at > NOW() - INTERVAL '7 days';
END;
$$ LANGUAGE plpgsql;

-- Function to create a job if not already pending/running
CREATE OR REPLACE FUNCTION create_pipeline_job_if_not_exists(
    p_job_type TEXT,
    p_params JSONB,
    p_priority INTEGER DEFAULT 0
)
RETURNS UUID AS $$
DECLARE
    v_existing_id UUID;
    v_new_id UUID;
BEGIN
    -- Check for existing pending/running job with same type and params
    SELECT id INTO v_existing_id
    FROM pipeline_jobs
    WHERE job_type = p_job_type
      AND params = p_params
      AND status IN ('pending', 'running')
    LIMIT 1;

    IF v_existing_id IS NOT NULL THEN
        RETURN v_existing_id;
    END IF;

    -- Create new job
    INSERT INTO pipeline_jobs (job_type, params, priority)
    VALUES (p_job_type, p_params, p_priority)
    RETURNING id INTO v_new_id;

    RETURN v_new_id;
END;
$$ LANGUAGE plpgsql;

-- Opportunity Ranker System Schema
-- Run this migration in your Supabase SQL editor

-- ============================================================================
-- Opportunities Table
-- ============================================================================

CREATE TABLE IF NOT EXISTS opportunities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    keyword TEXT NOT NULL,
    category TEXT NOT NULL,
    country TEXT NOT NULL DEFAULT 'us',

    -- Dimension scores (0-100)
    competition_gap_score NUMERIC(4,1),
    market_demand_score NUMERIC(4,1),
    revenue_potential_score NUMERIC(4,1),
    trend_momentum_score NUMERIC(4,1),
    execution_feasibility_score NUMERIC(4,1),

    -- Final weighted score
    opportunity_score NUMERIC(4,1),

    -- Score component breakdowns for transparency
    competition_gap_breakdown JSONB,
    market_demand_breakdown JSONB,
    revenue_potential_breakdown JSONB,
    trend_momentum_breakdown JSONB,
    execution_feasibility_breakdown JSONB,

    -- Raw data from external sources
    raw_data JSONB,

    -- AI-generated insights
    reasoning TEXT,
    top_competitor_weaknesses JSONB,  -- Array of strings
    suggested_differentiator TEXT,

    -- Tracking
    scored_at TIMESTAMPTZ DEFAULT NOW(),
    status TEXT DEFAULT 'scored',  -- 'scored', 'selected', 'blueprinted', 'published'

    -- Link to generated blueprint (when status = 'blueprinted' or later)
    blueprint_id UUID,
    selected_at TIMESTAMPTZ,
    blueprinted_at TIMESTAMPTZ,

    -- Unique constraint on keyword + category + country
    UNIQUE(keyword, category, country)
);

-- Indexes for fast queries
CREATE INDEX IF NOT EXISTS idx_opportunities_score ON opportunities(opportunity_score DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_opportunities_status ON opportunities(status);
CREATE INDEX IF NOT EXISTS idx_opportunities_category ON opportunities(category);
CREATE INDEX IF NOT EXISTS idx_opportunities_country ON opportunities(country);
CREATE INDEX IF NOT EXISTS idx_opportunities_scored_at ON opportunities(scored_at DESC);
CREATE INDEX IF NOT EXISTS idx_opportunities_selected_at ON opportunities(selected_at DESC);

-- Composite index for daily queries
CREATE INDEX IF NOT EXISTS idx_opportunities_category_score ON opportunities(category, opportunity_score DESC NULLS LAST);

-- ============================================================================
-- Opportunity History Table (for trend tracking)
-- ============================================================================

CREATE TABLE IF NOT EXISTS opportunity_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    opportunity_id UUID REFERENCES opportunities(id) ON DELETE CASCADE,
    opportunity_score NUMERIC(4,1),
    competition_gap_score NUMERIC(4,1),
    market_demand_score NUMERIC(4,1),
    revenue_potential_score NUMERIC(4,1),
    trend_momentum_score NUMERIC(4,1),
    execution_feasibility_score NUMERIC(4,1),
    recorded_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_opportunity_history_opportunity_id ON opportunity_history(opportunity_id);
CREATE INDEX IF NOT EXISTS idx_opportunity_history_recorded_at ON opportunity_history(recorded_at DESC);

-- ============================================================================
-- Opportunity Jobs Table (background job queue)
-- ============================================================================

CREATE TABLE IF NOT EXISTS opportunity_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_type TEXT NOT NULL,  -- 'score_single', 'discover_category', 'daily_run'
    status TEXT NOT NULL DEFAULT 'pending',  -- 'pending', 'running', 'completed', 'failed'

    -- Job parameters (JSON)
    params JSONB NOT NULL DEFAULT '{}',

    -- Progress tracking
    total_items INTEGER,
    processed_items INTEGER DEFAULT 0,
    opportunities_scored INTEGER DEFAULT 0,

    -- Results
    winner_id UUID,
    winner_keyword TEXT,
    winner_score NUMERIC(4,1),

    -- Error handling
    error_message TEXT,

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_opportunity_jobs_status ON opportunity_jobs(status);
CREATE INDEX IF NOT EXISTS idx_opportunity_jobs_created_at ON opportunity_jobs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_opportunity_jobs_type_status ON opportunity_jobs(job_type, status);

-- ============================================================================
-- Daily Run Results Table (track each autonomous run)
-- ============================================================================

CREATE TABLE IF NOT EXISTS opportunity_daily_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    run_date DATE NOT NULL DEFAULT CURRENT_DATE,

    -- Categories processed
    categories_processed JSONB,  -- Array of category names

    -- Statistics
    total_keywords_discovered INTEGER DEFAULT 0,
    total_keywords_scored INTEGER DEFAULT 0,

    -- Winner
    winner_opportunity_id UUID REFERENCES opportunities(id),
    winner_keyword TEXT,
    winner_category TEXT,
    winner_score NUMERIC(4,1),

    -- Blueprint generation
    blueprint_triggered BOOLEAN DEFAULT FALSE,
    blueprint_id UUID,

    -- Status
    status TEXT DEFAULT 'running',  -- 'running', 'completed', 'failed'
    error_message TEXT,

    -- Timestamps
    started_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ,

    -- One run per day
    UNIQUE(run_date)
);

CREATE INDEX IF NOT EXISTS idx_opportunity_daily_runs_date ON opportunity_daily_runs(run_date DESC);
CREATE INDEX IF NOT EXISTS idx_opportunity_daily_runs_status ON opportunity_daily_runs(status);

-- ============================================================================
-- Row Level Security (RLS)
-- ============================================================================

ALTER TABLE opportunities ENABLE ROW LEVEL SECURITY;
ALTER TABLE opportunity_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE opportunity_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE opportunity_daily_runs ENABLE ROW LEVEL SECURITY;

-- Allow all operations (adjust based on your auth requirements)
CREATE POLICY "Allow all for opportunities" ON opportunities FOR ALL USING (true);
CREATE POLICY "Allow all for opportunity_history" ON opportunity_history FOR ALL USING (true);
CREATE POLICY "Allow all for opportunity_jobs" ON opportunity_jobs FOR ALL USING (true);
CREATE POLICY "Allow all for opportunity_daily_runs" ON opportunity_daily_runs FOR ALL USING (true);

-- ============================================================================
-- Useful Functions
-- ============================================================================

-- Function to claim the next pending opportunity job atomically
CREATE OR REPLACE FUNCTION claim_opportunity_job()
RETURNS SETOF opportunity_jobs AS $$
    UPDATE opportunity_jobs
    SET status = 'running', started_at = NOW()
    WHERE id = (
        SELECT id FROM opportunity_jobs
        WHERE status = 'pending'
        ORDER BY created_at ASC
        LIMIT 1
        FOR UPDATE SKIP LOCKED
    )
    RETURNING *;
$$ LANGUAGE sql;

-- Function to get opportunity statistics
CREATE OR REPLACE FUNCTION get_opportunity_stats(p_country TEXT DEFAULT 'us')
RETURNS TABLE (
    total_opportunities BIGINT,
    avg_score NUMERIC,
    high_opportunity_count BIGINT,
    selected_count BIGINT,
    blueprinted_count BIGINT,
    top_category TEXT,
    top_category_avg_score NUMERIC
) AS $$
BEGIN
    RETURN QUERY
    WITH category_stats AS (
        SELECT
            category,
            ROUND(AVG(opportunity_score)::NUMERIC, 1) as avg_cat_score
        FROM opportunities
        WHERE country = p_country AND opportunity_score IS NOT NULL
        GROUP BY category
        ORDER BY avg_cat_score DESC
        LIMIT 1
    )
    SELECT
        COUNT(*)::BIGINT AS total_opportunities,
        ROUND(AVG(o.opportunity_score)::NUMERIC, 1) AS avg_score,
        COUNT(CASE WHEN o.opportunity_score >= 60 THEN 1 END)::BIGINT AS high_opportunity_count,
        COUNT(CASE WHEN o.status = 'selected' THEN 1 END)::BIGINT AS selected_count,
        COUNT(CASE WHEN o.status = 'blueprinted' THEN 1 END)::BIGINT AS blueprinted_count,
        cs.category AS top_category,
        cs.avg_cat_score AS top_category_avg_score
    FROM opportunities o
    LEFT JOIN category_stats cs ON true
    WHERE o.country = p_country;
END;
$$ LANGUAGE plpgsql;

-- Function to get today's winner
CREATE OR REPLACE FUNCTION get_todays_winner(p_country TEXT DEFAULT 'us')
RETURNS TABLE (
    opportunity_id UUID,
    keyword TEXT,
    category TEXT,
    opportunity_score NUMERIC,
    status TEXT,
    selected_at TIMESTAMPTZ
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        o.id,
        o.keyword,
        o.category,
        o.opportunity_score,
        o.status,
        o.selected_at
    FROM opportunities o
    WHERE o.country = p_country
      AND o.selected_at::DATE = CURRENT_DATE
    ORDER BY o.opportunity_score DESC
    LIMIT 1;
END;
$$ LANGUAGE plpgsql;

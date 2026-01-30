-- Keyword Research System Schema
-- Run this migration in your Supabase SQL editor

-- ============================================================================
-- Keywords Table
-- ============================================================================

CREATE TABLE IF NOT EXISTS keywords (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    keyword TEXT NOT NULL,
    country TEXT NOT NULL DEFAULT 'us',

    -- Scores (0-100)
    volume_score NUMERIC(4,1),
    difficulty_score NUMERIC(4,1),
    opportunity_score NUMERIC(4,1),

    -- Raw metrics for transparency
    autosuggest_priority INTEGER,
    autosuggest_position INTEGER,
    trigger_chars INTEGER,
    total_results INTEGER,
    top10_avg_reviews NUMERIC,
    top10_avg_rating NUMERIC(2,1),
    top10_title_matches INTEGER,

    -- Discovery metadata
    discovered_via TEXT,  -- 'autosuggest', 'competitor', 'category_crawl', 'manual'
    source_app_id TEXT,
    source_category TEXT,
    source_seed TEXT,

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    scored_at TIMESTAMPTZ,

    -- Unique constraint on keyword + country
    UNIQUE(keyword, country)
);

-- Enable trigram extension for fuzzy search (must be enabled BEFORE creating the index)
-- Note: If this fails, you may need to enable it via Supabase dashboard: Database > Extensions > pg_trgm
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Indexes for fast queries
CREATE INDEX IF NOT EXISTS idx_keywords_opportunity ON keywords(opportunity_score DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_keywords_volume ON keywords(volume_score DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_keywords_difficulty ON keywords(difficulty_score ASC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_keywords_country ON keywords(country);
CREATE INDEX IF NOT EXISTS idx_keywords_discovered_via ON keywords(discovered_via);
CREATE INDEX IF NOT EXISTS idx_keywords_scored_at ON keywords(scored_at);

-- Trigram index for fuzzy keyword search (requires pg_trgm extension)
-- If this fails, either enable pg_trgm first or comment out this line
CREATE INDEX IF NOT EXISTS idx_keywords_keyword_search ON keywords USING gin(keyword gin_trgm_ops);

-- ============================================================================
-- Keyword Rankings Table (Top 10 apps per keyword)
-- ============================================================================

CREATE TABLE IF NOT EXISTS keyword_rankings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    keyword_id UUID REFERENCES keywords(id) ON DELETE CASCADE,
    app_id TEXT NOT NULL,
    rank_position INTEGER NOT NULL,
    has_keyword_in_title BOOLEAN DEFAULT FALSE,
    app_name TEXT,
    app_review_count INTEGER,
    app_rating NUMERIC(2,1),
    app_icon_url TEXT,
    scraped_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(keyword_id, app_id)
);

CREATE INDEX IF NOT EXISTS idx_keyword_rankings_keyword_id ON keyword_rankings(keyword_id);
CREATE INDEX IF NOT EXISTS idx_keyword_rankings_app_id ON keyword_rankings(app_id);

-- ============================================================================
-- Keyword History Table (for trend tracking)
-- ============================================================================

CREATE TABLE IF NOT EXISTS keyword_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    keyword_id UUID REFERENCES keywords(id) ON DELETE CASCADE,
    volume_score NUMERIC(4,1),
    difficulty_score NUMERIC(4,1),
    opportunity_score NUMERIC(4,1),
    recorded_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_keyword_history_keyword_id ON keyword_history(keyword_id);
CREATE INDEX IF NOT EXISTS idx_keyword_history_recorded_at ON keyword_history(recorded_at DESC);

-- ============================================================================
-- Keyword Jobs Table (background job queue)
-- ============================================================================

CREATE TABLE IF NOT EXISTS keyword_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_type TEXT NOT NULL,  -- 'discover_seed', 'discover_competitor', 'discover_category', 'score_bulk', 'rescore_stale'
    status TEXT NOT NULL DEFAULT 'pending',  -- 'pending', 'running', 'completed', 'failed'

    -- Job parameters (JSON)
    params JSONB NOT NULL DEFAULT '{}',

    -- Progress tracking
    total_items INTEGER,
    processed_items INTEGER DEFAULT 0,
    keywords_discovered INTEGER DEFAULT 0,
    keywords_scored INTEGER DEFAULT 0,

    -- Error handling
    error_message TEXT,

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_keyword_jobs_status ON keyword_jobs(status);
CREATE INDEX IF NOT EXISTS idx_keyword_jobs_created_at ON keyword_jobs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_keyword_jobs_type_status ON keyword_jobs(job_type, status);

-- ============================================================================
-- Row Level Security (RLS)
-- ============================================================================

-- Enable RLS
ALTER TABLE keywords ENABLE ROW LEVEL SECURITY;
ALTER TABLE keyword_rankings ENABLE ROW LEVEL SECURITY;
ALTER TABLE keyword_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE keyword_jobs ENABLE ROW LEVEL SECURITY;

-- Allow all operations (adjust based on your auth requirements)
CREATE POLICY "Allow all for keywords" ON keywords FOR ALL USING (true);
CREATE POLICY "Allow all for keyword_rankings" ON keyword_rankings FOR ALL USING (true);
CREATE POLICY "Allow all for keyword_history" ON keyword_history FOR ALL USING (true);
CREATE POLICY "Allow all for keyword_jobs" ON keyword_jobs FOR ALL USING (true);

-- ============================================================================
-- Useful Functions
-- ============================================================================

-- Function to claim the next pending job atomically
CREATE OR REPLACE FUNCTION claim_keyword_job()
RETURNS SETOF keyword_jobs AS $$
    UPDATE keyword_jobs
    SET status = 'running', started_at = NOW()
    WHERE id = (
        SELECT id FROM keyword_jobs
        WHERE status = 'pending'
        ORDER BY created_at ASC
        LIMIT 1
        FOR UPDATE SKIP LOCKED
    )
    RETURNING *;
$$ LANGUAGE sql;

-- Function to get keyword statistics
CREATE OR REPLACE FUNCTION get_keyword_stats(p_country TEXT DEFAULT 'us')
RETURNS TABLE (
    total_keywords BIGINT,
    scored_keywords BIGINT,
    avg_volume NUMERIC,
    avg_difficulty NUMERIC,
    avg_opportunity NUMERIC,
    high_opportunity_count BIGINT
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        COUNT(*)::BIGINT AS total_keywords,
        COUNT(CASE WHEN volume_score IS NOT NULL THEN 1 END)::BIGINT AS scored_keywords,
        ROUND(AVG(volume_score)::NUMERIC, 1) AS avg_volume,
        ROUND(AVG(difficulty_score)::NUMERIC, 1) AS avg_difficulty,
        ROUND(AVG(opportunity_score)::NUMERIC, 1) AS avg_opportunity,
        COUNT(CASE WHEN opportunity_score >= 40 THEN 1 END)::BIGINT AS high_opportunity_count
    FROM keywords
    WHERE country = p_country;
END;
$$ LANGUAGE plpgsql;

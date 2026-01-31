-- Crawl4AI Deep Integration Database Schema
-- Migration: 20260131_crawl4ai_tables.sql

-- ============================================================================
-- Crawled Content Cache Table
-- ============================================================================
-- General-purpose cache for all crawled content with TTL support

CREATE TABLE IF NOT EXISTS crawled_content (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cache_key TEXT UNIQUE NOT NULL,
    cache_type TEXT NOT NULL, -- 'app_store', 'reddit', 'website'
    identifier TEXT NOT NULL, -- app_id, search key, domain
    content JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,
    hit_count INTEGER DEFAULT 0,

    -- Indexes
    CONSTRAINT valid_cache_type CHECK (cache_type IN ('app_store', 'reddit', 'website'))
);

CREATE INDEX IF NOT EXISTS idx_crawled_content_cache_key ON crawled_content(cache_key);
CREATE INDEX IF NOT EXISTS idx_crawled_content_type ON crawled_content(cache_type);
CREATE INDEX IF NOT EXISTS idx_crawled_content_expires ON crawled_content(expires_at);
CREATE INDEX IF NOT EXISTS idx_crawled_content_identifier ON crawled_content(identifier);


-- ============================================================================
-- Extended App Reviews Table
-- ============================================================================
-- Stores thousands of reviews per app (vs RSS 50-100)

CREATE TABLE IF NOT EXISTS app_extended_reviews (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    app_id TEXT NOT NULL,
    review_id TEXT NOT NULL, -- Original App Store review ID or hash
    country TEXT NOT NULL DEFAULT 'us',
    title TEXT,
    content TEXT NOT NULL,
    rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
    author TEXT DEFAULT 'Anonymous',
    review_date TIMESTAMPTZ,
    version TEXT, -- App version reviewed
    helpful_count INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Prevent duplicates
    UNIQUE(app_id, review_id, country)
);

CREATE INDEX IF NOT EXISTS idx_extended_reviews_app ON app_extended_reviews(app_id, country);
CREATE INDEX IF NOT EXISTS idx_extended_reviews_rating ON app_extended_reviews(app_id, rating);
CREATE INDEX IF NOT EXISTS idx_extended_reviews_date ON app_extended_reviews(review_date DESC);

-- Full-text search on review content
CREATE INDEX IF NOT EXISTS idx_extended_reviews_content_fts
ON app_extended_reviews USING gin(to_tsvector('english', content));


-- ============================================================================
-- Reddit Discussions Table
-- ============================================================================
-- Real Reddit data (replaces simulated discussions)

CREATE TABLE IF NOT EXISTS reddit_discussions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    post_id TEXT UNIQUE NOT NULL, -- Reddit's post ID
    subreddit TEXT NOT NULL,
    title TEXT NOT NULL,
    content TEXT,
    url TEXT NOT NULL,
    author TEXT DEFAULT 'deleted',
    score INTEGER DEFAULT 0,
    upvote_ratio REAL DEFAULT 0.0,
    num_comments INTEGER DEFAULT 0,
    flair TEXT,
    is_self BOOLEAN DEFAULT TRUE,
    post_created_at TIMESTAMPTZ,

    -- Search/filter metadata
    keywords TEXT[], -- Keywords that matched this post
    relevance_score REAL DEFAULT 0.0,

    -- Management
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reddit_subreddit ON reddit_discussions(subreddit);
CREATE INDEX IF NOT EXISTS idx_reddit_score ON reddit_discussions(score DESC);
CREATE INDEX IF NOT EXISTS idx_reddit_keywords ON reddit_discussions USING gin(keywords);
CREATE INDEX IF NOT EXISTS idx_reddit_created ON reddit_discussions(post_created_at DESC);

-- Full-text search
CREATE INDEX IF NOT EXISTS idx_reddit_content_fts
ON reddit_discussions USING gin(to_tsvector('english', title || ' ' || COALESCE(content, '')));


-- ============================================================================
-- Reddit Comments Table
-- ============================================================================

CREATE TABLE IF NOT EXISTS reddit_comments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    discussion_id UUID REFERENCES reddit_discussions(id) ON DELETE CASCADE,
    comment_id TEXT NOT NULL,
    author TEXT DEFAULT 'deleted',
    content TEXT NOT NULL,
    score INTEGER DEFAULT 0,
    is_op BOOLEAN DEFAULT FALSE,
    comment_created_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE(discussion_id, comment_id)
);

CREATE INDEX IF NOT EXISTS idx_reddit_comments_discussion ON reddit_comments(discussion_id);
CREATE INDEX IF NOT EXISTS idx_reddit_comments_score ON reddit_comments(score DESC);


-- ============================================================================
-- App Update History Table
-- ============================================================================
-- What's New / version history for apps

CREATE TABLE IF NOT EXISTS app_update_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    app_id TEXT NOT NULL,
    country TEXT NOT NULL DEFAULT 'us',
    version TEXT NOT NULL,
    release_date TIMESTAMPTZ,
    release_notes TEXT,
    size_bytes BIGINT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE(app_id, version, country)
);

CREATE INDEX IF NOT EXISTS idx_update_history_app ON app_update_history(app_id, country);
CREATE INDEX IF NOT EXISTS idx_update_history_date ON app_update_history(release_date DESC);


-- ============================================================================
-- App Privacy Labels Table
-- ============================================================================
-- Privacy nutrition labels from App Store

CREATE TABLE IF NOT EXISTS app_privacy_labels (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    app_id TEXT NOT NULL,
    country TEXT NOT NULL DEFAULT 'us',
    category TEXT NOT NULL, -- e.g., "Data Linked to You"
    data_types TEXT[] DEFAULT '{}',
    purposes TEXT[] DEFAULT '{}',
    privacy_policy_url TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE(app_id, category, country)
);

CREATE INDEX IF NOT EXISTS idx_privacy_labels_app ON app_privacy_labels(app_id, country);


-- ============================================================================
-- Competitor Websites Table
-- ============================================================================
-- Crawled competitor landing pages

CREATE TABLE IF NOT EXISTS competitor_websites (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    url TEXT NOT NULL,
    domain TEXT NOT NULL,
    title TEXT,
    description TEXT,
    main_content TEXT,
    features TEXT[] DEFAULT '{}',
    pricing_info JSONB,
    screenshots TEXT[] DEFAULT '{}',
    testimonials TEXT[] DEFAULT '{}',
    technology_stack TEXT[] DEFAULT '{}',
    social_links JSONB DEFAULT '{}',
    crawled_pages INTEGER DEFAULT 0,

    -- Link to project if associated
    project_id UUID REFERENCES app_projects(id) ON DELETE SET NULL,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_competitor_websites_domain ON competitor_websites(domain);
CREATE INDEX IF NOT EXISTS idx_competitor_websites_project ON competitor_websites(project_id);


-- ============================================================================
-- Crawl Jobs Table
-- ============================================================================
-- Async job queue for long-running crawls

CREATE TABLE IF NOT EXISTS crawl_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_type TEXT NOT NULL, -- 'app_store_reviews', 'reddit', 'website', 'batch'
    status TEXT NOT NULL DEFAULT 'pending',
    request JSONB NOT NULL, -- Original request parameters
    result JSONB, -- Crawl result when completed
    error TEXT, -- Error message if failed
    progress REAL DEFAULT 0.0 CHECK (progress >= 0 AND progress <= 1),

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,

    CONSTRAINT valid_status CHECK (status IN ('pending', 'running', 'completed', 'failed', 'cancelled'))
);

CREATE INDEX IF NOT EXISTS idx_crawl_jobs_status ON crawl_jobs(status);
CREATE INDEX IF NOT EXISTS idx_crawl_jobs_type ON crawl_jobs(job_type);
CREATE INDEX IF NOT EXISTS idx_crawl_jobs_created ON crawl_jobs(created_at DESC);


-- ============================================================================
-- Alter Existing App Projects Table
-- ============================================================================
-- Add columns for extended crawl data

DO $$
BEGIN
    -- Add extended_reviews_crawled_at if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'app_projects' AND column_name = 'extended_reviews_crawled_at'
    ) THEN
        ALTER TABLE app_projects ADD COLUMN extended_reviews_crawled_at TIMESTAMPTZ;
    END IF;

    -- Add extended_reviews_count if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'app_projects' AND column_name = 'extended_reviews_count'
    ) THEN
        ALTER TABLE app_projects ADD COLUMN extended_reviews_count INTEGER DEFAULT 0;
    END IF;

    -- Add privacy_labels if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'app_projects' AND column_name = 'privacy_labels'
    ) THEN
        ALTER TABLE app_projects ADD COLUMN privacy_labels JSONB;
    END IF;

    -- Add update_history if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'app_projects' AND column_name = 'update_history'
    ) THEN
        ALTER TABLE app_projects ADD COLUMN update_history JSONB;
    END IF;
END $$;


-- ============================================================================
-- Helper Functions
-- ============================================================================

-- Function to clean up expired cache entries
CREATE OR REPLACE FUNCTION cleanup_expired_cache()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM crawled_content WHERE expires_at < NOW();
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Function to get cache stats
CREATE OR REPLACE FUNCTION get_cache_stats()
RETURNS TABLE (
    cache_type TEXT,
    entry_count BIGINT,
    total_hit_count BIGINT,
    oldest_entry TIMESTAMPTZ,
    newest_entry TIMESTAMPTZ
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        cc.cache_type,
        COUNT(*)::BIGINT as entry_count,
        SUM(cc.hit_count)::BIGINT as total_hit_count,
        MIN(cc.created_at) as oldest_entry,
        MAX(cc.created_at) as newest_entry
    FROM crawled_content cc
    WHERE cc.expires_at > NOW()
    GROUP BY cc.cache_type;
END;
$$ LANGUAGE plpgsql;

-- Function to search extended reviews
CREATE OR REPLACE FUNCTION search_extended_reviews(
    p_app_id TEXT,
    p_search_query TEXT DEFAULT NULL,
    p_min_rating INTEGER DEFAULT NULL,
    p_max_rating INTEGER DEFAULT NULL,
    p_limit INTEGER DEFAULT 100
)
RETURNS SETOF app_extended_reviews AS $$
BEGIN
    RETURN QUERY
    SELECT *
    FROM app_extended_reviews
    WHERE app_id = p_app_id
      AND (p_min_rating IS NULL OR rating >= p_min_rating)
      AND (p_max_rating IS NULL OR rating <= p_max_rating)
      AND (p_search_query IS NULL OR
           to_tsvector('english', content) @@ plainto_tsquery('english', p_search_query))
    ORDER BY review_date DESC NULLS LAST
    LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;


-- ============================================================================
-- Row Level Security (Optional)
-- ============================================================================

-- Enable RLS on tables if needed
-- ALTER TABLE crawled_content ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE app_extended_reviews ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE reddit_discussions ENABLE ROW LEVEL SECURITY;


-- ============================================================================
-- Comments
-- ============================================================================

COMMENT ON TABLE crawled_content IS 'Cache for all crawled content with TTL support';
COMMENT ON TABLE app_extended_reviews IS 'Extended App Store reviews (thousands vs RSS 50-100)';
COMMENT ON TABLE reddit_discussions IS 'Real Reddit discussions (replaces simulated data)';
COMMENT ON TABLE reddit_comments IS 'Comments on Reddit discussions';
COMMENT ON TABLE app_update_history IS 'What''s New / version history for apps';
COMMENT ON TABLE app_privacy_labels IS 'Privacy nutrition labels from App Store';
COMMENT ON TABLE competitor_websites IS 'Crawled competitor landing pages';
COMMENT ON TABLE crawl_jobs IS 'Async job queue for long-running crawls';

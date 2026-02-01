-- Reddit Performance Tracking Tables
-- Tracks subreddit and topic performance for yield-based optimization

-- ============================================================================
-- Subreddit Performance Table
-- ============================================================================

CREATE TABLE IF NOT EXISTS subreddit_performance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subreddit TEXT NOT NULL,
  app_category TEXT NOT NULL,

  -- Metrics
  total_searches INT DEFAULT 0,
  total_posts_found INT DEFAULT 0,
  avg_post_engagement FLOAT DEFAULT 0,
  needs_discovered INT DEFAULT 0,  -- How many needs came from this sub
  high_severity_needs INT DEFAULT 0,

  -- Computed yield score
  -- Higher score = better subreddit for this category
  yield_score FLOAT GENERATED ALWAYS AS (
    CASE
      WHEN total_searches = 0 THEN 0
      ELSE (
        (total_posts_found::FLOAT / NULLIF(total_searches, 0)) *
        (1 + LN(1 + avg_post_engagement)) *
        (1 + needs_discovered * 0.1) *
        (1 + high_severity_needs * 0.2)
      )
    END
  ) STORED,

  last_used TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(subreddit, app_category)
);

-- Index for efficient queries
CREATE INDEX IF NOT EXISTS idx_subreddit_performance_category
  ON subreddit_performance(app_category);

CREATE INDEX IF NOT EXISTS idx_subreddit_performance_yield
  ON subreddit_performance(app_category, yield_score DESC);

-- ============================================================================
-- Topic Performance Table
-- ============================================================================

CREATE TABLE IF NOT EXISTS topic_performance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  topic_phrase TEXT NOT NULL,
  app_category TEXT NOT NULL,

  times_used INT DEFAULT 0,
  posts_found INT DEFAULT 0,
  avg_relevance_score FLOAT DEFAULT 0,  -- From post engagement

  -- Did this topic lead to insights?
  contributed_to_needs INT DEFAULT 0,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(topic_phrase, app_category)
);

-- Index for efficient queries
CREATE INDEX IF NOT EXISTS idx_topic_performance_category
  ON topic_performance(app_category);

-- ============================================================================
-- Analysis Performance Table
-- ============================================================================

-- Track overall analysis performance for learning
CREATE TABLE IF NOT EXISTS analysis_performance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reddit_analysis_id UUID REFERENCES reddit_analyses(id) ON DELETE CASCADE,

  -- Input metrics
  subreddits_searched INT DEFAULT 0,
  topics_searched INT DEFAULT 0,
  posts_crawled INT DEFAULT 0,
  comments_crawled INT DEFAULT 0,

  -- Output metrics
  needs_discovered INT DEFAULT 0,
  high_severity_needs INT DEFAULT 0,
  medium_severity_needs INT DEFAULT 0,
  low_severity_needs INT DEFAULT 0,

  -- Quality metrics
  avg_confidence_score FLOAT DEFAULT 0,
  quotes_attributed INT DEFAULT 0,

  -- Timing
  crawl_duration_seconds INT DEFAULT 0,
  analysis_duration_seconds INT DEFAULT 0,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_analysis_performance_analysis_id
  ON analysis_performance(reddit_analysis_id);

-- ============================================================================
-- Update Trigger for updated_at
-- ============================================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply trigger to subreddit_performance
DROP TRIGGER IF EXISTS update_subreddit_performance_updated_at ON subreddit_performance;
CREATE TRIGGER update_subreddit_performance_updated_at
  BEFORE UPDATE ON subreddit_performance
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Apply trigger to topic_performance
DROP TRIGGER IF EXISTS update_topic_performance_updated_at ON topic_performance;
CREATE TRIGGER update_topic_performance_updated_at
  BEFORE UPDATE ON topic_performance
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- RLS Policies (if needed)
-- ============================================================================

-- Enable RLS on tables
ALTER TABLE subreddit_performance ENABLE ROW LEVEL SECURITY;
ALTER TABLE topic_performance ENABLE ROW LEVEL SECURITY;
ALTER TABLE analysis_performance ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to read performance data
CREATE POLICY "Allow authenticated read on subreddit_performance"
  ON subreddit_performance FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Allow authenticated read on topic_performance"
  ON topic_performance FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Allow authenticated read on analysis_performance"
  ON analysis_performance FOR SELECT
  TO authenticated
  USING (true);

-- Allow service role to insert/update
CREATE POLICY "Allow service insert/update on subreddit_performance"
  ON subreddit_performance FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow service insert/update on topic_performance"
  ON topic_performance FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow service insert/update on analysis_performance"
  ON analysis_performance FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ============================================================================
-- RPC Functions for Atomic Upserts
-- ============================================================================

-- Upsert subreddit performance with atomic increment
CREATE OR REPLACE FUNCTION upsert_subreddit_performance(
  p_subreddit TEXT,
  p_app_category TEXT,
  p_posts_found INT,
  p_avg_engagement FLOAT,
  p_needs_discovered INT,
  p_high_severity_needs INT
) RETURNS VOID AS $$
BEGIN
  INSERT INTO subreddit_performance (
    subreddit, app_category, total_searches, total_posts_found,
    avg_post_engagement, needs_discovered, high_severity_needs, last_used
  ) VALUES (
    p_subreddit, p_app_category, 1, p_posts_found,
    p_avg_engagement, p_needs_discovered, p_high_severity_needs, NOW()
  )
  ON CONFLICT (subreddit, app_category)
  DO UPDATE SET
    total_searches = subreddit_performance.total_searches + 1,
    total_posts_found = subreddit_performance.total_posts_found + p_posts_found,
    avg_post_engagement = (subreddit_performance.avg_post_engagement * subreddit_performance.total_searches + p_avg_engagement) / (subreddit_performance.total_searches + 1),
    needs_discovered = subreddit_performance.needs_discovered + p_needs_discovered,
    high_severity_needs = subreddit_performance.high_severity_needs + p_high_severity_needs,
    last_used = NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Upsert topic performance with atomic increment
CREATE OR REPLACE FUNCTION upsert_topic_performance(
  p_topic_phrase TEXT,
  p_app_category TEXT,
  p_posts_found INT,
  p_contributed_to_needs INT
) RETURNS VOID AS $$
BEGIN
  INSERT INTO topic_performance (
    topic_phrase, app_category, times_used, posts_found,
    avg_relevance_score, contributed_to_needs
  ) VALUES (
    p_topic_phrase, p_app_category, 1, p_posts_found,
    0, p_contributed_to_needs
  )
  ON CONFLICT (topic_phrase, app_category)
  DO UPDATE SET
    times_used = topic_performance.times_used + 1,
    posts_found = topic_performance.posts_found + p_posts_found,
    contributed_to_needs = topic_performance.contributed_to_needs + p_contributed_to_needs;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- App Store Scraper PWA - Supabase Database Schema
-- Run this SQL in your Supabase project's SQL Editor

-- Create the saved_searches table
CREATE TABLE saved_searches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT,
  params JSONB NOT NULL,
  results JSONB NOT NULL,
  result_count INTEGER,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Create index for faster queries sorted by date
CREATE INDEX idx_searches_created ON saved_searches(created_at DESC);

-- Enable Row Level Security (optional but recommended)
-- ALTER TABLE saved_searches ENABLE ROW LEVEL SECURITY;

-- Create a policy to allow all operations (since this is a private app)
-- CREATE POLICY "Allow all operations" ON saved_searches FOR ALL USING (true);

-- Grant permissions
GRANT ALL ON saved_searches TO anon;
GRANT ALL ON saved_searches TO authenticated;

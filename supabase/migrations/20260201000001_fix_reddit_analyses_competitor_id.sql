-- Fix competitor_id column type from UUID to TEXT
-- The competitor_id stores app_store_id strings (e.g., "com.app.example"), not UUIDs

-- Only alter if the column exists and is UUID type
DO $$
BEGIN
  -- Check if table exists
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'reddit_analyses') THEN
    -- Check if column is currently UUID type
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'reddit_analyses'
      AND column_name = 'competitor_id'
      AND data_type = 'uuid'
    ) THEN
      -- Alter the column type to TEXT
      ALTER TABLE reddit_analyses ALTER COLUMN competitor_id TYPE TEXT;
      RAISE NOTICE 'Changed competitor_id column from UUID to TEXT';
    ELSE
      RAISE NOTICE 'competitor_id column is already TEXT or does not exist';
    END IF;
  ELSE
    RAISE NOTICE 'reddit_analyses table does not exist yet';
  END IF;
END $$;

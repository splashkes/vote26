-- Remove old process_bid functions to force use of process_bid_secure

-- Drop all variants of the old process_bid function
DROP FUNCTION IF EXISTS process_bid(text, text, numeric, text, jsonb);
DROP FUNCTION IF EXISTS process_bid(text, text, numeric, text, jsonb, text);
DROP FUNCTION IF EXISTS process_bid(text, text, jsonb, numeric, text);

-- Verify only secure version remains
DO $$
BEGIN
  RAISE NOTICE 'Remaining process_bid functions:';
  PERFORM proname FROM pg_proc WHERE proname LIKE 'process_bid%';
END $$;
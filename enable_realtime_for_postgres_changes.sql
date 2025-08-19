-- Enable Supabase realtime for postgres_changes approach
-- Remove triggers and enable direct table realtime instead

-- 1. Drop the broadcast triggers since we're using postgres_changes
DROP TRIGGER IF EXISTS cache_invalidate_art_trigger ON art;
DROP TRIGGER IF EXISTS cache_invalidate_votes_trigger ON votes;
DROP TRIGGER IF EXISTS cache_invalidate_bids_trigger ON bids;
DROP TRIGGER IF EXISTS cache_invalidate_media_trigger ON art_media;

-- 2. Enable realtime for the tables we want to monitor
ALTER TABLE public.bids REPLICA IDENTITY FULL;
ALTER TABLE public.votes REPLICA IDENTITY FULL;
ALTER TABLE public.art REPLICA IDENTITY FULL;
ALTER TABLE public.art_media REPLICA IDENTITY FULL;

-- 3. Create publication for realtime (if not exists)
-- This allows Supabase realtime to stream changes from these tables
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    CREATE PUBLICATION supabase_realtime;
  END IF;
END $$;

-- 4. Add our tables to the realtime publication
ALTER PUBLICATION supabase_realtime ADD TABLE public.bids;
ALTER PUBLICATION supabase_realtime ADD TABLE public.votes;
ALTER PUBLICATION supabase_realtime ADD TABLE public.art;
ALTER PUBLICATION supabase_realtime ADD TABLE public.art_media;

-- 5. Comment explaining the change
COMMENT ON TABLE public.bids IS 'Realtime enabled for postgres_changes streaming to clients';
COMMENT ON TABLE public.votes IS 'Realtime enabled for postgres_changes streaming to clients';

-- Note: Clients will now receive INSERT/UPDATE/DELETE events directly from these tables
-- via Supabase realtime postgres_changes instead of custom triggers
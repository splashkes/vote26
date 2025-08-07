-- DISABLE REALTIME ON ALL TABLES
-- Realtime was consuming 33.7% of query performance
-- We'll selectively re-enable only where absolutely necessary
-- Date: 2025-08-06

-- ============================================
-- Get all tables and disable realtime
-- ============================================

DO $$
DECLARE
    r RECORD;
    disabled_count INTEGER := 0;
BEGIN
    -- Disable realtime on all tables in public schema
    FOR r IN 
        SELECT tablename 
        FROM pg_tables 
        WHERE schemaname = 'public'
        ORDER BY tablename
    LOOP
        -- Disable realtime for this table
        EXECUTE format('ALTER TABLE public.%I REPLICA IDENTITY DEFAULT', r.tablename);
        
        -- Remove from realtime publication if exists
        BEGIN
            EXECUTE format('ALTER PUBLICATION supabase_realtime DROP TABLE public.%I', r.tablename);
            disabled_count := disabled_count + 1;
            RAISE NOTICE 'Disabled realtime on: public.%', r.tablename;
        EXCEPTION 
            WHEN undefined_object THEN
                -- Table wasn't in publication, that's fine
                NULL;
            WHEN OTHERS THEN
                RAISE NOTICE 'Could not disable realtime on: public.% (may not have been enabled)', r.tablename;
        END;
    END LOOP;
    
    RAISE NOTICE '';
    RAISE NOTICE '========================================';
    RAISE NOTICE 'Realtime disabled on % tables', disabled_count;
    RAISE NOTICE 'Expected performance improvement: 30-40%';
    RAISE NOTICE '========================================';
END $$;

-- ============================================
-- Verify realtime is disabled
-- ============================================

DO $$
DECLARE
    realtime_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO realtime_count
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
    AND schemaname = 'public';
    
    IF realtime_count = 0 THEN
        RAISE NOTICE '';
        RAISE NOTICE '✅ SUCCESS: Realtime completely disabled on all public tables';
        RAISE NOTICE 'This will eliminate the 33.7%% performance overhead from realtime subscriptions';
    ELSE
        RAISE WARNING '⚠️  Still % tables with realtime enabled', realtime_count;
    END IF;
END $$;

-- ============================================
-- Future: Selective re-enablement
-- ============================================
-- When we want to re-enable realtime on specific tables, use:
-- ALTER PUBLICATION supabase_realtime ADD TABLE public.table_name;
-- 
-- Candidates for realtime (to be evaluated):
-- 1. bids table - for live auction updates (MAYBE)
-- 2. votes table - for live vote counts (PROBABLY NOT - too heavy)
-- 3. messages table - for notifications (MAYBE)
-- 
-- Most updates can be handled with:
-- - Polling every 5-10 seconds for auction
-- - Manual refresh buttons
-- - Optimistic UI updates
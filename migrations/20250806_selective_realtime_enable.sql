-- SELECTIVELY RE-ENABLE REALTIME FOR CRITICAL TABLES
-- Only enabling for tables that need live updates in the UI
-- Date: 2025-08-06

-- ============================================
-- Enable realtime on specific tables
-- ============================================

DO $$
BEGIN
    RAISE NOTICE 'Selectively enabling realtime for critical auction and voting tables...';
    RAISE NOTICE '';
    
    -- 1. BIDS TABLE - Critical for live auction updates
    ALTER PUBLICATION supabase_realtime ADD TABLE public.bids;
    RAISE NOTICE '✅ Enabled realtime on: bids (live auction updates)';
    
    -- 2. ART TABLE - For status changes, winner updates, media updates
    ALTER PUBLICATION supabase_realtime ADD TABLE public.art;
    RAISE NOTICE '✅ Enabled realtime on: art (status and winner updates)';
    
    -- 3. VOTES TABLE - For live vote counts (admin panel)
    ALTER PUBLICATION supabase_realtime ADD TABLE public.votes;
    RAISE NOTICE '✅ Enabled realtime on: votes (live vote tracking)';
    
    -- 4. ROUND_CONTESTANTS TABLE - For round updates and artist assignments
    ALTER PUBLICATION supabase_realtime ADD TABLE public.round_contestants;
    RAISE NOTICE '✅ Enabled realtime on: round_contestants (round updates)';
    
    -- 5. ART_MEDIA TABLE - For image updates
    ALTER PUBLICATION supabase_realtime ADD TABLE public.art_media;
    RAISE NOTICE '✅ Enabled realtime on: art_media (image updates)';
    
    RAISE NOTICE '';
    RAISE NOTICE '========================================';
    RAISE NOTICE 'Realtime enabled on 5 critical tables';
    RAISE NOTICE 'All other tables remain without realtime';
    RAISE NOTICE '========================================';
END $$;

-- ============================================
-- Verify realtime configuration
-- ============================================

DO $$
DECLARE
    r RECORD;
    realtime_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO realtime_count
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
    AND schemaname = 'public';
    
    RAISE NOTICE '';
    RAISE NOTICE 'Current realtime configuration:';
    RAISE NOTICE '--------------------------------';
    
    FOR r IN 
        SELECT tablename 
        FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        ORDER BY tablename
    LOOP
        RAISE NOTICE '  ✓ %', r.tablename;
    END LOOP;
    
    RAISE NOTICE '';
    RAISE NOTICE 'Total tables with realtime: %', realtime_count;
    RAISE NOTICE '';
    RAISE NOTICE 'Expected performance impact:';
    RAISE NOTICE '  - Minimal overhead (only 5 tables)';
    RAISE NOTICE '  - Targeted updates for UI responsiveness';
    RAISE NOTICE '  - ~5-10%% resource usage vs 33.7%% previously';
END $$;

-- ============================================
-- Notes on usage patterns
-- ============================================
-- 
-- REGULAR USERS (EventDetails):
--   Vote Tab: 
--     - art table: winner status
--     - art_media table: image updates
--     - round_contestants: artist additions
--     - bids: top bid display
--     - art table: auction status (color)
--   
--   Auction Tab:
--     - bids table: top bid and bid count
--     - art table: close time and status
--
-- ADMIN USERS (AdminPanel):
--   Voting Tab:
--     - votes table: live vote counts
--     - art table: vote weight updates
--   
--   Auction Tab:
--     - bids table: all bid updates
--     - art table: status and closing times
-- Fix Function Search Path Security Warnings
-- This fixes the search_path for all functions used by Vote26 app
-- Date: 2025-08-06

-- ============================================
-- CRITICAL: Functions used by Vote26 App
-- ============================================

-- cast_vote_secure - Core voting function
ALTER FUNCTION public.cast_vote_secure 
SET search_path = pg_catalog, public;

-- process_bid_secure - Core bidding function  
ALTER FUNCTION public.process_bid_secure
SET search_path = pg_catalog, public;

-- refresh_auth_metadata - Authentication
ALTER FUNCTION public.refresh_auth_metadata
SET search_path = pg_catalog, public;

-- ensure_person_exists - User creation
ALTER FUNCTION public.ensure_person_exists
SET search_path = pg_catalog, public;

-- manage_auction_timer - Auction management
ALTER FUNCTION public.manage_auction_timer
SET search_path = pg_catalog, public;

-- get_event_weighted_votes - Vote display
ALTER FUNCTION public.get_event_weighted_votes
SET search_path = pg_catalog, public;

-- get_event_vote_ranges - Vote analytics
ALTER FUNCTION public.get_event_vote_ranges
SET search_path = pg_catalog, public;

-- check_event_admin_permission - Admin security
ALTER FUNCTION public.check_event_admin_permission
SET search_path = pg_catalog, public;

-- get_user_admin_level - Permission checks
ALTER FUNCTION public.get_user_admin_level
SET search_path = pg_catalog, public;

-- get_auction_timer_status - Auction status
ALTER FUNCTION public.get_auction_timer_status
SET search_path = pg_catalog, public;

-- get_cloudflare_config - Image uploads
ALTER FUNCTION public.get_cloudflare_config
SET search_path = pg_catalog, public;

-- admin_update_art_status - Admin functions
ALTER FUNCTION public.admin_update_art_status
SET search_path = pg_catalog, public;

-- ============================================
-- Verification
-- ============================================
DO $$
DECLARE
  func_record RECORD;
  unfixed_count INTEGER := 0;
BEGIN
  RAISE NOTICE 'Checking critical functions for search_path...';
  
  FOR func_record IN 
    SELECT 
      p.proname AS function_name,
      pg_get_function_result(p.oid) AS return_type,
      p.prosecdef AS security_definer,
      p.proconfig AS config
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public'
    AND p.proname IN (
      'cast_vote_secure',
      'process_bid_secure', 
      'refresh_auth_metadata',
      'ensure_person_exists',
      'manage_auction_timer',
      'get_event_weighted_votes',
      'get_event_vote_ranges',
      'check_event_admin_permission',
      'get_user_admin_level',
      'get_auction_timer_status',
      'get_cloudflare_config',
      'admin_update_art_status'
    )
  LOOP
    IF func_record.config IS NULL OR 
       NOT (func_record.config::text LIKE '%search_path%') THEN
      unfixed_count := unfixed_count + 1;
      RAISE WARNING 'Function % still missing search_path!', func_record.function_name;
    ELSE
      RAISE NOTICE '✓ Function % has search_path set', func_record.function_name;
    END IF;
  END LOOP;
  
  IF unfixed_count = 0 THEN
    RAISE NOTICE '';
    RAISE NOTICE '✅ All critical Vote26 functions have been secured!';
  ELSE
    RAISE WARNING '⚠️  % functions still need search_path fixes', unfixed_count;
  END IF;
END $$;
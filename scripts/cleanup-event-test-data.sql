-- ============================================================================
-- EVENT TEST DATA CLEANUP SCRIPT
-- ============================================================================
-- This script safely removes all test data for an event before going live
-- 
-- USAGE:
-- 1. Replace 'EVENT_EID_HERE' with the actual event EID (e.g., 'AB2900')
-- 2. Run verification queries first to see what will be deleted
-- 3. Run cleanup in a transaction for safety
-- 4. Verify final state
--
-- CRITICAL: Only run this on events that are about to go live!
-- ============================================================================

-- Set the event EID to cleanup (CHANGE THIS!)
\set event_eid 'EVENT_EID_HERE'

-- Get event details first (verification step)
SELECT 
  'EVENT TO CLEANUP:' as info,
  id as event_id,
  eid,
  name,
  event_start_datetime,
  venue,
  CASE 
    WHEN event_start_datetime > NOW() THEN 'FUTURE EVENT - OK TO CLEANUP'
    ELSE '⚠️  WARNING: EVENT STARTED/PAST'
  END as safety_check
FROM events 
WHERE eid = :'event_eid';

-- ============================================================================
-- VERIFICATION QUERIES (Run these FIRST to see what will be deleted)
-- ============================================================================

-- Show all test data that will be deleted
SELECT '=== TEST DATA TO BE DELETED ===' as section;

-- Count payment records
SELECT 
  'Payment Records' as data_type,
  COUNT(*) as count,
  STRING_AGG(DISTINCT pp.status::TEXT, ', ') as statuses,
  SUM(pp.amount) as total_amount
FROM payment_processing pp
JOIN art a ON pp.art_id = a.id
JOIN events e ON a.event_id = e.id
WHERE e.eid = :'event_eid';

-- Count bids
SELECT 
  'Bid Records' as data_type,
  COUNT(*) as count,
  MIN(b.created_at) as earliest_bid,
  MAX(b.created_at) as latest_bid,
  COUNT(DISTINCT b.person_id) as unique_bidders
FROM bids b
JOIN art a ON b.art_id = a.id
JOIN events e ON a.event_id = e.id
WHERE e.eid = :'event_eid';

-- Count votes
SELECT 
  'Vote Records' as data_type,
  COUNT(*) as count,
  MIN(v.created_at) as earliest_vote,
  MAX(v.created_at) as latest_vote,
  COUNT(DISTINCT v.person_id) as unique_voters
FROM votes v
JOIN events e ON v.event_id = e.id
WHERE e.eid = :'event_eid';

-- Count media connections
SELECT 
  'Media Links' as data_type,
  COUNT(*) as count,
  STRING_AGG(DISTINCT a.art_code, ', ') as artworks_with_media
FROM art_media am
JOIN art a ON am.art_id = a.id
JOIN events e ON a.event_id = e.id
WHERE e.eid = :'event_eid';

-- Show artwork current state
SELECT 
  'Current Artwork State' as data_type,
  COUNT(*) as total_artworks,
  STRING_AGG(DISTINCT a.status::TEXT, ', ') as current_statuses,
  SUM(a.current_bid) as total_current_bids
FROM art a
JOIN events e ON a.event_id = e.id
WHERE e.eid = :'event_eid';

-- ============================================================================
-- SAFETY CHECK - Confirm this is the right event
-- ============================================================================
SELECT '=== CONFIRM EVENT DETAILS ===' as section;

SELECT 
  a.art_code,
  a.status,
  a.current_bid,
  COALESCE(bid_count.count, 0) as bid_count,
  COALESCE(media_count.count, 0) as media_count
FROM art a
JOIN events e ON a.event_id = e.id
LEFT JOIN (
  SELECT art_id, COUNT(*) as count 
  FROM bids 
  GROUP BY art_id
) bid_count ON a.id = bid_count.art_id
LEFT JOIN (
  SELECT art_id, COUNT(*) as count 
  FROM art_media 
  GROUP BY art_id
) media_count ON a.id = media_count.art_id
WHERE e.eid = :'event_eid'
ORDER BY a.round, a.easel;

-- ============================================================================
-- CLEANUP OPERATIONS (Run these AFTER verification)
-- ============================================================================

-- Uncomment the following section to perform the actual cleanup:
/*
BEGIN;

-- Store event_id for safety
DO $$ 
DECLARE 
    target_event_id UUID;
BEGIN
    -- Get the event ID
    SELECT id INTO target_event_id
    FROM events 
    WHERE eid = :'event_eid';
    
    IF target_event_id IS NULL THEN
        RAISE EXCEPTION 'Event with EID % not found!', :'event_eid';
    END IF;
    
    RAISE NOTICE 'Starting cleanup for event ID: %', target_event_id;
    
    -- 1. Remove payment processing records
    DELETE FROM payment_processing 
    WHERE art_id IN (SELECT id FROM art WHERE event_id = target_event_id);
    RAISE NOTICE 'Deleted % payment records', ROW_COUNT;
    
    -- 2. Remove bids
    DELETE FROM bids 
    WHERE art_id IN (SELECT id FROM art WHERE event_id = target_event_id);
    RAISE NOTICE 'Deleted % bid records', ROW_COUNT;
    
    -- 3. Remove votes
    DELETE FROM votes 
    WHERE event_id = target_event_id;
    RAISE NOTICE 'Deleted % vote records', ROW_COUNT;
    
    -- 4. Remove art_media connections
    DELETE FROM art_media 
    WHERE art_id IN (SELECT id FROM art WHERE event_id = target_event_id);
    RAISE NOTICE 'Deleted % media links', ROW_COUNT;
    
    -- 5. Reset artwork statuses and bids
    UPDATE art 
    SET 
      status = 'active',
      current_bid = 0
    WHERE event_id = target_event_id;
    RAISE NOTICE 'Reset % artworks to active status', ROW_COUNT;
    
    RAISE NOTICE 'Cleanup completed successfully!';
END $$;

COMMIT;
*/

-- ============================================================================
-- FINAL VERIFICATION (Run after cleanup)
-- ============================================================================

SELECT '=== POST-CLEANUP VERIFICATION ===' as section;

-- Verify everything is clean
SELECT 
  a.art_code,
  a.status,
  a.current_bid,
  CASE 
    WHEN NOT EXISTS(SELECT 1 FROM bids WHERE art_id = a.id) THEN '✓ CLEAN'
    ELSE '❌ HAS BIDS'
  END as bids_clean,
  CASE 
    WHEN NOT EXISTS(SELECT 1 FROM art_media WHERE art_id = a.id) THEN '✓ CLEAN'
    ELSE '❌ HAS MEDIA'
  END as media_clean,
  CASE 
    WHEN NOT EXISTS(SELECT 1 FROM payment_processing WHERE art_id = a.id) THEN '✓ CLEAN'
    ELSE '❌ HAS PAYMENTS'
  END as payments_clean
FROM art a
JOIN events e ON a.event_id = e.id
WHERE e.eid = :'event_eid'
ORDER BY a.round, a.easel;

-- Final summary
SELECT 
  'FINAL STATUS' as summary,
  COUNT(*) as total_artworks,
  SUM(CASE WHEN a.status = 'active' THEN 1 ELSE 0 END) as active_artworks,
  SUM(a.current_bid) as total_bids_should_be_zero,
  CASE 
    WHEN SUM(a.current_bid) = 0 AND COUNT(*) = SUM(CASE WHEN a.status = 'active' THEN 1 ELSE 0 END)
    THEN '✅ EVENT READY FOR LIVE'
    ELSE '❌ ISSUES REMAIN'
  END as status
FROM art a
JOIN events e ON a.event_id = e.id
WHERE e.eid = :'event_eid';
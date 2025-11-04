# Event Data Cleanup Process Documentation

## Overview
This document describes the safe process for cleaning up test data from an Art Battle event before it goes live. This process was successfully used to clean up event AB3032 on October 22, 2025.

## ⚠️ CRITICAL SAFETY REQUIREMENTS

1. **NO CASCADE OPERATIONS** - All deletions must be explicit, table by table
2. **BACKUP FIRST** - Create temporary backup tables before any deletion
3. **VERIFY EACH STEP** - Check data counts before and after each operation
4. **USE TRANSACTIONS** - Wrap operations in BEGIN/COMMIT for rollback capability
5. **LIVE SYSTEM** - This is a production database, extreme caution required

## Process Steps

### Step 1: Identify the Event

```sql
-- Get event details and verify it's safe to clean
SELECT
  id as event_id,
  eid,
  name,
  event_start_datetime,
  CASE
    WHEN event_start_datetime > NOW() THEN 'FUTURE EVENT - OK TO CLEANUP'
    ELSE '⚠️  WARNING: EVENT STARTED/PAST'
  END as safety_check
FROM events
WHERE eid = 'EVENT_EID_HERE';
```

### Step 2: Count All Related Data

Before any deletion, count all data that will be affected:

```sql
-- Count all related data
WITH event_info AS (
  SELECT id FROM events WHERE eid = 'EVENT_EID_HERE'
)
SELECT
  'art' as table_name, COUNT(*) as count
FROM art WHERE event_id = (SELECT id FROM event_info)
UNION ALL
SELECT 'bids', COUNT(*)
FROM bids WHERE art_id IN (SELECT id FROM art WHERE event_id = (SELECT id FROM event_info))
UNION ALL
SELECT 'votes', COUNT(*)
FROM votes WHERE event_id = (SELECT id FROM event_info)
UNION ALL
SELECT 'art_media', COUNT(*)
FROM art_media WHERE art_id IN (SELECT id FROM art WHERE event_id = (SELECT id FROM event_info))
UNION ALL
SELECT 'event_artists', COUNT(*)
FROM event_artists WHERE event_id = (SELECT id FROM event_info)
ORDER BY table_name;
```

### Step 3: Create Backup Tables

**ALWAYS create backups before deletion:**

```sql
BEGIN;

-- Create backup of votes
CREATE TEMP TABLE backup_votes_EVENT AS
SELECT v.*
FROM votes v
WHERE v.event_id = 'EVENT_UUID_HERE';

-- Create backup of bids
CREATE TEMP TABLE backup_bids_EVENT AS
SELECT b.*
FROM bids b
WHERE b.art_id IN (
  SELECT id FROM art WHERE event_id = 'EVENT_UUID_HERE'
);

-- Create backup of art_media
CREATE TEMP TABLE backup_art_media_EVENT AS
SELECT am.*
FROM art_media am
WHERE am.art_id IN (
  SELECT id FROM art WHERE event_id = 'EVENT_UUID_HERE'
);

-- Verify backups
SELECT 'Backed up votes' as status, COUNT(*) as count FROM backup_votes_EVENT
UNION ALL
SELECT 'Backed up bids', COUNT(*) FROM backup_bids_EVENT
UNION ALL
SELECT 'Backed up art_media', COUNT(*) FROM backup_art_media_EVENT;

COMMIT;
```

### Step 4: Delete Votes

```sql
BEGIN;

-- Count before
SELECT 'BEFORE: Votes' as status, COUNT(*) as count
FROM votes WHERE event_id = 'EVENT_UUID_HERE';

-- Delete votes (EXPLICIT, NO CASCADE)
DELETE FROM votes
WHERE event_id = 'EVENT_UUID_HERE';

-- Verify deletion
SELECT 'AFTER: Votes' as status, COUNT(*) as count
FROM votes WHERE event_id = 'EVENT_UUID_HERE';

COMMIT;
```

### Step 5: Delete Bids

```sql
BEGIN;

-- Count before
SELECT 'BEFORE: Bids' as status, COUNT(*) as count
FROM bids WHERE art_id IN (SELECT id FROM art WHERE event_id = 'EVENT_UUID_HERE');

-- Delete bids (EXPLICIT, NO CASCADE)
DELETE FROM bids
WHERE art_id IN (
  SELECT id FROM art WHERE event_id = 'EVENT_UUID_HERE'
);

-- Verify deletion
SELECT 'AFTER: Bids' as status, COUNT(*) as count
FROM bids WHERE art_id IN (SELECT id FROM art WHERE event_id = 'EVENT_UUID_HERE');

COMMIT;
```

### Step 6: Delete Art Media Connections

```sql
BEGIN;

-- Count before
SELECT 'BEFORE: Art_media' as status, COUNT(*) as count
FROM art_media WHERE art_id IN (SELECT id FROM art WHERE event_id = 'EVENT_UUID_HERE');

-- Delete art_media connections (EXPLICIT, NO CASCADE)
DELETE FROM art_media
WHERE art_id IN (
  SELECT id FROM art WHERE event_id = 'EVENT_UUID_HERE'
);

-- Verify deletion
SELECT 'AFTER: Art_media' as status, COUNT(*) as count
FROM art_media WHERE art_id IN (SELECT id FROM art WHERE event_id = 'EVENT_UUID_HERE');

COMMIT;
```

### Step 7: Reset Artwork Status and ALL Auction Fields

**IMPORTANT:** Reset ALL auction-related fields, not just status and current_bid:

```sql
BEGIN;

-- Show before state
SELECT 'BEFORE: Artwork states' as status,
  COUNT(*) as total,
  SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active_count,
  SUM(CASE WHEN status = 'closed' THEN 1 ELSE 0 END) as closed_count,
  SUM(CASE WHEN status = 'sold' THEN 1 ELSE 0 END) as sold_count,
  SUM(CASE WHEN status = 'paid' THEN 1 ELSE 0 END) as paid_count,
  SUM(CASE WHEN winner_id IS NOT NULL THEN 1 ELSE 0 END) as has_winner,
  SUM(CASE WHEN closing_time IS NOT NULL THEN 1 ELSE 0 END) as has_closing_time
FROM art WHERE event_id = 'EVENT_UUID_HERE';

-- Reset ALL auction-related fields
UPDATE art
SET
  -- Core fields
  status = 'active',
  current_bid = 0,
  winner_id = NULL,

  -- Auction timing
  closing_time = NULL,
  auction_extended = false,
  extension_count = 0,

  -- Payment tracking
  final_price = NULL,
  artist_pay_recent_status_id = NULL,
  buyer_pay_recent_status_id = NULL,
  artist_pay_recent_date = NULL,
  buyer_pay_recent_date = NULL,
  buyer_pay_recent_person_id = NULL,
  buyer_pay_recent_user_id = NULL,
  artist_pay_recent_person_id = NULL,
  artist_pay_recent_user_id = NULL,

  -- Counters
  bid_count = 0,
  vote_count = 0,

  -- Metadata
  updated_at = NOW()
WHERE event_id = 'EVENT_UUID_HERE';

-- Show after state
SELECT 'AFTER: Artwork states' as status,
  COUNT(*) as total,
  SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active_count,
  SUM(CASE WHEN winner_id IS NOT NULL THEN 1 ELSE 0 END) as has_winner,
  SUM(CASE WHEN closing_time IS NOT NULL THEN 1 ELSE 0 END) as has_closing_time
FROM art WHERE event_id = 'EVENT_UUID_HERE';

COMMIT;
```

### Step 8: Final Verification

```sql
-- Verify all data is cleaned
WITH cleanup_summary AS (
  SELECT 'Votes' as data_type, COUNT(*) as count
  FROM votes WHERE event_id = 'EVENT_UUID_HERE'
  UNION ALL
  SELECT 'Bids', COUNT(*)
  FROM bids WHERE art_id IN (SELECT id FROM art WHERE event_id = 'EVENT_UUID_HERE')
  UNION ALL
  SELECT 'Art_media', COUNT(*)
  FROM art_media WHERE art_id IN (SELECT id FROM art WHERE event_id = 'EVENT_UUID_HERE')
)
SELECT
  data_type,
  count as remaining,
  CASE WHEN count = 0 THEN '✅ CLEAN' ELSE '❌ DATA REMAINS' END as status
FROM cleanup_summary
ORDER BY data_type;

-- Check artwork statuses
SELECT
  art_code,
  status,
  current_bid,
  CASE
    WHEN status = 'active' AND current_bid = 0 THEN '✓ Ready'
    ELSE '❌ Not ready'
  END as ready_status
FROM art
WHERE event_id = 'EVENT_UUID_HERE'
ORDER BY round, easel;
```

## Tables NOT Modified

The following tables are intentionally NOT modified during cleanup:
- `events` - Event configuration remains unchanged
- `event_artists` - Artist assignments remain intact
- `artist_profiles` - Artist data preserved
- `rounds` - Round structure maintained
- `media_files` - Media files remain in storage (only connections removed)
- `people` - User records preserved

## Rollback Procedure

If something goes wrong during cleanup:

1. **If still in transaction:** Simply run `ROLLBACK;` instead of `COMMIT;`
2. **If already committed:** Restore from backup tables:

```sql
-- Restore votes (if backup still exists in session)
INSERT INTO votes
SELECT * FROM backup_votes_EVENT;

-- Restore bids
INSERT INTO bids
SELECT * FROM backup_bids_EVENT;

-- Restore art_media
INSERT INTO art_media
SELECT * FROM backup_art_media_EVENT;
```

## Example: AB3032 Cleanup Results

Event: **AB3032 – San Francisco City Championship**
Date: October 22, 2025

### Data Deleted:
- 4 votes
- 20 bids
- 21 art_media connections

### Data Reset (All 17 artworks):
- Status: `active` (was mixed: active, closed, sold)
- Current bid: 0.00
- Winner ID: NULL (4 had winners)
- Closing time: NULL (4 had closing times)
- Auction extended: false
- Extension count: 0
- Final price: NULL
- All payment tracking fields: NULL
- Bid count: 0
- Vote count: 0

### Final Status:
✅ ALL DATA CLEANED - EVENT READY

## Important Notes

1. **Payment Processing Records**: If payment_processing records exist, delete them BEFORE bids:
   ```sql
   DELETE FROM payment_processing
   WHERE art_id IN (SELECT id FROM art WHERE event_id = 'EVENT_UUID_HERE');
   ```

2. **Notifications**: Consider cleaning up any test notifications:
   ```sql
   DELETE FROM notifications
   WHERE event_id = 'EVENT_UUID_HERE';
   ```

3. **Slack Notifications**: May want to clean test Slack messages:
   ```sql
   DELETE FROM slack_notifications
   WHERE event_id = 'EVENT_UUID_HERE';
   ```

4. **Order of Operations Matters**:
   - Delete dependent data first (payments, notifications)
   - Then delete bids (depends on art)
   - Then delete votes
   - Then delete media connections
   - Finally reset artwork states

## Checklist

- [ ] Verify event is future/not yet started
- [ ] Count all data to be deleted
- [ ] Create backup tables
- [ ] Delete votes
- [ ] Delete bids
- [ ] Delete art_media connections
- [ ] Reset artwork statuses to 'active'
- [ ] Reset artwork current_bid to 0
- [ ] Reset winner_id to NULL
- [ ] Reset closing_time to NULL
- [ ] Reset auction_extended to false
- [ ] Reset all payment tracking fields to NULL
- [ ] Reset bid_count and vote_count to 0
- [ ] Verify all counts are 0
- [ ] Verify all artworks show '✓ FULLY RESET'
- [ ] Document what was cleaned

## Related Files

- `/root/vote_app/vote26/scripts/cleanup-event-test-data.sql` - Original cleanup script template
- `/root/vote_app/vote26/scripts/quick-cleanup.sh` - Quick cleanup shell script (use with caution)
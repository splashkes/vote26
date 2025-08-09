# Art Battle Vote - Event Management Scripts

This directory contains scripts for managing Art Battle events, particularly for cleaning up test data before live events.

## Event Cleanup Process

### Before Running ANY Cleanup Script:
1. **Double-check the event ID** - Make sure you have the correct event
2. **Verify event timing** - Only clean events that haven't started yet
3. **Take a database snapshot** (if possible) for emergency recovery
4. **Run in a test environment first** if uncertain

## Scripts

### `cleanup-event-test-data.sql`
**Purpose:** Safely remove all test data (bids, votes, payments, media) from an event before it goes live.

**Usage:**
```bash
# 1. Open the script and replace 'EVENT_EID_HERE' with actual event ID
# 2. Run verification queries first:
PGPASSWORD='6kEtvU9n0KhTVr5' psql -h db.xsqdkubgyqwpyvfltnrf.supabase.co -p 5432 -d postgres -U postgres -v event_eid='AB2900' -f cleanup-event-test-data.sql

# 3. Review what will be deleted
# 4. Uncomment the cleanup section in the script
# 5. Run again to perform actual cleanup
```

**What it cleans:**
- ✅ Payment processing records (Stripe sessions)
- ✅ Test bids and bid history
- ✅ Test votes and vote weights
- ✅ Art media connections (uploaded images)
- ✅ Resets artwork status to 'active' with 0 bids

**Safety features:**
- Shows what will be deleted before doing anything
- Runs in transaction for rollback capability
- Provides detailed verification outputs
- Checks event timing to prevent accidents

## Manual Cleanup Process

If you need to run cleanup manually or understand the process:

### 1. Identify Event
```sql
-- Find the event
SELECT id, eid, name, event_start_datetime 
FROM events 
WHERE eid = 'AB2900';  -- Replace with actual EID
```

### 2. Assess Test Data
```sql
-- Count what needs cleaning
SELECT 
  'Payments' as type, COUNT(*) as count
FROM payment_processing pp
JOIN art a ON pp.art_id = a.id
WHERE a.event_id = 'EVENT_UUID_HERE'

UNION ALL

SELECT 
  'Bids' as type, COUNT(*) as count
FROM bids b
JOIN art a ON b.art_id = a.id
WHERE a.event_id = 'EVENT_UUID_HERE'

-- Add similar for votes, media, etc.
```

### 3. Clean in Order
```sql
-- Always clean in this order to avoid foreign key issues:
-- 1. Payment processing
-- 2. Bids
-- 3. Votes
-- 4. Art media links
-- 5. Reset artwork statuses
```

### 4. Verify Clean State
```sql
-- Ensure everything is clean
SELECT 
  art_code,
  status,
  current_bid,
  'Should all be active/0' as note
FROM art 
WHERE event_id = 'EVENT_UUID_HERE'
ORDER BY round, easel;
```

## Emergency Recovery

If cleanup goes wrong:

1. **Stop immediately** - Don't run more queries
2. **Check transaction state** - If still in transaction, can ROLLBACK
3. **Restore from snapshot** - If available
4. **Contact database admin** - For point-in-time recovery
5. **Document what happened** - For future prevention

## Best Practices

### Before Live Events:
- [ ] Clean test data 2-4 hours before event start
- [ ] Test one artwork's voting/bidding flow after cleanup
- [ ] Verify real-time subscriptions work
- [ ] Check SMS notifications are working
- [ ] Confirm payment flow works with clean data

### During Events:
- [ ] Monitor for any issues related to cleanup
- [ ] Have rollback plan ready if problems arise
- [ ] Keep database admin contact handy

### After Events:
- [ ] Document any issues found
- [ ] Update cleanup scripts if needed
- [ ] Archive event data properly

## Common Issues & Solutions

**Issue:** "Event not found"
- Solution: Double-check EID spelling and case-sensitivity

**Issue:** "Cannot delete due to foreign key"
- Solution: Clean in proper order (payments → bids → votes → media → status)

**Issue:** "Artworks still show old status"
- Solution: Check if UPDATE query ran successfully, may need to run status reset again

**Issue:** "Real-time updates not working after cleanup"
- Solution: Usually resolves automatically, but may need to refresh browser/clear cache

## Contact

For issues with cleanup scripts or database operations:
- Technical issues: Claude Code team
- Database emergencies: Database administrator
- Event coordination: Art Battle event team

---
*Last updated: 2025-08-09*
*Version: 1.0*
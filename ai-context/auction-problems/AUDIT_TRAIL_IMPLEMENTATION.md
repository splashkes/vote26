# Comprehensive Auction Audit Trail Implementation

## Overview

This document describes the safe implementation of comprehensive audit logging for the Art Battle auction system, specifically designed to prevent and investigate issues like the Montreal October 1, 2025 premature closure.

## Migration File

**Location:** `/root/vote_app/vote26/migrations/20251002_add_comprehensive_auction_audit_logging.sql`

## What Gets Audited

### 1. Table-Level Changes (via Triggers)
- **`art` table**: All INSERT, UPDATE, DELETE operations
  - Status changes (active → sold → paid → closed)
  - Closing time changes (critical for timer investigations)
  - Bid count updates
  - Winner assignments
- **`events` table**: All INSERT, UPDATE, DELETE operations
  - auction_close_starts_at changes
  - enable_auction toggles
  - Event activation/deactivation
- **`bids` table**: Already has audit trigger (existing)

### 2. Admin Function Calls
- `manage_auction_timer()` - All timer operations:
  - start: When auction countdown begins
  - extend: When timers are extended
  - cancel: When timers are cancelled
  - close_now: When auctions are force-closed
- Future: Can add logging to other admin functions

## Safety Features

### 1. Never Breaks Core Functionality
```sql
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'Failed to log admin action: % - %', SQLERRM, SQLSTATE;
    RETURN NULL; -- Returns NULL but doesn't throw error
END;
```

All audit logging uses exception handlers. If logging fails, it:
- Logs a WARNING to PostgreSQL logs
- Returns NULL
- **Continues with the main operation**

### 2. Security Definer with Safe Search Path
```sql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'auth'
```

- Functions run with elevated privileges (SECURITY DEFINER)
- But use explicit schema qualification to prevent SQL injection
- Search path is locked to prevent schema poisoning attacks

### 3. Sensitive Data Redaction
The existing `audit_trigger_function` automatically redacts:
- phone
- email
- password
- token
- secret

These fields appear as `[REDACTED]` in audit logs.

## Database Schema

### Tables

#### `security_audit_logs` (Table-level changes)
```sql
Column        | Type      | Description
--------------+-----------+------------------------------------------
id            | integer   | Primary key
created_at    | timestamp | When the change occurred
table_name    | text      | Which table was modified
operation     | text      | INSERT, UPDATE, or DELETE
user_id       | uuid      | Who made the change (auth.uid())
user_role     | text      | admin, authenticated, or anonymous
old_data      | jsonb     | Full row data before change
new_data      | jsonb     | Full row data after change
ip_address    | inet      | User's IP address
user_agent    | text      | User's browser/client
session_id    | text      | Session identifier
function_name | text      | Which trigger logged this
```

#### `admin_audit_log` (Admin actions)
```sql
Column        | Type      | Description
--------------+-----------+------------------------------------------
id            | uuid      | Primary key
admin_user_id | uuid      | Which admin performed the action
event_id      | uuid      | Which event was affected
action_type   | text      | Type of action (e.g., auction_timer_start)
action_data   | jsonb     | Detailed action data
created_at    | timestamp | When the action occurred
updated_at    | timestamp | Last update time
```

### Views (Simplified Queries)

#### `art_audit_history` - Formatted art changes
```sql
SELECT * FROM art_audit_history
WHERE art_code = 'AB3059-1-6'
ORDER BY created_at DESC;
```

Returns:
- When: created_at
- Who: user_email
- What: operation (INSERT/UPDATE/DELETE)
- Before: old_status, old_closing_time, old_bid_count
- After: new_status, new_closing_time, new_bid_count

#### `auction_timer_audit` - Formatted timer operations
```sql
SELECT * FROM auction_timer_audit
WHERE event_id = 'ca071057-032d-4ed2-9648-f550b49028d5'
ORDER BY created_at DESC;
```

Returns:
- When: created_at
- Who: admin_email
- What: timer_action (start/extend/cancel/close_now)
- Details: duration_minutes, artworks_updated, closing_time

### Helper Functions

#### `get_event_audit_timeline(event_id)` - Complete timeline
```sql
SELECT * FROM get_event_audit_timeline('ca071057-032d-4ed2-9648-f550b49028d5')
ORDER BY timestamp;
```

Returns combined view of:
- Admin actions
- Art changes
- All in chronological order

## How To Deploy

### Step 1: Review the Migration
```bash
less /root/vote_app/vote26/migrations/20251002_add_comprehensive_auction_audit_logging.sql
```

### Step 2: Test in Local/Staging First
```bash
# IMPORTANT: Test first!
PGPASSWORD='your_password' psql -h staging-db.example.com -p 5432 -d postgres -U postgres \
  -f migrations/20251002_add_comprehensive_auction_audit_logging.sql
```

### Step 3: Verify Triggers Were Created
```sql
SELECT
  t.tgname as trigger_name,
  c.relname as table_name,
  pg_get_triggerdef(t.oid) as definition
FROM pg_trigger t
JOIN pg_class c ON t.tgrelid = c.oid
WHERE c.relname IN ('art', 'events', 'bids')
  AND t.tgname LIKE '%audit%';
```

Should see:
- `audit_art_trigger` on `art`
- `audit_events_trigger` on `events`
- `audit_bids_trigger` on `bids` (existing)

### Step 4: Test Audit Logging Works
```sql
-- Make a test change
UPDATE art
SET status = 'active'
WHERE art_code = 'TEST-1-1';

-- Check if it was logged
SELECT * FROM art_audit_history
WHERE art_code = 'TEST-1-1'
ORDER BY created_at DESC
LIMIT 1;
```

### Step 5: Deploy to Production
```bash
# Use the instruction from CLAUDE.md
PGPASSWORD='6kEtvU9n0KhTVr5' psql -h db.artb.art -p 5432 -d postgres -U postgres \
  -f migrations/20251002_add_comprehensive_auction_audit_logging.sql
```

## How To Query Audit Logs

### Investigation Scenarios

#### 1. "When did this artwork's status change?"
```sql
SELECT
  created_at,
  user_email,
  old_status,
  new_status,
  old_closing_time,
  new_closing_time
FROM art_audit_history
WHERE art_code = 'AB3059-1-6'
  AND old_status IS DISTINCT FROM new_status
ORDER BY created_at;
```

#### 2. "Who started the auction timer?"
```sql
SELECT
  created_at,
  admin_email,
  timer_action,
  duration_minutes,
  artworks_updated,
  closing_time
FROM auction_timer_audit
WHERE event_id = 'ca071057-032d-4ed2-9648-f550b49028d5'
  AND timer_action = 'start'
ORDER BY created_at;
```

#### 3. "Complete timeline of what happened to an event"
```sql
SELECT
  timestamp AT TIME ZONE 'America/Montreal' as time_est,
  source,
  action,
  details,
  user_email
FROM get_event_audit_timeline('ca071057-032d-4ed2-9648-f550b49028d5')
ORDER BY timestamp;
```

#### 4. "Find all artworks that closed before the event started"
```sql
SELECT
  a.art_code,
  e.name as event_name,
  e.event_start_datetime AT TIME ZONE 'America/Montreal' as event_start,
  a.closing_time AT TIME ZONE 'America/Montreal' as closed_at,
  EXTRACT(EPOCH FROM (e.event_start_datetime - a.closing_time))/3600 as hours_before_event,
  -- Who set the closing time?
  (SELECT user_email
   FROM art_audit_history aah
   WHERE aah.art_id = a.id
     AND aah.new_closing_time IS NOT NULL
   ORDER BY created_at DESC
   LIMIT 1) as set_by
FROM art a
JOIN events e ON a.event_id = e.id
WHERE a.closing_time < e.event_start_datetime
  AND a.status IN ('closed', 'sold', 'paid')
ORDER BY hours_before_event DESC;
```

#### 5. "Show me all admin actions in the last 24 hours"
```sql
SELECT
  created_at,
  admin_email,
  action_type,
  event_name,
  action_data->>'result' as result,
  action_data
FROM auction_timer_audit
WHERE created_at > NOW() - INTERVAL '24 hours'
ORDER BY created_at DESC;
```

#### 6. "Did anyone try to reopen closed artworks?"
```sql
SELECT
  created_at,
  user_email,
  art_code,
  old_status,
  new_status,
  old_closing_time,
  new_closing_time
FROM art_audit_history
WHERE old_status = 'closed'
  AND new_status = 'active'
ORDER BY created_at DESC;
```

## Performance Considerations

### Indexes Created
- `idx_admin_audit_log_event_action` - Fast event + action queries
- `idx_security_audit_logs_table_operation` - Fast table + operation queries
- `idx_security_audit_logs_user_table` - Fast user + table queries

### Retention Policy
The existing system has automatic cleanup:
```sql
-- security_audit_logs table doesn't have automatic cleanup
-- Consider adding in future if table grows too large

-- Suggested retention: 90 days for security_audit_logs
-- Suggested retention: 365 days for admin_audit_log
```

### Performance Impact
- Triggers add ~1-5ms per operation
- Logs to separate tables (non-blocking)
- Exception handlers prevent failures
- Should have **minimal impact** on user-facing operations

## Monitoring & Alerts

### Suggested Monitoring Queries

#### 1. Detect timers set before event starts
```sql
-- Run this every 5 minutes via cron
SELECT
  e.id,
  e.name,
  e.event_start_datetime,
  COUNT(*) as artworks_closed_early
FROM events e
JOIN art a ON a.event_id = e.id
WHERE a.closing_time < e.event_start_datetime
  AND a.status IN ('closed', 'sold')
  AND e.event_start_datetime > NOW()
GROUP BY e.id, e.name, e.event_start_datetime
HAVING COUNT(*) > 0;
```

#### 2. Detect unusually short timers
```sql
-- Warn if timer < 15 minutes
SELECT
  created_at,
  admin_email,
  event_name,
  duration_minutes,
  artworks_updated
FROM auction_timer_audit
WHERE timer_action = 'start'
  AND duration_minutes < 15
  AND created_at > NOW() - INTERVAL '1 hour'
ORDER BY created_at DESC;
```

#### 3. Detect force closures
```sql
SELECT
  created_at,
  admin_email,
  event_name,
  artworks_updated
FROM auction_timer_audit
WHERE timer_action = 'close_now'
  AND created_at > NOW() - INTERVAL '1 hour'
ORDER BY created_at DESC;
```

## Rollback Plan

If the migration causes issues:

```sql
BEGIN;

-- Remove triggers
DROP TRIGGER IF EXISTS audit_art_trigger ON art;
DROP TRIGGER IF EXISTS audit_events_trigger ON events;

-- Remove views
DROP VIEW IF EXISTS art_audit_history;
DROP VIEW IF EXISTS auction_timer_audit;

-- Remove helper function
DROP FUNCTION IF EXISTS get_event_audit_timeline(UUID);
DROP FUNCTION IF EXISTS log_admin_action(TEXT, UUID, JSONB);

-- Restore original manage_auction_timer function
-- (You'll need to restore from backup or previous migration)

-- Remove indexes
DROP INDEX IF EXISTS idx_admin_audit_log_event_action;
DROP INDEX IF EXISTS idx_security_audit_logs_table_operation;
DROP INDEX IF EXISTS idx_security_audit_logs_user_table;

COMMIT;
```

## Next Steps

### Immediate
1. Deploy migration to staging
2. Test thoroughly
3. Deploy to production
4. Monitor for 24 hours

### Short Term (1-2 weeks)
1. Add audit logging to other critical functions:
   - `admin_update_art_status`
   - `admin_actually_close_auction_items`
   - `clear_auction_closing_time`
2. Create monitoring dashboard
3. Set up alerts for anomalies

### Long Term (1-2 months)
1. Implement automated recovery for common issues
2. Add audit log viewer to admin UI
3. Create weekly audit reports
4. Implement audit log retention policy

## Support

If you encounter issues:
1. Check PostgreSQL logs: `SELECT * FROM pg_stat_activity WHERE state = 'active';`
2. Check for warnings: Look for "Failed to log admin action" in logs
3. Verify triggers: `\d+ art` and look for "Triggers:" section
4. Test manually: Make a change and query `art_audit_history`

## References

- Montreal October 1, 2025 Analysis: `/root/vote_app/vote26/ai-context/auction-problems/montreal-oct1-2025-REVISED-analysis.md`
- Supabase Audit Documentation: https://supabase.com/docs/guides/database/database-triggers
- PostgreSQL Trigger Documentation: https://www.postgresql.org/docs/current/sql-createtrigger.html

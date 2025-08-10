# LOAD THIS FILE TO PREP FOR EVENT TROUBLESHOOTING

## ⚠️ CRITICAL REMINDERS - READ FIRST ⚠️

### NEVER DO THESE DURING LIVE EVENTS:
1. **DON'T modify critical functions during live events** (like cast_vote_secure, process_bid_secure)
2. **DON'T add unnecessary complexity** (like hash generation when not needed)
3. **DON'T make bulk database changes** without precise WHERE clauses
4. **DON'T assume auth/RLS issues** - check column constraints first
5. **DON'T batch up todo completions** - mark them complete immediately

### ALWAYS DO THESE:
1. **DO use TodoWrite tool** to track all tasks and progress
2. **DO test with specific user auth context** when debugging functions
3. **DO check column constraints and data types** before assuming logic errors
4. **DO use precise timestamps** when cleaning up test data
5. **DO keep functions simple** - remove unnecessary fields/logic

---

## Command & Query Construction - DOS AND DON'TS

### ❌ COMMAND DON'TS:

**DON'T use complex shell pipes with SQL:**
```bash
# WRONG - This will fail
PGPASSWORD='6kEtvU9n0KhTVr5' psql -h db.xsqdkubgyqwpyvfltnrf.supabase.co -p 5432 -d postgres -U postgres -c "
SELECT * FROM votes;" | grep "something"
```

**DON'T forget to escape quotes in complex SQL:**
```bash
# WRONG - Quotes will break
PGPASSWORD='6kEtvU9n0KhTVr5' psql ... -c "SELECT * FROM votes WHERE art_code = 'AB2900-1-1'"
```

**DON'T use unescaped dollar signs in bash:**
```bash
# WRONG - $1, $2 will be interpreted as bash variables
-c "SELECT cast_vote_secure($1, $2, $3)"
```

**DON'T chain multiple SQL statements without proper separation:**
```bash
# WRONG - Missing semicolons or proper formatting
-c "UPDATE table1 SET x=1 UPDATE table2 SET y=2"
```

### ✅ COMMAND DOS:

**DO use proper escaping for complex SQL:**
```bash
# CORRECT - Use $function$ escaping for complex functions
PGPASSWORD='6kEtvU9n0KhTVr5' psql -h db.xsqdkubgyqwpyvfltnrf.supabase.co -p 5432 -d postgres -U postgres -c "
CREATE OR REPLACE FUNCTION test()
RETURNS text
LANGUAGE plpgsql
AS \$function\$
BEGIN
  RETURN 'hello world';
END;
\$function\$;"
```

**DO use HERE documents for very complex SQL:**
```bash
# CORRECT - For very long SQL
PGPASSWORD='6kEtvU9n0KhTVr5' psql -h db.xsqdkubgyqwpyvfltnrf.supabase.co -p 5432 -d postgres -U postgres << 'EOF'
SELECT very_long_query
FROM multiple_tables
WHERE complex_conditions;
EOF
```

**DO separate multiple statements properly:**
```bash
# CORRECT - Clear statement separation
-c "
UPDATE table1 SET x=1;
UPDATE table2 SET y=2;
"
```

**DO use proper parameter passing:**
```bash
# CORRECT - Pass parameters properly
-c "SELECT cast_vote_secure('AB2900', 1, 1);"
```

### ❌ SQL QUERY DON'TS:

**DON'T use != in PostgreSQL:**
```sql
-- WRONG
WHERE vote_factor != 1.00

-- CORRECT  
WHERE vote_factor <> 1.00
-- OR
WHERE vote_factor != 1.00  -- Actually works but <> is standard
```

**DON'T forget column exists before using:**
```sql
-- WRONG - Always check table structure first
SELECT created_at FROM art_media;

-- CORRECT - Check first
\d art_media
-- Then query existing columns
SELECT created_by FROM art_media;
```

**DON'T use unqualified column names in JOINs:**
```sql
-- WRONG - Ambiguous columns
SELECT id, name FROM people p JOIN votes v ON p.id = v.person_id;

-- CORRECT - Qualified columns
SELECT p.id, p.name FROM people p JOIN votes v ON p.id = v.person_id;
```

**DON'T assume table/column names without checking:**
```sql
-- WRONG - Assuming column name
SELECT phone_number FROM people;

-- CORRECT - Check table structure first
\d people
-- Then use actual column name
SELECT phone FROM people;
```

### ✅ SQL QUERY DOS:

**DO check table structure before querying:**
```sql
-- ALWAYS start with this
\d table_name

-- Or this for detailed info
SELECT column_name, data_type, is_nullable, column_default 
FROM information_schema.columns 
WHERE table_name = 'table_name' AND table_schema = 'public'
ORDER BY ordinal_position;
```

**DO use proper UNION syntax:**
```sql
-- CORRECT
SELECT count(*) as votes, 'new_users' as type
FROM votes WHERE created_at > '2025-08-10'
UNION ALL
SELECT count(*) as votes, 'old_users' as type  
FROM votes WHERE created_at < '2025-08-10';
```

**DO use explicit type casting when needed:**
```sql
-- CORRECT - Explicit casting
SELECT p_eid::TEXT || '-' || p_round::TEXT || '-' || p_easel::TEXT;
```

**DO use proper string operations:**
```sql
-- CORRECT - PostgreSQL string functions
WHERE message ILIKE '%cast_vote_secure%'  -- Case insensitive
WHERE phone LIKE '+1402%'                 -- Pattern matching
```

---

## Quick Diagnostic Queries

### 1. Check System Health

**Database connections and locks:**
```sql
SELECT datname, pid, state, query_start, 
       LEFT(query, 100) as current_query 
FROM pg_stat_activity 
WHERE state != 'idle' 
ORDER BY query_start;
```

**WAL replication lag (real-time issues):**
```sql
SELECT slot_name, active, restart_lsn, confirmed_flush_lsn, 
       pg_size_pretty(pg_wal_lsn_diff(pg_current_wal_lsn(), confirmed_flush_lsn)) AS lag 
FROM pg_replication_slots 
WHERE slot_name LIKE '%realtime%';
```

### 2. Voting/Bidding Function Issues

**Test vote function with specific user:**
```sql
SET session_replication_role = replica;
SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claim.sub = 'USER_AUTH_UUID_HERE';
SET LOCAL request.jwt.claim.phone = '14025551234';
SELECT cast_vote_secure('AB2900', 1, 1);
```

**Test bid function with specific user:**
```sql
SET session_replication_role = replica;  
SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claim.sub = 'USER_AUTH_UUID_HERE';
SET LOCAL request.jwt.claim.phone = '14025551234';
SELECT process_bid_secure('ART_UUID_HERE', 50.00);
```

**Find users who scanned QR but can't vote:**
```sql
SELECT DISTINCT
  p.id as person_id,
  p.phone,
  p.created_at as person_created,
  COUNT(DISTINCT pqs.id) as qr_scan_count,
  COUNT(DISTINCT v.id) as vote_count,
  COUNT(DISTINCT vw.id) as has_vote_weight
FROM people p
JOIN people_qr_scans pqs ON p.id = pqs.person_id
LEFT JOIN votes v ON p.id = v.person_id AND v.event_id = 'EVENT_UUID_HERE'
LEFT JOIN vote_weights vw ON p.id = vw.person_id AND vw.event_id = 'EVENT_UUID_HERE'
WHERE pqs.event_id = 'EVENT_UUID_HERE'
  AND pqs.is_valid = true
  AND p.phone IS NOT NULL
GROUP BY p.id, p.phone, p.created_at
HAVING COUNT(DISTINCT v.id) = 0  -- No votes
ORDER BY p.created_at DESC;
```

### 3. Event Status and Vote Patterns

**Vote summary by round and time:**
```sql
SELECT 
  COUNT(*) as vote_count, 
  round, 
  DATE_TRUNC('minute', created_at) as time_bucket,
  AVG(vote_factor) as avg_vote_weight
FROM votes 
WHERE event_id = 'EVENT_UUID_HERE' 
GROUP BY round, time_bucket 
ORDER BY time_bucket DESC 
LIMIT 20;
```

**New vs existing user voting patterns:**
```sql
SELECT 
  v.round,
  p.created_at as person_created,
  v.created_at as vote_created,
  v.vote_factor,
  p.phone,
  CASE WHEN p.created_at > 'EVENT_START_TIME' THEN 'new_user' ELSE 'existing_user' END as user_type
FROM votes v
JOIN people p ON v.person_id = p.id 
WHERE v.event_id = 'EVENT_UUID_HERE'
ORDER BY v.created_at DESC
LIMIT 20;
```

### 4. Real-time System Issues

**Check realtime subscriptions:**
```sql
SELECT 
  id,
  entity,
  filters,
  claims_role,
  created_at
FROM realtime.subscription 
WHERE created_at > NOW() - INTERVAL '1 hour'
ORDER BY created_at DESC 
LIMIT 10;
```

**Check realtime publications:**
```sql
SELECT schemaname, tablename, pubname 
FROM pg_publication_tables 
WHERE pubname = 'supabase_realtime';
```

### 5. Error Detection

**Recent function errors:**
```sql
SELECT 
  timestamp,
  level,
  message,
  error_details,
  service,
  operation
FROM system_logs 
WHERE level IN ('error', 'fatal')
  AND timestamp > NOW() - INTERVAL '30 minutes'
ORDER BY timestamp DESC 
LIMIT 10;
```

**Authentication/token issues:**
```sql
SELECT 
  created_at,
  payload->>'action' as action,
  payload->>'actor_username' as phone_number
FROM auth.audit_log_entries 
WHERE payload->>'action' IN ('token_revoked', 'logout', 'user_signedup')
  AND created_at > NOW() - INTERVAL '30 minutes'
ORDER BY created_at DESC 
LIMIT 10;
```

### 6. Column/Schema Issues

**Check table structure when getting field errors:**
```sql
-- For votes table
\d votes

-- Check for missing columns
SELECT column_name, data_type, is_nullable, column_default 
FROM information_schema.columns 
WHERE table_name = 'votes' AND table_schema = 'public'
ORDER BY ordinal_position;
```

**Validate function signatures:**
```sql
SELECT proname, pg_get_function_arguments(oid) as args, prosecdef
FROM pg_proc 
WHERE proname IN ('cast_vote_secure', 'process_bid_secure');
```

---

## Common Issue Patterns & Solutions

### Issue: "An error occurred processing your vote"
**Diagnosis Steps:**
1. Test the function directly with user's auth context (see query above)
2. Check if it's a column constraint issue (VARCHAR length, NOT NULL, etc.)
3. Look for missing required fields in INSERT statements
4. Verify person record exists and has proper auth_user_id

**Common Causes:**
- Hash field being too long for VARCHAR(50) - **REMOVE HASH GENERATION**
- Missing columns in INSERT (eid, easel, art_uuid vs art_id confusion)
- Person record doesn't exist - function should create it
- Vote weights calculation failing - default to 1.0

### Issue: Real-time updates not working
**Diagnosis Steps:**
1. Check WAL replication lag (query above)
2. Verify tables are in supabase_realtime publication
3. Check if database restarted (users need to refresh browsers)

**Common Causes:**
- WAL replication slot stuck with high lag
- Database restart broke existing WebSocket connections
- RLS policies blocking real-time updates

### Issue: QR code validation failing
**Diagnosis Steps:**
1. Check if QR codes are expiring too quickly
2. Verify edge function has proper permissions
3. Test QR validation function directly

### Issue: SMS not sending
**Common Causes:**
- Wrong Twilio from number in secrets
- Region permissions (like Dominican Republic numbers)
- Supabase Auth rate limiting vs Twilio rate limiting

---

## Emergency Recovery Commands

### Fix broken vote function (remove problematic fields):
```sql
-- Get current function definition first
SELECT pg_get_functiondef(oid) 
FROM pg_proc 
WHERE proname = 'cast_vote_secure' 
AND pg_get_function_arguments(oid) = 'p_eid character varying, p_round integer, p_easel integer';

-- Template for minimal working vote function (NO HASH!)
-- See the working version in git history: commit after hash removal
```

### Clean up test votes (BE VERY CAREFUL):
```sql
-- ALWAYS use precise timestamp and person_id
DELETE FROM votes 
WHERE person_id = 'SPECIFIC_PERSON_UUID' 
  AND created_at > 'SPECIFIC_TIMESTAMP';

-- Update vote counts after cleanup
UPDATE art 
SET vote_count = GREATEST(0, vote_count - DELETED_COUNT) 
WHERE art_code = 'SPECIFIC_ART_CODE';
```

### Create vote weight for blocked user:
```sql
-- Only if vote_weights calculation is completely broken
INSERT INTO vote_weights (event_id, person_id, vote_factor, phone_number, from_source, status) 
VALUES ('EVENT_UUID', 'PERSON_UUID', 1.0, '+14025551234', 'emergency_fix', 'active');
```

---

## Live Event Best Practices

### Before Event:
1. **Test all critical functions** with realistic data sizes
2. **Verify column constraints** match what functions expect
3. **Check QR code expiration times** (should be 10+ minutes, not 90 seconds)
4. **Confirm Twilio from numbers** are set in Supabase secrets

### During Event:
1. **Monitor vote patterns** - watch for drop-offs in new user voting
2. **Use TodoWrite tool** religiously to track all tasks
3. **Test function changes** with specific auth context before deploying
4. **Keep changes minimal** - remove complexity, don't add it
5. **Mark todos complete** immediately after finishing each task

### After Issues:
1. **Document everything** in incident reports
2. **Create snapshots** of vote data before/after fixes
3. **Verify fix works** with previously failing users
4. **Don't bulk delete** - be surgical with cleanup

---

## Key Database Connection Info
```bash
# Main connection (add to CLAUDE.md if not there):
PGPASSWORD='6kEtvU9n0KhTVr5' psql -h db.xsqdkubgyqwpyvfltnrf.supabase.co -p 5432 -d postgres -U postgres

# Current event UUID (AB2900):
EVENT_UUID='6cdb02e0-5920-44b6-887d-7bf662fc129c'
```

---

## Remember: Keep It Simple
- **Default vote weight to 1.0** if complex calculations fail
- **Remove unnecessary fields** like hash generation
- **Test with real user auth context** not just function isolation
- **Use the TodoWrite tool** - it saves your sanity during chaotic live events
- **Small precise fixes** beat large rewrites during emergencies
- **Always check table structure (\d table_name) before querying**
- **Use proper escaping (\$function\$) for complex SQL in bash**
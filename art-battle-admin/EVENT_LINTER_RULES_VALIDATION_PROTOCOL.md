# Event Linter Rules - Pre-Implementation Validation Protocol

**Date:** October 4, 2025
**Purpose:** Validate data availability and complexity assumptions BEFORE implementing each rule
**Goal:** Minimize troubleshooting time by checking everything carefully first

---

## Validation Methodology

### For Each Rule, Answer These Questions:

1. **Does the data exist?** ✅ / ❌
2. **Is the data in the expected format?** ✅ / ❌
3. **Are there enough sample events to test?** ✅ / ❌
4. **Can we write a working query?** ✅ / ❌
5. **Does the query perform well?** ✅ / ❌
6. **Are there edge cases to handle?** Document them

---

## Phase 1: Data Discovery Queries

### Step 1: Check Table/Column Existence

```sql
-- Run this for each rule to verify fields exist
-- Example for Rule #14: artist_payment_overdue

-- Check if art table has sale tracking
SELECT
  COUNT(*) as total_art,
  COUNT(CASE WHEN sold = true THEN 1 END) as sold_count,
  COUNT(CASE WHEN sold_datetime IS NOT NULL THEN 1 END) as has_sold_datetime,
  COUNT(CASE WHEN payment_completed = true THEN 1 END) as payment_completed_count
FROM art
LIMIT 1;

-- Expected result: All counts > 0
-- If any count = 0, that field doesn't exist or isn't populated
```

### Step 2: Sample Data Inspection

```sql
-- Get sample data to understand structure
-- Rule #14: artist_payment_overdue

SELECT
  a.id,
  a.code,
  a.sold,
  a.sold_datetime,
  a.artist_id,
  ap.name as artist_name,
  -- Check if payment tracking exists
  (SELECT COUNT(*) FROM payment_attempts WHERE art_id = a.id) as payment_attempts_count,
  (SELECT MAX(created_at) FROM payment_attempts WHERE art_id = a.id) as last_payment_attempt
FROM art a
LEFT JOIN artist_profiles ap ON a.artist_id = ap.id
WHERE a.sold = true
LIMIT 10;

-- What to look for:
-- ✅ sold_datetime is populated (not NULL for sold art)
-- ✅ payment_attempts table exists and has data
-- ✅ Can join to artist_profiles
-- ❌ If any joins fail, need to adjust approach
```

### Step 3: Data Availability Statistics

```sql
-- For each rule, check data coverage
-- Example: Rule #37 ticket_revenue_success (needs historical comparison)

SELECT
  COUNT(DISTINCT e.id) as total_events,
  COUNT(DISTINCT CASE WHEN e.event_end_datetime < NOW() THEN e.id END) as completed_events,
  COUNT(DISTINCT CASE WHEN e.ticket_revenue IS NOT NULL THEN e.id END) as events_with_revenue,
  COUNT(DISTINCT e.cities_id) as cities_with_events,
  -- Check if we can get "last event" for comparison
  COUNT(DISTINCT CASE
    WHEN e.event_end_datetime < NOW()
    AND e.ticket_revenue IS NOT NULL
    THEN e.cities_id
  END) as cities_with_completed_revenue_events
FROM events e;

-- Interpretation:
-- If cities_with_completed_revenue_events < 10, might not have enough data for comparisons
-- If ticket_revenue NULL for most events, rule won't work
```

---

## Phase 2: Rule-Specific Validation Queries

### Template: Test Each Rule's Core Logic

```sql
-- TEMPLATE: Copy this for each rule and customize

-- Rule ID: [INSERT_RULE_ID]
-- Rule Name: [INSERT_RULE_NAME]
-- Expected Data: [LIST_REQUIRED_FIELDS]

-- Test 1: Data Existence Check
SELECT
  '[FIELD_NAME]' as field_name,
  COUNT(*) as total_rows,
  COUNT([FIELD_NAME]) as non_null_count,
  COUNT(DISTINCT [FIELD_NAME]) as distinct_values,
  MIN([FIELD_NAME]) as min_value,
  MAX([FIELD_NAME]) as max_value
FROM [TABLE_NAME];

-- Test 2: Sample Matching Records
-- (Records that WOULD trigger this rule)
SELECT *
FROM [TABLE_NAME]
WHERE [RULE_CONDITIONS]
LIMIT 10;

-- Test 3: Count Potential Findings
SELECT COUNT(*) as potential_findings
FROM [TABLE_NAME]
WHERE [RULE_CONDITIONS];

-- Test 4: Performance Check (should be <1 second)
EXPLAIN ANALYZE
SELECT *
FROM [TABLE_NAME]
WHERE [RULE_CONDITIONS];
```

---

## Phase 3: Specific Rule Validations

### Rule #14: `artist_payment_overdue`
**Assumption:** Art has `sold_datetime`, can track payment status

```sql
-- Validation Query Set

-- 1. Check art table structure
SELECT
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_name = 'art'
  AND column_name IN ('sold', 'sold_datetime', 'artist_id', 'sale_amount', 'currency');

-- Expected: All 5 columns exist
-- ❌ If missing: Need different approach


-- 2. Check if we can calculate "days since sale"
SELECT
  a.id,
  a.code,
  a.sold_datetime,
  EXTRACT(DAY FROM (NOW() - a.sold_datetime)) as days_since_sale,
  -- Check payment status
  COALESCE(
    (SELECT status FROM payment_attempts
     WHERE art_id = a.id
     ORDER BY created_at DESC
     LIMIT 1),
    'no_payment_attempt'
  ) as payment_status
FROM art a
WHERE a.sold = true
  AND a.sold_datetime IS NOT NULL
  AND EXTRACT(DAY FROM (NOW() - a.sold_datetime)) > 14
LIMIT 10;

-- Expected: Returns rows with days_since_sale > 14
-- ❌ If no rows: Either no old sales, or sold_datetime not populated


-- 3. Check if payment tracking exists
SELECT
  COUNT(DISTINCT a.id) as sold_art_count,
  COUNT(DISTINCT pa.art_id) as art_with_payment_attempts,
  COUNT(DISTINCT CASE WHEN pa.status = 'completed' THEN pa.art_id END) as art_with_completed_payments
FROM art a
LEFT JOIN payment_attempts pa ON a.artist_id = pa.artist_id
WHERE a.sold = true;

-- Expected: sold_art_count > 0, some payment tracking
-- ❌ If payment_attempts table doesn't exist: Use alternative method


-- 4. Performance test - Full rule query
EXPLAIN ANALYZE
SELECT
  a.id,
  a.code,
  a.artist_id,
  ap.name,
  a.sold_datetime,
  EXTRACT(DAY FROM (NOW() - a.sold_datetime)) as days_overdue
FROM art a
JOIN artist_profiles ap ON a.artist_id = ap.id
WHERE a.sold = true
  AND a.sold_datetime < (NOW() - INTERVAL '14 days')
  AND NOT EXISTS (
    SELECT 1 FROM payment_attempts pa
    WHERE pa.artist_id = a.artist_id
      AND pa.status = 'completed'
      AND pa.art_id = a.id
  );

-- Expected: Execution time < 1000ms
-- ❌ If slow: Need index on art(sold_datetime) or payment_attempts(art_id)
```

### Rule #2: `live_event_ended_no_results`
**Assumption:** Events have `winner_announced` or similar field

```sql
-- 1. Check events table for winner tracking
SELECT
  column_name,
  data_type
FROM information_schema.columns
WHERE table_name = 'events'
  AND column_name LIKE '%winner%' OR column_name LIKE '%result%';

-- Expected: Find winner_announced, winner_id, or results_finalized
-- ❌ If no columns: Need to define what "results finalized" means


-- 2. Check what fields indicate "results done"
SELECT
  e.eid,
  e.event_end_datetime,
  e.winner_announced,  -- May not exist
  e.auction_close_time,
  e.results_published_at,  -- May not exist
  -- Count if all rounds have results
  (SELECT COUNT(*) FROM rounds WHERE event_id = e.id AND winner_id IS NOT NULL) as rounds_with_winners
FROM events e
WHERE e.event_end_datetime < NOW()
  AND e.event_end_datetime > NOW() - INTERVAL '7 days'
LIMIT 10;

-- Interpretation:
-- ✅ If winner_announced exists and is boolean: Use that
-- ✅ If rounds have winner_id: Count rounds with winners
-- ❌ If no clear indicator: Need to create new field or logic


-- 3. Test rule logic
SELECT
  e.eid,
  e.name,
  e.event_end_datetime,
  EXTRACT(HOUR FROM (NOW() - e.event_end_datetime)) as hours_since_end,
  -- Check if results are done
  CASE
    WHEN e.winner_announced = true THEN 'Results done'
    WHEN e.auction_close_time IS NOT NULL THEN 'Auction closed'
    ELSE 'Results pending'
  END as status
FROM events e
WHERE e.event_end_datetime < NOW() - INTERVAL '30 minutes'
  AND (e.winner_announced = false OR e.winner_announced IS NULL);

-- Expected: Returns events needing results
-- ❌ If no rows: Either all events have results (good!) or field doesn't exist
```

### Rule #37: `ticket_revenue_success`
**Assumption:** Can find "last event in same city" with revenue data

```sql
-- 1. Check if events have ticket_revenue
SELECT
  COUNT(*) as total_events,
  COUNT(ticket_revenue) as events_with_revenue,
  COUNT(DISTINCT cities_id) as cities_count,
  AVG(ticket_revenue) as avg_revenue,
  MIN(ticket_revenue) as min_revenue,
  MAX(ticket_revenue) as max_revenue
FROM events
WHERE event_end_datetime < NOW();

-- Expected: High percentage with ticket_revenue
-- ❌ If events_with_revenue < 50%: Data quality issue


-- 2. Test "last event in city" logic
WITH city_events AS (
  SELECT
    e.id,
    e.eid,
    e.cities_id,
    e.event_end_datetime,
    e.ticket_revenue,
    ROW_NUMBER() OVER (
      PARTITION BY e.cities_id
      ORDER BY e.event_end_datetime DESC
    ) as event_rank
  FROM events e
  WHERE e.event_end_datetime < NOW()
    AND e.ticket_revenue IS NOT NULL
)
SELECT
  cities_id,
  COUNT(*) as events_in_city,
  -- Get last event revenue
  MAX(CASE WHEN event_rank = 1 THEN ticket_revenue END) as last_event_revenue,
  -- Get 2nd last for comparison
  MAX(CASE WHEN event_rank = 2 THEN ticket_revenue END) as previous_event_revenue
FROM city_events
GROUP BY cities_id
HAVING COUNT(*) >= 2  -- Need at least 2 events to compare
ORDER BY cities_id;

-- Expected: Returns cities with 2+ events and revenue data
-- ❌ If few results: Not enough historical data for comparisons


-- 3. Full rule query test
WITH last_city_event AS (
  SELECT DISTINCT ON (cities_id)
    cities_id,
    ticket_revenue as last_revenue
  FROM events
  WHERE event_end_datetime < NOW()
    AND ticket_revenue IS NOT NULL
  ORDER BY cities_id, event_end_datetime DESC
)
SELECT
  e.eid,
  e.ticket_revenue as current_revenue,
  lce.last_revenue,
  ((e.ticket_revenue - lce.last_revenue) / lce.last_revenue * 100) as percent_change
FROM events e
JOIN last_city_event lce ON e.cities_id = lce.cities_id
WHERE e.event_end_datetime < NOW() - INTERVAL '1 day'
  AND e.ticket_revenue > lce.last_revenue
LIMIT 10;

-- Expected: Returns events with revenue increases
-- ❌ If no results: Logic issue or data issue
```

### Rule #19: `no_ad_campaign_for_event`
**Assumption:** Meta ads integration provides campaign data

```sql
-- 1. Check if Meta ads cache exists
SELECT
  COUNT(*) as total_cached,
  COUNT(DISTINCT event_id) as events_with_ads,
  MIN(created_at) as oldest_cache,
  MAX(created_at) as newest_cache
FROM ai_analysis_cache
WHERE analysis_type = 'meta_ads';

-- Expected: Some cached results
-- ❌ If 0 rows: Meta integration not being used


-- 2. Check cache data structure
SELECT
  event_id,
  result->>'total_spend' as spend,
  result->>'campaigns' as campaigns,
  jsonb_array_length(result->'campaigns') as campaign_count
FROM ai_analysis_cache
WHERE analysis_type = 'meta_ads'
LIMIT 5;

-- Expected: Can extract spend and campaign count
-- ❌ If JSON structure different: Need to adjust parsing


-- 3. Test rule: Events without ads
SELECT
  e.eid,
  e.name,
  e.event_start_datetime,
  EXTRACT(DAY FROM (e.event_start_datetime - NOW())) as days_until,
  e.ticket_sales_count,
  COALESCE(
    (SELECT jsonb_array_length(result->'campaigns')
     FROM ai_analysis_cache
     WHERE event_id = e.eid AND analysis_type = 'meta_ads'),
    0
  ) as campaign_count
FROM events e
WHERE e.event_start_datetime > NOW()
  AND e.event_start_datetime < NOW() + INTERVAL '14 days'
  AND NOT EXISTS (
    SELECT 1 FROM ai_analysis_cache
    WHERE event_id = e.eid
      AND analysis_type = 'meta_ads'
      AND jsonb_array_length(result->'campaigns') > 0
  );

-- Expected: Events approaching with no ads
-- ❌ If all events have ads: Great! Rule will just not trigger
-- ❌ If cache never populated: Need to trigger Meta function first
```

### Rule #28: `city_confirmation_timing_warning`
**Assumption:** Can calculate city historical average for confirmation timing

```sql
-- 1. Check if confirmation timing data exists
SELECT
  COUNT(*) as total_events,
  COUNT(DISTINCT cities_id) as cities_count,
  COUNT(CASE WHEN confirmed_artists_count > 0 THEN 1 END) as events_with_confirmations,
  -- Check if we track WHEN confirmations happened
  COUNT(artists_confirmed_at) as events_with_confirmation_timestamp
FROM events
WHERE event_end_datetime < NOW();

-- Expected: High count of events_with_confirmations
-- ❌ If artists_confirmed_at doesn't exist: Can't track timing


-- 2. Calculate city averages (the complex part)
WITH confirmation_timing AS (
  SELECT
    e.cities_id,
    e.event_start_datetime,
    e.artists_confirmed_at,
    EXTRACT(DAY FROM (e.event_start_datetime - e.artists_confirmed_at)) as days_out_confirmed
  FROM events e
  WHERE e.event_end_datetime < NOW()
    AND e.artists_confirmed_at IS NOT NULL
    AND e.event_start_datetime > e.artists_confirmed_at  -- Sanity check
)
SELECT
  cities_id,
  COUNT(*) as sample_size,
  AVG(days_out_confirmed) as avg_days_out,
  STDDEV(days_out_confirmed) as stddev_days,
  MIN(days_out_confirmed) as min_days,
  MAX(days_out_confirmed) as max_days
FROM confirmation_timing
GROUP BY cities_id
HAVING COUNT(*) >= 3  -- Need minimum sample
ORDER BY sample_size DESC;

-- Expected: Multiple cities with averages
-- ❌ If sample_size < 3 for most cities: Not enough data
-- ❌ If artists_confirmed_at NULL: Need alternative data source


-- 3. Check if artist_confirmations table tracks this
SELECT
  ac.event_eid,
  ac.created_at as confirmation_date,
  e.event_start_datetime,
  EXTRACT(DAY FROM (e.event_start_datetime - ac.created_at)) as days_out
FROM artist_confirmations ac
JOIN events e ON e.eid = ac.event_eid
WHERE ac.confirmation_status = 'confirmed'
  AND e.event_start_datetime > ac.created_at
ORDER BY ac.created_at DESC
LIMIT 10;

-- Expected: Can calculate days_out from artist_confirmations
-- ✅ If this works: Use artist_confirmations table
-- ❌ If no data: This rule needs new tracking
```

### Rule #13: `rapid_data_access` (Security)
**Assumption:** Can track session duration and API calls

```sql
-- 1. Check if session/auth logs exist
SELECT
  table_name,
  column_name
FROM information_schema.columns
WHERE table_name IN ('auth_logs', 'api_logs', 'sessions', 'supabase_auth_logs')
ORDER BY table_name;

-- Expected: Some logging table exists
-- ❌ If no tables: Need to implement logging first


-- 2. Check Supabase auth.sessions if accessible
-- (May need service role)
SELECT
  id,
  user_id,
  created_at,
  updated_at,
  -- Calculate session duration
  EXTRACT(EPOCH FROM (updated_at - created_at)) as session_seconds
FROM auth.sessions
WHERE created_at > NOW() - INTERVAL '7 days'
ORDER BY created_at DESC
LIMIT 10;

-- Expected: Can see session durations
-- ❌ If access denied: Need different approach


-- 3. Check if we log API calls
SELECT
  COUNT(*) as total_calls,
  COUNT(DISTINCT user_id) as unique_users,
  -- Look for patterns
  user_id,
  COUNT(*) as calls_per_user,
  MIN(created_at) as first_call,
  MAX(created_at) as last_call,
  EXTRACT(EPOCH FROM (MAX(created_at) - MIN(created_at))) as session_duration_seconds
FROM api_request_logs  -- May not exist
WHERE created_at > NOW() - INTERVAL '1 day'
GROUP BY user_id
ORDER BY calls_per_user DESC
LIMIT 10;

-- Expected: Can track API calls per user
-- ❌ If table doesn't exist: Need to create logging


-- 4. Alternative: Check Supabase Edge Function logs
-- This would require querying Supabase logging API
-- or BigQuery if logs are exported there

-- For now, check if we have ANY logging mechanism:
SELECT
  schemaname,
  tablename,
  tableowner
FROM pg_tables
WHERE tablename LIKE '%log%'
   OR tablename LIKE '%session%'
   OR tablename LIKE '%audit%';

-- Expected: Find some audit/logging tables
-- ❌ If none: This rule needs infrastructure first
```

---

## Phase 4: Performance Validation

### Query Performance Checklist

For each rule query, run:

```sql
-- 1. Check query plan
EXPLAIN ANALYZE
[YOUR_RULE_QUERY];

-- Look for:
-- ✅ "Seq Scan" only on small tables (<1000 rows)
-- ✅ "Index Scan" on large tables
-- ✅ Total execution time < 1000ms
-- ❌ "Seq Scan" on events/art/artist_profiles (need index)
-- ❌ Execution time > 5000ms (too slow)


-- 2. Check if indexes exist
SELECT
  tablename,
  indexname,
  indexdef
FROM pg_indexes
WHERE tablename IN ('events', 'art', 'artist_profiles', 'artist_confirmations', 'payment_attempts')
ORDER BY tablename, indexname;

-- Verify indexes exist for:
-- - events(event_start_datetime)
-- - events(event_end_datetime)
-- - events(cities_id)
-- - art(sold_datetime)
-- - art(artist_id)
-- - payment_attempts(artist_id, status)


-- 3. Create missing indexes
-- Example:
CREATE INDEX CONCURRENTLY idx_art_sold_datetime
  ON art(sold_datetime)
  WHERE sold = true;

CREATE INDEX CONCURRENTLY idx_events_start_datetime
  ON events(event_start_datetime)
  WHERE event_start_datetime > NOW();
```

---

## Phase 5: Edge Case Testing

### Common Edge Cases to Test

```sql
-- 1. NULL value handling
-- For Rule #14: What if sold_datetime is NULL?
SELECT
  COUNT(*) as sold_without_date
FROM art
WHERE sold = true
  AND sold_datetime IS NULL;

-- If count > 0: Need COALESCE or NULL handling in rule


-- 2. Timezone issues
-- Check if datetimes are stored with timezone
SELECT
  column_name,
  data_type,
  datetime_precision
FROM information_schema.columns
WHERE table_name = 'events'
  AND column_name LIKE '%datetime%';

-- Expected: "timestamp with time zone"
-- ❌ If "timestamp without time zone": Timezone bugs possible


-- 3. Division by zero
-- For percentage calculations
SELECT
  COUNT(*) as events_with_zero_revenue
FROM events
WHERE ticket_revenue = 0 OR ticket_revenue IS NULL;

-- If count > 0: Need NULLIF() in division:
-- (current - last) / NULLIF(last, 0) * 100


-- 4. Multi-currency handling
-- For payment rules
SELECT
  currency,
  COUNT(*) as count,
  SUM(sale_amount) as total
FROM art
WHERE sold = true
GROUP BY currency;

-- If multiple currencies: Need currency-aware comparisons


-- 5. Duplicate events (same EID)
SELECT
  eid,
  COUNT(*) as count
FROM events
GROUP BY eid
HAVING COUNT(*) > 1;

-- If duplicates exist: Need DISTINCT or different join strategy
```

---

## Phase 6: Integration Testing

### Test Rule in Edge Function Context

Before adding to YAML, test the query in edge function:

```typescript
// Create test edge function: /supabase/functions/test-rule-14/index.ts

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

Deno.serve(async (req) => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  );

  // Test Rule #14: artist_payment_overdue
  const { data, error } = await supabase
    .from('art')
    .select(`
      id,
      code,
      sold_datetime,
      artist_id,
      artist_profiles!inner(name, email)
    `)
    .eq('sold', true)
    .lt('sold_datetime', new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString())
    .is('payment_completed', null);

  return new Response(JSON.stringify({
    success: !error,
    count: data?.length || 0,
    sample: data?.slice(0, 3) || [],
    error: error?.message,
    debug: {
      query: 'artist_payment_overdue test',
      timestamp: new Date().toISOString()
    }
  }), {
    headers: { 'Content-Type': 'application/json' }
  });
});
```

Deploy and test:
```bash
cd /root/vote_app/vote26/supabase
supabase functions deploy test-rule-14

# Test it
curl https://xsqdkubgyqwpyvfltnrf.supabase.co/functions/v1/test-rule-14 \
  -H "Authorization: Bearer YOUR_ANON_KEY"
```

---

## Phase 7: Data Quality Assessment

### For Each Rule, Document:

```markdown
## Rule #[NUMBER]: [RULE_ID]

### Data Availability: ✅ / ⚠️ / ❌
- **Primary data source:** [table.column]
- **Coverage:** [X%] of events have this data
- **Sample size:** [N] events can be evaluated
- **Data quality issues:** [List any problems]

### Complexity Validation: [1-10]
- **Original estimate:** [X]
- **Actual complexity:** [Y]
- **Reason for difference:** [Explanation]
- **Query performance:** [Xms average]

### Edge Cases Identified:
1. [Edge case 1]
2. [Edge case 2]

### Required Changes:
- [ ] Create index on [table.column]
- [ ] Add missing field [field_name]
- [ ] Handle NULL values with [approach]
- [ ] Adjust YAML condition [change]

### Ready for Implementation: ✅ / ❌
- If ❌, blockers: [List blockers]
```

---

## Quick Start: Validation Script

Run this to validate multiple rules at once:

```sql
-- Save as: validate_linter_rules.sql

DO $$
DECLARE
  rule_results TEXT := '';
BEGIN
  -- Rule #14: artist_payment_overdue
  rule_results := rule_results || E'\n=== Rule #14: artist_payment_overdue ===\n';

  -- Check data exists
  EXECUTE '
    SELECT COUNT(*) FROM art WHERE sold = true AND sold_datetime IS NOT NULL
  ' INTO rule_results;

  rule_results := rule_results || 'Sold art with dates: ' || rule_results || E'\n';

  -- Check payment tracking
  EXECUTE '
    SELECT COUNT(*) FROM payment_attempts
  ' INTO rule_results;

  rule_results := rule_results || 'Payment attempts: ' || rule_results || E'\n';

  -- Rule #2: live_event_ended_no_results
  rule_results := rule_results || E'\n=== Rule #2: live_event_ended_no_results ===\n';

  EXECUTE '
    SELECT COUNT(*) FROM events
    WHERE event_end_datetime < NOW()
      AND event_end_datetime > NOW() - INTERVAL ''7 days''
  ' INTO rule_results;

  rule_results := rule_results || 'Recent completed events: ' || rule_results || E'\n';

  -- Output results
  RAISE NOTICE '%', rule_results;
END $$;
```

---

## Recommended Workflow

### For Each Rule (30-60 min per rule):

1. **Run Data Discovery** (10 min)
   - Check table/column existence
   - Verify data types
   - Check data coverage

2. **Run Sample Query** (10 min)
   - Get 10 sample records
   - Verify logic works
   - Check for NULL handling

3. **Run Performance Test** (10 min)
   - EXPLAIN ANALYZE
   - Check indexes
   - Optimize if needed

4. **Test Edge Cases** (10 min)
   - NULL values
   - Zero/empty values
   - Timezone issues
   - Multi-currency

5. **Document Findings** (10 min)
   - Update complexity score
   - Note required changes
   - Mark ready/not ready

6. **Create Test Function** (10 min)
   - Deploy test edge function
   - Verify in real environment
   - Check response format

---

## Validation Tracking Sheet

Create a simple tracking file:

| Rule # | ID | Data ✓ | Query ✓ | Perf ✓ | Edges ✓ | Test ✓ | Status |
|--------|-----|--------|---------|--------|---------|--------|--------|
| 2 | live_event_ended_no_results | ✅ | ✅ | ✅ | ⚠️ | ✅ | Ready |
| 14 | artist_payment_overdue | ✅ | ✅ | ❌ | ✅ | - | Needs Index |
| 37 | ticket_revenue_success | ⚠️ | ✅ | ✅ | ✅ | - | Low Data Coverage |

Legend:
- ✅ Validated, no issues
- ⚠️ Minor issues, workaround exists
- ❌ Blocker, must fix before implementation
- `-` Not yet tested

---

## Common Validation Issues & Solutions

### Issue: "Field doesn't exist"
**Solution:**
1. Search for alternative field names
2. Check if data is in related table
3. Consider creating field if critical
4. Adjust rule to use available data

### Issue: "Not enough historical data"
**Solution:**
1. Lower threshold (e.g., 3 events → 2 events)
2. Use global average instead of city
3. Mark as "future rule" - implement when data exists

### Issue: "Query too slow (>5 sec)"
**Solution:**
1. Add indexes on filtered/joined columns
2. Add WHERE clause to limit scope
3. Use materialized view for complex aggregations
4. Cache results with longer TTL

### Issue: "Too many NULL values"
**Solution:**
1. Use COALESCE with sensible defaults
2. Add condition to exclude NULLs
3. Change severity (error → warning)
4. Document as data quality issue

### Issue: "Timezone confusion"
**Solution:**
1. Always use AT TIME ZONE 'UTC'
2. Convert event timezone to UTC for comparison
3. Use INTERVAL for relative time
4. Test with events in different timezones

---

## Pre-Deployment Checklist

Before adding rule to YAML:

- [ ] Data existence verified in production database
- [ ] Sample query returns expected results
- [ ] Performance test shows <1 sec execution
- [ ] Edge cases handled (NULL, zero, empty)
- [ ] Tested in edge function context
- [ ] Message template has all placeholders available
- [ ] Documented complexity score matches reality
- [ ] Required indexes created
- [ ] Ready for production

---

**Next Steps:**
1. Start with Phase 1 rules (#2, #14, #15, #23, #49, #50)
2. Run validation protocol for each
3. Document findings
4. Implement only after ALL checks pass
5. Deploy one rule at a time
6. Monitor for 24 hours before next rule

This approach will catch 90% of issues before they hit production! 🎯

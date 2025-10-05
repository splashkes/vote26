# Quick Validation Guide - Test Before You Build

**Goal:** Validate every assumption about data BEFORE writing YAML rules
**Time per rule:** 15-30 minutes
**Saved debugging time:** Hours or days

---

## 🚀 Quick Start (3 Steps)

### Step 1: Pick a Rule to Validate
From `EVENT_LINTER_RULES_EVALUATION.md`, choose a rule to implement.

Example: Rule #14 (`artist_payment_overdue`)

### Step 2: Run the Validation Script
```bash
cd /root/vote_app/vote26/art-battle-admin

# Set service key (one time)
export SUPABASE_SERVICE_KEY="your_service_role_key_here"

# Validate specific rule
node validate-linter-rule.js --rule 14

# Or validate all implemented rules
node validate-linter-rule.js --all
```

### Step 3: Interpret Results
- ✅ **All green** = Ready to implement in YAML
- ⚠️ **Warnings** = Implement but note limitations
- ❌ **Red errors** = Fix blockers first

---

## 📊 What Gets Validated

### 1. Data Existence
- Does the table/column exist?
- Is the field populated (not NULL)?
- Do we have enough sample data to test?

**Example Check:**
```
📋 Art table has sale tracking
   ✅ Validation passed
   📊 Results (145ms):
   {
     "total_art": 2453,
     "sold_count": 1879,
     "has_sold_datetime": 1879,
     "old_sales": 234
   }
```

### 2. Query Logic
- Does the query return expected results?
- Can we find sample records that match conditions?
- Are joins working correctly?

**Example Check:**
```
📋 Sample overdue payments
   📊 Results (89ms):
   [
     {
       "code": "AB3001-A1",
       "days_overdue": 18,
       "artist_name": "Jane Artist",
       "payment_status": "pending"
     }
   ]
```

### 3. Performance
- Query execution time < 1 second?
- Are indexes being used?
- Will it scale with more data?

**Example Check:**
```
⚡ Performance Test
   ✅ Query completed in 234ms (excellent)
```

### 4. Edge Cases
- NULL value handling
- Division by zero
- Timezone issues
- Empty result sets

---

## 🔍 Manual SQL Testing (When Script Doesn't Cover It)

For rules not yet in the validation script:

### Template Query
```sql
-- Rule #[NUMBER]: [RULE_ID]

-- 1. Check data exists
SELECT
  COUNT(*) as total,
  COUNT([field_name]) as populated,
  COUNT(DISTINCT [field_name]) as unique_values
FROM [table_name];

-- 2. Sample data
SELECT *
FROM [table_name]
WHERE [rule_conditions]
LIMIT 10;

-- 3. Performance test
EXPLAIN ANALYZE
SELECT COUNT(*)
FROM [table_name]
WHERE [rule_conditions];
```

### Example: Rule #28 (City Confirmation Timing)

```sql
-- 1. Check if we track confirmation timing
SELECT
  COUNT(*) as total_events,
  COUNT(artists_confirmed_at) as has_confirmation_date,
  COUNT(DISTINCT cities_id) as cities_count
FROM events
WHERE event_end_datetime < NOW();

-- If artists_confirmed_at doesn't exist, try:
SELECT
  ac.event_eid,
  ac.created_at as confirmation_date,
  e.event_start_datetime,
  EXTRACT(DAY FROM (e.event_start_datetime - ac.created_at)) as days_out
FROM artist_confirmations ac
JOIN events e ON e.eid = ac.event_eid
WHERE ac.confirmation_status = 'confirmed'
LIMIT 10;

-- 2. Calculate city averages (the complex part)
WITH confirmation_timing AS (
  SELECT
    e.cities_id,
    EXTRACT(DAY FROM (e.event_start_datetime - ac.created_at)) as days_out
  FROM artist_confirmations ac
  JOIN events e ON e.eid = ac.event_eid
  WHERE ac.confirmation_status = 'confirmed'
)
SELECT
  cities_id,
  COUNT(*) as sample_size,
  AVG(days_out) as avg_days_out,
  MIN(days_out) as min,
  MAX(days_out) as max
FROM confirmation_timing
GROUP BY cities_id
HAVING COUNT(*) >= 3
ORDER BY sample_size DESC;

-- 3. Check if sample sizes are adequate
-- If most cities have <3 events, rule won't work reliably
```

---

## 🛠️ Common Fixes

### Problem: "Field doesn't exist"

**Check:**
```sql
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'events'
  AND column_name LIKE '%confirm%';
```

**Solutions:**
1. Use different field name
2. Check related table (e.g., `artist_confirmations` instead of `events.confirmed_at`)
3. Create field if critical (requires migration)
4. Adjust rule to use available data

---

### Problem: "Not enough data"

**Check:**
```sql
-- How much historical data do we have?
SELECT
  EXTRACT(YEAR FROM event_end_datetime) as year,
  COUNT(*) as events,
  COUNT(DISTINCT cities_id) as cities
FROM events
WHERE event_end_datetime < NOW()
GROUP BY EXTRACT(YEAR FROM event_end_datetime)
ORDER BY year DESC;
```

**Solutions:**
1. Lower threshold (3 events → 2 events)
2. Use longer time window
3. Mark as "future rule" - implement when data exists
4. Use global average instead of city-specific

---

### Problem: "Query too slow (>5 sec)"

**Check indexes:**
```sql
SELECT
  tablename,
  indexname,
  indexdef
FROM pg_indexes
WHERE tablename = 'events'
ORDER BY tablename, indexname;
```

**Solutions:**
1. Add index:
   ```sql
   CREATE INDEX CONCURRENTLY idx_events_sold_datetime
     ON art(sold_datetime)
     WHERE sold = true;
   ```

2. Add WHERE clause to limit scope:
   ```sql
   -- Instead of:
   SELECT * FROM events;

   -- Use:
   SELECT * FROM events
   WHERE event_start_datetime > NOW() - INTERVAL '1 year';
   ```

3. Use materialized view for complex aggregations

---

### Problem: "Too many NULL values"

**Check NULL percentage:**
```sql
SELECT
  COUNT(*) as total,
  COUNT(ticket_revenue) as populated,
  ROUND(COUNT(ticket_revenue)::numeric / COUNT(*) * 100, 1) as percent_populated
FROM events;
```

**Solutions:**
1. Use COALESCE:
   ```sql
   COALESCE(ticket_revenue, 0) > 1000
   ```

2. Exclude NULLs:
   ```sql
   WHERE ticket_revenue IS NOT NULL
     AND ticket_revenue > 1000
   ```

3. Change severity (error → warning → info)
4. Document as data quality issue

---

## ✅ Validation Checklist

Before implementing a rule, confirm:

- [ ] **Data exists** in production database
- [ ] **Field is populated** (not mostly NULL)
- [ ] **Sample query** returns expected results
- [ ] **Performance** test shows <1 sec execution
- [ ] **Edge cases** handled (NULL, zero, empty)
- [ ] **Indexes exist** for filtered fields
- [ ] **Joins work** correctly
- [ ] **Sample size** adequate for comparisons (if comparative rule)
- [ ] **Message placeholders** have data available

---

## 📋 Validation Tracking Template

Copy this for each rule:

```markdown
## Rule #14: artist_payment_overdue

**Validation Date:** 2025-10-04
**Validated By:** [Your Name]

### Data Availability: ✅
- Primary data: `art.sold_datetime`, `payment_attempts.status`
- Coverage: 100% of sold art has sold_datetime
- Sample size: 234 sales >14 days old

### Query Performance: ✅
- Execution time: 234ms (excellent)
- Indexes used: idx_art_sold, idx_payment_attempts_art_id
- Scales well with data growth

### Edge Cases: ✅
- NULL handling: sold_datetime always populated for sold=true
- Timezone: Using UTC consistently
- Missing payments: Uses LEFT JOIN, handles gracefully

### Required Changes: None
- [x] All validations passed
- [x] Ready for YAML implementation

### Notes:
- payment_attempts table has good coverage
- Consider adding alert for >30 days overdue (separate rule)
```

---

## 🚨 When to STOP and Reassess

**Stop implementing if you see:**

1. **<50% data coverage** - Rule will fire incorrectly
   ```
   Only 234 of 1879 sold art pieces have payment tracking (12%)
   ```

2. **No historical data** - Can't calculate averages/comparisons
   ```
   Only 2 cities have ≥3 completed events for comparison
   ```

3. **Query >5 seconds** - Will slow down linter
   ```
   Query took 12,451ms (needs optimization)
   ```

4. **Complex joins fail** - Data model doesn't support it
   ```
   ERROR: relation "payment_history" does not exist
   ```

**In these cases:**
- Document the blocker in evaluation MD
- Move rule to "Future" phase
- Implement simpler version if possible
- Consider data quality improvements first

---

## 🎯 Success Criteria

**Rule is ready when:**
- ✅ All validation checks pass
- ✅ Sample query returns realistic results
- ✅ Performance <1 sec on production data
- ✅ Edge cases documented and handled
- ✅ Required indexes exist
- ✅ Message placeholders map to real data

**Then and only then:** Add to YAML and deploy! 🚀

---

## 📚 Reference Files

1. **EVENT_LINTER_RULES_EVALUATION.md** - All rules scored and prioritized
2. **EVENT_LINTER_RULES_VALIDATION_PROTOCOL.md** - Detailed validation methodology
3. **validate-linter-rule.js** - Automated validation script
4. **This guide** - Quick reference for daily use

---

## 💡 Pro Tips

1. **Start with easiest rules** - Build confidence and momentum
2. **Validate in production** - Dev data might differ
3. **Test edge cases manually** - Script can't catch everything
4. **Document assumptions** - Future you will thank you
5. **One rule at a time** - Don't batch implement without testing each

---

**Remember:** 30 minutes of validation saves hours of debugging! 🎯

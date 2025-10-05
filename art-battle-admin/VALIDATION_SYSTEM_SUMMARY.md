# Event Linter Validation System - Complete Overview

**Created:** October 4, 2025
**Purpose:** Comprehensive pre-implementation testing system for lint rules
**Goal:** Minimize troubleshooting by validating all assumptions before deploy

---

## 📁 What We Built

### 1. **Rule Evaluation Framework**
**File:** `EVENT_LINTER_RULES_EVALUATION.md`

- 51 proposed rules evaluated and scored
- Each rule scored on Business Value (1-10) and Complexity (1-10)
- Organized into 7 implementation phases
- Priority recommendations for each phase

**Key Sections:**
- Detailed rule analysis with data requirements
- Implementation phases (Week 1 through Future)
- Quick reference by difficulty level
- Success metrics per phase

---

### 2. **Validation Protocol**
**File:** `EVENT_LINTER_RULES_VALIDATION_PROTOCOL.md`

Comprehensive methodology for testing each rule before implementation.

**What It Covers:**
- Phase 1: Data Discovery Queries
- Phase 2: Rule-Specific Validation
- Phase 3: Performance Testing
- Phase 4: Edge Case Testing
- Phase 5: Integration Testing
- Phase 6: Data Quality Assessment

**Validation Questions:**
1. Does the data exist? ✅ / ❌
2. Is data in expected format? ✅ / ❌
3. Enough sample events to test? ✅ / ❌
4. Can we write a working query? ✅ / ❌
5. Does query perform well? ✅ / ❌
6. Edge cases handled? Document them

---

### 3. **Automated Validation Script**
**File:** `validate-linter-rule.js`

Node.js script that automates validation checks.

**Usage:**
```bash
# Validate single rule
node validate-linter-rule.js --rule 14

# Validate by ID
node validate-linter-rule.js --rule artist_payment_overdue

# Validate all implemented rules
node validate-linter-rule.js --all
```

**What It Tests:**
- Data existence and structure
- Sample queries return expected results
- Query performance (<1 sec target)
- Validation logic for each rule
- Returns ✅/⚠️/❌ status

**Currently Validates:**
- Rule #2: `live_event_ended_no_results`
- Rule #14: `artist_payment_overdue`
- Rule #19: `no_ad_campaign_for_event`
- Rule #37: `ticket_revenue_success`

---

### 4. **Quick Validation Guide**
**File:** `QUICK_VALIDATION_GUIDE.md`

Day-to-day reference for validating rules.

**Covers:**
- 3-step quick start
- What gets validated
- Manual SQL testing templates
- Common problems and fixes
- Validation checklist
- When to stop and reassess

**Use this for:** Daily rule validation workflow

---

### 5. **Database Helper Function**
**File:** `supabase/migrations/20251004_create_exec_sql_function.sql`

SQL function that allows validation script to run test queries.

**Function:** `exec_sql(text)`
- Executes arbitrary SQL
- Returns results as JSONB
- SERVICE ROLE ONLY (security)
- Used by validation script

**Deploy:**
```bash
cd /root/vote_app/vote26
PGPASSWORD='6kEtvU9n0KhTVr5' psql -h db.artb.art -p 5432 -d postgres -U postgres \
  -f supabase/migrations/20251004_create_exec_sql_function.sql
```

---

## 🚀 How to Use This System

### Step-by-Step Workflow

#### 1. Choose Rule to Implement
From `EVENT_LINTER_RULES_EVALUATION.md`:
```
Phase 1: Critical Immediate Wins
✅ Rule #14: artist_payment_overdue - BV: 10, C: 4
```

#### 2. Deploy Database Helper (One-Time Setup)
```bash
cd /root/vote_app/vote26
PGPASSWORD='6kEtvU9n0KhTVr5' psql -h db.artb.art -p 5432 -d postgres -U postgres \
  -f supabase/migrations/20251004_create_exec_sql_function.sql
```

#### 3. Set Environment Variable
```bash
export SUPABASE_SERVICE_KEY="your_service_role_key"
```

#### 4. Run Automated Validation
```bash
cd /root/vote_app/vote26/art-battle-admin
node validate-linter-rule.js --rule 14
```

**Interpret Results:**
- ✅ All green → Ready to implement
- ⚠️ Warnings → Implement with notes
- ❌ Errors → Fix blockers first

#### 5. Manual Deep Dive (If Needed)
Use queries from `EVENT_LINTER_RULES_VALIDATION_PROTOCOL.md`

Example for Rule #14:
```sql
-- Check data coverage
SELECT
  COUNT(*) as total_art,
  COUNT(CASE WHEN sold = true THEN 1 END) as sold_count,
  COUNT(sold_datetime) as has_datetime
FROM art;

-- Test rule logic
SELECT *
FROM art
WHERE sold = true
  AND sold_datetime < NOW() - INTERVAL '14 days'
LIMIT 10;
```

#### 6. Document Findings
Use template from validation guide:
```markdown
## Rule #14: artist_payment_overdue

**Validation Date:** 2025-10-04

### Data Availability: ✅
- Coverage: 100% of sold art has dates
- Sample size: 234 sales >14 days old

### Performance: ✅
- Execution: 234ms (excellent)

### Ready: ✅
```

#### 7. Implement in YAML
Only after ALL validations pass:
```yaml
- id: artist_payment_overdue
  name: Artist Payment Overdue
  severity: error
  category: data_completeness
  context: post_event
  conditions:
    - field: art_sold_datetime
      operator: past_days
      value: 14
    - field: payment_completed
      operator: equals
      value: false
  message: "Artist {{artist_name}} waiting {{days_overdue}} days for payment"
```

#### 8. Deploy & Monitor
```bash
# Upload to CDN
s3cmd put public/eventLinterRules.yaml --acl-public s3://artb/admin/eventLinterRules.yaml

# Test via CLI
node test-linter-cli.js --summary

# Monitor in UI
# Open /event-linter in admin
```

---

## 📊 Validation Examples

### Example 1: Rule #14 Passes All Checks ✅

```
==========================================================
Validating Rule #14: artist_payment_overdue
Artist Payment Overdue
==========================================================

📋 Art table has sale tracking
   ✅ Validation passed
   📊 Results (145ms):
   {
     "total_art": 2453,
     "sold_count": 1879,
     "has_sold_datetime": 1879,
     "old_sales": 234
   }

📋 Payment tracking exists
   ✅ Validation passed
   📊 Results (89ms):
   {
     "sold_art": 1879,
     "art_with_payments": 1245
   }

📋 Sample overdue payments
   📊 Results (67ms):
   [
     {
       "code": "AB3001-A1",
       "days_overdue": 18,
       "artist_name": "Jane Artist",
       "payment_status": "pending"
     }
   ]

⚡ Performance Test
   ✅ Query completed in 234ms (excellent)

==========================================================
✅ Rule #14 is READY for implementation
==========================================================
```

### Example 2: Rule #28 Has Blockers ❌

```
==========================================================
Validating Rule #28: city_confirmation_timing_warning
Confirmation Below City Average
==========================================================

📋 Events have confirmation dates
   ❌ artists_confirmed_at field doesn't exist

📋 Alternative: artist_confirmations table
   ⚠️  Only 45 events have confirmation records

📋 City historical averages
   ❌ Only 2 cities have ≥3 events for comparison

⚡ Performance Test
   ✅ Query completed in 456ms (excellent)

==========================================================
❌ Rule #28 has BLOCKERS - fix before implementing
Blockers:
- Missing confirmation timestamp field
- Insufficient historical data (need 3+ events per city)
==========================================================
```

**Action:** Move Rule #28 to Phase 6 or Future, implement simpler rules first

---

## 🎯 Success Criteria

### Rule Ready for Implementation When:

1. ✅ **All validation checks pass** (green in script)
2. ✅ **Sample query returns realistic data**
3. ✅ **Performance <1 second** on production
4. ✅ **Edge cases documented** and handled
5. ✅ **Required indexes exist** (or created)
6. ✅ **Message placeholders** map to real fields

### Common Blockers:

| Blocker | Fix |
|---------|-----|
| Field doesn't exist | Use alternative field or create via migration |
| <50% data coverage | Adjust rule threshold or mark as future |
| Query >5 seconds | Add index or optimize query |
| No historical data | Wait for data or use different comparison |
| Complex join fails | Simplify logic or adjust data model |

---

## 📈 Implementation Strategy

### Phase 1: Critical Rules (Week 1)
**Target:** 6 rules - Payment compliance

Validate in order:
1. Rule #2: `live_event_ended_no_results`
2. Rule #14: `artist_payment_overdue`
3. Rule #50: `artist_critical_balance_error`
4. Rule #49: `artist_high_balance_warning`
5. Rule #15: `payment_account_not_verified`
6. Rule #23: `missing_event_revenue_data`

**Expected:** All should validate cleanly (low complexity, existing data)

### Phase 2: Operations (Week 2)
**Target:** 8 rules - Live event ops

Validate:
- Rules #1, #4, #8, #17, #18, #26, #27, #51

**Watch for:** Live event timing logic, real-time data availability

### Phase 3: Marketing (Week 3-4)
**Target:** 10 rules - Revenue/ads

Validate:
- Rules #16, #19, #20, #22, #35, #37-40

**Watch for:** Meta ads integration, historical revenue data

### Phase 4-7: Complex Analytics
**Only after Phases 1-3 succeed**

These require:
- Historical aggregations
- Complex city/global averages
- Multi-table joins
- New data sources

---

## 🛠️ Troubleshooting the Validation System

### Issue: `exec_sql` function not found

**Fix:**
```bash
# Deploy the helper function
cd /root/vote_app/vote26
PGPASSWORD='6kEtvU9n0KhTVr5' psql -h db.artb.art -p 5432 -d postgres -U postgres \
  -f supabase/migrations/20251004_create_exec_sql_function.sql
```

### Issue: Service key not working

**Fix:**
```bash
# Get service role key from Supabase dashboard
# Settings → API → service_role key (secret)

export SUPABASE_SERVICE_KEY="eyJ..."
```

### Issue: Validation script errors

**Fix:**
```bash
# Check Node version (need v18+)
node --version

# Install dependencies if needed
npm install @supabase/supabase-js
```

### Issue: Can't connect to database

**Fix:**
```bash
# Test connection
psql -h db.artb.art -p 5432 -d postgres -U postgres -c "SELECT 1"

# If fails, check:
# 1. IP whitelisted in Supabase
# 2. Password correct
# 3. Network access
```

---

## 📝 Adding New Rules to Validator

To add validation for a new rule:

1. **Edit `validate-linter-rule.js`**
2. **Add to `RULE_VALIDATIONS` object:**

```javascript
51: {
  id: 'all_artists_paid_quickly',
  name: 'All Artists Paid Within 7 Days',
  dataChecks: [
    {
      name: 'Check payment timing data',
      query: `
        SELECT
          COUNT(*) as total_sales,
          COUNT(CASE WHEN payment_completed_at IS NOT NULL THEN 1 END) as paid_count
        FROM art
        WHERE sold = true
          AND event_end_datetime < NOW() - INTERVAL '7 days'
      `,
      validate: (result) => {
        if (result[0].total_sales === 0) {
          return { ok: false, reason: 'No completed events with sales' };
        }
        return { ok: true };
      }
    }
  ],
  performanceTest: `
    SELECT COUNT(*)
    FROM events e
    WHERE e.event_end_datetime BETWEEN NOW() - INTERVAL '7 days' AND NOW()
      AND NOT EXISTS (
        SELECT 1 FROM art a
        WHERE a.event_id = e.id
          AND a.sold = true
          AND (a.payment_completed = false OR a.payment_completed IS NULL)
      )
  `
}
```

3. **Test it:**
```bash
node validate-linter-rule.js --rule 51
```

---

## 🎉 Benefits of This System

### Before Validation System:
- ❌ Implement rule blindly
- ❌ Deploy to production
- ❌ Discover data doesn't exist
- ❌ Spend hours debugging
- ❌ Rewrite rule logic
- ❌ Redeploy and hope

**Result:** Days wasted, frustration

### After Validation System:
- ✅ Validate data exists (5 min)
- ✅ Test query works (5 min)
- ✅ Check performance (5 min)
- ✅ Implement with confidence (10 min)
- ✅ Deploy once, works perfectly

**Result:** 30 min total, zero debugging

---

## 📚 File Reference

| File | Purpose | When to Use |
|------|---------|-------------|
| `EVENT_LINTER_RULES_EVALUATION.md` | All rules scored & prioritized | Planning which rules to build |
| `EVENT_LINTER_RULES_VALIDATION_PROTOCOL.md` | Detailed validation methodology | Deep dive on specific rule |
| `validate-linter-rule.js` | Automated validation script | Quick validation before coding |
| `QUICK_VALIDATION_GUIDE.md` | Day-to-day reference | Daily workflow |
| `VALIDATION_SYSTEM_SUMMARY.md` | This file - overview | Understanding the system |

---

## ✅ Next Steps

1. **Deploy helper function** (one-time):
   ```bash
   PGPASSWORD='6kEtvU9n0KhTVr5' psql -h db.artb.art -p 5432 -d postgres -U postgres \
     -f supabase/migrations/20251004_create_exec_sql_function.sql
   ```

2. **Set service key** (per session):
   ```bash
   export SUPABASE_SERVICE_KEY="your_key"
   ```

3. **Pick Phase 1 rule** from evaluation:
   - Start with Rule #2 or #14 (easiest)

4. **Validate it**:
   ```bash
   node validate-linter-rule.js --rule 14
   ```

5. **If ✅ green** → Implement in YAML
6. **If ❌ red** → Fix blockers or choose different rule
7. **Repeat** for all Phase 1 rules

---

**Remember:** 30 minutes of validation saves hours (or days) of debugging! 🎯

**The validation system is your safety net - use it for every rule!**

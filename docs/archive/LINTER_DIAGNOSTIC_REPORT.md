# Event Linter Diagnostic Report
**Generated:** 2025-10-15
**Total Rules Tested:** 31 inactive rules

---

## 🔴 CRITICAL ISSUE: Working Rules Not Showing in UI

### Discovery
The diagnostic tool found **37 total findings** from 3 rules that the main linter reports as having 0 findings:

| Rule ID | Diagnostic Findings | Main Linter Findings | Discrepancy |
|---------|---------------------|----------------------|-------------|
| missing_eventbrite_id_historical | 33 | 0 | ❌ -33 |
| missing_venue_historical | 3 | 0 | ❌ -3 |
| event_week_no_tickets | 1 | 0 | ❌ -1 |

### Possible Causes:
1. **Date filtering mismatch**: Diagnostic uses 4-year window, main linter might use different filter
2. **Suppression**: Findings might be suppressed in linter_suppressions table
3. **Rule evaluation order**: Main linter might exit early or skip these rules
4. **Different data source**: Diagnostic fetches events directly, main linter might use different query

### Action Required:
1. Re-run the main linter after the 4-year filter fix is deployed
2. Check linter_suppressions table for these rule IDs
3. Compare event selection logic between diagnostic and main linter

---

## 📊 Inactive Rules Breakdown

### By Category:

**Category 1: Missing Database Fields** - 18 rules (58%)
- Cannot function without schema changes

**Category 2: No Evaluation Possible** - 3 rules (10%)
- Likely handled by database functions or have no conditions

**Category 3: Conditions Too Strict** - 10 rules (32%)
- Have "almost matching" events, may need tuning

---

## 🎯 Top Recommendations

### Immediate Actions (This Week)
1. ✅ Deploy event-linter with 4-year filter (DONE)
2. 🔍 Re-run linter and verify the 3 "hidden" rules now show findings
3. 📋 Check linter_suppressions table for suppressed findings

### Short Term (This Month)
4. 📊 Add artist tracking fields to events table:
   - `confirmed_artists_count` (affects 4 rules)
   - `event_artists_confirmed_count`
   - `applied_artists_count`

5. 💰 Add revenue comparison fields:
   - `ticket_revenue`, `prev_ticket_revenue` (affects 2 rules)
   - `auction_revenue`, `prev_auction_revenue`

### Medium Term (This Quarter)
6. 🎨 Add promo tracking: `promo_materials_count` (affects 2 rules)
7. ✅ Add approval tracking: `basics_approved`
8. 🎫 Add ticket metrics: `ticket_sales`

### Long Term (Future)
9. 📸 Live event fields (if needed): `door_time`, `qr_codes_generated`, `round_timer_active`, `photos_count`
10. 🔍 Review and tune "almost matching" rules

---

## 📋 Complete Results by Rule

### ✅ Working But Hidden (3 rules)
```
✓ missing_eventbrite_id_historical     33 findings
✓ missing_venue_historical               3 findings
✓ event_week_no_tickets                  1 finding
```

### ❌ Missing Fields - Artist Related (6 rules)
```
✗ applications_closed_low_count          Field: applied_artists_count
✗ early_preparation_success              Field: confirmed_artists_count
✗ event_2weeks_few_artists               Field: confirmed_artists_count
✗ event_artists_low_7days                Field: event_artists_confirmed_count
✗ event_soon_low_artists                 Field: confirmed_artists_count
✗ event_week_no_artists                  Field: confirmed_artists_count
```

### ❌ Missing Fields - Revenue (6 rules)
```
✗ auction_revenue_success                Fields: auction_revenue, prev_auction_revenue
✗ ticket_revenue_decline_error           Fields: ticket_revenue, prev_ticket_revenue
✗ ticket_revenue_success                 Fields: ticket_revenue, prev_ticket_revenue
✗ ticket_sales_below_average             Field: ticket_sales
✗ total_votes_decline_error              Fields: total_votes, prev_total_votes
✗ no_tax_rate_auction                    Field: tax_rate_auction (+ 5 almost match)
```

### ❌ Missing Fields - Live Events (4 rules)
```
✗ live_door_time_no_qr                   Fields: door_time, qr_codes_generated
✗ live_event_no_timer_set                Field: round_timer_active
✗ live_event_photos_missing              Field: photos_count
✗ live_round_3_auction_not_closed        Fields: rounds.3.end_time, auction_close_time
```

### ❌ Missing Fields - Other (4 rules)
```
✗ booking_opportunity_strong_city        Fields: has_future_event, best_recent_votes
✗ early_preparation_success              Field: promo_materials_count
✗ event_basics_not_approved_14days       Field: basics_approved (+ 5 almost match)
✗ event_week_away_no_promo               Field: promo_materials_count (+ 3 almost match)
✗ sold_out_event                         Field: sold_out (+ 5 almost match)
```

### ⚠️ Conditions Too Strict (10 rules)
```
⚠ event_2weeks_no_tickets                2 almost match (86% missing ticket_link)
⚠ event_2weeks_no_venue                  2 almost match
⚠ event_tomorrow_no_venue                5 almost match
⚠ event_week_no_venue                    2 almost match
⚠ food_beverage_above_average            5 almost match
⚠ no_tax_rate_auction                    5 almost match
⚠ sold_out_event                         5 almost match
⚠ ticket_sales_below_average             5 almost match
⚠ event_soon_low_artists                 1 almost match
⚠ event_week_no_artists                  3 almost match
```

### ❓ No Clear Issue (3 rules)
```
? event_ended_no_food_beverage           No recommendations
? event_ended_no_other_revenue           No recommendations
? event_ended_no_producer_tickets        No recommendations
```

---

## 💡 Key Insights

1. **58% of inactive rules** fail because database fields don't exist
2. **Adding 3 field groups** would activate 13 rules:
   - Artist count fields → 6 rules
   - Revenue comparison fields → 6 rules
   - Promo/approval fields → 1-2 rules

3. **Quick wins available**: Re-running linter may immediately show 37 new findings from 3 rules

4. **Data quality issue**: 86% of events missing `ticket_link` field

---

## 🔧 Database Schema Additions Needed

### High Priority Fields (Affects 6+ rules each)
```sql
ALTER TABLE events ADD COLUMN confirmed_artists_count INTEGER;
ALTER TABLE events ADD COLUMN event_artists_confirmed_count INTEGER;
ALTER TABLE events ADD COLUMN applied_artists_count INTEGER;

ALTER TABLE events ADD COLUMN ticket_revenue DECIMAL(10,2);
ALTER TABLE events ADD COLUMN prev_ticket_revenue DECIMAL(10,2);
ALTER TABLE events ADD COLUMN auction_revenue DECIMAL(10,2);
ALTER TABLE events ADD COLUMN prev_auction_revenue DECIMAL(10,2);
```

### Medium Priority Fields
```sql
ALTER TABLE events ADD COLUMN promo_materials_count INTEGER;
ALTER TABLE events ADD COLUMN basics_approved BOOLEAN;
ALTER TABLE events ADD COLUMN ticket_sales INTEGER;
ALTER TABLE events ADD COLUMN total_votes INTEGER;
ALTER TABLE events ADD COLUMN prev_total_votes INTEGER;
```

### Low Priority (Live Events)
```sql
ALTER TABLE events ADD COLUMN door_time TIMESTAMP;
ALTER TABLE events ADD COLUMN qr_codes_generated BOOLEAN;
ALTER TABLE events ADD COLUMN round_timer_active BOOLEAN;
ALTER TABLE events ADD COLUMN photos_count INTEGER;
```

---

## 📈 Expected Impact

**If all high-priority fields are added:**
- Activate 12 additional rules (38% increase)
- Provide early warnings for artist booking issues
- Track revenue trends and detect declines
- Better event preparation tracking

**Current State:**
- 28 active rules (63.6%)
- 853 total findings

**Projected State (with fields added):**
- 40+ active rules (90%+)
- Estimated 1000+ findings with better coverage

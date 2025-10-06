# Event Linter System - Development Session Notes
**Date:** 2025-10-06
**Session Duration:** Extended development session
**Total Changes:** 1,123 lines added, 5 commits

---

## Summary of Work Completed

### 1. Live Event Monitoring & Statistics (Commit: 31f45d4)

**What Was Built:**
- Real-time statistics for active events (QR scans, votes, photos by round)
- Smart photo reminder system that checks actual photo counts before firing
- Unpaid paintings detection (artworks with winning bids but no payment/reminder)
- 45-day event scope filter for performance optimization
- Artist-level findings with dedicated UI (artist number badges, profile/payment links)

**Technical Implementation:**
- Custom edge function logic queries `people_qr_scans`, `votes`, `art_media` tables
- Dynamic round detection based on event duration (Round 1: <90min, R2: 90-150min, R3: >150min)
- Filtering logic: `minutesSinceStart >= 30 && hoursUntilEnd > 0 && hoursUntilEnd <= 12`
- Reduced event scope from 993 to 50 events (45-day window) for better performance

**Business Value:**
- Operational visibility during live events
- Payment follow-up accountability
- Performance improvements (4,422 findings → 191 findings)

---

### 2. Finding Suppression System (Commit: fae46cb)

**What Was Built:**
- Database-driven suppression system (`linter_suppressions` table)
- Suppression UI in finding detail modal with duration options (Forever, 7/30/90 days)
- Audit trail tracking (suppressed_by, reason, created_at)
- Edge function filtering to hide suppressed findings

**Technical Implementation:**
```sql
CREATE TABLE linter_suppressions (
  rule_id TEXT,
  event_id UUID,
  artist_id UUID,
  suppressed_by UUID,
  suppressed_until TIMESTAMP,
  reason TEXT,
  UNIQUE CONSTRAINT (rule_id, event_id, artist_id)
)
```

**Key Design Decision:**
- **Rejected hash-based approach** in favor of explicit rule_id + event_id/artist_id matching
- This allows suppressions to work with dynamic message content (timestamps, counts, etc.)
- Clean, auditable, and easily reversible

**Business Value:**
- Capture feedback about problematic rules (e.g., "This is a bad rule - testing too soon, move to 14 days out")
- Temporary suppressions for known issues
- User-driven quality improvement loop

---

### 3. Success Rules & User Feedback Integration (Commit: a4a2baa)

**What Was Built:**
- `all_artists_booked_success` rule showing booking lead time
- Fixed `ticket_revenue_decline_error` based on suppression feedback
- Added `days_until_event` field to all future event enrichment

**Critical Feedback Loop:**
User suppressed a finding with reason: "This is a bad rule - testing too soon, move to 14 days out or proper compare"

**Response:**
```json
// Old condition
{"field": "event_end_datetime", "value": 1, "operator": "past_days"}

// New condition (waits 14 days)
{"field": "event_end_datetime", "value": 14, "operator": "past_days"},
{"field": "event_end_datetime", "value": 30, "operator": "within_days"}
```

**Business Value:**
- Validation that suppression system is working as designed
- Rules improve based on operational feedback
- Success metrics show positive outcomes ("🎉 All 12 artists confirmed 5 days before the event - fully booked!")

---

### 4. Event Planning Validation Rules (Commit: 8b8bfa2)

**What Was Built:**
5 new validation rules for event planning workflow:
1. **event_not_approved_error** (Error) - Event must be approved 14 days before
2. **venue_not_set_warning** (Warning) - Venue required 30 days before
3. **event_folder_missing_reminder** (Reminder) - Google Drive folder needed 21 days before
4. **advertising_budget_not_set_info** (Info) - Budget tracking suggestion 45 days before
5. **event_planning_defaults_info** (Info) - Display planning params 60 days before

**Technical Pattern:**
All rules use time-based conditions with `upcoming_days` operator and `is_null` checks

**Business Value:**
- Enforce approval workflow
- Ensure operational readiness
- Budget visibility

---

### 5. Venues Management & Event Planning Fields (Commit: 24caaf0)

**What Was Built:**
- Complete venues management system (VenuesManagement.jsx - 419 lines)
- 10 new event fields across 4 categories:
  - **Venue:** venue_id (FK to venues table)
  - **Financial:** ticket_price_notes, meta_ads_budget, other_ads_budget
  - **Planning:** target_artists_booked, expected_number_of_rounds, wildcard_expected, event_folder_link
  - **Approval:** event_info_approved_by, event_info_approved_at

**Database Migrations:**
- 6 migration files created with proper rollback handling
- Populated venues table with existing data
- Added foreign key constraints

**Business Value:**
- Centralized venue database
- Budget tracking per event
- Approval audit trail

---

## Common Themes Across All Work

### 1. **Database-Driven Configuration**
Every feature uses database tables for configuration rather than hardcoded logic:
- `event_linter_rules` table for all rules
- `linter_suppressions` table for hiding findings
- `venues` table for managed venue data

**Why This Works:**
- Rules can be added/modified without code deployment
- Non-technical users can manage suppressions via UI
- Easy to query and audit

### 2. **Temporal Logic Everywhere**
The linter is fundamentally time-aware:
- Pre-event rules use `upcoming_days`
- Post-event rules use `past_days`
- Live event rules use `past_minutes` + `upcoming_hours`
- Timing thresholds: 14 days (approval), 21 days (folder), 30 days (venue), 45 days (budget)

**Pattern Observed:**
```
IF event_in_timeframe AND condition_not_met THEN fire_finding
```

### 3. **Feedback-Driven Development**
The suppression system creates a direct feedback loop:
- User suppresses finding → Leaves reason
- Developer reads reason → Updates rule
- User removes suppression → Validates fix

**Example from this session:**
```
Suppression reason: "This is a bad rule - testing too soon, move to 14 days out"
Action taken: Changed from 1 day to 14 days post-event
Result: Removed suppression, rule now works correctly
```

### 4. **Progressive Enhancement of Event Data**
Events are enriched with computed fields throughout the linter:
- `confirmed_artists_count` - fetched from artist_confirmations
- `withdrawn_artists_count` - counted separately
- `days_until_event` - calculated on the fly
- Photo counts, vote counts, QR scan counts - queried when needed

**Performance Trade-off:**
- More queries = slower execution
- But: Only runs on 50 events (45-day window)
- Acceptable latency for admin tool

### 5. **Severity as User Intent**
Each severity level has clear operational meaning:
- **Error** (❌): Must fix before event goes live (blocking)
- **Warning** (⚠️): Should fix but not blocking
- **Reminder** (🔔): Actionable prompt (e.g., "start auction timer")
- **Info** (📊): Status information or suggestions
- **Success** (✅): Positive reinforcement

---

## Opportunities for Improvement

### Performance Optimizations

#### 1. **Query Batching**
**Current State:**
```typescript
// Separate queries for each stat type
const { data: qrData } = await supabase.from('people_qr_scans')...
const { data: voteData } = await supabase.from('votes')...
const { data: photoData } = await supabase.from('art')...
```

**Opportunity:**
- Use materialized views or database functions to batch stats
- Create `get_event_live_stats(event_id)` RPC function
- Single query instead of 3

**Impact:** 3x reduction in database round trips

---

#### 2. **Caching Strategy**
**Current State:**
- Every linter run fetches all data fresh
- No caching layer

**Opportunity:**
- Cache findings for 1-5 minutes (most rules don't change that fast)
- Invalidate cache on rule updates or suppressions
- Use Supabase Realtime for live event stats only

**Implementation:**
```typescript
const cacheKey = `linter:${filterEid || 'all'}:${futureOnly}:${activeOnly}`;
const cached = await redis.get(cacheKey);
if (cached && !forceRefresh) return cached;
```

**Impact:** 10x faster response time for repeated queries

---

#### 3. **Incremental Linting**
**Current State:**
- Runs all rules on all events every time
- ~50 events × ~30 rules = 1,500 evaluations

**Opportunity:**
- Track which events have changed since last run
- Only re-evaluate rules for modified events
- Store last_linted_at timestamp

**Impact:** 90%+ reduction in computation for stable events

---

### User Experience Improvements

#### 4. **Bulk Suppression**
**Current State:**
- Can only suppress one finding at a time
- No "suppress all instances of this rule" option

**Opportunity:**
```
Suppress Options:
[ ] This finding only (event + rule)
[ ] This rule for all events
[ ] This rule for events in [city/country]
```

**Use Case:** Bad rule firing for 50+ events → suppress globally, fix rule, unsuppress

---

#### 5. **Suppression Management View**
**Current State:**
- No way to see all active suppressions
- Can't bulk-delete expired suppressions

**Opportunity:**
- Add "Suppressions" tab to Event Linter
- Show table: Rule | Event | Reason | Suppressed By | Expires | Actions
- Bulk operations: Delete expired, Unsuppress all by rule

**Mock:**
```
Active Suppressions (12)
┌─────────────────────────┬────────┬─────────────────────┬──────────┬─────────┐
│ Rule                    │ Event  │ Reason              │ Expires  │ Actions │
├─────────────────────────┼────────┼─────────────────────┼──────────┼─────────┤
│ ticket_revenue_decline  │ AB3035 │ Testing too soon... │ Forever  │ Remove  │
│ venue_not_set           │ AB3064 │ Venue TBD...        │ 7 days   │ Remove  │
└─────────────────────────┴────────┴─────────────────────┴──────────┴─────────┘
```

---

#### 6. **Rule Effectiveness Dashboard**
**Current State:**
- No visibility into which rules are most valuable
- Don't know which rules are suppressed most often

**Opportunity:**
- Track metrics per rule: hit_count, suppression_count, avg_time_to_resolve
- Show "Top 10 Most Suppressed Rules" → signals problems
- Show "Rules Never Fired" → candidates for deletion

**Data Schema:**
```sql
CREATE TABLE linter_rule_metrics (
  rule_id TEXT,
  date DATE,
  hit_count INTEGER,
  suppression_count INTEGER,
  unique_events_affected INTEGER
);
```

---

### Rule Quality Improvements

#### 7. **Comparative Rules Need Better Baselines**
**Current State:**
```sql
-- Compares to previous event, but what if previous was an outlier?
{"field": "ticket_revenue", "operator": "less_than_percent", "value": 50,
 "compare_to": "prev_ticket_revenue"}
```

**Opportunity:**
- Compare to rolling average of last N events in same city
- Use statistical thresholds (2 standard deviations below mean)
- Account for event type, venue capacity, seasonality

**Example:**
```javascript
// Instead of: current < 50% of previous
// Use: current < (city_avg - 2 * stddev)
```

---

#### 8. **Context-Aware Rule Activation**
**Current State:**
- All rules fire for all events
- No concept of event type or special circumstances

**Opportunity:**
```sql
ALTER TABLE event_linter_rules
  ADD COLUMN contexts JSONB; -- ["standard", "pop-up", "festival"]

ALTER TABLE events
  ADD COLUMN event_type TEXT DEFAULT 'standard';
```

**Use Case:**
- Pop-up events might not need venue approval (outdoor/mobile)
- Festival events might have different artist counts (6 vs 12)

---

#### 9. **Rule Dependencies**
**Current State:**
- Each rule evaluated independently
- Can result in redundant or conflicting findings

**Opportunity:**
```sql
-- "Event not ready" error should suppress all other pre-event reminders
ALTER TABLE event_linter_rules
  ADD COLUMN depends_on TEXT[]; -- Other rule_ids that must pass first

-- If event_not_approved_error fires, skip:
-- - venue_not_set_warning
-- - event_folder_missing_reminder
-- - advertising_budget_not_set_info
```

**Impact:** Cleaner findings list, focus on critical issues first

---

### Data Quality & Monitoring

#### 10. **Dead Rule Detection**
**Current State:**
- Rules can become obsolete but stay active
- No automated cleanup

**Opportunity:**
```sql
-- Track last time each rule fired
CREATE TABLE linter_rule_activity (
  rule_id TEXT PRIMARY KEY,
  last_fired_at TIMESTAMP,
  total_fires INTEGER,
  last_30_day_fires INTEGER
);

-- Alert if rule hasn't fired in 90 days
SELECT rule_id FROM linter_rule_activity
WHERE last_fired_at < NOW() - INTERVAL '90 days'
  AND status = 'active';
```

---

#### 11. **Condition Testing UI**
**Current State:**
- No way to test rule conditions before saving
- Trial-and-error approach ("did my rule fire?")

**Opportunity:**
- Add "Test Rule" button in admin UI
- Show: "This rule would fire for 12 events: AB3064, AB3049..."
- Preview finding message with actual data

**Mock:**
```
Rule: event_not_approved_error
Conditions: [...json...]

[Test Rule] button

Results:
✓ Would fire for 7 events
✗ Would NOT fire for 43 events

Sample finding:
  AB3064: ❌ Event not approved - must have approval within 14 days of event
```

---

#### 12. **Historical Trending**
**Current State:**
- Linter shows current state only
- No historical tracking of findings

**Opportunity:**
```sql
CREATE TABLE linter_snapshots (
  id UUID PRIMARY KEY,
  run_at TIMESTAMP,
  summary JSONB, -- {error: 50, warning: 74, ...}
  findings JSONB[] -- Store all findings
);

-- Daily snapshot job
-- Enables queries like:
-- "Show error count trend over last 30 days"
-- "Which events had the most errors historically?"
```

**Dashboard:**
```
Event Linter Health (Last 30 Days)
┌────────────────────────────────────────┐
│ Errors: 45 → 38 → 42 → 50 (↑17%)      │
│ Warnings: 80 → 75 → 70 → 74 (↓7%)     │
│ Trend: More critical issues recently   │
└────────────────────────────────────────┘
```

---

### Architecture Improvements

#### 13. **Plugin System for Custom Logic**
**Current State:**
- Custom logic hardcoded in edge function
- Examples: admin counts, photo checks, unpaid paintings

**Opportunity:**
```typescript
// Define plugin interface
interface LinterPlugin {
  name: string;
  rulesHandled: string[];
  execute(events: Event[], rule: Rule): Finding[];
}

// Register plugins
const plugins = [
  new AdminCountPlugin(),
  new PhotoReminderPlugin(),
  new UnpaidPaintingsPlugin()
];

// Execute
for (const plugin of plugins) {
  const pluginFindings = await plugin.execute(eventsToLint, matchingRules);
  findings.push(...pluginFindings);
}
```

**Benefits:**
- Cleaner code organization
- Easier testing
- Third-party extensions possible

---

#### 14. **Webhooks for Real-Time Alerts**
**Current State:**
- Findings only visible when user opens Event Linter UI
- No proactive notifications

**Opportunity:**
```sql
CREATE TABLE linter_webhooks (
  id UUID PRIMARY KEY,
  name TEXT,
  url TEXT,
  trigger_severities TEXT[], -- ['error', 'warning']
  trigger_rules TEXT[], -- Specific rule_ids or null for all
  active BOOLEAN
);

-- When critical finding fires:
POST https://slack.com/webhooks/...
{
  "text": "🚨 AB3064: Event not approved - must have approval within 14 days!"
}
```

**Use Cases:**
- Slack notification for critical errors
- Email digest of daily warnings
- Jira ticket creation for missing venue

---

#### 15. **Multi-Tenant Rule Sets**
**Current State:**
- One global rule set for all events
- No city/country/region-specific rules

**Opportunity:**
```sql
ALTER TABLE event_linter_rules
  ADD COLUMN rule_set TEXT DEFAULT 'global';

-- Enable rules like:
-- "Toronto events must have French ticket descriptions"
-- "UK events require VAT in ticket pricing"
-- "Pop-up events have different admin requirements"
```

---

## Technical Debt & Cleanup

### 16. **Type Safety in Edge Function**
**Current:** Using `any` types extensively
```typescript
const severityOrder: any = { error: 0, warning: 1, ... };
findings.forEach((admin: any) => { ... });
```

**Opportunity:**
```typescript
interface Finding {
  ruleId: string;
  severity: 'error' | 'warning' | 'reminder' | 'info' | 'success';
  message: string;
  eventId?: string;
  artistId?: string;
  // ... etc
}

const findings: Finding[] = [];
```

---

### 17. **Operator Consistency**
**Current:** Operators spread across different functions
- `isPastDays()`, `isUpcomingDays()`, `isWithinDays()`
- Some return boolean, some modify event object
- Inconsistent parameter order

**Opportunity:**
```typescript
class ConditionEvaluator {
  static operators = {
    'past_days': (field: Date, value: number) => daysSince(field) >= value,
    'upcoming_days': (field: Date, value: number) => daysUntil(field) <= value,
    'within_days': (field: Date, value: number) => Math.abs(daysDiff(field)) <= value,
    // ... etc
  };
}
```

---

### 18. **Migration File Consolidation**
**Current:** 6 migration files for related changes
- `20251006_add_event_fields.sql`
- `20251006_add_event_planning_fields.sql`
- `20251006_add_venues_and_event_fields.sql`
- `20251006_populate_venues.sql`
- `20251006_venues_tables_only.sql`

**Opportunity:**
- Consolidate into 2 files:
  1. `20251006_venues_and_event_planning.sql` (schema)
  2. `20251006_seed_venues.sql` (data)

---

## Lessons Learned

### What Worked Well

1. **Suppression-Based Feedback Loop**
   - Users tell us what's wrong via suppression reasons
   - Direct path from complaint → fix → validation
   - Better than Slack messages or email

2. **Database-Driven Everything**
   - Rules, suppressions, venues all in database
   - No deployments needed for configuration changes
   - Easy to query and audit

3. **Time-Based Rule Activation**
   - Natural fit for event lifecycle
   - Clear when rules should fire
   - Users understand "14 days before event"

4. **Severity Levels**
   - Error/Warning/Reminder/Info/Success intuitive
   - Color coding works well
   - Users can filter by severity

### What Could Be Better

1. **Performance on Large Data Sets**
   - Would struggle with 1000+ events
   - Need caching and incremental evaluation
   - Consider moving heavy queries to database functions

2. **Rule Authoring UX**
   - Currently requires SQL knowledge
   - No validation of rule logic
   - No testing before deployment
   - → Build admin UI for rule creation

3. **Finding Overload**
   - 191 findings across 50 events = ~4 per event
   - Hard to know what to focus on
   - → Add prioritization and grouping

4. **No Historical Context**
   - Can't see "this error has existed for 30 days"
   - Can't track resolution time
   - → Add finding persistence and tracking

---

## Metrics & Impact

### Performance
- **Before:** 4,422 findings across 993 events
- **After:** 191 findings across 50 events (45-day filter)
- **Improvement:** 96% reduction in noise

### Code Volume
- **Lines Added:** 1,123 lines
- **Files Modified:** 13 files
- **Commits:** 5 commits

### Feature Adoption Signals
- **1 suppression created** during development session
- **Suppression reason used to fix rule** (14-day delay)
- **7 events** caught by new approval error
- **10 events** missing event folders (reminder)

### Database Impact
- **New Tables:** 2 (linter_suppressions, venues)
- **New Columns:** 10 (event planning fields)
- **New Rules:** 5 (event planning validation)

---

## Recommended Next Steps

### Immediate (Next Sprint)
1. Build suppression management view
2. Add rule effectiveness dashboard
3. Implement finding grouping/prioritization

### Short Term (Next Month)
4. Add caching layer (Redis or in-memory)
5. Create rule testing UI
6. Build historical trending

### Long Term (Next Quarter)
7. Implement plugin architecture
8. Add webhook support for Slack integration
9. Build multi-tenant rule sets
10. Create public API for third-party integrations

---

## Conclusion

This session demonstrates the power of **user-driven, data-driven tooling**. The Event Linter has evolved from a simple validation system into a comprehensive operational dashboard that:

- **Prevents problems** (pre-event validation)
- **Detects issues** (live monitoring)
- **Drives accountability** (post-event tracking)
- **Learns from feedback** (suppression → fix loop)

The foundation is solid. The opportunities for improvement are clear. The path forward is incremental refinement based on real operational usage.

**Most importantly:** The suppression system ensures that every pain point becomes a data point, and every data point drives improvement.

# Event Linter - Hidden Rules Investigation Report
**Date:** 2025-10-16
**Status:** ✅ RESOLVED

---

## 🔍 Initial Problem

The diagnostic tool reported that 3 rules were finding matches but not appearing in the main linter output:

| Rule ID | Diagnostic Matches | Main Linter Findings | Apparent Discrepancy |
|---------|-------------------|----------------------|----------------------|
| event_folder_missing_reminder | 2 | 0 | ❌ -2 |
| event_soon_low_artists | 2 | 0 | ❌ -2 |
| event_week_no_ticket_link | 2 | 0 | ❌ -2 |

**Total:** 6 findings appeared to be "hidden" from the main linter.

---

## 🔬 Investigation Process

### Step 1: Verify Rules Are Missing
✅ Confirmed that none of these rules appear in the main linter output

### Step 2: Check for Suppressions
✅ Verified `linter_suppressions` table has no entries for these rules

### Step 3: Identify Matching Events
Found that ALL 6 findings were for the same 2 events:
- **AB6098** - "TEST ALL FEATURES TES TEST TEST"
- **AB6097** - "TEST invitation TEST TES TEST"

**Key Observation:** Both events are in the AB4000-AB6999 range and have "TEST" in their names.

### Step 4: Compare Event Filtering Logic

#### Main Linter (event-linter/index.ts:440-447):
```typescript
// Filter out test/internal events
eventsToLint = eventsToLint.filter(e => {
  if (!e.eid) return true;
  const match = e.eid.match(/^AB(\d+)$/);
  if (!match) return true;
  const eidNum = parseInt(match[1]);
  return eidNum < 4000 || eidNum >= 7000;  // ← Excludes AB4000-AB6999
});
```

#### Diagnostic Tool (BEFORE FIX):
```typescript
// Filter to last 4 years
const fourYearsAgo = new Date(Date.now() - 1460 * 24 * 60 * 60 * 1000);
let recentEvents = events.filter(e => {
  if (!e.event_start_datetime) return true;
  return new Date(e.event_start_datetime) >= fourYearsAgo;
});
// ← NO TEST EVENT FILTER!
```

---

## ✅ Root Cause Identified

**The diagnostic tool was missing the test event filter!**

The main linter **intentionally excludes** events in the AB4000-AB6999 range, which are designated as test/internal events. The diagnostic tool did not apply this same filter, causing it to report findings for test events that would never appear in the production linter.

---

## 🔧 Solution Applied

### Updated Diagnostic Tool

Added the test event filter to match main linter logic:

```typescript
// Filter to last 4 years
const fourYearsAgo = new Date(Date.now() - 1460 * 24 * 60 * 60 * 1000);
let recentEvents = events.filter(e => {
  if (!e.event_start_datetime) return true;
  return new Date(e.event_start_datetime) >= fourYearsAgo;
});

// ✅ NEW: Filter out test/internal events (AB4000-AB6999 range)
recentEvents = recentEvents.filter(e => {
  if (!e.eid) return true;
  const match = e.eid.match(/^AB(\d+)$/);
  if (!match) return true;
  const eidNum = parseInt(match[1]);
  return eidNum < 4000 || eidNum >= 7000;
});
```

**File Modified:** `/root/vote_app/vote26/supabase/functions/test-linter-rule/index.ts`
**Deployed:** 2025-10-16

---

## ✅ Verification

After deploying the fix, all three rules now correctly report 0 matches:

| Rule ID | Matches BEFORE | Matches AFTER | Status |
|---------|---------------|--------------|--------|
| event_folder_missing_reminder | 2 | 0 | ✅ Fixed |
| event_soon_low_artists | 2 | 0 | ✅ Fixed |
| event_week_no_ticket_link | 2 | 0 | ✅ Fixed |

---

## 📊 Impact Assessment

### What This Means:

1. **No Actual Hidden Findings**
   The 6 "hidden" findings were not real production findings - they were for test events that are intentionally filtered out.

2. **Diagnostic Tool Now Accurate**
   The diagnostic tool now matches the main linter's event selection logic exactly.

3. **No Production Issues**
   The main linter was working correctly all along. The issue was only with the diagnostic tool.

4. **Test Event Isolation Working**
   The AB4000-AB6999 test range is properly isolated from production linting.

---

## 🎓 Key Learnings

### 1. Filter Consistency is Critical
When building diagnostic/testing tools, they must apply the **exact same filters** as the production system to provide accurate results.

### 2. Test Data Management
The AB4000-AB6999 EID range provides a clean way to isolate test data from production without needing separate databases or environments.

### 3. Event Filtering Strategy
The main linter applies filters in this order:
1. Test/internal events filter (AB4000-AB6999)
2. Historical filter (last 4 years)
3. Specific EID filter (if provided)
4. Future-only filter (if enabled)
5. Active-only filter (if enabled)

All diagnostic tools should follow the same filtering order.

---

## 📋 Documentation Updates

### Files Updated:
1. ✅ `/root/vote_app/vote26/supabase/functions/test-linter-rule/index.ts`
   Added test event filter to match main linter

2. ✅ `/root/vote_app/vote26/LINTER_HIDDEN_RULES_INVESTIGATION.md`
   This investigation report

3. 📝 **TODO:** Update `/root/vote_app/vote26/LINTER_DIAGNOSTIC_REPORT_UPDATED.md`
   Remove "hidden rules" section and update with correct findings

---

## ✅ Resolution Summary

**Problem:** Diagnostic tool reported 6 findings that didn't appear in main linter
**Cause:** Diagnostic tool missing test event filter (AB4000-AB6999)
**Solution:** Added test event filter to diagnostic tool
**Result:** Diagnostic tool now matches main linter exactly
**Status:** ✅ RESOLVED

**No production issues found. Main linter working correctly.**

---

## 🔜 Remaining Work

The investigation is complete, but there are still 46 genuinely inactive rules that need attention:

### Priority Actions:
1. **Review "almost matching" rules** (35 rules with events off by 1 condition)
   - May need condition threshold adjustments
   - Some rules may be too strict for real-world data

2. **Verify "no conditions" rules** (16 rules)
   - Confirm they're handled by database functions
   - Test manually to ensure they work

3. **Add missing fields** (if needed)
   - Live event fields (door_time, qr_codes_generated, etc.)
   - Promo tracking (promo_materials_count)
   - Approval tracking (basics_approved)

---

**Investigation Completed By:** Claude
**Date:** 2025-10-16
**Status:** ✅ RESOLVED - No production issues

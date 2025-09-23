# Past Event Filtering Changes - Development Log

**Date:** September 23, 2025
**Issue:** Artist profiles showing past events in confirmations, invitations, and applications
**Status:** 🔄 ACTIVE DEBUGGING - Schema relationship issues discovered

---

## Problem Statement

**User Reported Issue:**
- Artist profiles (specifically Mario Guitron) showing past events from 2024/early 2025
- Events like "AB2525 – San Francisco (Sep 27)", "AB2953 – San Francisco (May 21)" appearing in confirmed events
- All three sections affected: Confirmations, Invitations, Applications

**Expected Behavior:**
- Only show events with `event_start_datetime >= NOW()`
- Hide all past events from the UI

---

## Development Attempts & Issues Discovered

### Attempt 1: Database-Level Filtering (❌ FAILED)
**Time:** 16:16 - 16:28
**Approach:** Add date filtering to Supabase queries with joined tables

**Changes Made:**
```javascript
// In confirmations query
.gte('event.event_start_datetime', new Date().toISOString())

// In applications query
.gte('event.event_start_datetime', new Date().toISOString())

// In get-event-details-for-artist-profile function
.gte('event_start_datetime', new Date().toISOString())
```

**Result:** ❌ Failed - Supabase doesn't properly support filtering on joined table fields

**Error Observed:** Past events still appeared despite database filtering

### Attempt 2: Frontend Filtering (❌ FAILED - Variable Scoping)
**Time:** 16:28 - 16:30
**Approach:** Move filtering back to frontend after loading data

**Changes Made:**
- Added `const now = new Date()` in confirmations section
- Added filtering logic for all three data types
- Used `eventDate >= now` comparison

**Result:** ❌ Failed - "Cannot access uninitialized variable" error

**Error:** Variable `now` used in invitations filtering before being declared in confirmations section

### Attempt 3: Fixed Variable Scoping (❌ FAILED - Schema Issue)
**Time:** 16:30 - Current
**Approach:** Fix variable scoping, move `now` declaration to top

**Changes Made:**
- Moved `const now = new Date()` to line 215 (before applications filtering)
- Removed duplicate declaration in confirmations section
- Fixed all references to use single `now` variable

**Result:** ❌ Failed - New database schema error

**Current Error:**
```
Failed to load profile data: Could not find a relationship between 'artist_confirmations' and 'events' in the schema cache
```

---

## Root Cause Analysis

### Database Schema Investigation

**Key Discovery:** The database relationships are not standard foreign keys:

1. **`artist_confirmations` ↔ `events`**
   - Link field: `artist_confirmations.event_eid` (string)
   - Target field: `events.eid` (string)
   - **NOT** a foreign key relationship

2. **`artist_invitations` ↔ `events`**
   - Link field: `artist_invitations.event_eid` (string)
   - Target field: `events.eid` (string)
   - **NOT** a foreign key relationship

3. **`artist_applications` ↔ `events`**
   - Link field: `artist_applications.event_id` (UUID)
   - Target field: `events.id` (UUID)
   - ✅ **IS** a proper foreign key relationship

### Supabase Limitations Identified

1. **Joined Table Filtering:** Supabase does not reliably filter on joined table fields (`.gte('event.field', value)`)
2. **String-Based Relationships:** Cannot use `!inner` join syntax when relationship is via string fields, not foreign keys
3. **Schema Cache:** Supabase requires explicit foreign key relationships for join syntax to work

---

## Current State of Files

### Modified Files:

#### `/root/vote_app/vote26/art-battle-artists/src/components/Home.jsx`
**Lines Modified:** 194-345

**Current State:**
- ✅ Applications: Uses proper foreign key join (`event:events!inner`)
- ❌ Confirmations: Attempts `event:events!inner` join on string relationship (BROKEN)
- ❌ Invitations: Uses edge function calls (inconsistent filtering)

#### `/root/vote_app/vote26/supabase/functions/get-event-details-for-artist-profile/index.ts`
**Lines Modified:** 55-67

**Current State:**
- ✅ Reverted to original (no date filtering in edge function)

---

## Correct Solution Strategy

### For Applications (✅ Working)
- Keep current approach: proper foreign key join with date filtering
- Query: `.gte('event.event_start_datetime', now)`

### For Confirmations (🔧 Needs Fix)
**Problem:** No foreign key relationship between tables
**Solution:** Two-step process required:
1. Load confirmations without join
2. Load event details separately
3. Filter based on event dates

### For Invitations (🔧 Needs Fix)
**Problem:** No foreign key relationship, relies on edge function
**Solution:** Filter in edge function OR filter after loading

---

## Recommended Fix Implementation

### Step 1: Fix Confirmations Query
```javascript
// Load confirmations without join
const { data: confirmationsRaw } = await supabase
  .from('artist_confirmations')
  .select('*')
  .eq('artist_profile_id', profile.id)
  .eq('confirmation_status', 'confirmed');

// Load event details and filter
const confirmationsData = [];
for (const confirmation of confirmationsRaw) {
  const { data: event } = await supabase
    .from('events')
    .select('id, eid, name, event_start_datetime, event_end_datetime')
    .eq('eid', confirmation.event_eid)
    .gte('event_start_datetime', now.toISOString())
    .single();

  if (event) {
    confirmationsData.push({ ...confirmation, event });
  }
}
```

### Step 2: Fix Invitations
- Keep current edge function approach
- Add date filtering in `get-event-details-for-artist-profile` function
- Return null for past events

### Step 3: Keep Applications As-Is
- Applications already work correctly with proper foreign key relationship

---

## Deployment History

| Time | Build Hash | Status | Issue |
|------|------------|--------|-------|
| 16:16:41 | index-1758644197841-Bm-azYLf.js | ❌ Failed | Database filtering didn't work |
| 16:28:06 | index-1758644882340-NhHmxCed.js | ❌ Failed | Variable scoping error |
| 16:30:18 | index-1758645010213-Cnmv3p9-.js | ❌ Failed | Schema relationship error |

---

## Risk Assessment

### Current Risks:
1. **Broken Confirmations Loading:** Artists cannot see confirmed events
2. **Broken Applications Loading:** Artists cannot see applications (if affects join)
3. **User Experience:** Profile pages may be completely non-functional

### Immediate Actions Required:
1. **Rollback** to working state if possible
2. **Implement proper fix** using non-join queries for confirmations
3. **Test thoroughly** before deployment

### Testing Checklist:
- [ ] Mario Guitron profile loads without errors
- [ ] Past events are properly filtered out
- [ ] Future events (if any) display correctly
- [ ] Applications section works
- [ ] Invitations section works
- [ ] Payment balance displays correctly

---

**Next Steps:**
1. Implement proper two-step query for confirmations
2. Add date filtering to edge function for invitations
3. Test with known user (Mario Guitron)
4. Deploy with proper testing

**DO NOT DEPLOY** until schema relationship issues are resolved and tested locally.
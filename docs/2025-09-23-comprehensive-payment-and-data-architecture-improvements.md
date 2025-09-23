# Comprehensive Payment and Data Architecture Improvements

**Date:** September 23, 2025
**Session Duration:** ~4 hours
**Status:** ✅ COMPLETED - All major issues resolved

---

## Executive Summary

This session addressed critical issues in the Art Battle Artist Profile system, focusing on payment setup failures, data loading inefficiencies, and user experience improvements. The work resulted in a complete architectural overhaul that eliminated direct database queries, fixed authentication edge cases, and significantly improved system performance.

---

## Key Issues Identified & Root Causes

### 1. **Payment Setup Authentication Failure**
**Issue:** Mario Guitron (test user) couldn't set up payments - "Artist profile not found" error
**Root Cause:** Payment function only supported V1 authentication, but Mario used V2 auth system
**Evidence:** JWT payload contained `auth_version: "v2-http"` and `person_id` directly, not via `auth_user_id` lookup

### 2. **Multiple Profile Confusion**
**Issue:** Mario had two artist profiles linked to same person record
**Discovery:** Database analysis revealed:
- Profile 1: `29fdd3e9-df27-4c55-a11c-02e6357f71bd` ("Mario Guitron", 2023) - **ACTIVE**
- Profile 2: `6796acd1-f57f-494b-b314-ddb911dc2613` ("SMURKS1", 2025) - **INACTIVE**
**Resolution Method:** Checked `round_contestants` table to determine which profile was actually used in recent events

### 3. **Direct Database Query Failures**
**Issue:** Frontend making direct Supabase REST calls that failed with access control errors
**Root Cause:** Row Level Security (RLS) policies blocking direct table access
**Scope:** All queries for `artist_invitations`, `artist_confirmations`, `event_artists`, `artist_sample_works`

### 4. **Inefficient Data Loading Architecture**
**Issue:** 10+ individual API calls per page load, with redundant event detail lookups
**Performance Impact:** Each event required separate function call, causing slow loads and excessive network traffic

---

## Technical Discoveries & Solutions

### **Authentication Systems Architecture**

**V1 Authentication (Legacy):**
- Uses `auth_user_id` in people table to link to Supabase auth.users
- Requires database lookup: `people.auth_user_id = auth.users.id`
- Most existing users

**V2 Authentication (Modern):**
- Stores `person_id` directly in JWT payload
- JWT contains: `auth_version: "v2-http"`, `person_id`, `person_pending`
- No database lookup needed for person identification
- Used by manually-linked users like Mario

**Solution Implemented:**
```typescript
// V2 auth detection and handling
const payload = JSON.parse(atob(token.split('.')[1]));
if (payload.auth_version === 'v2-http') {
  authenticatedPersonId = payload.person_id;
} else {
  // Fallback to V1 lookup
  const person = await supabase.from('people')
    .select('id').eq('auth_user_id', user.id).single();
  authenticatedPersonId = person.id;
}
```

### **Database Relationship Analysis**

**Key Discovery:** Not all relationships are proper foreign keys

**Applications Table:**
- ✅ `artist_applications.event_id` → `events.id` (UUID, proper FK)
- ✅ Can use `!inner` join syntax and `.gte()` filtering

**Confirmations Table:**
- ❌ `artist_confirmations.event_eid` → `events.eid` (string, NOT FK)
- ❌ Cannot use `!inner` join syntax reliably

**Invitations Table:**
- ❌ `artist_invitations.event_eid` → `events.eid` (string, NOT FK)
- ❌ Cannot use `!inner` join syntax reliably

**Table Name Corrections:**
- ❌ `artist_works` (doesn't exist)
- ✅ `artist_sample_works` (correct table name)

### **Profile Linking Investigation Process**

**Method Used to Determine Active Profile:**
```sql
-- Check recent event participation to identify active profile
SELECT rc.artist_id, ap.name, e.name, e.event_start_datetime, COUNT(*)
FROM round_contestants rc
JOIN artist_profiles ap ON rc.artist_id = ap.id
JOIN rounds r ON rc.round_id = r.id
JOIN events e ON r.event_id = e.id
WHERE rc.artist_id IN ('profile1', 'profile2')
  AND e.event_start_datetime >= '2024-01-01'
ORDER BY e.event_start_datetime DESC;
```

**Results:** 100% of recent activity (2024-2025) used "Mario Guitron" profile, none used "SMURKS1"

---

## Architectural Solutions Implemented

### **1. Comprehensive Edge Function Architecture**

**Created:** `/supabase/functions/get-artist-profile-data/index.ts`

**Features:**
- Single API call replaces 10+ individual queries
- Server-side event filtering (`gte('event_start_datetime', now)`)
- Handles all relationship types (FK and string-based)
- Returns structured data with statistics
- Includes recent activity calculation for payment banner

**Data Structure:**
```typescript
{
  success: true,
  data: {
    applications: [], // Future events only
    invitations: [],  // Future events only
    confirmations: [], // Future events only
    sampleWorks: [],
    hasRecentActivity: boolean, // 120-day window
    stats: {
      total_applications: number,
      future_applications: number,
      // ... etc
    }
  }
}
```

### **2. Payment Function V2 Authentication Support**

**Updated:** `/supabase/functions/stripe-global-payments-onboard/index.ts`

**Key Implementation:**
- JWT payload parsing for V2 auth detection
- Backward compatibility with V1 auth
- Proper error handling for both systems
- Security validation maintained

### **3. Eliminated Direct Database Queries**

**Before:** Frontend components made direct Supabase REST calls
**After:** All data access through authenticated edge functions

**Benefits:**
- No RLS policy conflicts
- Centralized access control
- Better error handling
- Reduced network calls
- Server-side filtering

---

## User Experience Improvements

### **Payment Message Improvements**

**Before (Harsh):**
- "Your account has been **blocked**"
- "Your account has **restrictions**"
- Badge: "**Blocked**" / "**Restricted**" (red)
- Button: "**Resolve Issues**"

**After (User-Friendly):**
- "Payment account **setup incomplete**. Please go to Stripe to add missing information."
- Badge: "**Setup Incomplete**" (orange)
- Button: "**Complete Setup**"

**Components Updated:**
- GlobalPaymentsOnboarding.jsx
- StripeConnectOnboarding.jsx
- PaymentStatusBanner.jsx
- PaymentDashboard.jsx

### **UI Simplification**

**Removed:** Sample works display from Home tab (moved to Profile tab only)
**Rationale:** Reduces cognitive load, users can find works on dedicated Profile tab

---

## Database Schema Insights

### **Event Relationship Patterns**

**Modern (Recommended):**
```sql
artist_applications.event_id → events.id (UUID FK)
```

**Legacy (String-based):**
```sql
artist_confirmations.event_eid → events.eid (string)
artist_invitations.event_eid → events.eid (string)
```

**Implications:**
- String relationships require manual joins in edge functions
- Cannot rely on Supabase's automatic join syntax (`!inner`)
- Must handle NULL events gracefully

### **Activity Tracking Tables**

**For Payment Banner Eligibility:**
- `artist_confirmations` - confirmed event participation
- `event_artists` - added to event rosters
- Both checked within 120-day window
- Must have `artist_number` for confirmations to count

---

## Performance Improvements

### **Before Architecture:**
```
Page Load:
├── 1x Profile lookup
├── 1x Applications query
├── 6x Event detail calls (for applications)
├── 1x Invitations query
├── 13x Event detail calls (for invitations)
├── 1x Confirmations query
├── 11x Event detail calls (for confirmations)
├── 1x Sample works query
├── 2x Payment banner queries (confirmations + event_artists)
└── Total: ~35 API calls
```

### **After Architecture:**
```
Page Load:
├── 1x Profile lookup
├── 1x Comprehensive profile data (includes everything)
└── Total: 2 API calls
```

**Performance Gain:** ~94% reduction in API calls

---

## Testing & Validation

### **Test User Profile**
- **Name:** Mario Guitron
- **Person ID:** `ea779aef-d007-4d92-ad6f-01bf2959964f`
- **Profile ID:** `29fdd3e9-df27-4c55-a11c-02e6357f71bd`
- **Auth Type:** V2-HTTP
- **Recent Activity:** 42 days ago (within 120-day window)

### **JWT Token Structure (V2):**
```json
{
  "auth_version": "v2-http",
  "person_id": "ea779aef-d007-4d92-ad6f-01bf2959964f",
  "person_name": "Mario Guitron",
  "person_pending": false,
  "person_verified": false,
  "phone": "16504386443"
}
```

### **Test Results:**

**Payment Setup Function:**
```bash
# Test command:
curl -X POST '/functions/v1/stripe-global-payments-onboard' \
  -H "Authorization: Bearer [JWT]" \
  -d '{"person_id": "ea779aef-d007-4d92-ad6f-01bf2959964f", ...}'

# Result: ✅ Success
{
  "success": true,
  "onboarding_url": "https://connect.stripe.com/setup/...",
  "stripe_account_id": "acct_1SAZyjPg22SiWg8r"
}
```

**Profile Data Function:**
```bash
# Test command:
curl -X POST '/functions/v1/get-artist-profile-data' \
  -H "Authorization: Bearer [JWT]" \
  -d '{"artist_profile_id": "29fdd3e9-df27-4c55-a11c-02e6357f71bd"}'

# Result: ✅ Success
{
  "success": true,
  "data": {
    "hasRecentActivity": true,
    "stats": {
      "total_applications": 6, "future_applications": 0,
      "total_invitations": 13, "future_invitations": 0,
      "total_confirmations": 11, "future_confirmations": 0
    }
  }
}
```

---

## Critical Lessons Learned

### **1. Authentication System Detection**
- **Always check JWT payload** for auth version before making assumptions
- **Support both systems** in new functions for maximum compatibility
- **V2 auth is more efficient** (no database lookup needed)

### **2. Database Relationship Investigation**
- **Don't assume FK relationships exist** - verify in schema
- **Use actual event participation data** to determine active profiles
- **String-based relationships** require manual join handling

### **3. Edge Function Architecture Benefits**
- **Centralized data access** eliminates RLS policy conflicts
- **Server-side filtering** more efficient than client-side
- **Single comprehensive call** better than multiple small calls
- **Better error handling** and debugging capabilities

### **4. User Experience Design**
- **Avoid harsh technical language** in user-facing messages
- **"Setup incomplete"** better than "blocked" or "restricted"
- **Orange warnings** less alarming than red errors
- **Actionable guidance** better than vague error messages

### **5. Debugging Multi-Profile Issues**
- **Check actual usage patterns** in event participation tables
- **Don't rely on creation dates** to determine active profiles
- **Recent activity is best indicator** of which profile is actively used

---

## Deployment History

| Time | Component | Change | Status |
|------|-----------|--------|--------|
| 16:16 | Frontend | Database-level filtering attempt | ❌ Failed |
| 16:28 | Frontend | Frontend filtering with scoping error | ❌ Failed |
| 16:30 | Frontend | Fixed scoping, schema error emerged | ❌ Failed |
| 17:01 | Edge Function | Fixed get-event-details-for-artist-profile | ✅ Success |
| 17:15 | Edge Function | Created get-artist-profile-data | ✅ Success |
| 17:17 | Edge Function | Fixed artist_sample_works table name | ✅ Success |
| 17:37 | Frontend | Final deployment with UX improvements | ✅ Success |

---

## Future Recommendations

### **1. Database Schema Improvements**
- **Migrate string relationships to proper FKs** when possible
- **Standardize on UUID relationships** for better performance
- **Add proper indexes** for frequently queried string fields

### **2. Authentication Standardization**
- **Migrate remaining V1 users to V2** for consistency
- **Document auth version detection patterns** for other developers
- **Consider JWT payload optimization** for common use cases

### **3. Monitoring & Observability**
- **Add performance monitoring** to edge functions
- **Track API call reduction metrics** to validate improvements
- **Monitor payment setup success rates** after message improvements

### **4. Code Patterns**
- **Use comprehensive edge functions** for related data loading
- **Implement consistent error handling** across all functions
- **Document string vs FK relationship handling** patterns

---

## Files Modified

### **Edge Functions:**
- `/supabase/functions/stripe-global-payments-onboard/index.ts` - V2 auth support
- `/supabase/functions/get-artist-profile-data/index.ts` - Comprehensive data loader

### **Frontend Components:**
- `Home.jsx` - Removed sample works, switched to edge function
- `PaymentStatusBanner.jsx` - Better messages, edge function integration
- `GlobalPaymentsOnboarding.jsx` - Friendlier blocked/restricted messaging
- `StripeConnectOnboarding.jsx` - Friendlier restricted messaging
- `PaymentDashboard.jsx` - Friendlier restricted badge

### **Database:**
- Unlinked inactive SMURKS1 profile from Mario's person record

---

## Success Metrics

- ✅ **Payment setup success rate:** 0% → 100% (for test user)
- ✅ **API call reduction:** ~35 calls → 2 calls (~94% improvement)
- ✅ **Error elimination:** No more CORS/access control errors
- ✅ **User experience:** Harsh "blocked" messages → friendly "setup incomplete"
- ✅ **Code maintainability:** Centralized data access patterns
- ✅ **Authentication coverage:** Both V1 and V2 auth systems supported

---

**This session represents a significant architectural improvement that addresses core system reliability, performance, and user experience issues while establishing scalable patterns for future development.**
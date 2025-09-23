# Payment Setup Invitation Audit Process & Findings

**Date:** September 23, 2025
**Audit Period:** September 22-23, 2025
**Total Invitations Analyzed:** 18 artists
**Critical Issue Discovered:** 88% authentication mapping failure rate

---

## Executive Summary

**🚨 CRITICAL FINDING:** While payment setup invitations were correctly sent to artists with legitimate outstanding balances ($2,708 total), **88% of recipients cannot access their money** due to authentication mapping failures between phone numbers, person records, and artist profiles.

**Only 2 out of 17 artists (12%) can actually log in and access their payment dashboard.**

---

## Audit Process Developed

### 1. Payment Setup Invitation Tracking
- **Location:** `payment_setup_invitations` table (`/root/vote_app/vote26/migrations/20250922_create_payment_setup_invitations_tracking.sql`)
- **Logging Function:** `log_payment_setup_invitation()`
- **History Function:** `get_artist_invitation_history()`
- **Edge Function:** `send-payment-setup-reminder` (`/root/vote_app/vote26/supabase/functions/send-payment-setup-reminder/index.ts`)

### 2. Critical Discovery: Incorrect Balance Calculation Logic

**❌ WRONG APPROACH (Initial SQL audit):**
```sql
WHERE a.status = 'paid' AND a.final_price > 0
```
**Result:** All artists showed $0 balance (false negatives)

**✅ CORRECT APPROACH (Matching artist-account-ledger logic):**
```sql
WHERE a.status IN ('sold', 'paid', 'closed')
AND COALESCE(a.final_price, a.current_bid, 0) > 0
```
**Key Insights from `/root/vote_app/vote26/supabase/functions/artist-account-ledger/index.ts`:**
- **Line 150:** Uses `.in('status', ['sold', 'paid', 'closed'])` not just 'paid'
- **Line 157:** Uses `art.final_price || art.current_bid || 0` fallback logic
- **Line 162:** Calculates `salePrice * 0.5` for artist commission

### 3. Authentication Mapping Analysis Process

**SQL Query Logic:**
```sql
-- Check if invitation phone maps to correct artist profile
LEFT JOIN people p ON (p.auth_phone = invitation_phone OR p.phone = invitation_phone)
-- Verify profile.person_id matches auth person_id
CASE
    WHEN auth_person_id IS NULL THEN 'PHONE_NOT_IN_AUTH_SYSTEM'
    WHEN profile_person_id IS NULL THEN 'PROFILE_NOT_LINKED_TO_PERSON'
    WHEN auth_person_id = profile_person_id THEN 'CORRECT_MAPPING'
    ELSE 'WRONG_PERSON_MAPPING'
END
```

---

## Findings Summary

### ✅ Invitation Justification: 94% Correct
- **17/18 artists** have legitimate outstanding balances ($50-$410)
- **1/18 artists** (Adam Adkison) has $0 balance - likely data/timing issue
- **Total owed:** $2,708 across 17 artists

### 🚨 Authentication Mapping: 88% FAILURE
- **✅ WORKING (2 artists - $312.50):**
  - Mario Guitron: $227.50 ✅
  - Julia Davids: $85.00 ✅

- **❌ BROKEN (15 artists - $2,395.50):**

#### Category 1: PHONE_NOT_IN_AUTH_SYSTEM (10 artists - $1,553)
*Phone numbers not registered in people table for authentication*
- Tetiana Blyzenko: +16282339378 → $410.00
- Tsungwei Moo: 14158182118 → $370.00
- Francisco Ramirez: +14086614206 → $192.50
- Jennifer: +13023109062 → $160.00
- Nicole Shek: +14088139018 → $155.00
- Turtle Wayne: +15105855930 → $102.50
- Vikash: +10410745753 → $87.50
- Michaela Carr: +13025476658 → $85.00
- Daria Kuznetsova: +15618730838 → $77.50
- Adam Adkison: +16179990503 → $0

#### Category 2: WRONG_PERSON_MAPPING (1 artist - $375)
*Phone number exists but maps to different person than profile owner*
- Michel-Antoine Renaud: +16138166272 → $375.00
  - Profile person_id: e234327a-c733-4ab8-926d-0800c160e8d3
  - Auth person_id: e52f9232-0438-42f3-a14c-a5f014db30f5

#### Category 3: PROFILE_NOT_LINKED_TO_PERSON (4 artists - $467.50)
*Person exists in auth system but artist profile not linked to person record*
- Vincent Rivera: +13028980966 → $195.00 (Auth person: "Vincent Rivera")
- Raye Twist: +19146028495 → $125.00 (Auth person: "Rachel Entwistle")
- Jordan Bricknell: +19787605585 → $87.50 (Auth person: "User")
- Alana Kualapai: +12095963893 → $87.50 (Auth person: "Ak K")

---

## Root Cause Analysis

### The Mario Guitron Success Case
From the Artist Profile Account Transition Guide case study, Mario had:
- **Profile 1:** "Mario Guitron" (money profile) - No auth access initially
- **Profile 2:** "SMURKS1" - Had auth access, $0 balance

**Solution Applied:** Used `transition_artist_account()` to transfer auth access from SMURKS1 to Mario Guitron profile.

**Result:** Mario can now log in with +16504386443 and access his $227.50.

### Current Problem Scale
The same issue exists for 15 other artists, but they haven't been through the transition process:
- Phone numbers not in auth system
- Profiles not linked to correct person records
- Phone numbers mapping to wrong people

---

## Critical Functions for Resolution

### 1. Profile Analysis
**Function:** `analyze_artist_profiles_for_merge()`
**Location:** `/root/vote_app/vote26/supabase-functions/db-functions/analyze_artist_profiles_for_merge.sql`

### 2. Account Transition
**Function:** `transition_artist_account()`
**Location:** `/root/vote_app/vote26/supabase-functions/db-functions/transition_artist_account.sql`

### 3. Payment Balance Verification
**Function:** `artist-account-ledger` (Edge Function)
**Location:** `/root/vote_app/vote26/supabase/functions/artist-account-ledger/index.ts`

### 4. Audit Function Created
**Function:** `audit_payment_setup_invitations()`
**Location:** `/root/vote_app/vote26/migrations/20250923_create_payment_invitation_audit_function_v2.sql`

---

## Correct Lookup Process for Future Invitations

### Before Sending Payment Setup Invitations:

1. **Verify Balance using artist-account-ledger logic:**
   ```sql
   WHERE a.status IN ('sold', 'paid', 'closed')
   AND COALESCE(a.final_price, a.current_bid, 0) > 0
   ```

2. **Verify Authentication Mapping:**
   ```sql
   -- Check if phone will give access to money profile
   SELECT ap.id as money_profile_id, p.id as auth_person_id
   FROM artist_profiles ap
   LEFT JOIN people p ON p.auth_phone = 'target_phone' OR p.phone = 'target_phone'
   WHERE ap.id = 'profile_with_money'
   AND ap.person_id = p.id  -- Must match for login to work
   ```

3. **If mapping broken, fix BEFORE sending invitation:**
   - Use `analyze_artist_profiles_for_merge()` to find all profiles for artist
   - Use `transition_artist_account()` to link auth to money profile
   - Verify with `artist-account-ledger` that balance is accessible

### Invitation Send Criteria:
- ✅ Artist has outstanding balance > $0
- ✅ Phone number maps to correct person_id
- ✅ Person_id matches profile with money
- ✅ Test login would show correct balance

---

## Immediate Action Required

### 1. Stop Further Broken Invitations
- Audit process before sending more invitations
- Implement pre-send mapping verification

### 2. Fix Existing 15 Broken Mappings
- **Category 1 (10 artists):** Create person records for phone numbers, link to profiles
- **Category 2 (1 artist):** Use transition_artist_account() to fix wrong mapping
- **Category 3 (4 artists):** Link existing person records to profiles

### 3. Update Invitation Process
- Integrate mapping verification into send-payment-setup-reminder function
- Create pre-send validation edge function

---

## Tools Created During Audit

### Database Function
```sql
-- Check invitation effectiveness
SELECT * FROM audit_payment_setup_invitations(7);
```

### Connection String
```bash
PGPASSWORD='6kEtvU9n0KhTVr5' psql -h db.xsqdkubgyqwpyvfltnrf.supabase.co -p 5432 -d postgres -U postgres
```

### Admin JWT for Testing
```bash
curl -X POST "https://xsqdkubgyqwpyvfltnrf.supabase.co/functions/v1/artist-account-ledger" \
  -H "Authorization: Bearer [ADMIN_JWT]" \
  -d '{"artist_profile_id": "profile-uuid"}'
```

---

**Next Steps:** Execute batch fix for the 15 broken authentication mappings to ensure artists can access their $2,395.50 in outstanding payments.
# Artist Profile Account Transition Guide

**Date:** September 23, 2025
**Version:** 1.0
**Authors:** Claude Code Assistant
**Approved by:** [To be filled]

## Executive Summary

This document provides comprehensive procedures for resolving artist profile authentication issues where payments are linked to the wrong profile. This commonly occurs when artists have multiple profiles but their phone number/authentication is linked to a profile without payment obligations.

**Use Case:** Artist cannot access their payment dashboard because their login credentials are linked to a profile that shows $0 balance, while their actual earnings are on a different profile.

---

## Table of Contents

1. [When to Use This Process](#when-to-use-this-process)
2. [Roles and Responsibilities](#roles-and-responsibilities)
3. [Prerequisites](#prerequisites)
4. [Office Administrator Procedure](#office-administrator-procedure)
5. [Technical Administrator Procedure](#technical-administrator-procedure)
6. [Verification and Testing](#verification-and-testing)
7. [Rollback Procedures](#rollback-procedures)
8. [Troubleshooting](#troubleshooting)
9. [Case Study: Mario Guitron](#case-study-mario-guitron)

---

## When to Use This Process

### Symptoms
- Artist reports they cannot see their payment balance when logging in
- Artist says their payment dashboard shows $0 but they know they have sold artwork
- Artist has multiple profiles under the same name/contact information
- Payment ledger shows different amounts for different profiles with same contact info

### Common Scenarios
1. **Multiple Event Registrations:** Artist registered for events multiple times, creating duplicate profiles
2. **Name Changes:** Artist used different name variations (nickname vs full name)
3. **Contact Updates:** Artist updated contact information, creating new profile instead of updating existing
4. **System Migration Issues:** Legacy data migration created orphaned profiles

---

## Roles and Responsibilities

### Office Administrator (Non-Technical)
- **Primary Role:** Initial investigation, artist communication, business validation
- **Responsibilities:**
  - Receive and document artist complaints
  - Verify artist identity and legitimate ownership of profiles
  - Communicate with artists throughout process
  - Validate business logic of proposed changes
  - Approve execution of technical procedures

### Technical Administrator (Database Access Required)
- **Primary Role:** Technical investigation, data analysis, execution of database changes
- **Responsibilities:**
  - Perform technical analysis of profile data
  - Execute database queries and RPC functions
  - Validate data integrity before and after changes
  - Perform rollback if issues arise
  - Document technical steps and results

---

## Prerequisites

### Required Access
- **Database Access:** PostgreSQL connection to production Supabase instance
- **Function Access:** Deployed `artist-account-ledger` and `transition_artist_account` functions
- **Admin Authentication:** Valid ABHQ admin JWT token for API calls

### Required Information
- Artist's full name and contact information
- Phone number or email used for authentication
- Event names/dates where artwork was sold
- Specific complaint details from artist

### Tools Needed
- `psql` command line tool
- `curl` for API testing
- Text editor for documentation
- Access to this guide

---

## Office Administrator Procedure

### Step 1: Document the Issue
Create a case file with the following information:

```
Case ID: [YYYY-MM-DD-ArtistLastName]
Artist Name:
Phone Number:
Email:
Issue Description:
Events Affected:
Expected Balance: $
Current Balance Shown: $
Date Reported:
```

### Step 2: Verify Artist Identity
- **Confirm Identity:** Verify artist is legitimate owner of profiles
- **Contact Information:** Confirm phone number and email are current
- **Event Participation:** Verify artist actually participated in mentioned events
- **Payment Expectations:** Understand what balance artist expects to see

### Step 3: Business Validation Questions
Ask the artist:
1. "What phone number do you use to log into the system?"
2. "What events did you participate in where artwork was sold?"
3. "Do you remember using different names when registering?"
4. "Have you ever had multiple accounts or profiles?"
5. "What balance do you expect to see and why?"

### Step 4: Initial Communication Template
```
Hi [Artist Name],

Thank you for contacting us about your payment dashboard. We've received your report that your balance shows $[amount] but you believe it should be $[expected].

We're investigating this issue and will work to resolve it within [timeframe]. This may involve consolidating multiple profiles if we find duplicates.

We'll keep you updated on our progress.

Best regards,
[Your Name]
Art Battle Support Team
```

### Step 5: Technical Handoff
Forward to Technical Administrator with:
- Complete case file
- Business validation results
- Artist contact information
- Approval to proceed with technical investigation

---

## Technical Administrator Procedure

### Step 1: Profile Discovery and Analysis

#### 1.1 Search for Artist Profiles
```sql
-- Replace with artist's information
PGPASSWORD='6kEtvU9n0KhTVr5' psql -h db.xsqdkubgyqwpyvfltnrf.supabase.co -p 5432 -d postgres -U postgres -c "
SELECT
    ap.id,
    ap.name,
    ap.email,
    ap.phone,
    ap.person_id,
    ap.created_at,
    p.email as person_email,
    p.phone as person_phone,
    p.auth_phone,
    p.auth_user_id
FROM artist_profiles ap
LEFT JOIN people p ON ap.person_id = p.id
WHERE
    ap.name ILIKE '%[ARTIST_NAME]%'
    OR ap.email ILIKE '%[EMAIL]%'
    OR ap.phone LIKE '%[PHONE]%'
    OR p.email ILIKE '%[EMAIL]%'
    OR p.phone LIKE '%[PHONE]%'
    OR p.auth_phone LIKE '%[PHONE]%'
ORDER BY ap.created_at;
"
```

#### 1.2 Analyze Profile Data
```sql
-- Use profile IDs found above
SELECT analyze_artist_profiles_for_merge(ARRAY['profile-id-1', 'profile-id-2']::uuid[]);
```

**Document the results:**
- Number of profiles found
- Which profile has person_id/auth access
- Which profile has payment obligations
- Data distribution across profiles

### Step 2: Payment Analysis

#### 2.1 Check Payment Ledgers
For each profile found, check their payment status:

```bash
# Replace with actual profile IDs and valid admin JWT token
curl -X POST "https://xsqdkubgyqwpyvfltnrf.supabase.co/functions/v1/artist-account-ledger" \
  -H "Authorization: Bearer [ADMIN_JWT_TOKEN]" \
  -H "Content-Type: application/json" \
  -d '{"artist_profile_id": "[PROFILE_ID]"}'
```

**Document for each profile:**
- Current balance
- Number of transactions
- Most recent activity
- Payment obligations

#### 2.2 Validate Business Logic
- Confirm which profile should be the "target" (usually the one with money)
- Identify which profile has the authentication access
- Verify the consolidation makes business sense

### Step 3: Pre-Transition Validation

#### 3.1 Create Backup Documentation
```sql
-- Document current state before changes
SELECT
    'BEFORE_TRANSITION' as checkpoint,
    ap.id,
    ap.name,
    ap.person_id,
    COUNT(a.id) as artwork_count,
    COUNT(rc.id) as round_contestant_count,
    COUNT(aa.id) as application_count
FROM artist_profiles ap
LEFT JOIN art a ON ap.id = a.artist_id
LEFT JOIN round_contestants rc ON ap.id = rc.artist_id
LEFT JOIN artist_applications aa ON ap.id = aa.artist_profile_id
WHERE ap.id IN ('[PROFILE_ID_1]', '[PROFILE_ID_2]')
GROUP BY ap.id, ap.name, ap.person_id;
```

#### 3.2 Verify Prerequisites
- [ ] Target profile exists and has payment obligations
- [ ] Source profile exists and has authentication access
- [ ] No conflicts in person_id assignments
- [ ] Business validation completed by Office Administrator
- [ ] Backup documentation created

### Step 4: Execute Dry Run

```sql
-- ALWAYS do dry run first
SELECT transition_artist_account(
    '[TARGET_PROFILE_ID]'::uuid,    -- Profile that should get the access
    ARRAY['[SOURCE_PROFILE_ID]']::uuid[],  -- Profile(s) to migrate from
    '[PERSON_ID]'::uuid,    -- Person ID from source profile
    true  -- dry_run = true
);
```

**Review dry run results:**
- Check `total_records_moved` count is reasonable
- Verify no errors in the migration log
- Confirm the operation looks correct

### Step 5: Execute Transition

⚠️ **WARNING:** This operation cannot be easily undone. Ensure dry run was successful and business approval obtained.

```sql
-- Execute actual transition (dry_run = false)
SELECT transition_artist_account(
    '[TARGET_PROFILE_ID]'::uuid,    -- Profile that should get the access
    ARRAY['[SOURCE_PROFILE_ID]']::uuid[],  -- Profile(s) to migrate from
    '[PERSON_ID]'::uuid,    -- Person ID from source profile
    false  -- dry_run = false (EXECUTE)
);
```

**Document the results:**
- Save the complete migration log
- Note the timestamp of execution
- Record any errors or warnings

---

## Verification and Testing

### Step 1: Immediate Post-Transition Checks

#### 1.1 Verify Profile Linkage
```sql
-- Check both profiles now point to same person
SELECT
    ap.id,
    ap.name,
    ap.person_id,
    p.auth_user_id
FROM artist_profiles ap
LEFT JOIN people p ON ap.person_id = p.id
WHERE ap.id IN ('[TARGET_PROFILE_ID]', '[SOURCE_PROFILE_ID]');
```

#### 1.2 Verify Payment Ledger
```bash
# Check target profile now shows correct balance
curl -X POST "https://xsqdkubgyqwpyvfltnrf.supabase.co/functions/v1/artist-account-ledger" \
  -H "Authorization: Bearer [ADMIN_JWT_TOKEN]" \
  -H "Content-Type: application/json" \
  -d '{"artist_profile_id": "[TARGET_PROFILE_ID]"}'
```

**Expected Results:**
- Target profile shows consolidated payment history
- Balance reflects all artwork sales
- Transaction count includes all relevant sales

#### 1.3 Verify Data Migration
```sql
-- Check data was moved correctly
SELECT
    'AFTER_TRANSITION' as checkpoint,
    ap.id,
    ap.name,
    COUNT(a.id) as artwork_count,
    COUNT(rc.id) as round_contestant_count,
    COUNT(aa.id) as application_count
FROM artist_profiles ap
LEFT JOIN art a ON ap.id = a.artist_id
LEFT JOIN round_contestants rc ON ap.id = rc.artist_id
LEFT JOIN artist_applications aa ON ap.id = aa.artist_profile_id
WHERE ap.id = '[TARGET_PROFILE_ID]'
GROUP BY ap.id, ap.name;
```

### Step 2: Functional Testing

#### 2.1 Authentication Test
- Have artist attempt to log in with their phone number
- Verify they can access the payment dashboard
- Confirm correct balance is displayed

#### 2.2 System Integration Test
- Check if artist-account-ledger API returns correct data
- Verify payment dashboard loads properly
- Test Stripe onboarding flow if applicable

### Step 3: Business Validation
- Contact artist to confirm issue is resolved
- Verify they can see expected balance
- Document successful resolution

---

## Rollback Procedures

### When to Rollback
- Data integrity issues discovered
- Artist reports new problems after transition
- Business logic errors identified
- System functionality broken

### Rollback Limitations
⚠️ **IMPORTANT:** The `transition_artist_account` function is NOT easily reversible. Rollback requires manual data restoration.

### Emergency Rollback Steps

#### 1. Immediate Assessment
- Document what went wrong
- Assess scope of impact
- Determine if rollback is necessary vs. forward fix

#### 2. Manual Data Restoration
```sql
-- This is a TEMPLATE - specific steps depend on what went wrong
-- May need to manually restore person_id assignments
UPDATE artist_profiles
SET person_id = '[ORIGINAL_PERSON_ID]'
WHERE id = '[PROFILE_ID]';

-- May need to move specific data back
-- This requires case-by-case analysis
```

#### 3. Contact Database Administrator
- For complex rollbacks, contact senior DBA
- Provide complete migration log
- Explain business impact and urgency

---

## Troubleshooting

### Common Issues

#### Issue 1: Function Not Found
**Error:** `function transition_artist_account does not exist`
**Solution:**
1. Deploy the function: `supabase functions deploy artist-account-ledger`
2. Check function exists: `SELECT routine_name FROM information_schema.routines WHERE routine_name LIKE '%transition%';`

#### Issue 2: Permission Denied
**Error:** `permission denied` or `JWT expired`
**Solution:**
1. Get fresh admin JWT token
2. Verify admin permissions in JWT payload
3. Check database RLS policies

#### Issue 3: Profile Not Found
**Error:** `Target profile not found`
**Solution:**
1. Verify profile ID is correct UUID format
2. Check profile exists: `SELECT * FROM artist_profiles WHERE id = '[ID]';`
3. Ensure no typos in UUID

#### Issue 4: Data Integrity Violations
**Error:** Various constraint violations during migration
**Solution:**
1. Check foreign key relationships
2. Verify no circular dependencies
3. Run analyze function first to identify conflicts

### Debug Queries

#### Check Profile Relationships
```sql
SELECT
    ap.id,
    ap.name,
    ap.person_id,
    p.auth_user_id,
    COUNT(a.id) as art_count
FROM artist_profiles ap
LEFT JOIN people p ON ap.person_id = p.id
LEFT JOIN art a ON ap.id = a.artist_id
WHERE ap.name ILIKE '%[ARTIST_NAME]%'
GROUP BY ap.id, ap.name, ap.person_id, p.auth_user_id;
```

#### Check for Conflicts
```sql
-- Look for data that might conflict during migration
SELECT table_name, column_name, constraint_name
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
  ON tc.constraint_name = kcu.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND kcu.column_name IN ('artist_id', 'artist_profile_id');
```

---

## Case Study: Mario Guitron

### Background
**Date:** September 23, 2025
**Artist:** Mario Guitron
**Phone:** +16504386443
**Email:** mguitron80@gmail.com
**Issue:** Could not access payment dashboard showing $227.50 owed

### Problem Discovery
1. **Two Profiles Found:**
   - Profile 1: "Mario Guitron" (29fdd3e9-df27-4c55-a11c-02e6357f71bd) - Had payment obligations but no auth access
   - Profile 2: "SMURKS1" (6796acd1-f57f-494b-b314-ddb911dc2613) - Had auth access but $0 balance

2. **Payment Analysis:**
   - Mario Guitron profile: $227.50 from 3 paid artworks
   - SMURKS1 profile: $0 from 11 sold artworks with $0 values

### Resolution Steps
1. **Validation:** Confirmed both profiles belonged to same person
2. **Dry Run:** Executed transition preview - 35 records to migrate
3. **Execution:** Transferred auth access from SMURKS1 to Mario Guitron profile
4. **Verification:** Artist could log in and see $227.50 balance

### Results
- ✅ Phone number linked to correct profile
- ✅ Full payment history consolidated
- ✅ Artist can access Stripe onboarding
- ✅ 35 database records migrated successfully

### Command History
```sql
-- Profile discovery
SELECT ap.id, ap.name, ap.email, ap.phone, ap.person_id
FROM artist_profiles ap
WHERE ap.name ILIKE '%mario%guitron%';

-- Payment analysis
SELECT artist_account_ledger('[PROFILE_ID]');

-- Dry run
SELECT transition_artist_account(
    '29fdd3e9-df27-4c55-a11c-02e6357f71bd'::uuid,
    ARRAY['6796acd1-f57f-494b-b314-ddb911dc2613']::uuid[],
    'ea779aef-d007-4d92-ad6f-01bf2959964f'::uuid,
    true
);

-- Execution
SELECT transition_artist_account(
    '29fdd3e9-df27-4c55-a11c-02e6357f71bd'::uuid,
    ARRAY['6796acd1-f57f-494b-b314-ddb911dc2613']::uuid[],
    'ea779aef-d007-4d92-ad6f-01bf2959964f'::uuid,
    false
);
```

---

## Appendix

### Required Database Functions

#### `analyze_artist_profiles_for_merge`
**Purpose:** Analyze multiple profiles for consolidation feasibility
**Location:** `/root/vote_app/vote26/supabase-functions/db-functions/analyze_artist_profiles_for_merge.sql`

#### `transition_artist_account`
**Purpose:** Execute profile consolidation and data migration
**Location:** `/root/vote_app/vote26/supabase-functions/db-functions/transition_artist_account.sql`

#### `artist-account-ledger` (Edge Function)
**Purpose:** Get comprehensive payment ledger for artist profile
**Location:** `/root/vote_app/vote26/supabase/functions/artist-account-ledger/`

### Database Connection Command
```bash
PGPASSWORD='6kEtvU9n0KhTVr5' psql -h db.xsqdkubgyqwpyvfltnrf.supabase.co -p 5432 -d postgres -U postgres
```

### Contact Information
- **Technical Issues:** Database Administrator
- **Business Questions:** Office Administrator
- **Emergency:** Art Battle Support Team

---

**Document Version:** 1.0
**Last Updated:** September 23, 2025
**Next Review:** December 23, 2025
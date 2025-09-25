# Duplicate Artist Profile Resolution Playbook

**Date Created:** September 25, 2025
**Last Updated:** September 25, 2025
**Version:** 1.0

## Overview

This playbook provides step-by-step procedures for resolving duplicate artist profiles where critical data (art sales, Stripe accounts, invitations, authentication) is scattered across multiple profiles for the same person.

## Common Symptoms

### Payment Issues
- Artist has verified Stripe account but doesn't appear in "Ready to Pay" tab
- Artist has money owed but shows $0 balance when logging in
- Ready to Pay count is lower than expected despite new Stripe account setups

### Invitation Issues
- Artist receives invitation emails but can't see invitations when logging in
- Producer sent invitations to one profile but artist logs into a different profile
- Artist reports "missing" invitations that show in admin system

### Authentication Issues
- Artist can't access their payment dashboard
- Login works but shows wrong/incomplete information
- Multiple profiles with same email/phone but different capabilities

## Investigation Process

### Step 1: Identify All Profiles for the Artist

```sql
-- Search by name (adjust pattern as needed)
SELECT
  ap.id,
  ap.name,
  ap.entry_id,
  ap.email,
  ap.phone
FROM artist_profiles ap
WHERE ap.name ILIKE '%[ARTIST_NAME]%'
ORDER BY ap.entry_id;

-- Alternative: Search by email if known
SELECT * FROM lookup_profiles_by_contact('', '[EMAIL_ADDRESS]');
```

### Step 2: Analyze Profile Capabilities

```sql
-- Check authentication, art sales, Stripe accounts, and invitations
WITH profile_analysis AS (
  SELECT
    ap.id,
    ap.name,
    ap.entry_id,
    ap.email,
    -- Authentication check
    CASE WHEN p.auth_user_id IS NOT NULL THEN 'CAN LOGIN' ELSE 'NO LOGIN' END as login_status,
    p.auth_user_id,
    -- Art sales check
    COUNT(DISTINCT a.id) as art_count,
    SUM(COALESCE(a.final_price, a.current_bid, 0) * 0.5) as sales_total,
    -- Stripe account check
    agp.stripe_recipient_id,
    agp.status as stripe_status,
    -- Invitations check
    COUNT(DISTINCT ai.id) as invitation_count
  FROM artist_profiles ap
  LEFT JOIN people p ON ap.person_id = p.id
  LEFT JOIN art a ON ap.id = a.artist_id
    AND a.status IN ('sold', 'paid', 'closed')
    AND COALESCE(a.final_price, a.current_bid, 0) > 0
  LEFT JOIN artist_global_payments agp ON ap.id = agp.artist_profile_id
  LEFT JOIN artist_invitations ai ON ap.id = ai.artist_profile_id
  WHERE ap.name ILIKE '%[ARTIST_NAME]%'
  GROUP BY ap.id, ap.name, ap.entry_id, ap.email, p.auth_user_id, agp.stripe_recipient_id, agp.status
)
SELECT * FROM profile_analysis
ORDER BY sales_total DESC, invitation_count DESC;
```

### Step 3: Use Duplicate Analysis Function

```sql
-- Get detailed analysis of profiles for merge planning
SELECT * FROM analyze_artist_profiles_for_merge(
  ARRAY['[PROFILE_ID_1]', '[PROFILE_ID_2]']::uuid[]
);
```

## Resolution Patterns

### Pattern 1: Stripe Account on Wrong Profile
**Symptoms:** Artist has Stripe account but shows $0 owed; different profile has money owed
**Example:** Mona Farrokhi, Sara Woodhull

**Solution:**
```sql
-- Transfer Stripe account from $0 profile to money-owed profile
UPDATE artist_global_payments
SET artist_profile_id = '[MONEY_OWED_PROFILE_ID]'
WHERE artist_profile_id = '[STRIPE_ACCOUNT_PROFILE_ID]'
  AND stripe_recipient_id = '[STRIPE_ACCOUNT_ID]';

-- Verify transfer
SELECT
  ap.name,
  ap.entry_id,
  agp.stripe_recipient_id,
  agp.status
FROM artist_profiles ap
JOIN artist_global_payments agp ON ap.id = agp.artist_profile_id
WHERE agp.stripe_recipient_id = '[STRIPE_ACCOUNT_ID]';
```

### Pattern 2: Invitations on Wrong Profile
**Symptoms:** Artist can login but can't see invitations; invitations exist on non-login profile
**Example:** CeeCee

**Solution:**
```sql
-- Transfer invitations from non-login profile to main login profile
UPDATE artist_invitations
SET artist_profile_id = '[MAIN_PROFILE_ID]' -- Profile with login capability
WHERE artist_profile_id = '[INVITATION_PROFILE_ID]'; -- Profile with invitations but no login

-- Verify transfer
SELECT
  ap.name,
  ap.entry_id,
  COUNT(ai.id) as invitation_count,
  MAX(ai.created_at) as latest_invitation
FROM artist_profiles ap
LEFT JOIN artist_invitations ai ON ap.id = ai.artist_profile_id
WHERE ap.id = '[MAIN_PROFILE_ID]'
GROUP BY ap.id, ap.name, ap.entry_id;
```

## Step-by-Step Resolution Process

### Phase 1: Investigation
1. **Identify all profiles** using name/email search
2. **Map profile capabilities** (login, art sales, Stripe, invitations)
3. **Determine target profile** (usually the one with most activity/capabilities)
4. **Document current state** before making changes

### Phase 2: Data Consolidation
1. **Transfer Stripe accounts** to profiles with money owed
2. **Transfer invitations** to profiles with login capability
3. **Verify each transfer** immediately after execution
4. **Test functionality** (Ready to Pay count, login access)

### Phase 3: Verification
1. **Check Ready to Pay count** increased as expected
2. **Test edge function** returns updated data
3. **Verify artist can login** and see correct information
4. **Document resolution** in this playbook

## Verification Commands

### Check Ready to Pay Status
```sql
-- Should show artist with correct balance and Stripe account
SELECT
  artist_name,
  artist_entry_id,
  estimated_balance,
  stripe_recipient_id
FROM get_ready_to_pay_artists()
WHERE artist_name ILIKE '%[ARTIST_NAME]%';
```

### Check Total Ready to Pay Count
```sql
SELECT COUNT(*) as total_ready_to_pay FROM get_ready_to_pay_artists();
```

### Test Edge Function
```bash
curl -s -X POST "https://xsqdkubgyqwpyvfltnrf.supabase.co/functions/v1/working-admin-payments" \
  -H "Authorization: Bearer [TOKEN]" \
  -H "Content-Type: application/json" \
  -d '{"days_back": 90}' | jq '.summary.artists_ready_count'
```

## Case Studies

### Case 1: Mona Farrokhi (September 25, 2025)
**Problem:** Stripe account on Entry #128040 ($0 balance), art sales on Entry #128038 ($25 owed)
**Solution:** Transferred `acct_1SB5GNBb9DvjKhte` from #128040 to #128038
**Result:** Ready to Pay count increased, Mona now appears with $25 and verified Stripe account

### Case 2: Sara Woodhull (September 25, 2025)
**Problem:** Stripe account on Entry #310161 ($0 balance), art sales on Entry #221030 ($30 owed)
**Solution:** Transferred `acct_1SB5n2Bs5vrxvBWu` from #310161 to #221030
**Result:** Ready to Pay count increased, Sara now appears with $30 and verified Stripe account

### Case 3: CeeCee (September 25, 2025)
**Problem:** 10 invitations on Entry #132757 (no login), login capability on Entry #128375 (2 invitations)
**Solution:** Transferred all invitations from #132757 and #310428 to #128375
**Result:** CeeCee can now see all 13 invitations when logging in to her main profile

## Profile Identification Tips

### Finding Duplicates
- Look for same email address with different entry IDs
- Check for similar names (nicknames vs full names)
- Search by phone number using `lookup_profiles_by_contact()`
- Look for recent profile creation dates around event registration times

### Determining Main Profile
**Priority Order:**
1. **Most art sales/revenue** (business priority)
2. **Has authentication/login capability** (user access)
3. **Most recent activity** (current relevance)
4. **Verified Stripe account** (payment capability)
5. **Most invitations** (engagement history)

## Safety Notes

### Before Making Changes
- **Document current state** of all profiles involved
- **Verify artist identity** through multiple data points (email, phone, name)
- **Check for recent activity** to avoid disrupting active processes
- **Test queries** on staging environment if available

### Rollback Procedures
- Keep original profile IDs and data mappings documented
- Transfers can be reversed by swapping profile IDs in UPDATE statements
- Always verify changes immediately after execution
- Maintain audit trail of changes made

### Common Pitfalls
- **Don't transfer TO profiles without login capability** - artist won't be able to access
- **Don't merge profiles with different email addresses** without confirming with artist
- **Check for active payments in progress** before moving Stripe accounts
- **Verify phone number formats match** (some have +1 prefix, others don't)

## Tools and Functions

### Available Database Functions
- `lookup_profiles_by_contact(phone, email)` - Find profiles by contact info
- `analyze_artist_profiles_for_merge(profile_ids[])` - Detailed profile analysis
- `merge_duplicate_people()` - Full profile merge (use with caution)
- `get_ready_to_pay_artists()` - Verify payment readiness

### Useful Tables
- `artist_profiles` - Basic profile information
- `people` - Authentication and contact information
- `artist_global_payments` - Stripe account connections
- `artist_invitations` - Event invitations
- `art` - Artwork sales data
- `artist_payments` - Payment history

## Success Metrics

### Payment System
- Ready to Pay count increases correctly
- Artist appears in admin interface with correct balance
- Stripe account shows "ready" status
- Edge function returns updated counts

### Artist Experience
- Artist can login successfully
- All invitations visible after login
- Payment dashboard shows correct balance
- No error messages or missing data

---

**Last Resolution:** September 25, 2025 - Fixed Mona Farrokhi, Sara Woodhull, and CeeCee
**Next Review:** When duplicate profile issues are reported
**Maintainer:** Claude Code Assistant
# Profile Switching Analysis - Payment Access Problem

**Date:** October 15, 2025
**Problem:** Artists logging into "wrong" profile can't access payments owed to them

---

## Current System Architecture

### 1. Profile Selection Logic
**Function:** `get_primary_artist_profile(person_id)`
```sql
SELECT * FROM artist_profiles
WHERE person_id = ?
  AND superseded_by IS NULL
ORDER BY
  set_primary_profile_at DESC NULLS LAST,
  created_at DESC
LIMIT 1;
```

**Priority:**
1. Profile with `set_primary_profile_at` set (user manually selected)
2. Most recently created active profile
3. **Key:** Only looks at profiles where `superseded_by IS NULL`

### 2. Payment Tracking
**Payments are tied to `artist_profile_id`**, not person_id:
- `artist_payments.artist_profile_id` → profile that gets paid
- `art.artist_id` → profile that created the artwork
- `artist_confirmations.artist_profile_id` → profile confirmed for event
- `event_artists.artist_id` → profile in event roster

### 3. Reconciliation System (Admin Tool)
**Location:** `art-battle-admin/DuplicateProfileResolver.jsx`

**What it does:**
1. Admin selects canonical PERSON
2. Admin selects canonical ARTIST_PROFILE
3. Reconciliation:
   - Canonical profile: `superseded_by = NULL`, `set_primary_profile_at = NOW()`
   - Other profiles: `superseded_by = {canonical_profile_id}`
   - All profiles: `person_id = {canonical_person_id}`

**Result:** User logs in → gets canonical profile → sees everything tied to that profile

---

## The Problem in Detail

### Scenario 1: Simple Case (Already Works)
```
User logs in with phone 61449109931
└─> Person ID: abc-123
    └─> Profile A (primary): $500 owed
    └─> Profile B (superseded): $0 owed

✅ get_primary_artist_profile returns Profile A
✅ User sees $500
```

### Scenario 2: Wrong Profile Selected (BROKEN)
```
User logs in with phone 61449109931
└─> Person ID: abc-123
    ├─> Profile A (created 2023): $500 owed, 50 artworks
    └─> Profile B (created 2025, SELECTED AS PRIMARY): $0 owed, no data

Profile B was set as primary because:
- Admin ran reconciliation and chose Profile B by mistake
- User clicked "Use This Profile" on empty profile
- Profile B was created more recently

❌ get_primary_artist_profile returns Profile B
❌ User sees $0 balance
❌ Payments still on Profile A (can't be accessed)
```

---

## What Data is Tied to Which Profile?

### HARD-LINKED to artist_profile_id (NOT movable without DB changes):
| Table | Column | What it stores |
|-------|--------|----------------|
| `art` | `artist_id` | Artwork ownership, sales |
| `artist_payments` | `artist_profile_id` | **💰 MONEY OWED** |
| `artist_confirmations` | `artist_profile_id` | Event confirmations |
| `event_artists` | `artist_id` | Event roster |
| `artist_invitations` | `artist_profile_id` | Invitations |
| `artist_applications` | `artist_profile_id` | Applications |
| `artist_sample_works` | `artist_profile_id` | Portfolio images |
| `artist_stripe_accounts` | `artist_profile_id` | Stripe connection |
| `artist_global_payments` | `artist_profile_id` | Global payments setup |

### STORED in artist_profiles (CAN be copied):
- `name`, `bio`, `email`, `phone`
- `city`, `country`
- `instagram`, `facebook`, `twitter`, `website`
- `sample_works_urls` (array)
- `pronouns`, `abhq_bio`

---

## Existing Solutions

### Option 1: Admin Reconciliation (Current)
**Process:**
1. Artist contacts support: "I can't see my $500!"
2. Admin opens DuplicateProfileResolver
3. Admin searches by phone/email
4. Admin selects correct Person + correct Artist_Profile
5. Admin clicks "Reconcile"
6. System sets correct profile as primary

**Pros:**
- ✅ Works perfectly once done
- ✅ Merges all profiles under one person
- ✅ Preserves all data

**Cons:**
- ❌ Requires admin intervention
- ❌ Artist can't self-serve
- ❌ Can take hours/days
- ❌ Doesn't prevent the problem

### Option 2: Profile Picker on Login (Current)
**When:** User logs in, multiple candidate profiles found, no primary set

**UI:** Shows all profiles with:
- Name, email, phone
- Outstanding balance (calculated)
- Artwork count
- Sample works

**User clicks:** "Use This Profile" → sets `set_primary_profile_at`

**Pros:**
- ✅ User chooses correct profile
- ✅ Shows balance to help decide

**Cons:**
- ❌ Only appears when no primary set
- ❌ If wrong profile already primary, doesn't show
- ❌ Decision is "final" (no easy way to switch back)

---

## Proposed Solution Ideas

### OPTION A: "Money on Other Profile" Warning
**Where:** PaymentStatusBanner / Home.jsx info box

**Logic:**
```javascript
// Check all profiles with same person_id OR phone
const allProfilesForUser = await getRelatedProfiles(currentProfile);

const otherProfilesWithMoney = allProfilesForUser
  .filter(p => p.id !== currentProfile.id)
  .filter(p => p.outstandingBalance > 0);

if (otherProfilesWithMoney.length > 0) {
  showWarning({
    message: "💰 You have ${X} owed on another profile",
    profiles: otherProfilesWithMoney,
    action: "View Other Profiles"
  });
}
```

**UI:**
```
⚠️ Money on Another Profile

You have $500 owed on a different profile.

Current profile: Jane Doe (#256440) - $0 balance
Other profile: Jane D (#310423) - $500 balance

[View Other Profiles] button
  ↓
Modal showing all profiles with radio selection
[Switch to This Profile (Warning: may lose data)]
```

**Pros:**
- ✅ Artist sees they have money elsewhere
- ✅ Self-service (no admin needed)
- ✅ Transparent about which profile has what

**Cons:**
- ⚠️ Switching profiles is destructive
- ⚠️ Could lose bio, photos, recent applications
- ⚠️ Confusing UX ("Why do I have multiple profiles?")

---

### OPTION B: Payment Forwarding (DB Changes)
**Concept:** When payment created, check if profile is superseded, forward to canonical

**Logic:**
```sql
-- When creating artist_payment
INSERT INTO artist_payments (artist_profile_id, ...)
VALUES (
  COALESCE(
    (SELECT superseded_by FROM artist_profiles WHERE id = ?),
    ? -- original profile_id if not superseded
  ),
  ...
);
```

**OR:**
```sql
-- View that resolves payments
CREATE VIEW artist_payments_resolved AS
SELECT
  COALESCE(ap.superseded_by, ap.id) as effective_profile_id,
  apay.*
FROM artist_payments apay
JOIN artist_profiles ap ON apay.artist_profile_id = ap.id;
```

**Pros:**
- ✅ Payments automatically "follow" the artist
- ✅ No user confusion
- ✅ Works retroactively with views

**Cons:**
- ⚠️ Requires DB schema changes
- ⚠️ Need to update all payment queries
- ⚠️ Could break existing payment processing
- ⚠️ What about Stripe account mismatches?

---

### OPTION C: Unified Artist Ledger (DB Refactor)
**Concept:** Payments tied to `person_id` instead of `artist_profile_id`

**Changes:**
```sql
ALTER TABLE artist_payments
  ADD COLUMN person_id UUID REFERENCES people(id);

-- Migrate existing
UPDATE artist_payments ap
SET person_id = (
  SELECT person_id
  FROM artist_profiles
  WHERE id = ap.artist_profile_id
);
```

**Pros:**
- ✅ Future-proof
- ✅ Profile switching becomes safe
- ✅ No data loss

**Cons:**
- ❌ Massive refactor
- ❌ Breaks existing queries
- ❌ Audit trail becomes unclear
- ❌ Stripe accounts still tied to profiles

---

### OPTION D: Profile Merge Tool (Artist Portal)
**Where:** Home.jsx, visible when multiple active profiles detected

**UI:**
```
ℹ️ Multiple Profiles Detected

We found 2 profiles that might be you:

● Profile A: Jane Doe (#256440)
  - $0 balance
  - 0 artworks
  - Created: 2025-10-01

● Profile B: Jane D (#310423)
  - $500 balance
  - 15 artworks
  - Created: 2023-05-15
  - ✓ Stripe connected

These profiles can be merged. Which profile has your correct information?

[Select Profile B] → Profile A will be archived, B becomes primary

⚠️ Warning: Once merged, you cannot undo this.
```

**Backend:**
```javascript
// Call set-primary-profile with selected profile
// All future logins use selected profile
// Old profile marked superseded
```

**Pros:**
- ✅ Artist self-service
- ✅ Uses existing reconciliation logic
- ✅ Transparent about consequences
- ✅ One-time decision

**Cons:**
- ⚠️ Still potentially destructive
- ⚠️ Need clear warnings
- ⚠️ What if they choose wrong?

---

## Recommendation

### SHORT TERM (Safest):
**OPTION A + Improved Admin Tool**

1. **Add warning box to artist portal:**
   - Detects other profiles with money
   - Shows total owed elsewhere
   - Link to "Contact Support" (Slack notification)
   - **Don't allow self-switching** (too risky)

2. **Improve admin DuplicateProfileResolver:**
   - Highlight profile with highest balance
   - Show clearer warnings
   - Add "undo reconciliation" feature
   - Better audit logging

### MEDIUM TERM:
**OPTION D - Self-Service Merge**
- Let artists see and select correct profile
- Clear warnings about data loss
- Require confirmation: "I understand Profile A will be archived"
- Admin can still override/fix

### LONG TERM:
**OPTION B - Payment Forwarding via Views**
- Don't change schema
- Create views that resolve superseded profiles
- Update queries to use views
- Payments "follow" the artist automatically

---

## Questions to Answer Before Implementation

1. **How often does this actually happen?**
   - Need metrics: How many artists have multiple active profiles?
   - How many have money split across profiles?

2. **What causes wrong profile selection?**
   - User clicking wrong profile in picker?
   - Admin reconciliation mistakes?
   - Profile created at wrong time?

3. **Is switching safe?**
   - What happens to pending applications on old profile?
   - What happens to Stripe connection?
   - What happens to event confirmations?

4. **Can we prevent the problem?**
   - Better phone/email matching during signup?
   - Auto-detect and merge during login?
   - Warn artists before creating duplicate profiles?

---

## Next Steps

1. ✅ Get user confirmation on approach
2. ⬜ Query database: How many artists have this problem?
3. ⬜ Review admin reconciliation logs: What went wrong?
4. ⬜ Design warning UI mockup
5. ⬜ Test switching logic in staging
6. ⬜ Create undo/rollback mechanism

---

**DO NOT IMPLEMENT ANYTHING YET**

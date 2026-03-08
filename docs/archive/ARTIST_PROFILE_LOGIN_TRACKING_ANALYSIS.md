# Artist Profile Login Tracking & Active Profile Analysis

**Date:** November 4, 2025
**Purpose:** Document login tracking capabilities and active profile identification for artist profiles

---

## Executive Summary

**Key Findings:**
- Login tracking exists at the **PERSON level** via `auth.users.last_sign_in_at`
- **858 out of 6,710** people with profiles have auth logins (12.8%)
- **41 people have multiple profiles** (0.6%)
- Active profile determined by `superseded_by IS NULL`
- All profiles for a person share the same `last_sign_in_at` timestamp

---

## Architecture Overview

### Data Flow: Profile → Person → Auth User

```
artist_profiles.person_id
  ↓
people.id (links profiles to person)
  ↓
people.auth_user_id
  ↓
auth.users.id (Supabase auth table)
  ↓
auth.users.last_sign_in_at ← LOGIN TIMESTAMP
```

### Key Tables & Columns

#### `artist_profiles` Table
| Column | Type | Purpose |
|--------|------|---------|
| `id` | UUID | Profile unique identifier |
| `entry_id` | INTEGER | Human-readable profile number |
| `person_id` | UUID | Links to people table |
| `superseded_by` | UUID | If set, profile is inactive (merged into another) |
| `set_primary_profile_at` | TIMESTAMP | When user selected this as primary |
| `name`, `email`, `phone` | TEXT | Profile contact info |

#### `people` Table
| Column | Type | Purpose |
|--------|------|---------|
| `id` | UUID | Person unique identifier |
| `auth_user_id` | UUID | Links to auth.users |
| `last_interaction_at` | TIMESTAMPTZ | General interaction tracking |
| `last_qr_scan_at` | TIMESTAMPTZ | QR scan specific |

#### `auth.users` Table (Supabase System)
| Column | Type | Purpose |
|--------|------|---------|
| `id` | UUID | Auth user identifier |
| `last_sign_in_at` | TIMESTAMPTZ | **LOGIN TIMESTAMP** ← Source of truth |
| `email` | TEXT | Auth email |
| `phone` | TEXT | Auth phone |

---

## Profile Status Logic

### Active Profile
```sql
WHERE superseded_by IS NULL
```
- Profile is **currently active** and accessible
- Can have art sales, invitations, payments
- User will see this profile when logging in

### Superseded Profile
```sql
WHERE superseded_by IS NOT NULL
```
- Profile has been **merged/deactivated**
- Points to the canonical profile via `superseded_by`
- Historical data preserved but not actively used
- User won't see this profile after login

### Primary Profile Selection
From `get_primary_artist_profile()` function:
```sql
ORDER BY
  set_primary_profile_at DESC NULLS LAST,  -- User manually selected
  created_at DESC                          -- Fallback to newest
```

---

## Login Tracking Details

### Source of Truth
**`auth.users.last_sign_in_at`** is the authoritative timestamp for when a user last logged in.

### Important Notes:
1. **One timestamp per person** - All profiles for a person share the same login time
2. **Managed by Supabase** - Updates automatically on authentication
3. **No profile-level tracking** - Cannot tell which profile was "active" during a specific login
4. **NULL means never logged in** - Profile created but user hasn't authenticated

### Example: Ellen Weiner
```
Person: 05ce2b33-c175-4774-9c94-ce240d650a2f
  Linked Phone: 13025457808 (auth)
  Last Login: 2025-10-29 08:03:04 (6 days ago)

  Profile #256465 (Entry ID):
    - Status: ACTIVE ✓
    - Profile Phone: +13025457808
    - set_primary_profile_at: NULL

  Profile #310545 (Entry ID):
    - Status: SUPERSEDED
    - Profile Phone: 13025457808
    - set_primary_profile_at: 2025-09-28 18:58:39
    - superseded_by: dbd1487a-8a3d-4ca7-9153-c9064760a5dd (Profile #256465)
```

**Interpretation:**
- Ellen logs in with phone: 13025457808
- She last logged in 6 days ago
- She currently uses Profile #256465 (ACTIVE)
- Profile #310545 was previously primary but has been superseded

### Phone Number Sources

**Three places store phone numbers:**

1. **`auth.users.phone`** - The authoritative auth phone (what user logs in with)
   - Updated by Supabase Auth system
   - Used for SMS verification
   - Usually stored without `+` prefix

2. **`people.phone`** or `people.auth_phone`** - Person's phone
   - Links person to auth user
   - Usually has `+` prefix
   - May differ from profile phone

3. **`artist_profiles.phone`** - Profile-specific phone
   - Can be different from auth phone
   - Artist might have multiple profiles with different phones
   - Display purposes only

**Best Practice for Display:**
```sql
COALESCE(au.phone, p.auth_phone, p.phone) AS linked_phone
```
This prioritizes the auth phone (actual login phone) over other sources.

---

## SQL Queries for UI Display

### 1. Get Login Info for Current Profile (with Phone)
```sql
SELECT
  ap.id AS profile_id,
  ap.entry_id,
  ap.name AS profile_name,
  ap.superseded_by IS NULL AS is_active,

  -- Phone Numbers
  COALESCE(au.phone, p.auth_phone, p.phone) AS linked_phone,  -- Auth phone (what they log in with)
  ap.phone AS profile_phone,  -- Phone on profile

  -- Login Info
  p.auth_user_id,
  au.last_sign_in_at,
  EXTRACT(DAY FROM (NOW() - au.last_sign_in_at))::INTEGER AS days_since_login,
  (p.auth_user_id IS NOT NULL) AS has_auth_login
FROM artist_profiles ap
LEFT JOIN people p ON ap.person_id = p.id
LEFT JOIN auth.users au ON p.auth_user_id = au.id
WHERE ap.id = $1;  -- Current profile ID
```

**Returns:**
- `linked_phone`: The phone number used for authentication (from `auth.users`)
- `profile_phone`: Phone stored on the artist profile
- `last_sign_in_at`: Timestamp of last login
- `days_since_login`: How many days ago

### 2. Get All Profiles for a Person with Login Stats
```sql
SELECT
  ap.id AS profile_id,
  ap.entry_id,
  ap.name AS profile_name,
  ap.email,
  ap.phone,
  CASE
    WHEN ap.superseded_by IS NULL THEN 'ACTIVE'
    ELSE 'SUPERSEDED'
  END AS status,
  ap.set_primary_profile_at,
  au.last_sign_in_at,
  EXTRACT(DAY FROM (NOW() - au.last_sign_in_at))::INTEGER AS days_since_login,
  (SELECT COUNT(*) FROM artist_profiles WHERE person_id = p.id) AS total_profiles
FROM artist_profiles ap
LEFT JOIN people p ON ap.person_id = p.id
LEFT JOIN auth.users au ON p.auth_user_id = au.id
WHERE p.id = $1  -- Person ID
ORDER BY
  (ap.superseded_by IS NULL) DESC,  -- Active first
  ap.set_primary_profile_at DESC NULLS LAST;
```

### 3. Admin View: All Profiles with Login Stats and Phone
```sql
SELECT
  ap.entry_id,
  ap.name AS profile_name,
  COALESCE(au.phone, p.auth_phone, p.phone) AS linked_phone,
  ap.email,
  au.last_sign_in_at,
  EXTRACT(DAY FROM (NOW() - au.last_sign_in_at))::INTEGER AS days_since_login,
  CASE
    WHEN au.last_sign_in_at IS NOT NULL AND au.last_sign_in_at > NOW() - INTERVAL '7 days'
    THEN '🟢 Recent'
    WHEN au.last_sign_in_at IS NOT NULL AND au.last_sign_in_at > NOW() - INTERVAL '30 days'
    THEN '🟡 Active'
    WHEN au.last_sign_in_at IS NOT NULL
    THEN '🔴 Inactive'
    ELSE '⚫ Never'
  END AS activity_status,
  CASE
    WHEN ap.superseded_by IS NULL THEN 'ACTIVE ✓'
    ELSE 'SUPERSEDED'
  END AS profile_status,
  (SELECT COUNT(*) FROM artist_profiles ap2 WHERE ap2.person_id = ap.person_id) AS total_profiles
FROM artist_profiles ap
LEFT JOIN people p ON ap.person_id = p.id
LEFT JOIN auth.users au ON p.auth_user_id = au.id
WHERE ap.person_id IS NOT NULL
  AND au.last_sign_in_at IS NOT NULL  -- Only show profiles with logins
ORDER BY au.last_sign_in_at DESC;
```

---

## Database Functions (Optional)

### Create Reusable Functions
See `/tmp/profile_login_analysis.sql` for:
- `get_person_profiles_with_login(person_id)` - All profiles for a person
- `get_profile_login_info(profile_id)` - Login info for specific profile
- `artist_profiles_with_login_stats` VIEW - Admin overview

**To Deploy:**
```bash
PGPASSWORD='6kEtvU9n0KhTVr5' psql \
  -h db.xsqdkubgyqwpyvfltnrf.supabase.co \
  -p 5432 -d postgres -U postgres \
  -f /tmp/profile_login_analysis.sql
```

---

## UI Display Recommendations

### Artist Portal (Home Page)

#### Option 1: Simple "Last Login" Badge
```
┌─────────────────────────────────┐
│ Welcome back, Ellen Weiner!     │
│ 📱 Phone: +1 (302) 545-7808     │
│ Last login: 6 days ago          │
│ Profile: Active ✓               │
└─────────────────────────────────┘
```

#### Option 2: Profile Status with Warning
```
┌─────────────────────────────────────────────┐
│ Profile: Ellen Weiner (#256465)             │
│ 📱 Phone: +1 (302) 545-7808                 │
│ Status: Active ✓                            │
│ Last Login: Oct 29, 2025 (6 days ago)      │
│                                             │
│ ⚠️ You have 1 other profile                │
│    [View All Profiles]                      │
└─────────────────────────────────────────────┘
```

#### Option 3: Detailed Multi-Profile View
```
┌─────────────────────────────────────────────┐
│ Your Profiles                               │
├─────────────────────────────────────────────┤
│ ✓ Ellen Weiner (#256465) - ACTIVE          │
│   📱 +1 (302) 545-7808                      │
│   Last login: 6 days ago                    │
│   $500 owed, 15 artworks                    │
│                                             │
│ ⊘ Ellen Weiner (#310545) - Superseded      │
│   Merged into profile #256465               │
└─────────────────────────────────────────────┘
```

### Admin Interface

#### Profile Management View
```
Entry ID | Name          | Phone              | Email             | Status      | Last Login  | Days | Profiles
---------|---------------|--------------------|-------------------|-------------|-------------|------|----------
256465   | Ellen Weiner  | +1 (302) 545-7808  | ellen@art.com     | ACTIVE ✓    | Oct 29      | 6    | 2
310545   | Ellen Weiner  | +1 (302) 545-7808  | ellen@art.com     | SUPERSEDED  | Oct 29      | 6    | 2
310859   | Notoxy        | +1 (514) 809-6153  | notoxy@gmail.com  | ACTIVE ✓    | Nov 4       | 0    | 1
```

---

## Statistics (Current State)

From database analysis on Nov 4, 2025:

| Metric | Count | Percentage |
|--------|-------|------------|
| Total people with profiles | 6,710 | 100% |
| People with auth login | 858 | 12.8% |
| People with multiple profiles | 41 | 0.6% |
| Profiles without login | 5,852 | 87.2% |

**Interpretation:**
- Most profiles are legacy/imported (no login capability)
- Very few people have profile duplication issues
- Auth-first architecture working as designed

---

## Common Use Cases

### 1. Show "Last Seen" in Artist Profile
**Query:**
```javascript
const { data } = await supabase.rpc('get_profile_login_info', {
  p_profile_id: currentProfileId
});

// Display: "Last login: 6 days ago"
```

### 2. Detect Multiple Profiles
**Query:**
```sql
SELECT COUNT(*) FROM artist_profiles
WHERE person_id = $1 AND superseded_by IS NULL
```
If count > 1, show warning about multiple active profiles.

### 3. Admin: Find Inactive Profiles
**Query:**
```sql
SELECT * FROM artist_profiles ap
JOIN people p ON ap.person_id = p.id
LEFT JOIN auth.users au ON p.auth_user_id = au.id
WHERE au.last_sign_in_at < NOW() - INTERVAL '90 days'
  AND ap.superseded_by IS NULL;
```

---

## Integration with Existing Systems

### Profile Deduplication Playbook
Reference: `/root/vote_app/vote26/DUPLICATE_ARTIST_PROFILE_RESOLUTION_PLAYBOOK.md`

When resolving duplicate profiles:
1. Check `last_sign_in_at` to see which profile is actively used
2. Transfer data **TO** the profile with recent logins
3. Mark old profile as superseded

### Auth System
Reference: `/root/vote_app/vote26/2025-01-07-auth-system-overhaul-log.md`

Auth-first architecture:
- `auth.uid()` → `people.auth_user_id` lookup
- No metadata dependencies
- Person linking via auth-webhook on phone confirmation

---

## Limitations & Considerations

### Current Limitations:
1. **No profile-level login tracking** - Can't tell which specific profile was used during a login session
2. **Shared timestamp** - All profiles for a person show the same login time
3. **No login history** - Only stores most recent login, not historical pattern
4. **No session duration** - Can't tell how long they stayed logged in

### Future Enhancements:
1. **Profile access log** - Track which profile is accessed in each session
2. **Login history table** - Store last N logins per person
3. **Session analytics** - Duration, pages visited, actions taken per session
4. **Profile switching events** - Log when users switch between profiles

---

## Next Steps

### For Immediate UI Implementation:

1. **Add "Last Login" Display:**
   - Use the SQL queries above
   - Show "X days ago" format
   - Gray out if never logged in

2. **Add Active Profile Indicator:**
   - Green checkmark for `superseded_by IS NULL`
   - Gray "Superseded" label for merged profiles

3. **Add Multiple Profile Warning:**
   - Count profiles for person
   - Show warning if > 1 active profile
   - Link to profile management

### For Database Functions (Optional):

```bash
# Deploy the functions if you want reusable DB functions
PGPASSWORD='6kEtvU9n0KhTVr5' psql \
  -h db.xsqdkubgyqwpyvfltnrf.supabase.co \
  -p 5432 -d postgres -U postgres \
  -f /tmp/profile_login_analysis.sql
```

---

## Example Implementation Code

### React Component (Artist Portal)

```javascript
import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

function ProfileLoginStatus({ profileId }) {
  const [loginInfo, setLoginInfo] = useState(null);

  useEffect(() => {
    async function fetchLoginInfo() {
      const { data, error } = await supabase
        .from('artist_profiles')
        .select(`
          id,
          entry_id,
          name,
          superseded_by,
          person:people!inner (
            auth_user_id,
            auth:auth.users (
              last_sign_in_at
            )
          )
        `)
        .eq('id', profileId)
        .single();

      if (data) {
        const lastLogin = data.person?.auth?.last_sign_in_at;
        const daysAgo = lastLogin
          ? Math.floor((Date.now() - new Date(lastLogin)) / (1000 * 60 * 60 * 24))
          : null;

        setLoginInfo({
          lastLogin,
          daysAgo,
          isActive: !data.superseded_by,
          hasLogin: !!data.person?.auth_user_id
        });
      }
    }

    fetchLoginInfo();
  }, [profileId]);

  if (!loginInfo) return null;

  return (
    <div className="profile-status">
      <div className="status-badge">
        {loginInfo.isActive ? '✓ Active' : '⊘ Superseded'}
      </div>
      {loginInfo.hasLogin && loginInfo.lastLogin && (
        <div className="last-login">
          Last login: {loginInfo.daysAgo === 0
            ? 'Today'
            : `${loginInfo.daysAgo} days ago`}
        </div>
      )}
      {!loginInfo.hasLogin && (
        <div className="no-login">Never logged in</div>
      )}
    </div>
  );
}
```

---

**Document Version:** 1.0
**Author:** Claude Code Analysis
**Last Updated:** November 4, 2025

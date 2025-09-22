# Stripe Account Transfer Function Documentation

**Date:** September 18, 2025
**Author:** Claude Code
**Migration File:** `20250918_create_transfer_stripe_account_function.sql`

## Overview

RPC functions to safely transfer Stripe payment accounts between duplicate artist profiles while preserving data integrity and event history.

## Functions

### `transfer_stripe_account(source_profile_id, target_profile_id, preserve_source_account, dry_run)`

Transfers a Stripe payment account from one artist profile to another.

**Parameters:**
- `source_profile_id` (uuid) - Profile containing the Stripe account to transfer
- `target_profile_id` (uuid) - Profile to receive the Stripe account
- `preserve_source_account` (boolean, default false) - If true, copies account; if false, moves it
- `dry_run` (boolean, default true) - If true, simulates the transfer without making changes

**Returns:** JSONB with detailed transfer log and success status

**Example Usage:**
```sql
-- Dry run to see what would happen
SELECT transfer_stripe_account(
    'source-uuid'::uuid,
    'target-uuid'::uuid,
    false,  -- replace existing account on target
    true    -- dry run
);

-- Execute the transfer
SELECT transfer_stripe_account(
    'source-uuid'::uuid,
    'target-uuid'::uuid,
    false,  -- replace existing account on target
    false   -- execute for real
);
```

### `find_duplicate_stripe_accounts(artist_email)`

Analyzes all profiles for a given email address to identify duplicate Stripe accounts.

**Parameters:**
- `artist_email` (text) - Email address to search for

**Returns:** JSONB array with profile analysis including data counts and Stripe account details

**Example Usage:**
```sql
SELECT find_duplicate_stripe_accounts('artist@example.com');
```

## Key Features

- **Safe Transfer:** Validates profiles exist before transfer
- **Conflict Resolution:** Handles existing Stripe accounts on target profile
- **Audit Trail:** Detailed logging of all actions performed
- **Dry Run Mode:** Test transfers without making changes
- **Primary Profile Update:** Automatically sets target as primary profile
- **Data Preservation:** Maintains all payment account metadata

## Real-World Case Study: CeeCee Profile Consolidation

### Background (September 18, 2025)

**Problem:** Artist "CeeCee" (colorfullyweird0@gmail.com) had three duplicate profiles causing authentication and payment issues:

1. **Profile A** (`0b855f7f`, Entry 132757, 2022): 18 applications, no Stripe, no auth
2. **Profile B** (`066214c7`, Entry 128375, 2025-07): 16 art pieces, 18 events, old Stripe account
3. **Profile C** (`4eadb593`, Entry 310428, 2025-09): new Stripe account, authentication, marked primary

**Issue:** CeeCee wasn't appearing in payment admin panel because authentication was on a different profile than her event history.

### Why Data Migration Was Rejected

Initially considered moving all data to the authenticated profile, but comprehensive database analysis revealed critical risks:

#### **Event Integrity Dependencies**
- **16 art pieces** tied to Entry ID 128375 in event displays
- **Event websites** expect specific entry_id for auction/voting systems
- **Historical URLs** and cached references would break
- **Display systems** would show wrong artist attribution

#### **Complex Foreign Key Web**
Database search revealed the active profile UUID appeared in:
- 16 art records (core business data)
- 14 event_artists records
- Active Stripe account with `acct_1S8lnZBtJhPNb4b7`
- 3 applications + 2 confirmations + 2 invitations
- Processing messages in queue system
- Email logs with sent confirmations

#### **Financial System Risks**
- Active payment processing could break
- Stripe webhook dependencies on specific UUIDs
- Payment reconciliation systems tied to profile IDs

### Solution: Authentication Fix + Stripe Transfer

**Safer approach:** Keep event data where it is, fix authentication and payment on the active profile.

**Steps Executed:**
1. **Transferred newer Stripe account** from authenticated profile to active profile using `transfer_stripe_account()`
2. **Updated authentication** by changing active profile's `person_id` to authenticated person
3. **Preserved all event/art history** under original Entry ID 128375

### Critical Technical Lessons

#### **Entry ID Significance**
- Entry IDs are **display identifiers** in event systems
- Moving art between entry IDs breaks event display integrity
- Always preserve entry_id when dealing with artists who have participated in events

#### **UUID vs Entry ID Dependencies**
- **UUIDs:** Internal database foreign keys, can be updated with proper migration
- **Entry IDs:** External display references, much harder to change safely
- Profile consolidation should prioritize preserving entry_id of active profiles

#### **Authentication Architecture**
- Authentication flows through `artist_profiles.person_id → people.auth_user_id`
- Simplest auth fix is updating `person_id` rather than moving data
- `set_primary_profile_at` timestamp indicates primary profile designation

#### **Stripe Account Dependencies**
- Multiple Stripe accounts can exist for same artist (when setup done multiple times)
- Payment admin functions expect Stripe account on profile with recent event participation
- Safe to transfer Stripe accounts between profiles using proper RPC functions

### Database Schema Notes

**Key Tables for Profile Consolidation:**
- `artist_profiles` - Core profile data with entry_id and person_id
- `artist_global_payments` - Stripe account linkage
- `people` - Authentication and contact info with auth_user_id
- `art` - Artwork records tied to profile UUID and events
- `round_contestants` - Event participation records

**Profile Linking Fields:**
- `artist_profiles.person_id` - Links to people table for auth
- `artist_profiles.set_primary_profile_at` - Primary profile timestamp
- `artist_profile_aliases` - Designed for profile consolidation (61k+ records)

### Recommendations for Future Cases

#### **Before Moving Any Data:**
1. Run comprehensive UUID search across entire database
2. Identify all foreign key relationships (documented and undocumented)
3. Check for entry_id dependencies in event systems
4. Verify no active payment processing on source profiles

#### **Preferred Consolidation Strategy:**
1. **Identify most active profile** (most events/art)
2. **Fix authentication** on active profile via person_id update
3. **Transfer payment accounts** to active profile using RPC functions
4. **Leave event/art data** where it is to preserve display integrity
5. **Use aliases system** for administrative consolidation if needed

#### **Red Flags - When NOT to Move Data:**
- Profile has participated in events (art records exist)
- Active payment processing in queue
- External URLs or cached references exist
- Event display systems depend on specific entry_ids

### Function Usage in CeeCee Case

```sql
-- Analysis
SELECT find_duplicate_stripe_accounts('colorfullyweird0@gmail.com');

-- Transfer (dry run first)
SELECT transfer_stripe_account(
    '4eadb593-4dd2-4051-ae02-9380df186508'::uuid,  -- source (new profile with auth)
    '066214c7-48a7-4b89-a72f-9ce085903256'::uuid,  -- target (active profile with events)
    false,  -- replace existing Stripe account
    true    -- dry run
);

-- Execute transfer
SELECT transfer_stripe_account(
    '4eadb593-4dd2-4051-ae02-9380df186508'::uuid,
    '066214c7-48a7-4b89-a72f-9ce085903256'::uuid,
    false,  -- replace existing
    false   -- execute
);

-- Fix authentication
UPDATE artist_profiles
SET person_id = '5d19efd9-a844-4074-817f-f8e5129af755'  -- authenticated person
WHERE id = '066214c7-48a7-4b89-a72f-9ce085903256';      -- active profile
```

### Result

**Final State:** CeeCee now appears in payment admin panel as "READY" with:
- Entry ID 128375 preserved (no broken event displays)
- 16 art pieces and 18 events intact
- Authentication enabled (phone/OTP login works)
- Latest Stripe account transferred and functional
- All historical data preserved

**Functions Available:** Reusable RPC functions for future duplicate profile cases with comprehensive logging and dry-run capabilities.
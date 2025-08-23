# Art Battle Auth System Analysis & Circular Reference Fix
**Date:** August 21, 2025  
**Issue:** 75+ users appearing as "Anonymous" due to circular person record references  
**Root Cause:** Auth webhook failure creating systematic data integrity issues

## System Architecture Overview

### Core Tables & Relationships
- **`auth.users`**: Supabase auth table with phone numbers and JWT metadata
- **`people`**: Art Battle's user profile table with names, phone numbers, and auth links
- **`bids`**: Auction bids linked to person records
- **`votes`**: Event votes linked to person records  
- **`art`**: Artwork table with winner_id references to people table

### Critical Relationships
```sql
auth.users.id <-> people.auth_user_id (1:1 link)
auth.users.raw_user_meta_data->>'person_id' -> people.id (metadata reference)
people.id <- bids.person_id (1:many)
people.id <- votes.person_id (1:many)
people.id <- art.winner_id (1:many)
```

## Authentication Flow & User Experience Sequence

### Normal Registration Flow (QR Scan Users)
1. **QR Code Scan** → Sets `person_id` in auth metadata
2. **Phone Verification** → `link_person_on_phone_verification()` trigger fires
3. **Trigger Logic**:
   - Extracts `person_id` from metadata
   - Links existing person record to auth user
   - Sets `verified = true`
4. **Frontend Display** → Shows person.name from linked record

### Normal Registration Flow (Direct OTP Users)  
1. **Direct Phone Entry** → No initial metadata
2. **Phone Verification** → `link_person_on_phone_verification()` trigger fires
3. **Trigger Logic**:
   - Searches for existing person by phone (multiple format variations)
   - If found: Links existing person to auth user
   - If not found: Creates new person record
   - Updates auth metadata with person_id
4. **Frontend Display** → Shows person.name from linked record

### What Went Wrong (Circular Reference Bug)

#### The Problem Chain
1. **Auth Webhook Fails** (months of failure, affecting 124k+ users)
2. **Users Sign Up** → Get auth records but NO person records created, NO metadata set
3. **Users Access App** → `refresh_auth_metadata()` RPC called as backup
4. **RPC Finds Existing Person** → Sets metadata to point to Person A (has real data)
5. **RPC Permission Fails** → Can't update auth.users (missing SECURITY DEFINER)
6. **Frontend Fallback** → Calls `ensure_person_exists()` 
7. **ensure_person_exists() Works** → Finds Person A and should link it
8. **BUT Auth Trigger Runs** → `link_person_on_phone_verification()` fires on verification
9. **Trigger Logic Flaw** → Only searches for people WHERE `auth_user_id IS NULL`
10. **Person A Already Linked** → Trigger can't find it (has auth_user_id from step 7)
11. **Trigger Creates Person B** → Empty person record, links auth user to it
12. **Result: Circular Reference**
    - Auth user linked to Person B (empty record)
    - Auth metadata points to Person A (has real data)
    - Frontend shows "Anonymous" (uses linked record, not metadata)

#### Why Some Users Were Different
- **Tamsyn Downes**: No metadata, no person link → Simple fix (just link)
- **Liam Downes & 74 others**: Circular reference → Complex fix needed

## Key Database Functions

### `link_person_on_phone_verification()` - The Critical Trigger
**Purpose:** Links person records to auth users when phone is verified  
**Trigger:** Fires on `auth.users` when `phone_confirmed_at` changes from NULL to timestamp

**Original Flaw:**
```sql
WHERE auth_user_id IS NULL  -- This prevented finding already-linked records!
```

**Fixed Version:** 
- Removed `auth_user_id IS NULL` constraint
- Added logic to handle already-linked person records
- Prioritizes records with actual data over empty records
- Handles auth user re-linking when needed

### `ensure_person_exists(p_phone)` 
**Purpose:** Ensure user has a person record, create if needed  
**Logic:**
1. Search for existing person by phone (multiple format variations)
2. If found: Link to current auth user
3. If not found: Create new person record
4. Return person_id

### `refresh_auth_metadata()`
**Purpose:** Read-only function to sync JWT metadata with person data  
**Does NOT create records** - just reads existing data and updates JWT

### `fix_circular_person_links()` - Our Repair Function
**Purpose:** Fix users where metadata person_id differs from linked person_id  
**Logic:**
1. Find auth users with circular references
2. Verify metadata person has real data (not empty)
3. Unlink current empty person record  
4. Link auth user to metadata person record
5. Return mapping for data transfer

## The Complete Fix Process (Aug 21, 2025)

### Step 1: Root Cause Fix
- Updated `link_person_on_phone_verification()` trigger
- Removed problematic `auth_user_id IS NULL` constraint
- Added proper handling of already-linked person records

### Step 2: Data Integrity Repair
- Identified 42 users with circular references
- Mapped old empty person records to real person records
- Transferred all associated data:
  - 13 bids moved from empty to real person records
  - 102 votes moved from empty to real person records  
  - Updated art.winner_id references for auction winners

### Step 3: Cleanup
- Deleted 42 empty person records after data transfer
- Verified users now show real names instead of "Anonymous"

## Critical System Dependencies

### Auth Context (`src/contexts/AuthContext.jsx`)
**Key Logic:**
- `extractPersonFromMetadata()` - Gets person data from JWT metadata
- Fallback calls to `refresh_auth_metadata()` and `ensure_person_exists()`
- Session refresh logic with person metadata sync

### Frontend Display Logic
- Uses `person` object from AuthContext
- If person.name exists → Shows real name
- If person.name empty/null → Shows "Anonymous"

## Phone Number Format Complexities
**Auth Table:** Stores various formats (`15806950664`, `+15806950664`)  
**People Table:** Usually stores with country code (`+15806950664`)  

**Matching Logic Must Handle:**
- `+1` prefixes (North America)
- `+` prefixes (international)  
- Raw numeric formats
- Reverse format matching (strip prefixes for comparison)

## Warning Signs for Future Issues

### Symptoms of Circular References
- Users appear as "Anonymous" despite having account data
- `auth.users.raw_user_meta_data` contains person_id but user shows no name
- Multiple person records with same auth_user_id
- Auth users linked to empty person records while metadata points elsewhere

### Database Queries to Check System Health
```sql
-- Check for circular references
SELECT 
  au.id as auth_user_id,
  (au.raw_user_meta_data->>'person_id')::uuid as metadata_person_id,
  p.id as linked_person_id,
  p.name,
  CASE WHEN (au.raw_user_meta_data->>'person_id')::uuid = p.id 
       THEN 'OK' ELSE 'CIRCULAR_REFERENCE' END as status
FROM auth.users au
JOIN people p ON p.auth_user_id = au.id
WHERE (au.raw_user_meta_data->>'person_id')::uuid IS NOT NULL;

-- Check for duplicate auth links
SELECT auth_user_id, COUNT(*) as person_count 
FROM people 
WHERE auth_user_id IS NOT NULL 
GROUP BY auth_user_id 
HAVING COUNT(*) > 1;

-- Check for unlinked auth users
SELECT COUNT(*) as unlinked_users
FROM auth.users au
LEFT JOIN people p ON p.auth_user_id = au.id
WHERE au.phone_confirmed_at IS NOT NULL 
AND p.id IS NULL;
```

## Recovery Procedures

### For Future Circular Reference Issues
1. **Identify affected users** using health check queries above
2. **Run fix function** (adapt `fix_circular_person_links()` logic)
3. **Transfer associated data** (bids, votes, art winners, etc.)
4. **Clean up empty records** after verifying all data transferred
5. **Update auth triggers** if root cause differs

### For Auth Webhook Failures  
1. **Check webhook endpoint** availability and permissions
2. **Review recent auth users** without person links
3. **Run batch linking process** using `ensure_person_exists()` logic
4. **Verify person metadata sync** with `refresh_auth_metadata()`

## System Robustness Improvements Made

### Trigger Improvements
- `link_person_on_phone_verification()` now handles edge cases better
- Prioritizes records with actual data over empty records
- Gracefully handles auth user re-linking scenarios

### Permission Fixes
- Added `SECURITY DEFINER` to functions that need auth.users access
- Fixed RPC permission issues that contributed to circular references

This documentation should enable rapid diagnosis and fix of similar auth system issues in the future.
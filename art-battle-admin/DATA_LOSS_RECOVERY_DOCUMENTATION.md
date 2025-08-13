# DATA LOSS RECOVERY DOCUMENTATION
## Date: August 12, 2025

### CRITICAL: Recent Work and Changes Made

#### **Edge Function Changes**
1. **File**: `/root/vote_app/vote26/art-battle-admin/supabase/functions/admin-artist-workflow/index.ts`
   - **Purpose**: Admin function to fetch artist workflow data (applications, invitations, confirmations)
   - **Recent Changes**: 
     - Updated to use `event_eid` instead of `event_id` for querying
     - Added artist name lookup via `artist_profiles.entry_id` matching `artist_number`
     - Simplified data structure focusing on: `event_eid`, `artist_number`, `entry_date`
     - Removed privacy fields (bio, phone, email) from responses

2. **Database Tables Modified/Referenced**:
   - `artist_applications` - Uses `event_eid` and `artist_number` fields
   - `artist_invitations` - Uses `event_eid` and `artist_number` fields  
   - `artist_confirmations` - Uses `event_eid` and `artist_number` fields
   - `artist_profiles` - Lookup table using `entry_id` field to match `artist_number`

#### **Frontend Changes**
1. **File**: `/root/vote_app/vote26/art-battle-admin/src/components/EventDetail.jsx`
   - **Lines Modified**: ~308-310
   - **Change**: Updated API call to pass `eventEid` instead of `eventId` to edge function
   - **Purpose**: Align with new backend data structure

#### **Data Structure Expected (Before Loss)**
Based on our testing, AB2900 event should have contained:
- **Applications**: 13 entries with populated `event_eid='AB2900'` and `artist_number` fields
- **Invitations**: 13 entries with populated `event_eid='AB2900'` and `artist_number` fields
- **Confirmations**: 10 entries with populated `event_eid='AB2900'` and `artist_number` fields

#### **Database Schema Dependencies**
1. **artist_applications table**:
   - `event_eid` (text) - Should contain values like 'AB2900'
   - `artist_number` (text) - Contains artist entry IDs
   - `entry_date` (timestamp) - Entry submission date
   - `application_status` (text) - Status field

2. **artist_invitations table**:
   - `event_eid` (text) - Should contain values like 'AB2900'
   - `artist_number` (text) - Contains artist entry IDs
   - `entry_date` (timestamp) - Invitation date
   - `status` (text) - Status field

3. **artist_confirmations table**:
   - `event_eid` (text) - Should contain values like 'AB2900'
   - `artist_number` (text) - Contains artist entry IDs
   - `confirmation_date` (timestamp) - Confirmation date
   - `confirmation_status` (text) - Status field

4. **artist_profiles table**:
   - `entry_id` (integer) - Matches `artist_number` from other tables
   - `name` (text) - Artist name for display
   - `city_text` (text) - Location info
   - `instagram` (text) - Social media handle

#### **Function Logic Flow**
1. Accept `eventEid` parameter (e.g., 'AB2900')
2. Query each workflow table filtering by `event_eid`
3. Collect all unique `artist_number` values
4. Lookup artist names from `artist_profiles` where `entry_id` matches `artist_number`
5. Transform and return simplified data structure

#### **Last Working State**
- Edge function was successfully deployed multiple times
- Was returning correct counts: 13 applications, 13 invitations, 10 confirmations for AB2900
- Artist name lookups were working via `entry_id` matching

#### **Current Issue Detected**
- All queries now return 0 results for AB2900
- Database queries show no records with populated `event_eid` fields
- This indicates either:
  - Data deletion/corruption in the workflow tables
  - Schema changes that removed/nullified the `event_eid` columns
  - Data migration failure

#### **Recovery Actions Needed**
1. **Immediate**: Check if data exists in backup tables or alternative locations
2. **Verify**: Database schema integrity for all artist workflow tables
3. **Restore**: `event_eid` and `artist_number` field population from backup source
4. **Test**: Edge function functionality once data is restored

#### **Files Requiring Attention Post-Recovery**
- Edge function may need rollback if data structure changed
- Frontend EventDetail component may need adjustment
- Any RLS policies related to artist workflow tables

#### **Contact Information**
- Claude Code session on August 12, 2025
- All changes documented in git history
- Edge function deployments logged in Supabase dashboard
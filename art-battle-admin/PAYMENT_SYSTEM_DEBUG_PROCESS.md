# Payment System Debug Process Documentation
**Date:** September 23, 2025
**Issue:** Admin payment interface showing wrong artist counts (15 instead of 300+)
**Status:** IN PROGRESS - Database functions work, Edge functions fail

## Problem Summary
The art-battle-admin payment interface was showing incorrect data:
- **Expected:** 300+ recent contestants in 90 days
- **Actual:** 15 recent contestants
- **Root Issue:** Edge functions return different data than database functions

## Original System Requirements
Based on previous conversation analysis, the payment system needs:

### 5 Core Categories of Artists:
1. **Recent Contestants** - Artists who participated in events within last X days
2. **Artists Owed Money** - Artists with positive balances (art sales > payments)
3. **Artists Ready to Pay** - Owed artists with completed payment setup
4. **Payment Attempts** - Artists with any payment history/attempts
5. **Completed Payments** - Artists with successful payments

### Key Data Sources:
- `artist_profiles` - Basic artist info (24,744 total artists)
- `round_contestants` - Event participation (17,488 total records)
- `rounds` + `events` - Event details and dates
- `art` - Art sales for balance calculations
- `artist_payments` - Payment history and status
- `artist_global_payments` - Payment account setup status

## Sequential Debug Process Completed

### Step 1: Database Query Validation ✅
**Direct SQL queries work correctly:**
```sql
-- Returns 429 recent contestants in 90 days
SELECT COUNT(DISTINCT rc.artist_id)
FROM round_contestants rc
JOIN rounds r ON rc.round_id = r.id
JOIN events e ON r.event_id = e.id
WHERE e.event_start_datetime >= NOW() - INTERVAL '90 days';
```

### Step 2: Simple Database Functions ✅
**Created and tested working functions:**
- `get_recent_contestants_count(days_back)` → Returns 429 ✅
- `get_recent_contestants_list(days_back)` → Returns 429 rows ✅
- `get_simple_admin_payments_data(days_back)` → Returns 442 recent contestants ✅

### Step 3: Simple Edge Function Test ✅
**Created `test-recent-count` edge function:**
- ✅ Returns 429 recent contestants correctly
- ✅ Proves edge functions CAN work

### Step 4: Complex Edge Function Issues ❌
**All complex edge functions return wrong data:**
- `admin-artist-payments-list` → 15 recent contestants ❌
- `simple-admin-payments` → 15 recent contestants ❌
- `fresh-admin-payments` → 15 recent contestants ❌
- `echo-admin-data` → 15 recent contestants ❌

### Step 5: Root Cause Identified ⚠️
**Database function vs Edge function discrepancy:**
- Direct database call: `get_simple_admin_payments_data(90)` → 442 recent contestants
- Edge function RPC call: same function → 15 recent contestants
- **Issue:** Database function behaves differently when called via Supabase RPC vs direct SQL

## Current Status

### What Works ✅
1. **Direct SQL queries** return correct numbers (429-442 recent contestants)
2. **Database functions** return correct numbers when called directly
3. **Simple edge functions** can call simple database functions correctly

### What Doesn't Work ❌
1. **Complex database function** returns different results via RPC (15 vs 442)
2. **All admin edge functions** show incorrect data
3. **Frontend** receives incorrect data

### Latest Function Created
`get_artists_owed_money()` - Simple function to show artists owed money (166 artists)

## Next Steps Required

### Immediate (Before Context Loss):
1. **Test `get_artists_owed_money()` via edge function** to isolate if issue is function-specific
2. **Create working edge function** using only proven simple approach
3. **Update frontend** to use working edge function

### Complete System Implementation:
1. **Payment Account Status Integration**
   - Connect to `artist_global_payments` table
   - Map Stripe integration status
   - Handle payment setup workflows

2. **Art Sales Balance Calculation**
   - Verify art sales commission calculation (50% to artist)
   - Ensure proper currency handling
   - Account for different auction types

3. **Payment Processing Integration**
   - Connect to existing Stripe payment functions
   - Handle payment status updates
   - Implement retry logic for failed payments

4. **Admin Interface Features**
   - Bulk payment processing
   - Payment status filtering and search
   - Export capabilities for accounting
   - Manual payment recording

5. **Security and Permissions**
   - Verify ABHQ super admin access control
   - Audit trail for payment actions
   - Rate limiting for bulk operations

## Critical Files and Locations

### Database Functions:
- `/root/vote_app/vote26/migrations/20250923_simple_recent_count.sql`
- `/root/vote_app/vote26/migrations/20250923_simple_recent_list.sql`
- `/root/vote_app/vote26/migrations/20250923_simple_admin_payments.sql`
- `/root/vote_app/vote26/migrations/20250923_simple_owed_money.sql`

### Edge Functions:
- `/root/vote_app/vote26/supabase/functions/test-recent-count/index.ts` ✅ WORKING
- `/root/vote_app/vote26/supabase/functions/admin-artist-payments-list/index.ts` ❌ BROKEN
- `/root/vote_app/vote26/supabase/functions/echo-admin-data/index.ts` ❌ BROKEN

### Frontend:
- `/root/vote_app/vote26/art-battle-admin/src/components/PaymentsAdminTabbed.jsx`

## Key Insights Discovered

1. **SECURITY DEFINER works** - Functions can access data with proper permissions
2. **Simple functions work** - Complex CTEs may have context issues
3. **RPC vs Direct SQL** - Supabase RPC calls behave differently than direct SQL
4. **Data exists** - 24,744 artists, 17,488 round contestants, hundreds owed money
5. **Edge function architecture** - Service role client can call database functions

## Warning Signs for Future
- If edge functions return small numbers (15-50) instead of hundreds, check RPC context
- Always test database functions directly before building edge functions
- SECURITY DEFINER is required but may not be sufficient
- PostgREST/Supabase RPC may have different execution context than direct SQL

---
**Next Session:** Test simple owed money function via edge function to confirm pattern, then build complete working solution.
# QR Security Investigation - Edge Function 500 Errors

**Date:** 2025-08-09  
**Event:** AB2900 - Omaha Live Event  
**Issue:** validate-qr-scan edge function returning 500 errors with rate limiting enabled

## Problem Summary

The `validate-qr-scan` edge function was causing 500 errors when rate limiting and IP blocking security features were enabled. The function worked perfectly before adding these security RPC calls.

## Investigation Results

### ✅ What We Ruled Out

1. **RLS Permissions** - NOT the issue
   - Tables `blocked_ips` and `qr_validation_attempts` have RLS enabled
   - Policies correctly allow `service_role` full access: `{service_role} | ALL`
   - Functions have proper permissions: `service_role=X/postgres`

2. **Function Existence** - NOT the issue
   - All 4 functions exist and are accessible:
     - `is_ip_blocked()`
     - `check_rate_limit()` 
     - `block_ip_address()`
     - `record_validation_attempt()`

3. **SQL Syntax** - NOT the issue
   - Functions execute perfectly when called directly from PostgreSQL
   - All functions are `SECURITY DEFINER` with proper ownership

4. **Database Connectivity** - NOT the issue
   - Other edge function operations (QR lookup, person creation) work fine

### ❌ Most Likely Causes

1. **Supabase Client Library Issues**
   - Edge function using `@supabase/supabase-js@2.39.3`
   - Potential version mismatch or RPC call incompatibility
   - Different execution context than direct SQL calls

2. **Parameter Type Casting**
   - TypeScript to SQL parameter conversion issues
   - RPC calls from edge functions may handle types differently than direct SQL

3. **Edge Function Environment**
   - Deno runtime limitations or timeouts
   - Different error handling in edge function vs direct database access
   - Network/execution context differences

4. **Exception Handling**
   - RPC calls throwing uncaught exceptions
   - Error propagation issues in edge function try/catch blocks

## Working vs Broken Versions

**Working Version (commit `a580140`):**
- Simple QR validation without security features
- No RPC calls to security functions
- Clean, minimal implementation

**Broken Version (commit `d3f2574`):**
- Added rate limiting with 4 RPC function calls
- Security checks before core validation logic
- Complex error handling for security features

## Resolution

**Immediate Fix:** Reverted to working version `a580140` for live event
**Status:** QR scanning operational for AB2900 - Omaha

## Future Security Enhancement Plan

To re-enable security features:

1. **Test RPC calls individually** in edge function environment
2. **Add explicit type casting** for all parameters
3. **Implement gradual rollout** - test one security function at a time
4. **Add detailed logging** to identify exact failure point
5. **Consider alternative implementation** - direct SQL queries vs RPC calls

## Security Functions Details

```sql
-- Functions exist and work in PostgreSQL:
SELECT is_ip_blocked('127.0.0.1');           -- Returns: false
SELECT check_rate_limit('127.0.0.1', 5, 10); -- Returns: false
SELECT record_validation_attempt(...);        -- Executes successfully
```

**Permissions:** All functions have `service_role=X/postgres` access
**Security:** All functions are `SECURITY DEFINER` owned by `postgres`
**Tables:** Both `blocked_ips` and `qr_validation_attempts` accessible to service role

## Lessons Learned

1. **Always deploy edge function changes** - local file edits don't auto-deploy
2. **Test in edge function environment** - PostgreSQL success ≠ edge function success
3. **Have rollback plan** - git history saved the live event
4. **Edge functions have different execution context** than direct database access
5. **RPC calls are not equivalent** to direct SQL execution in all environments

## Next Steps (Post-Event)

- [ ] Create isolated test edge function for security RPC calls
- [ ] Implement parameter logging for troubleshooting
- [ ] Test with different Supabase client versions
- [ ] Consider replacing RPC calls with direct SQL queries
- [ ] Add comprehensive error messages for better debugging
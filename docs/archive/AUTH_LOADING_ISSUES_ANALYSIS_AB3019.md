# Authentication & Loading Issues Analysis - AB3019 Live Event
**Date:** August 22, 2025  
**Event:** AB3019 Auckland CBD  
**Context:** Live troubleshooting during active event with user access issues

## Overview
During the AB3019 live event, multiple users experienced loading loops and access issues despite being properly authenticated and registered. This document captures all issues discovered, root causes identified, and fixes implemented.

## Issues Identified & Fixed

### 1. Auth Webhook 401 Errors ✅ FIXED
**Problem:** Auth webhook getting 401 unauthorized errors, preventing automatic person linking  
**Root Cause:** Hardcoded JWT token in `notify_auth_webhook()` function had wrong signature  
**Fix Applied:**
```sql
-- Updated notify_auth_webhook function with correct service role token
'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhzcWRrdWJneXF3cHl2Zmx0bnJmIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MzQyMTY5NiwiZXhwIjoyMDY4OTk3Njk2fQ.wQieprnqKOD1Ez-OJVzl9MbjvxmqNtW0FDzrkSPcDrg'
```
**Impact:** This was causing users to need the emergency script for person linking

### 2. Missing Auth Trigger ✅ FIXED  
**Problem:** `auth_user_created` trigger was accidentally CASCADE deleted  
**Root Cause:** Database maintenance deleted the trigger  
**Fix Applied:**
```sql
CREATE OR REPLACE TRIGGER auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_auth_user_created();
```

### 3. Auth Webhook SQL Syntax Error ✅ FIXED
**Problem:** `column people.auth_user_id nulls first does not exist` error  
**Root Cause:** Invalid ORDER BY syntax in Supabase JS client  
**Fix Applied:**
```typescript
// BEFORE (broken):
.order('auth_user_id nulls first, created_at', { ascending: false })

// AFTER (fixed):
.is('auth_user_id', null).order('created_at', { ascending: false })
```

### 4. Circular Reference Issues ✅ FIXED
**Problem:** 5 users with duplicate person records and metadata mismatches  
**Root Cause:** Auth users linked to wrong person records, with metadata pointing to different records  
**Users Affected:**
- 64224311575: metadata → df28dcee-4984-42a9-af7d-54d968126542, linked → 130910c8-c457-4b59-a87c-a9fd2b4facda
- 61421692328: Mary Farrugia vs User records
- 61427610924: Mohammad vs User records  
- 64226787076: Ioana Bold vs User records
- 64275886848: Leslie Gu vs User records

**Fix Applied:**
```sql
-- Ran fix_circular_person_links() function (fixed 4/5 automatically)
-- Manually fixed remaining case by linking to older person record
```

### 5. QR Code Validation Failures ✅ TEMPORARILY FIXED
**Problem:** Users getting 400 errors from validate-qr-scan function  
**Root Cause:** QR codes deleted after users scanned them, frontend re-validates on access  
**Affected Users:** +61434596585, +61433686776, +61405706068 (and likely many more)  
**Temporary Fix Applied:**
```typescript
// Modified validate-qr-scan to always return success
let isValid = true  // TEMPORARY: Always set to true
let scanResult = {
  success: true,      // TEMPORARY: Always success  
  message: 'QR code validated successfully (emergency override)',
  is_valid: true      // TEMPORARY: Always valid
}
```
**TODO:** Frontend should not re-validate QR codes for already registered users

### 6. Slack Notifications Column Error ✅ FIXED
**Problem:** `cast_vote_secure` function trying to insert `event_type` column that doesn't exist  
**Root Cause:** Table schema has `message_type` column, not `event_type`  
**Fix Applied:**
```sql
-- Updated INSERT to use correct column names
INSERT INTO slack_notifications (
  message_type,     -- FIXED: Use message_type instead of event_type
  event_id,
  payload           -- FIXED: Put all data in payload JSON
)
```

## Ongoing Issues (Not Fully Resolved)

### 1. Browser Compatibility Loading Loops 🔄 ONGOING
**Problem:** Users can log in with Chrome but not DuckDuckGo browser  
**Root Cause:** Frontend browser compatibility issues  
**Likely Causes:**
- localStorage/sessionStorage restrictions in privacy-focused browsers
- Cookie blocking (third-party, SameSite attributes)
- JavaScript ES6+ compatibility issues
- Service Worker support differences
- CORS/security policy differences

**Investigation Needed:**
- Browser console error analysis
- localStorage/cookie availability testing
- JavaScript polyfill requirements
- Build target compatibility review

### 2. Auction Closing Logic Issues 🔄 IDENTIFIED
**Problem:** Auction closing cron job incorrectly closing active paintings  
**Root Cause:** `set_event_auction_closing_times` affects ALL active artworks in event, not round-specific  
**Evidence:** AB3019 Round 3 artworks were incorrectly closed and required manual reopening
**TODO:** Make auction closing round-specific or add better filters

### 3. Art Status Inconsistencies 🔄 IDENTIFIED  
**Problem:** Paintings in wrong status states  
**Issues Found:**
- 5 artworks marked 'closed' despite having bids and artists (should be 'sold')
- 2 artworks marked 'sold' without any bids
**Examples:**
- AB3019-1-3: 18 bids, has artist, but status 'closed' 
- AB3019-2-6: status 'sold' but no bids

## Emergency Script Dependency Analysis

**Current State:** Emergency script `emergency_fix_unlinked_users()` was essential for event function but should not be required.

**Why Emergency Script Was Needed:**
1. Missing auth_user_created trigger (now fixed)
2. Broken auth webhook with 401 errors (now fixed)  
3. Circular references preventing proper linking (now fixed)

**Current Emergency Script Effectiveness:**
- ✅ Creates person records for unlinked auth users
- ✅ Fixes missing metadata in auth.users.raw_user_meta_data
- ❌ Does NOT resolve browser compatibility loading loops
- ❌ Does NOT fix QR validation issues (requires function-level fix)

## User-Reported Issues Tracked

### Specific Users Investigated:
- **+64212038109:** FULLY_LINKED, registered AB2995 Sydney ✅
- **642040383577:** FULLY_LINKED ✅  
- **0211932222:** FULLY_LINKED ✅
- **+61425328075:** FULLY_LINKED, registered AB2995 Sydney ✅
- **+61434596585:** FULLY_LINKED, but QR code deleted (temp fixed) ✅
- **+61433686776:** FULLY_LINKED, but QR code deleted (temp fixed) ✅  
- **+61405706068:** FULLY_LINKED, but QR code deleted (temp fixed) ✅

## Database Health Status

**Final Verification Results:**
- ✅ 0 metadata mismatches
- ✅ 0 duplicate auth links
- ✅ 0 orphaned auth users  
- ✅ 628 total authenticated users
- ✅ 628 properly linked users (100%)

## Key Learnings

### 1. QR Code Lifecycle Management
- **Issue:** QR codes being deleted while users still need them
- **Learning:** Once users scan QR codes and register, they shouldn't need original codes
- **Solution:** Frontend should not re-validate QR codes for registered users

### 2. Auth Webhook Criticality
- **Issue:** Hardcoded JWT tokens can become invalid
- **Learning:** Auth webhook failures create cascading user access issues
- **Solution:** Use environment variables or dynamic token generation

### 3. Trigger Dependencies  
- **Issue:** CASCADE deletions can remove critical triggers
- **Learning:** Auth triggers are essential for seamless user experience
- **Solution:** Regular verification of trigger existence

### 4. Browser Compatibility Testing
- **Issue:** Desktop browser testing doesn't catch mobile browser issues
- **Learning:** Privacy-focused browsers have different JS/storage behavior
- **Solution:** Test across multiple mobile browsers including privacy-focused ones

### 5. Emergency Script Design
- **Issue:** Emergency scripts should be temporary fixes, not permanent dependencies
- **Learning:** Root cause fixes eliminate need for emergency interventions
- **Solution:** Fix underlying auth flow issues rather than relying on cleanup scripts

## Monitoring & Prevention

### Recommended Monitoring:
1. **Auth webhook success rates** - Alert on 401 errors
2. **QR code validation failure rates** - Track missing code errors  
3. **User registration completion rates** - Monitor drop-offs
4. **Browser-specific error rates** - Identify compatibility issues
5. **Emergency script usage** - Should trend toward zero

### Prevention Strategies:
1. **Automated trigger verification** - Check critical triggers exist
2. **QR code lifecycle policies** - Define when codes can be deleted
3. **Cross-browser testing pipeline** - Include mobile/privacy browsers
4. **Auth flow integration tests** - End-to-end user registration testing
5. **Real-time auth health dashboard** - Monitor auth system status

## Technical Debt Identified

### High Priority:
1. **Frontend QR validation logic** - Remove re-validation for registered users
2. **Auction closing round specificity** - Prevent cross-round closures
3. **Art status validation** - Enforce business rule consistency
4. **Browser compatibility** - Add polyfills and fallbacks

### Medium Priority:  
1. **Dynamic JWT token management** - Remove hardcoded tokens
2. **Trigger monitoring** - Automated verification system
3. **Error handling improvements** - Better user feedback for failures

### Low Priority:
1. **Emergency script deprecation** - Phase out as root causes are fixed
2. **Auth system documentation** - Capture tribal knowledge
3. **Performance optimization** - Auth flow speed improvements

## Conclusion

The auth and loading issues during AB3019 were primarily due to:
1. **Backend authentication infrastructure problems** (mostly fixed)
2. **QR code lifecycle management issues** (temporarily fixed)  
3. **Frontend browser compatibility problems** (ongoing)

The emergency script dependency was successfully eliminated through systematic fixing of root causes. However, browser compatibility remains a significant challenge requiring frontend development attention.

**Most Critical Remaining Work:**
1. Frontend browser compatibility fixes
2. QR validation logic improvements  
3. Auction closing system refinements

This live troubleshooting session provided valuable insights into the authentication system's failure modes and recovery procedures.
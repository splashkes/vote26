# Auth Testing Tools Guide

Quick reference for diagnosing admin authentication issues in the Art Battle system.

## Prerequisites

```bash
cd /root/vote_app/vote26
npm install @supabase/supabase-js puppeteer  # Already installed
```

## Tool 1: Quick Auth Test

**Purpose**: Fast credential validation
**File**: `quick-auth-test.js`

### Usage
```bash
node quick-auth-test.js email@domain.com password
```

### Examples
```bash
# Test a user
node quick-auth-test.js peter@artbattle.com 1JphAHFDV0o594g

# Expected output:
🔐 Testing: peter@artbattle.com
✅ SUCCESS: peter@artbattle.com

# Failed login:
🔐 Testing: baduser@test.com wrongpass
❌ FAILED: Invalid login credentials
```

### When to use:
- Quick credential verification
- Testing after password reset
- Confirming user exists and can authenticate

---

## Tool 2: Deep User Analysis

**Purpose**: Comprehensive account diagnostics  
**File**: `deep-user-test.js`

### Usage
```bash
node deep-user-test.js email@domain.com password
```

### What it checks:
1. ✅ **Authentication** - Can user log in with Supabase?
2. ✅ **Admin Linkage** - Is user properly linked in `abhq_admin_users`?
3. ✅ **Database Access** - Can user read admin tables?
4. ✅ **Permissions** - What admin level/access does user have?
5. ✅ **Edge Functions** - Can user call admin functions?

### Sample Output
```
🔍 DEEP ANALYSIS FOR: peter@artbattle.com

1️⃣ AUTHENTICATION TEST
✅ Auth successful
   User ID: f80f75f6-70f3-4bf4-9546-e5846d85cea9
   Email: peter@artbattle.com
   Created: 2025-08-28T19:59:41.19831Z
   Last login: 2025-08-28T20:02:52.395534261Z
   Email confirmed: Yes

2️⃣ ADMIN USER LINKAGE CHECK
✅ Found in admin users table
   Admin ID: 196f2056-ea09-47d2-aac1-e4946ca659f5
   Auth User ID: f80f75f6-70f3-4bf4-9546-e5846d85cea9
   Active: Yes
   Level: producer
   Linked correctly: Yes

3️⃣ ADMIN FUNCTION ACCESS TEST
❌ Admin function failed: Could not find the function public.get_user_admin_level

4️⃣ ADMIN TABLE ACCESS TEST
✅ Events table access works
   Found 3 events

5️⃣ PROTECTED ADMIN DATA ACCESS TEST
✅ Admin users table access works
   Can see 3 admin users
   - hello@artbattle.com (producer)
   - login@artbattle.com (super)
   - simon@artbattle.com (producer)

6️⃣ EDGE FUNCTION CALL TEST
❌ Edge function failed: Edge Function returned a non-2xx status code
```

### When to use:
- User can't access admin functions despite login
- Investigating permission issues
- Verifying account setup is complete
- Checking database connectivity

---

## Troubleshooting Flowchart

```
User reports login issues
         ↓
1. Try quick-auth-test.js
         ↓
    ✅ SUCCESS?
         ↓
2. Try deep-user-test.js
         ↓
Check each section:
- Auth ✅ but Linkage ❌ → Fix abhq_admin_users record
- Auth ✅ but Access ❌ → Check RLS policies
- Auth ✅ but Functions ❌ → Check edge function deployment
         ↓
All ✅ → Issue is likely in frontend/browser
```

## Common Issues & Solutions

### ❌ "Invalid login credentials"
- **Cause**: Wrong password or user doesn't exist
- **Fix**: Verify email exists in `auth.users`, reset password if needed

### ❌ "Not found in abhq_admin_users"
- **Cause**: User exists in auth but not linked to admin system
- **Fix**: Create record in `abhq_admin_users` table with proper `user_id` link

### ❌ "Linked correctly: No"
- **Cause**: `abhq_admin_users.user_id` doesn't match `auth.users.id`
- **Fix**: Update the `user_id` field in `abhq_admin_users`

### ❌ "Admin users table access failed"
- **Cause**: RLS policies blocking access or user not active
- **Fix**: Check `active = true` and admin level permissions

### ✅ "Auth successful but can't use admin interface"
- **Cause**: Frontend issue, not auth issue
- **Fix**: Check browser console, clear localStorage, verify admin app deployment

## Quick Database Queries

### Check if user exists in auth:
```sql
SELECT id, email, created_at FROM auth.users WHERE email = 'user@domain.com';
```

### Check admin user linkage:
```sql
SELECT a.id, a.email, a.user_id, a.active, a.level, u.email as auth_email 
FROM abhq_admin_users a 
LEFT JOIN auth.users u ON a.user_id = u.id 
WHERE a.email = 'user@domain.com';
```

### Create admin user link:
```sql
INSERT INTO abhq_admin_users (id, email, user_id, active, level) 
VALUES (gen_random_uuid(), 'user@domain.com', 'USER_ID_FROM_AUTH_USERS', true, 'producer');
```

## Pro Tips

1. **Always test credentials first** - Most "system" issues are actually credential issues
2. **Use deep analysis for new users** - Ensures complete setup
3. **Keep known good credentials** - For system testing
4. **Check browser first** - Clear localStorage/cookies before blaming backend
5. **Document working credentials** - For future testing

## Current Working Test Credentials (as of 2025-08-28)

```
login@artbattle.com / sokkij-xyvQy4-rakgex
jenn.illencreative@gmail.com / 1JphAHFDV0o594g  
peter@artbattle.com / 1JphAHFDV0o594g
```
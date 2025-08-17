# CRITICAL: Art Battle Vote Authentication & Person Linking Architecture

## ⚠️ ESSENTIAL READING - DO NOT MODIFY WITHOUT UNDERSTANDING THIS DOCUMENT

**Date Created:** August 17, 2025  
**Critical System:** User Authentication & Person Record Linking  
**Status:** PRODUCTION - LIVE SYSTEM

---

## 🚨 PROBLEM HISTORY: What We Learned the Hard Way

### Original Problem (August 16-17, 2025)
Users were getting **stuck in "Validating QR code" state** and experiencing **cyclic loading loops** during QR code scanning at live Art Battle events in Seattle.

### Root Causes Discovered:

#### 1. **OTP Timing Gap Issue**
- Users would sign up via QR code → get redirected to OTP verification
- **Critical Gap:** OTP verification and person record linking happened separately
- **Result:** Users had auth records but no linked person records → 500 errors in QR validation

#### 2. **Database Trigger Interference** 
- **CRITICAL LESSON:** Any trigger that modifies `auth.users` table BREAKS Supabase OTP verification
- Multiple triggers were interfering with the OTP confirmation process
- Users would get "expired token" errors even when entering codes quickly

#### 3. **Metadata Sync Conflicts**
- Triggers updating `raw_user_meta_data` during user creation caused auth flow conflicts
- Even "safe" triggers running on BEFORE INSERT/UPDATE interfered with Supabase internals

---

## 🏗️ CURRENT ARCHITECTURE (WORKING SOLUTION)

### Two Registration Paths:

#### Path 1: QR Code Registration
```
1. User scans QR code
2. System creates auth.users with metadata: {person_id: "existing-person-uuid"}
3. User completes OTP verification
4. validate-qr-scan Edge Function links existing person record to auth user
```

#### Path 2: Direct OTP Registration  
```
1. User signs up directly (no QR code)
2. System creates auth.users (no metadata)
3. User completes OTP verification
4. Database webhook trigger calls auth-webhook Edge Function
5. auth-webhook finds existing person by phone OR creates new person record
```

### Key Components:

#### 1. **validate-qr-scan Edge Function** (`/supabase/functions/validate-qr-scan/index.ts`)
- **Purpose:** Handles QR code validation AND person linking for QR users
- **When Called:** When user scans QR code (frontend calls this)
- **Person Linking Logic:**
  ```typescript
  // Check if already linked
  const existingPerson = await supabase.from('people').select('id').eq('auth_user_id', user.id)
  
  if (existingPerson) {
    // Already linked, use existing
  } else {
    const personIdFromMeta = user.user_metadata?.person_id
    if (personIdFromMeta) {
      // QR user: Link to existing person from metadata
      await supabase.from('people').update({auth_user_id: user.id}).eq('id', personIdFromMeta)
    } else {
      // Direct OTP user: Find by phone or create new
      // [phone matching logic]
    }
  }
  ```

#### 2. **auth-webhook Edge Function** (`/supabase/functions/auth-webhook/index.ts`)
- **Purpose:** Handles person linking for direct OTP users
- **When Called:** Via database trigger after phone verification
- **Same Logic:** Uses identical person linking code as validate-qr-scan

#### 3. **Database Webhook Trigger** 
```sql
CREATE FUNCTION notify_auth_webhook() RETURNS TRIGGER AS $$
BEGIN
  -- Only when phone_confirmed_at changes from NULL to timestamp
  IF OLD.phone_confirmed_at IS NOT NULL OR NEW.phone_confirmed_at IS NULL THEN
    RETURN NEW;
  END IF;
  
  -- Call auth-webhook via pg_net
  PERFORM net.http_post(
    'https://xsqdkubgyqwpyvfltnrf.supabase.co/functions/v1/auth-webhook',
    jsonb_build_object('type', 'UPDATE', 'table', 'users', 'record', to_jsonb(NEW), 'old_record', to_jsonb(OLD))
  );
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER auth_webhook_trigger
  AFTER UPDATE OF phone_confirmed_at ON auth.users
  FOR EACH ROW
  WHEN (OLD.phone_confirmed_at IS NULL AND NEW.phone_confirmed_at IS NOT NULL)
  EXECUTE FUNCTION notify_auth_webhook();
```

---

## 🛡️ CRITICAL RULES - NEVER VIOLATE THESE

### ❌ NEVER DO THESE:
1. **NEVER create triggers that UPDATE auth.users table** - This breaks OTP verification
2. **NEVER modify raw_user_meta_data in BEFORE triggers** - Interferes with auth flow  
3. **NEVER use BEFORE INSERT/UPDATE triggers on auth.users** - Conflicts with Supabase internals
4. **NEVER assume person records are automatically linked** - Always check in code

### ✅ SAFE PATTERNS:
1. **AFTER UPDATE triggers** that don't modify auth.users are safe
2. **Edge Functions** called via webhooks for business logic
3. **Manual linking** in application code when needed
4. **Separate person linking** from auth verification process

---

## 🔧 TECHNICAL IMPLEMENTATION DETAILS

### Person Linking Logic (Shared between both Edge Functions):

#### Phone Number Normalization:
```typescript
let normalizedPhone = authPhone
if (normalizedPhone?.startsWith('+1')) {
  normalizedPhone = normalizedPhone.substring(2)
} else if (normalizedPhone?.startsWith('+')) {
  normalizedPhone = normalizedPhone.substring(1)
}
```

#### Person Matching Query:
```sql
SELECT id FROM people 
WHERE auth_user_id IS NULL 
AND (
  phone = '+1' || normalizedPhone OR
  phone = '+' || normalizedPhone OR  
  phone = normalizedPhone OR
  phone = authPhone OR
  REPLACE(REPLACE(phone, '+1', ''), '+', '') = normalizedPhone
)
ORDER BY created_at DESC 
LIMIT 1
```

#### QR Code Metadata Structure:
```json
{
  "person_id": "uuid-of-existing-person",
  "person_hash": "hash-for-verification", 
  "person_name": "Display Name"
}
```

---

## 📊 MONITORING & DEBUGGING

### Key Queries for Troubleshooting:

#### Check Unlinked Verified Users:
```sql
SELECT COUNT(*) FROM auth.users 
WHERE phone_confirmed_at IS NOT NULL 
AND id NOT IN (SELECT auth_user_id FROM people WHERE auth_user_id IS NOT NULL)
```

#### Recent Auth Events:
```sql
SELECT created_at, payload->>'action' as action, payload->>'actor_username' as phone 
FROM auth.audit_log_entries 
WHERE created_at > NOW() - INTERVAL '1 hour' 
ORDER BY created_at DESC
```

#### Person Linking Status:
```sql
SELECT 
  COUNT(*) as total_people,
  COUNT(auth_user_id) as linked_people,
  COUNT(*) - COUNT(auth_user_id) as unlinked_people
FROM people
```

### Common Issues:

#### "Expired Token" Errors:
- **Cause:** Database triggers interfering with OTP verification
- **Solution:** Remove all triggers that modify auth.users table
- **Prevention:** Only use AFTER triggers that don't touch auth.users

#### 500 Errors in QR Validation:
- **Cause:** User has auth record but no linked person record  
- **Solution:** Run person linking manually or check webhook trigger
- **Prevention:** Ensure both Edge Functions have identical linking logic

#### Cyclic Loading Loops:
- **Cause:** Frontend timeout issues or person linking failures
- **Solution:** Check Edge Function logs and ensure person linking succeeded
- **Prevention:** Add comprehensive error handling and fallback navigation

---

## 🚀 DEPLOYMENT CHECKLIST

When making changes to this system:

### ✅ Required Verifications:
1. **OTP Verification Works:** Test direct signup → OTP → confirmation
2. **QR Code Flow Works:** Test QR scan → OTP → person linking  
3. **Person Linking Works:** Verify both paths create proper person records
4. **No Auth Interference:** Ensure no triggers modify auth.users table
5. **Edge Functions Deployed:** Both validate-qr-scan and auth-webhook deployed
6. **Webhook Trigger Active:** Verify auth_webhook_trigger exists and enabled

### 📁 Files to Deploy:
- `/supabase/functions/validate-qr-scan/index.ts` → Supabase Edge Functions
- `/supabase/functions/auth-webhook/index.ts` → Supabase Edge Functions  
- Frontend build → CDN (via deploy.sh)

### 🗄️ Database Objects:
- `notify_auth_webhook()` function
- `auth_webhook_trigger` trigger on auth.users
- NO other triggers on auth.users (critical!)

---

## 🔒 EMERGENCY PROCEDURES

### If OTP Stops Working:
1. **Immediately disable all triggers on auth.users:**
   ```sql
   DROP TRIGGER IF EXISTS auth_webhook_trigger ON auth.users;
   DROP TRIGGER IF EXISTS [any_other_trigger] ON auth.users;
   ```

2. **Check for interference:**
   ```sql
   SELECT tgname FROM pg_trigger WHERE tgrelid = 'auth.users'::regclass;
   ```

3. **Manual user rescue:**
   ```sql
   UPDATE auth.users SET phone_confirmed_at = NOW() WHERE id = 'user-id';
   ```

### If Person Linking Breaks:
1. **Manual linking for specific users:**
   ```sql
   UPDATE people SET auth_user_id = 'auth-user-id' WHERE phone = 'user-phone';
   ```

2. **Batch linking for unlinked users:**
   ```sql
   -- Use the ensure_person_linked() function if it exists
   SELECT ensure_person_linked('auth-user-id');
   ```

---

## 📚 LESSONS LEARNED

### What DOESN'T Work:
1. **Database triggers on auth.users** - Always interfere with Supabase auth
2. **Synchronous person linking during auth** - Creates race conditions  
3. **Modifying metadata during user creation** - Conflicts with auth flow
4. **Complex trigger chains** - Hard to debug and causes cascading failures

### What DOES Work:
1. **Asynchronous person linking via webhooks** - Clean separation of concerns
2. **Edge Functions for business logic** - Reliable and debuggable
3. **Identical logic in both paths** - Consistent behavior and easier maintenance  
4. **AFTER triggers with external calls** - No interference with core auth

### Critical Timing:
- **Auth verification happens FIRST** (Supabase handles this)
- **Person linking happens AFTER** (Our code handles this) 
- **Never try to do both simultaneously** - Always leads to conflicts

---

## 🎯 SUCCESS METRICS

This architecture is working when:
- ✅ Users can complete OTP verification without "expired token" errors
- ✅ QR code scanning works without infinite loading loops  
- ✅ All verified users have linked person records
- ✅ No 500 errors in validate-qr-scan function
- ✅ Both registration paths work identically

**Last Updated:** August 17, 2025  
**Next Review:** Before any auth-related changes  
**Owner:** Development Team  

---

## ⚠️ FINAL WARNING

**This system was built through painful trial and error during live events. Every design decision was made to solve real production issues. Do not modify without understanding the full context and testing thoroughly in a staging environment that mirrors production auth flows.**

**The key insight: Supabase auth is a black box. Don't try to hook into it directly. Let it do its job, then handle your business logic afterward via webhooks.**
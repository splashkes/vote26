# Slack Integration Rollback Guide - August 25, 2025
**Date:** August 25, 2025  
**Status:** Emergency Recovery Documentation  
**Critical:** Use this guide if Slack notifications cause user flow blockages

---

## 🚨 **EMERGENCY SIGNS** - Use This Guide If:
- Users report "Profile creation failed" errors that weren't happening before
- Users get stuck at authentication steps 
- Profile updates are failing unexpectedly
- Authentication linking stops working
- Any artist portal flow becomes blocked

---

## 📋 **What Was Changed Today**

### **Functions Modified:**
1. **create-new-profile** (Edge Function)
2. **update-profile-clean** (Edge Function)  
3. **refresh_auth_metadata** (Database Function)

### **Changes Made:**
- Added `sendSlackNotification()` helper function to both edge functions
- Added Slack notification calls at success/failure points
- Updated database function with `queue_slack_notification()` calls
- All notifications target `#profile-debug` channel

### **Deployment Times:**
- **create-new-profile**: Deployed ~19:30 UTC August 25, 2025
- **update-profile-clean**: Deployed ~19:30 UTC August 25, 2025  
- **refresh_auth_metadata**: Deployed ~19:25 UTC August 25, 2025

---

## 🔄 **IMMEDIATE ROLLBACK STEPS**

### **Step 1: Download Clean Versions (30 seconds)**
```bash
# Get the clean versions without Slack integration
cd /root/vote_app/vote26/art-battle-artists

# Download the original versions from production
supabase functions download create-new-profile
supabase functions download update-profile-clean
```

### **Step 2: Remove Slack Calls from Edge Functions (2 minutes)**

**For create-new-profile/index.ts:**
1. Find and DELETE the `sendSlackNotification` function (lines ~31-44)
2. Find and DELETE these two calls:
   - Line ~123: `await sendSlackNotification(supabaseAdmin1, 'profile_creation_failed', ...)`
   - Line ~143: `await sendSlackNotification(supabaseAdmin1, 'profile_creation_success', ...)`

**For update-profile-clean/index.ts:**
1. Find and DELETE the `sendSlackNotification` function (lines ~31-44)
2. Find and DELETE these two calls:
   - Line ~186: `await sendSlackNotification(supabase, 'profile_update_failed', ...)`
   - Line ~196: `await sendSlackNotification(supabase, 'profile_update_success', ...)`

### **Step 3: Restore Original Database Function (30 seconds)**
```sql
-- Run this SQL to restore the original refresh_auth_metadata function
-- (Copy from the backup below)
```

### **Step 4: Deploy Clean Versions (1 minute)**
```bash
supabase functions deploy create-new-profile
supabase functions deploy update-profile-clean
```

### **Step 5: Test Immediately**
- Have a user attempt profile creation
- Check that authentication linking works
- Verify profile updates work normally

---

## 💾 **CLEAN FUNCTION BACKUPS**

### **Original refresh_auth_metadata (WORKING VERSION)**
```sql
CREATE OR REPLACE FUNCTION refresh_auth_metadata()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_auth_user_id UUID;
  v_auth_phone TEXT;
  v_person_id UUID;
  v_person_hash TEXT;
  v_person_name TEXT;
  v_auth_metadata JSONB;
  v_normalized_phone TEXT;
  v_start_time TIMESTAMP;
  v_duration_ms INTEGER;
  v_log_metadata JSONB;
  v_operation_result TEXT;
BEGIN
  v_start_time := clock_timestamp();

  -- Get authenticated user
  v_auth_user_id := auth.uid();

  IF v_auth_user_id IS NULL THEN
    PERFORM log_artist_auth(
      NULL, NULL, NULL,
      'metadata_refresh', 'refresh_auth_metadata',
      false, 'not_authenticated', 'No authenticated user found'
    );

    RETURN jsonb_build_object(
      'success', false,
      'error', 'Not authenticated'
    );
  END IF;

  -- Get user's phone from auth.users table
  SELECT phone INTO v_auth_phone
  FROM auth.users
  WHERE id = v_auth_user_id;

  IF v_auth_phone IS NULL THEN
    PERFORM log_artist_auth(
      v_auth_user_id, NULL, NULL,
      'metadata_refresh', 'refresh_auth_metadata',
      false, 'phone_missing', 'No phone number found in auth record'
    );

    RETURN jsonb_build_object(
      'success', false,
      'error', 'No phone number found in auth record'
    );
  END IF;

  -- Normalize phone number for better matching
  v_normalized_phone := v_auth_phone;
  -- Remove +1 prefix if it exists
  IF v_normalized_phone LIKE '+1%' THEN
    v_normalized_phone := SUBSTRING(v_normalized_phone FROM 3);
  END IF;
  -- Remove + prefix if it exists
  IF v_normalized_phone LIKE '+%' THEN
    v_normalized_phone := SUBSTRING(v_normalized_phone FROM 2);
  END IF;

  -- Log the person lookup attempt
  v_log_metadata := jsonb_build_object(
    'auth_phone', v_auth_phone,
    'normalized_phone', v_normalized_phone,
    'lookup_strategy', 'phone_matching'
  );

  -- Try to find existing person record
  SELECT id, hash, name INTO v_person_id, v_person_hash, v_person_name
  FROM people
  WHERE (auth_user_id = v_auth_user_id OR auth_user_id IS NULL)
    AND (
      phone = v_auth_phone
      OR phone = '+' || v_auth_phone
      OR phone = '+1' || v_auth_phone
      OR phone = '+1' || v_normalized_phone
      OR phone = '+' || v_normalized_phone
      OR phone = v_normalized_phone
      OR phone_number = v_auth_phone
      OR phone_number = '+' || v_auth_phone
      OR phone_number = '+1' || v_auth_phone
      OR phone_number = '+1' || v_normalized_phone
      OR phone_number = '+' || v_normalized_phone
      OR phone_number = v_normalized_phone
      OR REPLACE(REPLACE(phone, '+1', ''), '+', '') = v_normalized_phone
      OR REPLACE(REPLACE(phone_number, '+1', ''), '+', '') = v_normalized_phone
    )
  ORDER BY
    CASE WHEN auth_user_id = v_auth_user_id THEN 0 ELSE 1 END,
    created_at DESC
  LIMIT 1;

  IF v_person_id IS NOT NULL THEN
    -- Found existing person record
    v_operation_result := 'person_found_and_linked';

    -- Link existing person record
    UPDATE people
    SET
      auth_user_id = v_auth_user_id,
      auth_phone = v_auth_phone,
      verified = true,
      updated_at = NOW()
    WHERE id = v_person_id;

    IF v_person_hash IS NULL THEN
      -- Fix: Cast both parameters to text explicitly
      v_person_hash := encode(digest((v_person_id::text || COALESCE(v_auth_phone, ''))::text, 'sha256'::text), 'hex');
      UPDATE people
      SET hash = v_person_hash
      WHERE id = v_person_id;
    END IF;

    v_log_metadata := v_log_metadata || jsonb_build_object(
      'person_found', true,
      'person_was_linked', CASE WHEN v_person_name <> 'User' THEN true ELSE false END,
      'person_name', v_person_name
    );
  ELSE
    -- Create new person for direct OTP signup
    v_operation_result := 'person_created_new';
    v_person_id := gen_random_uuid();
    v_person_name := 'User';

    -- Generate hash with explicit text casting
    v_person_hash := encode(digest((v_person_id::text || COALESCE(v_auth_phone, ''))::text, 'sha256'::text), 'hex');

    -- Create new person record
    INSERT INTO people (
      id,
      phone,
      name,
      nickname,
      hash,
      auth_user_id,
      auth_phone,
      verified,
      created_at,
      updated_at
    ) VALUES (
      v_person_id,
      '+1' || v_normalized_phone,
      v_person_name,
      v_person_name,
      v_person_hash,
      v_auth_user_id,
      v_auth_phone,
      true,
      NOW(),
      NOW()
    );

    v_log_metadata := v_log_metadata || jsonb_build_object(
      'person_found', false,
      'person_created', true,
      'new_person_phone', '+1' || v_normalized_phone
    );
  END IF;

  -- Update auth user metadata
  v_auth_metadata := jsonb_build_object(
    'person_id', v_person_id,
    'person_hash', v_person_hash,
    'person_name', COALESCE(v_person_name, 'User')
  );

  UPDATE auth.users
  SET
    raw_user_meta_data = COALESCE(raw_user_meta_data, '{}'::jsonb) || v_auth_metadata,
    updated_at = NOW()
  WHERE id = v_auth_user_id;

  -- Calculate duration
  v_duration_ms := EXTRACT(EPOCH FROM (clock_timestamp() - v_start_time)) * 1000;

  -- Log successful operation
  v_log_metadata := v_log_metadata || jsonb_build_object(
    'operation_result', v_operation_result,
    'metadata_updated', true
  );

  PERFORM log_artist_auth(
    v_auth_user_id, v_person_id, v_auth_phone,
    'metadata_refresh', 'refresh_auth_metadata',
    true, NULL, NULL, v_duration_ms, v_log_metadata
  );

  RETURN jsonb_build_object(
    'success', true,
    'person_id', v_person_id,
    'person_hash', v_person_hash,
    'person_name', COALESCE(v_person_name, 'User'),
    'linked_phone', v_auth_phone,
    'action', CASE WHEN v_person_name = 'User' THEN 'created_new_person' ELSE 'linked_existing_person' END
  );

EXCEPTION
  WHEN OTHERS THEN
    -- Calculate duration even on error
    v_duration_ms := EXTRACT(EPOCH FROM (clock_timestamp() - v_start_time)) * 1000;

    -- Log the error
    PERFORM log_artist_auth(
      v_auth_user_id, v_person_id, v_auth_phone,
      'metadata_refresh', 'refresh_auth_metadata',
      false, 'database_error', SQLERRM, v_duration_ms,
      jsonb_build_object('sql_error', SQLERRM, 'sql_state', SQLSTATE)
    );

    RETURN jsonb_build_object(
      'success', false,
      'error', SQLERRM,
      'auth_user_id', v_auth_user_id,
      'auth_phone', v_auth_phone
    );
END;
$$;
```

---

## 🔍 **DIAGNOSIS STEPS**

### **Step 1: Check Recent Errors**
```sql
-- Check for recent auth failures since deployment
SELECT created_at, event_type, operation, success, error_message, auth_user_id, person_id
FROM artist_auth_logs 
WHERE created_at > '2025-08-25 19:20:00'
  AND success = false
ORDER BY created_at DESC
LIMIT 10;
```

### **Step 2: Check Slack Queue Issues**
```sql
-- Check if Slack notifications are failing and blocking processes
SELECT status, message_type, error, created_at
FROM slack_notifications
WHERE created_at > '2025-08-25 19:20:00'
  AND message_type LIKE '%profile%'
ORDER BY created_at DESC;
```

### **Step 3: Check Edge Function Logs**
- Go to Supabase Dashboard → Functions → Logs
- Look for functions failing after 19:30 UTC today
- Look for "Failed to queue slack notification" errors

---

## 🛠️ **POTENTIAL ISSUES & FIXES**

### **Issue 1: Slack RPC Function Missing**
**Symptom:** "function queue_slack_notification does not exist"
**Quick Fix:** Remove Slack calls, they're not critical to user flow

### **Issue 2: Slack Channel Permissions**
**Symptom:** Slack notifications failing, blocking main function
**Quick Fix:** Wrap Slack calls in try-catch (already done, but may need improvement)

### **Issue 3: Database Function Security Context**
**Symptom:** Database function can't call Slack queue due to RLS
**Quick Fix:** Revert to original database function without Slack calls

### **Issue 4: Edge Function Size/Performance**
**Symptom:** Functions timing out or running slowly
**Quick Fix:** Remove Slack integration to reduce function complexity

---

## 📞 **EMERGENCY CONTACT ACTIONS**

### **If Users Are Blocked RIGHT NOW:**
1. **IMMEDIATELY** run the database function restore (30 seconds)
2. **IMMEDIATELY** remove Slack calls from edge functions (2 minutes)
3. **IMMEDIATELY** redeploy both functions (1 minute)
4. **Test with a user account within 5 minutes**

### **If Issues Are Intermittent:**
1. Check diagnosis steps first
2. Monitor for 10-15 minutes
3. If more than 2 users report issues, do immediate rollback

---

## ✅ **SUCCESS VERIFICATION**

After rollback, verify these work:
- [ ] User can create new profile successfully
- [ ] User can update existing profile 
- [ ] Authentication linking works (new users get person records)
- [ ] No errors in edge function logs
- [ ] No failed entries in artist_auth_logs

---

## 📝 **ROLLBACK COMPLETION CHECKLIST**

- [ ] Database function restored to original version
- [ ] create-new-profile function cleaned of Slack calls
- [ ] update-profile-clean function cleaned of Slack calls  
- [ ] Both edge functions redeployed successfully
- [ ] User flow tested and confirmed working
- [ ] Monitor for 30 minutes post-rollback
- [ ] Document what went wrong for future reference

**If all boxes checked: Integration rollback SUCCESSFUL** ✅

---

**⚠️ CRITICAL NOTE:** The artist portal user flow is MORE IMPORTANT than Slack notifications. Always prioritize user access over monitoring features. Remove monitoring before it blocks users.
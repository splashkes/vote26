# Auth Metadata Contamination Testing Plan - September 4, 2025

## Overview
Testing plan to monitor and detect auth metadata contamination issues following the September 4th security incident. This plan covers both immediate monitoring and ongoing detection strategies.

## Immediate Testing (Next 48 Hours)

### 1. Bangkok Artist Verification
**Objective:** Confirm the Bangkok artist now sees her correct profile

**Test Steps:**
```bash
# Check her auth metadata is correctly fixed
PGPASSWORD='6kEtvU9n0KhTVr5' psql -h db.xsqdkubgyqwpyvfltnrf.supabase.co -p 5432 -d postgres -U postgres -c "
SELECT au.phone, 
       au.raw_user_meta_data->>'person_id' as metadata_person_id,
       au.raw_user_meta_data->>'person_name' as metadata_person_name,
       p.id as actual_person_id,
       p.name as actual_person_name,
       ap.name as artist_name,
       ap.entry_id
FROM auth.users au 
JOIN people p ON au.id = p.auth_user_id 
LEFT JOIN artist_profiles ap ON ap.person_id = p.id
WHERE au.phone = '66803914583';
"
```

**Expected Result:**
- `metadata_person_id` = `f6244fd2-cc8e-4354-92ed-22ebd8b8ecb5`
- `actual_person_id` = `f6244fd2-cc8e-4354-92ed-22ebd8b8ecb5`
- `artist_name` = `Janjira Ninlawong`
- `entry_id` = `310090`

**User Testing:**
- Ask Bangkok artist to logout completely from art-battle-artists
- Clear browser cache
- Login with phone 0803914583  
- Verify she sees "Janjira Ninlawong" profile, not "Bryan Heimowski"

### 2. System-Wide Consistency Check
**Run Every 6 Hours for 48 Hours**

```sql
-- Comprehensive metadata consistency check
SELECT 
    'METADATA_CONSISTENCY_CHECK' as check_type,
    NOW() as check_time,
    COUNT(*) as total_users,
    COUNT(CASE WHEN au.raw_user_meta_data->>'person_id' <> p.id::text THEN 1 END) as mismatched_metadata,
    COUNT(CASE WHEN au.raw_user_meta_data->>'person_id' IS NULL THEN 1 END) as missing_metadata,
    COUNT(CASE WHEN p.auth_user_id IS NULL THEN 1 END) as unlinked_people
FROM auth.users au 
FULL OUTER JOIN people p ON au.id = p.auth_user_id 
WHERE au.raw_user_meta_data IS NOT NULL OR p.id IS NOT NULL;
```

**Alert Conditions:**
- `mismatched_metadata > 0` = CRITICAL ALERT
- `missing_metadata > 10` = WARNING  
- `unlinked_people > 50` = WARNING

### 3. Specific User Verification
**Check the 3 previously affected users daily**

```sql
-- Monitor specific users that were corrupted
SELECT 
    'AFFECTED_USERS_CHECK' as check_type,
    au.phone,
    au.raw_user_meta_data->>'person_id' = p.id::text as metadata_matches,
    ap.name as artist_name,
    ap.entry_id,
    au.updated_at as last_auth_update,
    p.updated_at as last_person_update
FROM auth.users au 
JOIN people p ON au.id = p.auth_user_id 
LEFT JOIN artist_profiles ap ON ap.person_id = p.id
WHERE au.phone IN ('66803914583', '+161415311456', '+161434815661')
ORDER BY au.phone;
```

**Expected Results:** All `metadata_matches` should be `true`

## Weekly Monitoring (Next 4 Weeks)

### 1. Auth-Webhook Activity Monitoring
**Check for new contamination after auth-webhook executions**

```sql
-- Find recent auth-webhook activity
SELECT 
    'RECENT_AUTH_ACTIVITY' as check_type,
    COUNT(*) as recent_phone_confirmations,
    COUNT(CASE WHEN p.created_at > NOW() - INTERVAL '7 days' THEN 1 END) as new_people_created,
    COUNT(CASE WHEN au.phone_confirmed_at > NOW() - INTERVAL '7 days' THEN 1 END) as recent_confirmations
FROM auth.users au 
JOIN people p ON au.id = p.auth_user_id
WHERE au.phone_confirmed_at IS NOT NULL;
```

**Follow-up Check:** Run consistency check after any new phone confirmations

### 2. Cross-User Profile Access Detection
**Monitor for users seeing wrong profiles in art-battle-artists**

```sql
-- Find artist profiles and their person linkage
SELECT 
    ap.name as artist_name,
    ap.entry_id,
    ap.person_id,
    p.phone as person_phone,
    au.phone as auth_phone,
    au.raw_user_meta_data->>'person_id' as metadata_person_id,
    CASE 
        WHEN ap.person_id::text = au.raw_user_meta_data->>'person_id' THEN 'CORRECT'
        ELSE 'MISMATCH'
    END as status
FROM artist_profiles ap
JOIN people p ON ap.person_id = p.id  
JOIN auth.users au ON p.auth_user_id = au.id
WHERE au.raw_user_meta_data IS NOT NULL
ORDER BY status DESC, ap.entry_id;
```

**Alert on any `MISMATCH` status**

### 3. Phone Corruption Pattern Detection
**Monitor for new phone corruption cases**

```sql
-- Detect duplicate person records per auth user (sign of phone corruption)
SELECT 
    au.phone as auth_phone,
    COUNT(p.id) as linked_person_count,
    array_agg(p.phone) as person_phones,
    array_agg(p.id::text) as person_ids
FROM auth.users au
JOIN people p ON au.id = p.auth_user_id
GROUP BY au.id, au.phone
HAVING COUNT(p.id) > 1
ORDER BY linked_person_count DESC;
```

**Alert if any `linked_person_count > 1`**

## Stress Testing (Week 2)

### 1. Concurrent Auth-Webhook Testing
**Simulate high-load phone confirmation scenarios**

**Test Plan:**
1. Create 10 test users with phone numbers
2. Trigger phone confirmations simultaneously  
3. Monitor for metadata contamination
4. Clean up test users

**Monitoring Query:**
```sql
-- Check for any test user contamination
SELECT * FROM auth.users au 
JOIN people p ON au.id = p.auth_user_id 
WHERE au.phone LIKE '+1555%'  -- Test phone pattern
AND au.raw_user_meta_data->>'person_id' <> p.id::text;
```

### 2. Manual Profile Linking Testing
**Test the manual linking process that may have caused original contamination**

**Test Scenario:**
1. Create test artist profile
2. Manually link to existing person record
3. Monitor for any metadata side-effects on other users
4. Verify only target user affected

## Automated Monitoring Setup

### 1. Cron Job for Daily Checks
```bash
# Add to crontab
0 8,14,20 * * * /root/vote_app/vote26/scripts/check_auth_metadata.sh
```

**Script Content:**
```bash
#!/bin/bash
# /root/vote_app/vote26/scripts/check_auth_metadata.sh

LOGFILE="/root/vote_app/vote26/logs/auth_metadata_check_$(date +%Y%m%d).log"
PGPASSWORD='6kEtvU9n0KhTVr5'

echo "[$(date)] Starting auth metadata consistency check" >> $LOGFILE

# Run consistency check
RESULT=$(psql -h db.xsqdkubgyqwpyvfltnrf.supabase.co -p 5432 -d postgres -U postgres -t -c "
SELECT COUNT(CASE WHEN au.raw_user_meta_data->>'person_id' <> p.id::text THEN 1 END)
FROM auth.users au 
JOIN people p ON au.id = p.auth_user_id 
WHERE au.raw_user_meta_data IS NOT NULL;
")

if [ "$RESULT" -gt 0 ]; then
    echo "[$(date)] CRITICAL: $RESULT metadata mismatches detected!" >> $LOGFILE
    # Send Slack alert or email
    curl -X POST -H 'Content-type: application/json' \
         --data "{\"text\":\"🚨 Auth metadata contamination detected: $RESULT mismatches\"}" \
         YOUR_SLACK_WEBHOOK_URL
else
    echo "[$(date)] OK: No metadata mismatches detected" >> $LOGFILE
fi
```

### 2. Real-Time Monitoring with Database Triggers
**Create trigger to detect metadata changes**

```sql
-- Create audit table
CREATE TABLE IF NOT EXISTS auth_metadata_audit (
    id SERIAL PRIMARY KEY,
    auth_user_id UUID,
    old_person_id TEXT,
    new_person_id TEXT,
    change_time TIMESTAMP DEFAULT NOW(),
    change_source TEXT
);

-- Create trigger function
CREATE OR REPLACE FUNCTION audit_auth_metadata_changes()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.raw_user_meta_data->>'person_id' IS DISTINCT FROM NEW.raw_user_meta_data->>'person_id' THEN
        INSERT INTO auth_metadata_audit (
            auth_user_id,
            old_person_id, 
            new_person_id,
            change_source
        ) VALUES (
            NEW.id,
            OLD.raw_user_meta_data->>'person_id',
            NEW.raw_user_meta_data->>'person_id', 
            'database_trigger'
        );
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger
DROP TRIGGER IF EXISTS auth_metadata_change_trigger ON auth.users;
CREATE TRIGGER auth_metadata_change_trigger
    AFTER UPDATE ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION audit_auth_metadata_changes();
```

### 3. Weekly Report Generation
```sql
-- Weekly contamination report
SELECT 
    'WEEKLY_AUTH_REPORT' as report_type,
    date_trunc('week', NOW()) as week_starting,
    COUNT(*) as total_users_checked,
    COUNT(CASE WHEN au.raw_user_meta_data->>'person_id' <> p.id::text THEN 1 END) as contaminated_users,
    COUNT(CASE WHEN au.phone_confirmed_at > NOW() - INTERVAL '7 days' THEN 1 END) as new_confirmations,
    COUNT(CASE WHEN p.created_at > NOW() - INTERVAL '7 days' THEN 1 END) as new_people_created,
    MAX(au.updated_at) as latest_auth_update,
    MAX(p.updated_at) as latest_person_update
FROM auth.users au 
FULL OUTER JOIN people p ON au.id = p.auth_user_id 
WHERE au.raw_user_meta_data IS NOT NULL OR p.id IS NOT NULL;
```

## User Experience Testing

### 1. Login Flow Validation
**Weekly testing with real users in different regions**

**Test Cases:**
- Bangkok region user login
- Australian user login  
- North American user login
- New user registration + phone confirmation

**Success Criteria:**
- User sees their own profile only
- No cross-user data visible
- Profile editing works correctly

### 2. Profile View Testing
**Automated browser testing**

```javascript
// Selenium test script
describe('Profile View Security Test', () => {
  it('should show correct profile for authenticated user', async () => {
    await loginAsUser('66803914583'); // Bangkok artist
    const profileName = await page.textContent('[data-testid="profile-name"]');
    expect(profileName).toBe('Janjira Ninlawong');
    expect(profileName).not.toBe('Bryan Heimowski');
  });
});
```

## Emergency Response Plan

### If Contamination Detected

**Immediate Actions (Within 1 Hour):**
1. Run detailed contamination analysis:
```sql
SELECT au.phone, au.id as auth_user_id,
       au.raw_user_meta_data->>'person_id' as metadata_person_id,
       p.id as actual_person_id,
       ap.name as artist_name
FROM auth.users au 
JOIN people p ON au.id = p.auth_user_id 
LEFT JOIN artist_profiles ap ON ap.person_id = au.raw_user_meta_data->>'person_id'::uuid
WHERE au.raw_user_meta_data->>'person_id' <> p.id::text;
```

2. Document affected users
3. Apply immediate metadata fixes
4. Notify affected users to logout/login

**Investigation Actions (Within 24 Hours):**
1. Check auth-webhook logs for recent activity
2. Review any manual database operations
3. Identify contamination vector
4. Implement additional safeguards

**Communication Plan:**
- Internal: Slack alert with contamination count
- Users: Email notification if profile data exposed
- Documentation: Update incident log

## Long-Term Improvements

1. **Code Review:** Fix auth-webhook SQL parameter binding vulnerability
2. **Architecture:** Consider moving to stored procedures for metadata updates  
3. **Testing:** Add automated contamination tests to CI/CD pipeline
4. **Monitoring:** Implement real-time Grafana dashboard for auth health

## Testing Schedule Summary

| Frequency | Check Type | Query/Script | Alert Threshold |
|-----------|------------|--------------|-----------------|
| Every 6h | Consistency Check | metadata mismatch query | > 0 mismatches |
| Daily | Affected Users | specific user verification | any mismatch |  
| Weekly | Cross-User Detection | artist profile linkage | any MISMATCH status |
| Weekly | Phone Corruption | duplicate person records | > 1 linked_person_count |
| Monthly | Full System Audit | comprehensive report | trend analysis |

**Testing begins:** September 5, 2025  
**Duration:** 4 weeks intensive, then ongoing monitoring  
**Success criteria:** Zero contamination incidents detected
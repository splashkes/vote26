# Invitation Email System Monitoring Guide

## Daily Health Check Queries

### 1. Check Today's Invitations vs Email Logs
**Purpose**: Verify all invitations created today have corresponding email logs

```sql
-- Find invitations created today without email logs
WITH todays_invitations AS (
  SELECT 
    ai.created_at,
    ai.event_eid,
    ai.artist_number,
    ap.name as artist_name,
    COALESCE(p.email, au.email) as artist_email
  FROM artist_invitations ai
  LEFT JOIN artist_profiles ap ON ai.artist_profile_id = ap.id  
  LEFT JOIN people p ON ap.person_id = p.id
  LEFT JOIN auth.users au ON p.phone = au.phone OR p.email = au.email
  WHERE ai.created_at >= CURRENT_DATE
    AND ai.status = 'pending'
),
todays_emails AS (
  SELECT DISTINCT recipient 
  FROM email_logs 
  WHERE subject ILIKE '%invited%'
    AND sent_at >= CURRENT_DATE
)
SELECT 
  ti.*,
  CASE 
    WHEN ti.artist_email IS NULL THEN '❌ NO_EMAIL_IN_SYSTEM'
    WHEN te.recipient IS NULL THEN '⚠️ INVITATION_NO_EMAIL_SENT' 
    ELSE '✅ EMAIL_SENT'
  END as status
FROM todays_invitations ti
LEFT JOIN todays_emails te ON ti.artist_email = te.recipient
ORDER BY ti.created_at DESC;
```

### 2. Email System Health Check
**Purpose**: Verify send-custom-email function is working

```sql
-- Check recent email delivery rates
SELECT 
  DATE(sent_at) as date,
  COUNT(*) as total_emails,
  SUM(CASE WHEN status = 'sent' THEN 1 ELSE 0 END) as successful,
  SUM(CASE WHEN status != 'sent' THEN 1 ELSE 0 END) as failed,
  ROUND(SUM(CASE WHEN status = 'sent' THEN 1 ELSE 0 END) * 100.0 / COUNT(*), 2) as success_rate
FROM email_logs 
WHERE sent_at >= CURRENT_DATE - INTERVAL '7 days'
GROUP BY DATE(sent_at)
ORDER BY date DESC;
```

### 3. Artists Without Email Addresses
**Purpose**: Identify artists who can't receive invitations

```sql
-- Find artist profiles missing email addresses
SELECT 
  ap.id,
  ap.name as artist_name,
  p.phone,
  CASE 
    WHEN p.email IS NOT NULL THEN 'HAS_PEOPLE_EMAIL'
    WHEN au.email IS NOT NULL THEN 'HAS_AUTH_EMAIL'  
    ELSE 'NO_EMAIL_FOUND'
  END as email_status,
  COALESCE(p.email, au.email, 'NONE') as available_email
FROM artist_profiles ap
LEFT JOIN people p ON ap.person_id = p.id
LEFT JOIN auth.users au ON p.phone = au.phone OR p.email = au.email
WHERE COALESCE(p.email, au.email) IS NULL
ORDER BY ap.name;
```

## Weekly Health Checks

### 4. Pending Invitations Analysis
**Purpose**: Find invitations that may need follow-up

```sql
-- Invitations pending for more than 3 days
SELECT 
  ai.created_at,
  ai.event_eid,
  e.name as event_name,
  ai.artist_number,
  ap.name as artist_name,
  COALESCE(p.email, au.email, 'NO_EMAIL') as artist_email,
  DATE_PART('day', NOW() - ai.created_at) as days_pending
FROM artist_invitations ai
LEFT JOIN artist_profiles ap ON ai.artist_profile_id = ap.id
LEFT JOIN people p ON ap.person_id = p.id  
LEFT JOIN auth.users au ON p.phone = au.phone OR p.email = au.email
LEFT JOIN events e ON ai.event_eid = e.eid
WHERE ai.status = 'pending' 
  AND ai.created_at < CURRENT_DATE - INTERVAL '3 days'
ORDER BY ai.created_at ASC;
```

### 5. Email Delivery Failure Analysis
**Purpose**: Identify patterns in email failures

```sql
-- Email failures by error type (last 7 days)
SELECT 
  error_message,
  COUNT(*) as failure_count,
  STRING_AGG(DISTINCT recipient, ', ') as affected_emails
FROM email_logs 
WHERE status != 'sent' 
  AND sent_at >= CURRENT_DATE - INTERVAL '7 days'
  AND subject ILIKE '%invited%'
GROUP BY error_message
ORDER BY failure_count DESC;
```

## Automated Monitoring Setup

### 6. Supabase Function Health Check
Create a scheduled function to run daily:

```javascript
// Create: /supabase/functions/invitation-health-check/index.ts
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL') ?? '', 
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
);

async function checkInvitationHealth() {
  // Run query #1 from above
  const { data: invitationsToday } = await supabase.rpc('check_todays_invitations_health');
  
  const issues = invitationsToday?.filter(i => i.status !== '✅ EMAIL_SENT') || [];
  
  if (issues.length > 0) {
    // Send Slack alert
    await supabase.rpc('queue_slack_notification', {
      p_channel_name: 'profile-debug',
      p_message_type: 'invitation_email_health_check',
      p_text: `⚠️ INVITATION EMAIL ISSUES: ${issues.length} invitations today without emails sent`,
      p_blocks: JSON.stringify([{
        type: "section",
        text: {
          type: "mrkdwn", 
          text: `*Invitation Email Health Alert*\n${issues.length} invitations created today but no emails sent:\n${issues.map(i => `• ${i.artist_name} (${i.event_eid})`).join('\n')}`
        }
      }])
    });
  }
  
  return { issues: issues.length, total: invitationsToday?.length || 0 };
}

Deno.serve(async (req) => {
  try {
    const result = await checkInvitationHealth();
    return new Response(JSON.stringify(result), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
});
```

### 7. Database Function for Daily Check
Create a PostgreSQL function for easier monitoring:

```sql
-- Create reusable health check function
CREATE OR REPLACE FUNCTION check_todays_invitations_health()
RETURNS TABLE (
  created_at timestamp,
  event_eid text,
  artist_name text,
  artist_email text,
  status text
) AS $$
BEGIN
  RETURN QUERY
  WITH todays_invitations AS (
    SELECT 
      ai.created_at,
      ai.event_eid,
      ap.name as artist_name,
      COALESCE(p.email, au.email) as artist_email
    FROM artist_invitations ai
    LEFT JOIN artist_profiles ap ON ai.artist_profile_id = ap.id  
    LEFT JOIN people p ON ap.person_id = p.id
    LEFT JOIN auth.users au ON p.phone = au.phone OR p.email = au.email
    WHERE ai.created_at >= CURRENT_DATE
      AND ai.status = 'pending'
  ),
  todays_emails AS (
    SELECT DISTINCT recipient 
    FROM email_logs 
    WHERE subject ILIKE '%invited%'
      AND sent_at >= CURRENT_DATE
  )
  SELECT 
    ti.created_at,
    ti.event_eid,
    ti.artist_name,
    ti.artist_email,
    CASE 
      WHEN ti.artist_email IS NULL THEN 'NO_EMAIL_IN_SYSTEM'
      WHEN te.recipient IS NULL THEN 'INVITATION_NO_EMAIL_SENT' 
      ELSE 'EMAIL_SENT'
    END::text as status
  FROM todays_invitations ti
  LEFT JOIN todays_emails te ON ti.artist_email = te.recipient
  ORDER BY ti.created_at DESC;
END;
$$ LANGUAGE plpgsql;
```

## Alert Thresholds

### Critical Alerts (Immediate Action Required)
- **Any invitation > 2 hours old without email sent** (for artists with email)
- **Email delivery failure rate > 10%** in last 24 hours  
- **admin-send-invitation function errors** in logs

### Warning Alerts (Daily Review)
- **New artists without email addresses** 
- **Pending invitations > 3 days old**
- **Email bounce rate > 5%**

## Manual Verification Steps

### After Creating Invitations in Admin UI:
1. **Check function response**: Look for `"email": {"success": true}` in browser dev tools
2. **Verify email logs**: Run query within 5 minutes to confirm delivery
3. **Test email receipt**: If possible, confirm artist received email

### Weekly Review Checklist:
- [ ] Run all 5 monitoring queries above
- [ ] Review any failed email deliveries  
- [ ] Update email addresses for artists missing them
- [ ] Check Supabase function logs for errors
- [ ] Verify `send-custom-email` function is operational

## Emergency Response

### If Issues Found:
1. **Immediate**: Use `/root/vote_app/vote26/send_missed_invitations.js` script template
2. **Investigation**: Check Supabase function logs for `admin-send-invitation` errors  
3. **Root Cause**: Verify `send-custom-email` function is working
4. **Recovery**: Send missed emails manually using verified working method

### Contact & Escalation:
- **Documentation**: `/root/vote_app/vote26/INVITATION_EMAIL_SYSTEM_FIX_2025-09-04.md`
- **Recovery Script**: `/root/vote_app/vote26/send_missed_invitations.js`  
- **Priority Level**: 🔥 CRITICAL (Artists need invitations to participate)

## Quick Health Check Command
```bash
# Single command to check system health
psql -h db.xsqdkubgyqwpyvfltnrf.supabase.co -p 5432 -d postgres -U postgres \
-c "SELECT * FROM check_todays_invitations_health();" \
PGPASSWORD='6kEtvU9n0KhTVr5'
```
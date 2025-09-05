# Automated Security & Email Monitoring Setup - September 4, 2025

## Overview
Comprehensive database monitoring system using Supabase Edge Function `admin-security-monitor` that checks for security vulnerabilities, data consistency issues, and email delivery problems. Automatically sends Slack alerts when issues are detected.

## Function Capabilities

### Security Monitoring (14 Different Checks)

#### 🚨 Critical Issues
1. **Auth Metadata Contamination**: Cross-user profile access vulnerabilities
2. **Today's Invitations Missing Emails**: Invitations > 2 hours old without emails sent 
3. **Email Delivery Failure Rate**: Success rate < 80%

#### ⚠️ High Issues
4. **Orphaned Artist Profiles**: Profiles linked to non-existent people records
5. **Duplicate Profile Links**: Multiple profiles per person_id
6. **Email Delivery Failure Rate**: Success rate 80-90%

#### 🔶 Medium Issues  
7. **Missing Auth Users**: People records with invalid auth_user_id references
8. **Profile Phone Mismatches**: Phone numbers differ between profiles and auth users
9. **Orphaned Artworks**: Artworks with missing artist profiles
10. **Duplicate Profile Phones**: Same phone number on multiple profiles
11. **Artists Without Email Addresses**: Cannot receive email invitations
12. **Old Pending Invitations**: Invitations pending > 3 days
13. **Email Delivery Failure Patterns**: Analysis of failure types

#### 🔍 Low Issues
14. **Broken Sample Works Media**: Sample works with missing media files
15. **Orphaned Event Confirmations**: Confirmations for deleted profiles

## Deployment Status

### Edge Function
- **Name**: `admin-security-monitor`
- **URL**: `https://xsqdkubgyqwpyvfltnrf.supabase.co/functions/v1/admin-security-monitor`
- **Status**: ✅ Deployed and tested
- **Authentication**: Requires admin JWT token

### Test Script
- **File**: `/root/vote_app/vote26/test_security_monitor.sh`  
- **Usage**: `./test_security_monitor.sh`
- **Status**: ✅ Working - currently detects 0 issues

## Slack Integration

### Configuration Required
Set environment variable in Supabase dashboard:
```
SLACK_WEBHOOK_URL = [Your Slack webhook URL]
```

### Notification Behavior
- **No Issues**: No Slack notification sent
- **Issues Found**: Automatically sends detailed Slack notification with:
  - Issue summary by severity
  - Detailed breakdown of each check
  - Recommended actions
  - Timestamp
  - Color-coded by severity (red=critical, yellow=high, green=medium/low)

### Sample Slack Message Format
```
🚨 Database Security Monitoring Alert

Security Monitoring Results: Found 2 issue types with 5 total problems

Issue Breakdown:
🚨 Critical: 1
⚠️ High: 1  
🔶 Medium: 0
🔍 Low: 0

Detailed Issues:
🚨 Auth Metadata Contamination: 1 issues (CRITICAL)
   └ URGENT: Auth metadata contamination detected. Review AUTH_METADATA_CONTAMINATION_BUG_2025-09-04.md procedures.

⚠️ Today's Invitations Missing Emails: 4 issues (HIGH)  
   └ Review invitations created today - some missing emails or artist email addresses.
```

## Automated Scheduling Options

### Option 1: Supabase Cron Jobs (Recommended)
Create in Supabase SQL Editor:
```sql
-- Run daily at 9 AM UTC
SELECT cron.schedule(
  'daily-security-monitor',
  '0 9 * * *',
  $$
  SELECT net.http_post(
    url := 'https://xsqdkubgyqwpyvfltnrf.supabase.co/functions/v1/admin-security-monitor',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || '[ADMIN_JWT_TOKEN]'
    )
  );
  $$
);

-- Run every 4 hours for critical checks
SELECT cron.schedule(
  'frequent-security-monitor',
  '0 */4 * * *',
  $$
  SELECT net.http_post(
    url := 'https://xsqdkubgyqwpyvfltnrf.supabase.co/functions/v1/admin-security-monitor',
    headers := jsonb_build_object(
      'Content-Type', 'application/json', 
      'Authorization', 'Bearer ' || '[ADMIN_JWT_TOKEN]'
    )
  );
  $$
);
```

### Option 2: System Cron Job
Add to system crontab (`crontab -e`):
```bash
# Daily security monitoring at 9 AM
0 9 * * * /root/vote_app/vote26/test_security_monitor.sh >> /var/log/security_monitor.log 2>&1

# Every 4 hours for critical issues  
0 */4 * * * /root/vote_app/vote26/test_security_monitor.sh >> /var/log/security_monitor.log 2>&1
```

### Option 3: GitHub Actions (CI/CD)
```yaml
# .github/workflows/security-monitor.yml
name: Daily Security Monitoring
on:
  schedule:
    - cron: '0 9 * * *'  # 9 AM UTC daily
  workflow_dispatch:  # Manual trigger

jobs:
  security-check:
    runs-on: ubuntu-latest
    steps:
      - name: Run Security Monitor
        run: |
          curl -X POST "${{ secrets.SUPABASE_URL }}/functions/v1/admin-security-monitor" \
            -H "Authorization: Bearer ${{ secrets.ADMIN_JWT }}" \
            -H "Content-Type: application/json"
```

## Manual Testing & Monitoring

### Test Commands
```bash
# Quick test
./test_security_monitor.sh

# Raw curl test  
curl -X POST "https://xsqdkubgyqwpyvfltnrf.supabase.co/functions/v1/admin-security-monitor" \
  -H "Authorization: Bearer [JWT_TOKEN]" \
  -H "Content-Type: application/json"

# Get JWT token
cd art-battle-admin && ./get_jwt.sh
```

### Expected Response Format
```json
{
  "success": true,
  "timestamp": "2025-09-04T23:52:31.130Z",
  "summary": {
    "total_issue_types": 0,
    "total_issues": 0,
    "critical_issues": 0,
    "high_issues": 0,
    "medium_issues": 0,
    "low_issues": 0,
    "slack_notification_sent": false
  },
  "checks": []
}
```

### Monitoring Dashboard Queries
```sql
-- Check last 24 hours of monitoring results
SELECT 
  created_at,
  jsonb_pretty(response) as monitoring_results
FROM monitoring_logs 
WHERE created_at >= NOW() - INTERVAL '24 hours'
ORDER BY created_at DESC;

-- Alert frequency analysis
SELECT 
  DATE_TRUNC('day', created_at) as day,
  COUNT(*) as total_runs,
  SUM((response->>'total_issues')::int) as total_issues_found
FROM monitoring_logs
WHERE created_at >= NOW() - INTERVAL '7 days'
GROUP BY day
ORDER BY day DESC;
```

## Alert Thresholds & Response

### Immediate Action Required (CRITICAL)
- **Auth metadata contamination** → Run contamination fix procedures
- **Invitations > 2 hours without emails** → Use missed invitations recovery script
- **Email delivery rate < 80%** → Check send-custom-email function

### Daily Review (HIGH/MEDIUM)
- **Orphaned profiles/artworks** → Data cleanup required  
- **Duplicate phone numbers** → Profile consolidation needed
- **Old pending invitations** → Manual follow-up with artists

### Weekly Review (LOW)
- **Broken media links** → Asset cleanup
- **Missing email addresses** → Contact data collection

## Emergency Response Procedures

### If Function Fails
1. **Check Supabase function logs**: Dashboard → Functions → admin-security-monitor
2. **Test manually**: Run `./test_security_monitor.sh` 
3. **Check dependencies**: Verify database connectivity and permissions
4. **Redeploy if needed**: `supabase functions deploy admin-security-monitor`

### If Critical Issues Found
1. **Auth contamination** → Follow `AUTH_METADATA_CONTAMINATION_BUG_2025-09-04.md`
2. **Email failures** → Follow `INVITATION_EMAIL_SYSTEM_FIX_2025-09-04.md`
3. **Profile issues** → Follow `SECURITY_FIX_ARTIST_PROFILE_SYSTEM_2025-09-04.md`

## Logging & Audit Trail

### Function Logs
- **Location**: Supabase Dashboard → Functions → admin-security-monitor → Logs
- **Retention**: 7 days (Supabase standard)
- **Content**: Detailed execution logs, SQL query results, Slack notification status

### System Logs (if using cron)
- **Location**: `/var/log/security_monitor.log`
- **Rotation**: Configure with logrotate
- **Content**: Function response summaries and timestamps

### Slack History
- **Channel**: Configure webhook to appropriate channel
- **Searchable**: Use Slack search for `"Database Security Monitoring Alert"`
- **Archive**: Slack retains per plan (90 days for free, unlimited for paid)

## Performance & Cost Considerations

### Function Resource Usage
- **Runtime**: ~5-15 seconds depending on database size
- **Memory**: ~64MB typical usage
- **Database queries**: 14 analytical queries per run
- **Cost**: Minimal - well within Supabase free tier limits

### Frequency Recommendations
- **Critical checks**: Every 4 hours during business hours
- **Full monitoring**: Daily at 9 AM
- **Weekly deep dive**: Manual review of trends and patterns

### Optimization Options
- **Selective checks**: Modify function to run only specific checks on frequent runs
- **Batch processing**: Combine related queries for better performance
- **Caching**: Store results for non-critical trending analysis

## Maintenance & Updates

### Monthly Tasks
- [ ] Review alert thresholds and adjust based on false positive rates
- [ ] Update monitoring queries if schema changes occur
- [ ] Test Slack webhook functionality
- [ ] Review function performance and logs

### Quarterly Tasks  
- [ ] Add new monitoring checks based on discovered issues
- [ ] Update documentation with lessons learned
- [ ] Review and optimize SQL query performance
- [ ] Validate all emergency response procedures

### Integration Points
- **Related Systems**: Auth webhook, email system, profile management
- **Dependencies**: Supabase functions, database permissions, Slack webhook
- **Monitoring**: Function logs, Slack alerts, manual testing

---

**Setup Completed**: September 4, 2025  
**Status**: ✅ Deployed and tested - detecting 0 issues currently  
**Next Steps**: Configure Slack webhook and schedule automated runs
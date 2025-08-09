# Cron Setup for Daily Backups

## Quick Setup

To set up daily automated backups, follow these steps:

### 1. Test the Script First
```bash
# Test the backup script manually
cd /root/vote_app/vote26
./scripts/daily-backup.sh

# Check if backup was created successfully
ls -la backups/daily_*.tar.gz | tail -1
```

### 2. Set Up Cron Job

#### Option A: Quick Setup (2 AM daily)
```bash
# Add to crontab
(crontab -l 2>/dev/null; echo "0 2 * * * /root/vote_app/vote26/scripts/daily-backup.sh >> /var/log/artbattle-backup.log 2>&1") | crontab -

# Verify cron was added
crontab -l
```

#### Option B: Custom Schedule
```bash
# Edit crontab manually
crontab -e

# Add one of these lines:
# Daily at 2 AM
0 2 * * * /root/vote_app/vote26/scripts/daily-backup.sh >> /var/log/artbattle-backup.log 2>&1

# Daily at 3:30 AM
30 3 * * * /root/vote_app/vote26/scripts/daily-backup.sh >> /var/log/artbattle-backup.log 2>&1

# Every 12 hours (2 AM and 2 PM)
0 2,14 * * * /root/vote_app/vote26/scripts/daily-backup.sh >> /var/log/artbattle-backup.log 2>&1

# Weekly on Sundays at 2 AM
0 2 * * 0 /root/vote_app/vote26/scripts/daily-backup.sh >> /var/log/artbattle-backup.log 2>&1
```

### 3. Monitor Backups

#### Check backup logs:
```bash
# View recent backup logs
tail -f /var/log/artbattle-backup.log

# View last backup status
tail -20 /var/log/artbattle-backup.log | grep -E "(STARTED|COMPLETED|ERROR)"

# Check backup file sizes
ls -lah backups/daily_*.tar.gz | tail -5
```

#### Check cron is running:
```bash
# Check cron service status
systemctl status cron

# Check cron logs
grep "daily-backup" /var/log/cron.log | tail -5
```

## Script Configuration

### Environment Variables
The script uses these environment variables (with defaults):

```bash
# Database connection (defaults work for current setup)
export SUPABASE_DB_HOST="db.xsqdkubgyqwpyvfltnrf.supabase.co"
export SUPABASE_DB_PORT="5432"
export SUPABASE_DB_NAME="postgres"
export SUPABASE_DB_USER="postgres"
export PGPASSWORD="6kEtvU9n0KhTVr5"

# Backup settings
export BACKUP_RETENTION_DAYS="30"  # Keep backups for 30 days
```

### Customization Options

Edit `/root/vote_app/vote26/scripts/daily-backup.sh`:

```bash
# Change retention period (line ~30)
RETENTION_DAYS=30  # Change to desired days

# Add notification webhook (line ~95)
# Uncomment and add your Slack webhook URL
SLACK_WEBHOOK_URL="https://hooks.slack.com/services/YOUR/WEBHOOK/URL"

# Change backup location (line ~26)
BACKUP_BASE_DIR="$PROJECT_DIR/backups"  # Change path if needed
```

## Backup Storage Management

### Automatic Cleanup
- Script automatically deletes backups older than 30 days (configurable)
- Cleans up failed/incomplete backup directories

### Manual Cleanup
```bash
# Remove backups older than 7 days
find /root/vote_app/vote26/backups -name "daily_*.tar.gz" -mtime +7 -delete

# Check total backup size
du -sh /root/vote_app/vote26/backups

# Keep only last 10 backups
cd /root/vote_app/vote26/backups && ls -1t daily_*.tar.gz | tail -n +11 | xargs -r rm
```

## Backup Verification

### Automated Checks
The script automatically:
- Tests database connection before starting
- Verifies table data export
- Tests archive integrity after compression
- Logs all operations with timestamps

### Manual Verification
```bash
# Test backup integrity
tar -tzf backups/daily_YYYYMMDD_HHMMSS.tar.gz > /dev/null && echo "Archive OK"

# Check backup contents
tar -tzf backups/daily_YYYYMMDD_HHMMSS.tar.gz | head -10

# Extract specific file to check
tar -xzf backups/daily_YYYYMMDD_HHMMSS.tar.gz daily_YYYYMMDD_HHMMSS/backup_info.txt -O
```

## Troubleshooting

### Common Issues

**Cron job not running:**
```bash
# Check cron service
sudo systemctl status cron

# Restart cron if needed
sudo systemctl restart cron

# Check system logs
journalctl -u cron | tail -10
```

**Permission denied:**
```bash
# Make script executable
chmod +x /root/vote_app/vote26/scripts/daily-backup.sh

# Check file ownership
ls -la /root/vote_app/vote26/scripts/daily-backup.sh

# Fix ownership if needed
chown root:root /root/vote_app/vote26/scripts/daily-backup.sh
```

**Database connection failed:**
```bash
# Test connection manually
PGPASSWORD='6kEtvU9n0KhTVr5' psql -h db.xsqdkubgyqwpyvfltnrf.supabase.co -p 5432 -d postgres -U postgres -c "SELECT 1;"

# Check network connectivity
ping db.xsqdkubgyqwpyvfltnrf.supabase.co
```

**Disk space issues:**
```bash
# Check available disk space
df -h

# Check backup directory size
du -sh /root/vote_app/vote26/backups

# Clean up old backups manually
find /root/vote_app/vote26/backups -name "daily_*.tar.gz" -mtime +7 -delete
```

## Emergency Procedures

### If Daily Backup Fails
1. Check the log: `tail -50 /var/log/artbattle-backup.log`
2. Test script manually: `./scripts/daily-backup.sh`
3. Verify database connectivity
4. Check disk space availability
5. Contact system administrator if needed

### Before Major Events
```bash
# Create immediate backup before event
/root/vote_app/vote26/scripts/daily-backup.sh

# Verify backup completed successfully
echo $?  # Should return 0 for success

# Check backup file was created
ls -la /root/vote_app/vote26/backups/daily_*.tar.gz | tail -1
```

## Notification Setup (Optional)

To receive notifications when backups complete or fail:

1. **Slack Integration:**
   ```bash
   # Edit the script and add your webhook URL
   nano /root/vote_app/vote26/scripts/daily-backup.sh
   
   # Find line ~95 and uncomment:
   SLACK_WEBHOOK_URL="https://hooks.slack.com/services/YOUR/WEBHOOK/URL"
   ```

2. **Email Notifications:**
   ```bash
   # Install mail utility
   apt-get install mailutils
   
   # Add to cron with email notification
   0 2 * * * /root/vote_app/vote26/scripts/daily-backup.sh 2>&1 | mail -s "Daily Backup Report" admin@artbattle.com
   ```

---
*Last Updated: 2025-08-09*
*Version: 1.0*
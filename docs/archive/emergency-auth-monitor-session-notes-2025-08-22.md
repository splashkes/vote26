# Emergency Auth Monitor Session Notes - August 22, 2025

## Overview
Today's session focused on setting up and enhancing an emergency authentication monitoring system for the Art Battle Vote application during a live event. The system was designed to detect and automatically fix authentication issues in real-time.

## Initial Problem Investigation
- **Started with**: User reporting SQL query issues with `function_edge_logs` table
- **Discovery**: The `function_edge_logs` table doesn't exist in the current Supabase database
- **Learning**: Edge function logs may not be available in all Supabase projects or may be named differently
- **Alternative suggested**: Use system_logs table or Supabase CLI for edge function logs

## Emergency Auth Monitor Script Enhancement

### Script Location
- **File**: `/root/vote_app/vote26/emergency_auth_monitor.sh`
- **Purpose**: Auto-fixes unlinked users during live events to prevent auth failures

### Key Issues the Script Monitors & Fixes
1. **Unlinked Users**: Users in `auth.users` with confirmed phones but no corresponding record in `people` table
2. **Missing Metadata**: Users missing `person_id` in their `raw_user_meta_data`
3. **Unverified Users**: Users marked as `verified = false` in people table despite phone confirmation

### Script Evolution Throughout the Session

#### Initial State (30-second intervals)
- Basic monitoring every 30 seconds
- Simple count reports without phone number details
- Basic fix functionality

#### Enhancement 1: Phone Number Logging
**What we added:**
- Phone number capture BEFORE fixing issues
- Separate queries for each issue type to get affected phone numbers
- Enhanced logging to show exactly which users were fixed

**Code changes:**
```bash
# Added phone number capture for each issue type
UNLINKED_PHONES=$(PGPASSWORD='...' $PSQL_CMD -c "SELECT COALESCE(au.phone, 'no-phone') as phone FROM auth.users au LEFT JOIN people p ON p.auth_user_id = au.id WHERE au.phone_confirmed_at IS NOT NULL AND p.id IS NULL;" | tr '\n' ' ')

MISSING_META_PHONES=$(PGPASSWORD='...' $PSQL_CMD -c "SELECT COALESCE(phone, 'no-phone') as phone FROM auth.users WHERE phone_confirmed_at IS NOT NULL AND raw_user_meta_data->>'person_id' IS NULL;" | tr '\n' ' ')

UNVERIFIED_PHONES=$(PGPASSWORD='...' $PSQL_CMD -c "SELECT COALESCE(au.phone, 'no-phone') as phone FROM people p JOIN auth.users au ON p.auth_user_id = au.id WHERE au.phone_confirmed_at IS NOT NULL AND p.verified = false;" | tr '\n' ' ')
```

#### Enhancement 2: Faster Response Times
- **30 seconds → 3 seconds → 1 second**
- Progressive reduction for faster issue detection during high-traffic periods
- Final configuration: 1-second monitoring intervals for maximum responsiveness

### Live Event Activity Observed

#### High Activity Periods
**Major authentication fix session (09:06 - 09:29):**
- 22 users with missing metadata fixed in 20 minutes
- Mix of Australian (61) and New Zealand (64) phone numbers
- Peak activity: 4 users fixed simultaneously at 09:26:12

**Phone numbers fixed during peak period:**
- 642040383595, 642102891722, 61450610440
- 6421786724, 61410863227 (simultaneous)
- 64223854172, 61433686776, 61434596585
- 61406218278, 642902000163, 61410228092
- 61450530318, 61432048876, 642102507695
- 61414585925, 61426679794 (simultaneous)
- 61416438930, 61412910013
- 61425328075, 61410140980, 642041197448, 61423546079 (4 simultaneous!)
- 61427031790

#### Latest Activity (09:47 - 09:56)
- Additional users fixed: 61411980070, 61458280115, 6421333640, 61468333080
- Mixed unlinked and missing metadata issues
- International user: 447943214254 (UK number)

### Technical Insights Learned

#### Database Schema Understanding
- `auth.users` table contains Supabase authentication data
- `people` table contains application-specific user data
- Link between tables via `people.auth_user_id = auth.users.id`
- `raw_user_meta_data->>'person_id'` stores the person ID in auth metadata

#### Common Auth Failure Patterns
1. **Registration Race Conditions**: Users complete phone verification before people record is fully created
2. **Metadata Sync Issues**: person_id not always properly set in auth metadata
3. **Verification Status Lag**: Users remain unverified after successful phone confirmation

#### Geographic Distribution of Issues
- **Australia (61 prefix)**: Majority of auth issues
- **New Zealand (64 prefix)**: Significant portion of issues  
- **UK (44 prefix)**: Occasional international users
- **Pattern**: Issues seem to correlate with user registration flows during live events

### Performance Optimizations Implemented

#### Query Efficiency
- Used `-t -A` flags for clean psql output
- COALESCE() to handle NULL phone numbers gracefully
- Efficient JOINs to identify problematic users

#### Monitoring Frequency
- Started: 30-second intervals (suitable for low traffic)
- Progressed: 3-second intervals (better for moderate activity)
- Final: 1-second intervals (optimal for live event high traffic)

#### Background Process Management
- Used background bash execution for continuous monitoring
- Implemented proper process killing and restarting
- Real-time output monitoring with BashOutput tool

### Script Architecture Lessons

#### Effective Error Handling
- Handle PostgreSQL function existence issues (ROW_COUNT() error encountered)
- Graceful handling of empty phone numbers
- Proper error reporting without breaking the monitoring loop

#### Logging Best Practices
- Timestamp every action for audit trail
- Include specific phone numbers for accountability
- Clear status messages for operational visibility
- Separate logging for different issue types

### Operational Insights

#### Live Event Requirements
- Sub-second response times critical during high user activity
- Phone number logging essential for user support and debugging
- Continuous monitoring prevents user experience degradation
- Automated fixes reduce manual intervention during events

#### Scaling Considerations
- 1-second intervals sustainable for current database load
- Monitor database connection limits during high-frequency polling
- Consider connection pooling for production deployments

## Recommendations for Future Events

### Monitoring Setup
1. Start monitoring 30 minutes before event begins
2. Use 1-second intervals during peak registration periods
3. Return to longer intervals (10-30 seconds) during stable periods

### Alerting Enhancements
- Add Slack/Discord integration for critical issues
- Email alerts for sustained high error rates
- Dashboard for real-time auth health visualization

### Database Optimizations
- Index optimization for auth monitoring queries
- Consider read replicas for monitoring to reduce main DB load
- Pre-event database health checks

### Backup Procedures
- Manual intervention procedures if script fails
- Database rollback procedures for fix operations
- Emergency contact procedures for live event support

## Files Modified/Created
- `/root/vote_app/vote26/emergency_auth_monitor.sh` - Enhanced with phone logging and faster intervals
- `/root/vote_app/vote26/emergency-auth-monitor-session-notes-2025-08-22.md` - This documentation

## Key Technical Achievements
1. ✅ Implemented real-time auth issue detection
2. ✅ Added detailed phone number logging for accountability
3. ✅ Optimized monitoring frequency for live event needs
4. ✅ Demonstrated successful auto-fixing of 25+ user auth issues
5. ✅ Established operational procedures for live event monitoring

## Next Steps
- Consider implementing rate limiting to prevent database overload
- Add metrics collection for auth issue frequency analysis
- Develop alerting thresholds based on today's baseline data
- Create runbook for operators during live events
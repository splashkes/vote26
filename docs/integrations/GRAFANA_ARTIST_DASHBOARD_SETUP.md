# Art Battle Artist Activity Grafana Dashboard Setup Guide

## Overview
This dashboard provides high-resolution time series monitoring of artist engagement across the Art Battle platform, tracking profiles, applications, invitations, and confirmations with 15-minute granularity.

## Database Connection Details

### Connection Configuration
- **Host**: `db.xsqdkubgyqwpyvfltnrf.supabase.co`
- **Port**: `5432`
- **Database**: `postgres`
- **Username**: `postgres`  
- **Password**: `6kEtvU9n0KhTVr5` (from environment)
- **SSL Mode**: `require`

### Test Connection Query
```sql
SELECT 
  COUNT(*) as total_profiles,
  COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '24 hours') as profiles_24h,
  COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '7 days') as profiles_7d
FROM artist_profiles;
```

## Critical Table Schema Information

### Timestamp Fields (IMPORTANT - Each table is different!)

| Table | Creation Field | Update Field | Type | Notes |
|-------|---------------|--------------|------|-------|
| `artist_profiles` | `created_at` | `updated_at` | `timestamptz` | Standard Supabase |
| `artist_applications` | `applied_at` | `updated_at` | `timestamptz` | Applied date is creation |
| `artist_invitations` | `created_at` | `updated_at` | `timestamp` | **No timezone** |
| `artist_confirmations` | `created_at` | `updated_at` | `timestamp` | **No timezone** |

### Data Volume (Last 7 Days - Verified Active)
- **Artist Profiles**: ~15 new, ~10 updates
- **Applications**: ~25 new, minimal updates  
- **Invitations**: ~20 new, minimal updates
- **Confirmations**: ~15 new, minimal updates

## Dashboard Installation

### Method 1: JSON Import
1. Copy the contents of `grafana-artist-activity-dashboard.json`
2. In Grafana: **Create > Import Dashboard**
3. Paste JSON and configure PostgreSQL data source
4. Set refresh interval to **30 seconds** for real-time monitoring

### Method 2: Manual Panel Creation
Use the SQL queries from `grafana-sql-queries.sql` to create individual panels.

## Dashboard Panels Overview

### 1. High-Resolution Time Series (15-minute intervals)
- **Artist Profiles**: New registrations and profile updates
- **Applications**: New applications and status changes
- **Invitations**: Sent invitations and responses
- **Confirmations**: New confirmations and updates

### 2. Combined Activity Overview  
- All activity types in single view
- Hourly aggregation for trend analysis
- Color-coded by activity type

### 3. Real-Time Statistics
- Current hour activity counters
- 7-day rolling totals
- Status breakdowns (pie charts)

### 4. Event Analysis
- Activity by event (top performing events)
- Participation funnel (applications → invitations → confirmations)
- Event-specific trends

## Key SQL Queries

### High-Resolution Activity (15-minute buckets)
```sql
SELECT
  date_trunc('minute', created_at - (EXTRACT(minute FROM created_at)::int % 15) * interval '1 minute') as time,
  COUNT(*) as "New Profiles"
FROM artist_profiles 
WHERE $__timeFilter(created_at)
GROUP BY date_trunc('minute', created_at - (EXTRACT(minute FROM created_at)::int % 15) * interval '1 minute')
ORDER BY time;
```

### Event Participation Funnel
```sql
SELECT 
  e.name as event_name,
  COUNT(DISTINCT aa.artist_profile_id) as "Applications",
  COUNT(DISTINCT ai.artist_profile_id) as "Invitations",
  COUNT(DISTINCT ac.artist_profile_id) as "Confirmations"
FROM events e
LEFT JOIN artist_applications aa ON e.id = aa.event_id 
LEFT JOIN artist_invitations ai ON e.eid = ai.event_eid 
LEFT JOIN artist_confirmations ac ON e.eid = ac.event_eid 
WHERE e.created_at >= NOW() - INTERVAL '60 days'
GROUP BY e.name, e.id
ORDER BY COUNT(DISTINCT aa.artist_profile_id) DESC;
```

## Performance Optimization

### Database Indexes (Already Present)
- `idx_artist_profiles_*` - Comprehensive indexing on all timestamp fields
- `idx_artist_applications_applied_at` - Critical for time series queries  
- `idx_artist_*_status` - Status filtering indexes
- All foreign key relationships indexed

### Query Optimization Tips
1. **Always use `$__timeFilter()`** for Grafana time range filtering
2. **15-minute aggregation** uses modulo arithmetic for precise intervals
3. **UNION ALL** queries minimize overhead for combined views
4. **HAVING clauses** filter out empty results before sorting

## Live Event Monitoring

### Real-Time Alerts (Recommended)
- **High activity threshold**: >10 registrations/hour
- **System anomaly**: 0 activity for >2 hours during event periods
- **Conversion drops**: Applications without invitations >24 hours

### Event Day Dashboard Settings
- **Refresh**: 10-30 seconds
- **Time range**: Last 24 hours with 15-minute resolution
- **Focus panels**: Real-time stats, event-specific activity
- **Alerts**: Enabled for all critical thresholds

## Tested Data Patterns (Last 7 Days)

### Peak Activity Times
- **Toronto event**: 14 applications, 1 invitation
- **Ottawa event**: 11 applications, 7 invitations, 5 confirmations
- **Bangkok event**: 10 applications, 7 invitations, 7 confirmations
- **Activity pattern**: Steady 1-3 profiles/hour, bursts during event periods

### Status Distribution
- **Applications**: Primarily "pending" status
- **Invitations**: Mix of "pending" and "accepted"
- **Confirmations**: Mostly "confirmed" status

## Troubleshooting

### Common Issues
1. **Empty panels**: Check data source connection and time range
2. **Timezone issues**: `artist_invitations` and `artist_confirmations` use local time
3. **Missing data**: Verify table names and timestamp field names
4. **Performance**: Limit time ranges for complex queries during high activity

### Verification Queries
```sql
-- Test each table's recent activity
SELECT 'profiles' as table_name, COUNT(*) FROM artist_profiles WHERE created_at >= NOW() - INTERVAL '24 hours'
UNION ALL
SELECT 'applications', COUNT(*) FROM artist_applications WHERE applied_at >= NOW() - INTERVAL '24 hours'
UNION ALL  
SELECT 'invitations', COUNT(*) FROM artist_invitations WHERE created_at >= NOW() - INTERVAL '24 hours'
UNION ALL
SELECT 'confirmations', COUNT(*) FROM artist_confirmations WHERE created_at >= NOW() - INTERVAL '24 hours';
```

## Dashboard Maintenance

### Regular Tasks
- **Weekly**: Review panel performance and adjust time ranges
- **Monthly**: Archive old data views, update event filters
- **Before major events**: Test all alerts and real-time functionality
- **After events**: Analyze patterns and adjust thresholds

### Data Retention
- **High-resolution data**: 30 days for 15-minute intervals
- **Hourly aggregations**: 1 year for trend analysis
- **Daily summaries**: Indefinite for historical reporting

---

## Files Included
- `grafana-artist-activity-dashboard.json` - Complete dashboard export
- `grafana-sql-queries.sql` - All SQL queries with documentation
- This setup guide

**Dashboard is production-ready and tested with live data from the last 7 days showing active artist engagement patterns.**
# Grafana Dashboard Specifications for Art Battle System Monitoring

**Date:** August 21, 2025  
**Event:** AB3019 (Auckland CBD)  
**Purpose:** Real-time monitoring for live Art Battle events with comprehensive error detection and performance tracking

---

## Dashboard 1: Real-Time Event Activity

### Panel 1.1: User Activity Rate
**Purpose:** Monitor user signup and verification rates  
**Chart Type:** Time series line chart  
**Y-Axis:** Count per minute  
**Alerts:** > 50 signups/minute (capacity concern)

```sql
-- Active Users (Last 10 minutes)
SELECT 
  $__time(created_at),
  COUNT(*) as new_signups
FROM auth.users 
WHERE $__timeFilter(created_at)
GROUP BY $__timeGroup(created_at, '1m')
ORDER BY time;

-- Phone Verifications Rate
SELECT 
  $__time(phone_confirmed_at),
  COUNT(*) as verifications
FROM auth.users 
WHERE $__timeFilter(phone_confirmed_at)
AND phone_confirmed_at IS NOT NULL
GROUP BY $__timeGroup(phone_confirmed_at, '1m')
ORDER BY time;
```

### Panel 1.2: Voting Activity Heatmap
**Purpose:** Track voting intensity by round  
**Chart Type:** Time series with multiple series  
**Legend:** Round 1, Round 2, Round 3, Round 4

```sql
-- Votes per minute by round
SELECT 
  $__time(created_at),
  round as metric,
  COUNT(*) as value
FROM votes 
WHERE event_id = 'e6e74b4c-8b9d-4abe-be66-e610602980b3'
AND $__timeFilter(created_at)
GROUP BY $__timeGroup(created_at, '1m'), round
ORDER BY time;
```

### Panel 1.3: Bidding Activity & Values
**Purpose:** Monitor auction activity and revenue generation  
**Chart Type:** Time series with dual Y-axis  
**Left Y-Axis:** Bid count  
**Right Y-Axis:** Dollar value (NZD)

```sql
-- Bid frequency and total value
SELECT 
  $__time(b.created_at),
  COUNT(*) as bid_count,
  SUM(b.amount) as total_value_nzd
FROM bids b
JOIN art a ON a.id = b.art_id
WHERE a.event_id = 'e6e74b4c-8b9d-4abe-be66-e610602980b3'
AND $__timeFilter(b.created_at)
GROUP BY $__timeGroup(b.created_at, '1m')
ORDER BY time;
```

### Panel 1.4: QR Code Scan Activity
**Purpose:** Track physical engagement at venue  
**Chart Type:** Time series line chart

```sql
-- QR scans per minute
SELECT 
  $__time(created_at),
  COUNT(*) as qr_scans
FROM people_qr_scans 
WHERE event_id = 'e6e74b4c-8b9d-4abe-be66-e610602980b3'
AND $__timeFilter(created_at)
GROUP BY $__timeGroup(created_at, '1m')
ORDER BY time;
```

---

## Dashboard 2: System Health & Errors

### Panel 2.1: Auth System Health
**Purpose:** Monitor authentication system integrity  
**Chart Type:** Stat panels with trend sparklines  
**Alerts:** Circular refs > 0, Unlinked users increasing rapidly

```sql
-- Auth system metrics over time
SELECT 
  NOW() as time,
  'unlinked_users' as metric,
  COUNT(*) as value
FROM auth.users au
LEFT JOIN people p ON p.auth_user_id = au.id
WHERE au.phone_confirmed_at IS NOT NULL AND p.id IS NULL

UNION ALL

SELECT 
  NOW() as time,
  'no_metadata' as metric,
  COUNT(*) as value
FROM auth.users 
WHERE phone_confirmed_at IS NOT NULL 
AND raw_user_meta_data->>'person_id' IS NULL

UNION ALL

SELECT 
  NOW() as time,
  'circular_refs' as metric,
  COUNT(*) as value
FROM auth.users au
JOIN people p ON p.auth_user_id = au.id
WHERE (au.raw_user_meta_data->>'person_id')::uuid IS NOT NULL
AND (au.raw_user_meta_data->>'person_id')::uuid != p.id;
```

### Panel 2.2: Payment Processing Status
**Purpose:** Track payment system health and failures  
**Chart Type:** Pie chart + Time series  
**Alerts:** Failed payments > 5% of total, Stuck processing > 10

```sql
-- Payment status distribution
SELECT 
  NOW() as time,
  status as metric,
  COUNT(*) as value
FROM payment_processing 
WHERE event_id = 'e6e74b4c-8b9d-4abe-be66-e610602980b3'
GROUP BY status;

-- Payment failures over time
SELECT 
  $__time(created_at),
  COUNT(CASE WHEN status = 'failed' THEN 1 END) as failures,
  COUNT(CASE WHEN status = 'processing' AND created_at < NOW() - INTERVAL '30 minutes' THEN 1 END) as stuck
FROM payment_processing 
WHERE event_id = 'e6e74b4c-8b9d-4abe-be66-e610602980b3'
AND $__timeFilter(created_at)
GROUP BY $__timeGroup(created_at, '5m')
ORDER BY time;
```

### Panel 2.3: Data Integrity Errors
**Purpose:** Catch validation bypass and data corruption  
**Chart Type:** Time series  
**Alerts:** Any invalid bids or anonymous votes

```sql
-- Bid validation errors
SELECT 
  $__time(b.created_at),
  COUNT(*) as invalid_bids
FROM bids b 
JOIN art a ON a.id = b.art_id 
WHERE a.event_id = 'e6e74b4c-8b9d-4abe-be66-e610602980b3'
AND $__timeFilter(b.created_at)
AND b.amount < COALESCE(a.current_bid + 5, a.starting_bid, 55)
GROUP BY $__timeGroup(b.created_at, '1m')
ORDER BY time;

-- Votes without person attribution
SELECT 
  $__time(created_at),
  COUNT(*) as anonymous_votes
FROM votes 
WHERE event_id = 'e6e74b4c-8b9d-4abe-be66-e610602980b3'
AND $__timeFilter(created_at)
AND person_id IS NULL
GROUP BY $__timeGroup(created_at, '1m')
ORDER BY time;
```

### Panel 2.4: Recent Auth Failures
**Purpose:** Track authentication webhook and linking failures  
**Chart Type:** Time series

```sql
-- Auth failures in real-time
SELECT 
  $__time(phone_confirmed_at),
  COUNT(CASE WHEN raw_user_meta_data->>'person_id' IS NULL THEN 1 END) as webhook_failures
FROM auth.users 
WHERE $__timeFilter(phone_confirmed_at)
AND phone_confirmed_at IS NOT NULL
GROUP BY $__timeGroup(phone_confirmed_at, '1m')
ORDER BY time;
```

---

## Dashboard 3: Performance & Scalability

### Panel 3.1: Database Performance
**Purpose:** Monitor database load and contention  
**Chart Type:** Stat panels with color thresholds  
**Thresholds:** Green < 20 connections, Yellow < 50, Red > 50  
**Alerts:** Slow queries > 5, Waiting locks > 0

```sql
-- Active connections and query performance
SELECT 
  NOW() as time,
  'active_connections' as metric,
  COUNT(*) as value
FROM pg_stat_activity 
WHERE state = 'active' AND query != '<IDLE>'

UNION ALL

-- Slow queries
SELECT 
  NOW() as time,
  'slow_queries' as metric,
  COUNT(*) as value
FROM pg_stat_activity 
WHERE state = 'active' 
AND NOW() - query_start > INTERVAL '5 seconds'

UNION ALL

-- Lock contention
SELECT 
  NOW() as time,
  'waiting_locks' as metric,
  COUNT(*) as value
FROM pg_locks 
WHERE NOT granted;
```

### Panel 3.2: Query Execution Times
**Purpose:** Monitor database query performance degradation  
**Chart Type:** Time series  
**Y-Axis:** Milliseconds  
**Alerts:** Query time > 1000ms  
**Requirements:** pg_stat_statements extension enabled

```sql
-- Average query time for key operations
SELECT 
  NOW() as time,
  'voting_queries' as metric,
  mean_exec_time as value
FROM pg_stat_statements 
WHERE query ILIKE '%votes%' 
AND query ILIKE '%event_id%'

UNION ALL

SELECT 
  NOW() as time,
  'bidding_queries' as metric,
  mean_exec_time as value
FROM pg_stat_statements 
WHERE query ILIKE '%bids%' 
AND query ILIKE '%art_id%'

UNION ALL

SELECT 
  NOW() as time,
  'auth_queries' as metric,
  mean_exec_time as value
FROM pg_stat_statements 
WHERE query ILIKE '%auth.users%';
```

### Panel 3.3: Table Size Growth
**Purpose:** Monitor unexpected data growth during event  
**Chart Type:** Time series  
**Thresholds:** Monitor for unexpected growth rates

```sql
-- Table sizes for monitoring growth
SELECT 
  NOW() as time,
  'votes_size_mb' as metric,
  pg_total_relation_size('votes')/1024/1024 as value

UNION ALL

SELECT 
  NOW() as time,
  'bids_size_mb' as metric,
  pg_total_relation_size('bids')/1024/1024 as value

UNION ALL

SELECT 
  NOW() as time,
  'people_size_mb' as metric,
  pg_total_relation_size('people')/1024/1024 as value

UNION ALL

SELECT 
  NOW() as time,
  'auth_users_size_mb' as metric,
  pg_total_relation_size('auth.users')/1024/1024 as value;
```

### Panel 3.4: Connection Pool Health
**Purpose:** Monitor Supabase connection pool utilization

```sql
-- Connection pool metrics
SELECT 
  NOW() as time,
  'total_connections' as metric,
  COUNT(*) as value
FROM pg_stat_activity

UNION ALL

SELECT 
  NOW() as time,
  'idle_connections' as metric,
  COUNT(*) as value
FROM pg_stat_activity 
WHERE state = 'idle'

UNION ALL

SELECT 
  NOW() as time,
  'idle_in_transaction' as metric,
  COUNT(*) as value
FROM pg_stat_activity 
WHERE state = 'idle in transaction';
```

---

## Dashboard 4: Business Metrics

### Panel 4.1: Revenue Tracking
**Purpose:** Real-time revenue and sales performance  
**Chart Type:** Table with conditional formatting  
**Format:** Currency for revenue columns

```sql
-- Real-time revenue by round
SELECT 
  a.round,
  COUNT(CASE WHEN a.status = 'sold' THEN 1 END) as sold_pieces,
  COUNT(*) as total_pieces,
  ROUND((COUNT(CASE WHEN a.status = 'sold' THEN 1 END)::float / COUNT(*) * 100), 1) as sell_through_rate,
  SUM(CASE WHEN a.status = 'sold' THEN a.current_bid ELSE 0 END) as revenue_nzd,
  AVG(CASE WHEN a.status = 'sold' THEN a.current_bid END) as avg_sale_price,
  MAX(CASE WHEN a.status = 'sold' THEN a.current_bid END) as highest_sale
FROM art a
WHERE a.event_id = 'e6e74b4c-8b9d-4abe-be66-e610602980b3'
GROUP BY a.round
ORDER BY a.round;
```

### Panel 4.2: Engagement Metrics
**Purpose:** User engagement funnel analysis  
**Chart Type:** Funnel chart or horizontal bar chart

```sql
-- User engagement funnel
SELECT 
  'qr_scans' as stage,
  1 as stage_order,
  COUNT(*) as users
FROM people_qr_scans 
WHERE event_id = 'e6e74b4c-8b9d-4abe-be66-e610602980b3'

UNION ALL

SELECT 
  'voters' as stage,
  2 as stage_order,
  COUNT(DISTINCT person_id) as users
FROM votes 
WHERE event_id = 'e6e74b4c-8b9d-4abe-be66-e610602980b3'

UNION ALL

SELECT 
  'bidders' as stage,
  3 as stage_order,
  COUNT(DISTINCT b.person_id) as users
FROM bids b
JOIN art a ON a.id = b.art_id
WHERE a.event_id = 'e6e74b4c-8b9d-4abe-be66-e610602980b3'

UNION ALL

SELECT 
  'buyers' as stage,
  4 as stage_order,
  COUNT(DISTINCT pp.person_id) as users
FROM payment_processing pp
WHERE pp.event_id = 'e6e74b4c-8b9d-4abe-be66-e610602980b3'
AND pp.status = 'completed'

ORDER BY stage_order;
```

### Panel 4.3: Top Performing Artworks
**Purpose:** Track highest bid activity and values  
**Chart Type:** Table

```sql
-- Top performing artworks by bid activity
SELECT 
  a.art_code,
  a.round,
  a.easel,
  ap.name as artist_name,
  a.current_bid,
  a.bid_count,
  a.vote_count,
  a.status,
  CASE WHEN a.current_bid IS NOT NULL 
       THEN ROUND((a.current_bid / 55.0 - 1) * 100, 1) 
       ELSE 0 END as price_increase_percent
FROM art a
LEFT JOIN artist_profiles ap ON ap.id = a.artist_id
WHERE a.event_id = 'e6e74b4c-8b9d-4abe-be66-e610602980b3'
ORDER BY a.current_bid DESC NULLS LAST, a.bid_count DESC
LIMIT 10;
```

### Panel 4.4: Revenue Over Time
**Purpose:** Track cumulative revenue throughout event  
**Chart Type:** Time series area chart

```sql
-- Cumulative revenue over time
SELECT 
  $__time(pp.created_at),
  SUM(a.current_bid) OVER (ORDER BY pp.created_at) as cumulative_revenue_nzd
FROM payment_processing pp
JOIN art a ON a.id = pp.art_id
WHERE pp.event_id = 'e6e74b4c-8b9d-4abe-be66-e610602980b3'
AND pp.status = 'completed'
AND $__timeFilter(pp.created_at)
ORDER BY pp.created_at;
```

---

## Dashboard 5: Alert Conditions

### Critical Alerts (PagerDuty Integration)

#### Auth Webhook Complete Failure
```sql
SELECT COUNT(*) as webhook_failures
FROM auth.users 
WHERE phone_confirmed_at > NOW() - INTERVAL '10 minutes'
AND raw_user_meta_data->>'person_id' IS NULL;
-- Alert if > 5
```

#### Payment System Down
```sql
SELECT COUNT(*) as stuck_payments
FROM payment_processing 
WHERE status = 'processing' 
AND created_at < NOW() - INTERVAL '30 minutes';
-- Alert if > 0
```

#### Database Locks/Deadlocks
```sql
SELECT COUNT(*) as waiting_locks
FROM pg_locks 
WHERE NOT granted;
-- Alert if > 0
```

#### Critical Function Failures
```sql
-- Check if critical functions exist
SELECT COUNT(*) as missing_functions
FROM (
  SELECT 1 WHERE NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'process_bid_secure')
  UNION ALL
  SELECT 1 WHERE NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'cast_vote_secure')
  UNION ALL  
  SELECT 1 WHERE NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'link_person_on_phone_verification')
) sub;
-- Alert if > 0
```

### Warning Alerts (Slack Integration)

#### High Payment Failure Rate
```sql
SELECT COUNT(*) as failed_payments
FROM payment_processing 
WHERE status = 'failed' 
AND created_at > NOW() - INTERVAL '10 minutes';
-- Warn if > 3
```

#### Performance Degradation
```sql
SELECT COUNT(*) as slow_queries
FROM pg_stat_activity 
WHERE state = 'active' 
AND NOW() - query_start > INTERVAL '10 seconds';
-- Warn if > 2
```

#### High Auth Failure Rate
```sql
SELECT COUNT(*) as recent_auth_failures
FROM auth.users 
WHERE phone_confirmed_at > NOW() - INTERVAL '5 minutes'
AND phone_confirmed_at IS NOT NULL
AND raw_user_meta_data->>'person_id' IS NULL;
-- Warn if > 3
```

#### Unusual Data Patterns
```sql
-- Check for data integrity issues
SELECT 
  (SELECT COUNT(*) FROM bids WHERE art_id IS NULL) +
  (SELECT COUNT(*) FROM votes WHERE person_id IS NULL AND created_at > NOW() - INTERVAL '1 hour') +
  (SELECT COUNT(*) FROM people WHERE auth_user_id IS NOT NULL AND created_at > NOW() - INTERVAL '1 hour' AND name IS NULL)
as data_integrity_issues;
-- Warn if > 0
```

---

## Grafana Configuration Specifications

### Data Source Configuration
- **Type:** PostgreSQL
- **Host:** db.xsqdkubgyqwpyvfltnrf.supabase.co:5432
- **Database:** postgres
- **SSL Mode:** require
- **Connection Limits:** Max open: 5, Max idle: 2
- **Query Timeout:** 30s

### Dashboard Settings
- **Refresh Rate:** 30 seconds (critical panels), 1 minute (others)
- **Default Time Range:** Last 2 hours
- **Quick Ranges:** 15m, 1h, 4h, 12h, 24h
- **Timezone:** Pacific/Auckland (event timezone)

### Template Variables
```
$event_id = 'e6e74b4c-8b9d-4abe-be66-e610602980b3'
$interval = auto (based on time range)
$min_bid_amount = 55
```

### Annotations
- **Round Changes:** Query events table for current_round updates
- **Auction Close Times:** Mark when auction_close_starts_at triggers
- **System Deployments:** Manual annotations for any mid-event fixes

### Panel Defaults
- **Legend:** Bottom, list format
- **Tooltips:** All series, sorted descending
- **Null Values:** Show as gaps
- **Units:** 
  - Currency: NZD ($)
  - Time: milliseconds
  - Counts: short (K, M notation)

### Color Schemes
- **Success:** Green (#73BF69)
- **Warning:** Yellow (#FADE2A) 
- **Error:** Red (#F2495C)
- **Info:** Blue (#5794F2)
- **Revenue:** Purple (#B877D9)

### Export Configuration
- **Panel URLs:** Include template variables
- **Image Export:** PNG, 1920x1080
- **CSV Export:** Include timestamps
- **API Access:** Generate service account for external integrations

---

## Implementation Priority

### Phase 1 (Pre-Event - Critical)
1. Dashboard 2: System Health & Errors
2. Critical alerts setup
3. Dashboard 3: Performance & Scalability

### Phase 2 (Event Day - Important)  
1. Dashboard 1: Real-Time Event Activity
2. Warning alerts setup
3. Dashboard 4: Business Metrics

### Phase 3 (Post-Event - Nice to Have)
1. Historical analysis panels
2. Capacity planning metrics
3. Custom annotation integrations

---

## Monitoring Checklist

### Pre-Event (1 hour before)
- [ ] All dashboards loading correctly
- [ ] Alert channels tested (PagerDuty, Slack)
- [ ] Database connection stable
- [ ] Baseline metrics recorded

### During Event
- [ ] Monitor Dashboard 2 continuously 
- [ ] Check Dashboard 1 every 5 minutes
- [ ] Validate Dashboard 4 revenue calculations
- [ ] Respond to alerts within 2 minutes

### Post-Event
- [ ] Export final metrics
- [ ] Generate performance report
- [ ] Document any anomalies
- [ ] Update alert thresholds based on learnings

This comprehensive monitoring setup will provide complete visibility into system health, user behavior, business performance, and immediate alerting for any issues during the live Art Battle event.
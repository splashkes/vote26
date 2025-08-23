# Grafana Connection Monitoring Queries for Supabase XL Instance

**Date:** August 21, 2025  
**Instance Type:** XL  
**Direct Connection Limit:** 240  
**Pooled Connection Limit:** 1,000  
**Event:** AB3019 (Auckland CBD) - 500 expected users

---

## Connection Limits by Supabase Instance Size Reference

| Instance | Direct Connections | Pooled Connections | Monthly Cost Est. |
|----------|-------------------|-------------------|-------------------|
| Nano     | 60                | 200               | Free              |
| Micro    | 60                | 200               | $25               |
| Small    | 90                | 400               | $50               |
| Medium   | 120               | 600               | $100              |
| Large    | 160               | 800               | $200              |
| **XL**   | **240**           | **1,000**         | **$400**          |
| 2XL      | 380               | 1,500             | $800              |

---

## Panel 1: Direct Connection Usage Gauge

### Query
```sql
-- Direct Connection Usage with Percentage
SELECT 
  NOW() as time,
  'direct_connections_used' as metric,
  COUNT(*) as value,
  240 as max_limit,
  ROUND((COUNT(*)::float / 240 * 100), 1) as usage_percent
FROM pg_stat_activity;
```

### Grafana Configuration
- **Panel Type:** Stat with gauge visualization
- **Display Name:** "Direct DB Connections"
- **Units:** Connections
- **Max Value:** 240
- **Decimals:** 0

### Thresholds
- **Green (Healthy):** 0-60% (0-144 connections)
- **Yellow (Warning):** 60-80% (144-192 connections)
- **Red (Critical):** 80-100% (192-240 connections)

### Alert Conditions
- **Warning:** Usage > 60% (144 connections)
- **Critical:** Usage > 80% (192 connections)

---

## Panel 2: Connection Breakdown by Type

### Query
```sql
-- Connection breakdown with percentages and categories
SELECT 
  NOW() as time,
  CASE 
    WHEN application_name LIKE '%realtime%' THEN 'realtime_system'
    WHEN application_name = 'postgrest' THEN 'postgrest_api'  
    WHEN application_name = '' AND usename = 'postgres' THEN 'direct_admin'
    WHEN application_name = '' THEN 'unnamed_connections'
    WHEN application_name LIKE '%pg_%' THEN 'system_services'
    WHEN application_name LIKE '%Supavisor%' THEN 'connection_pooler'
    ELSE 'other_applications'
  END as connection_type,
  COUNT(*) as connections,
  ROUND((COUNT(*)::float / 240 * 100), 1) as percent_of_limit,
  state
FROM pg_stat_activity 
WHERE pid != pg_backend_pid()
GROUP BY connection_type, state
ORDER BY connections DESC;
```

### Grafana Configuration
- **Panel Type:** Table
- **Transform:** Group by connection_type, sum connections
- **Conditional Formatting:**
  - Green: < 20 connections
  - Yellow: 20-50 connections
  - Red: > 50 connections

---

## Panel 3: Connection Pool Health Estimation

### Query
```sql
-- Pooled connection capacity estimation
SELECT 
  NOW() as time,
  'pooled_capacity' as metric,
  1000 as max_pooled_connections,
  -- PostgREST connections are pooled
  (SELECT COUNT(*) FROM pg_stat_activity WHERE application_name = 'postgrest') as postgrest_connections,
  -- Estimate pooled usage (conservative)
  GREATEST(
    (SELECT COUNT(*) FROM pg_stat_activity WHERE application_name = 'postgrest') * 5,
    50
  ) as estimated_pooled_used,
  1000 - GREATEST(
    (SELECT COUNT(*) FROM pg_stat_activity WHERE application_name = 'postgrest') * 5,
    50
  ) as estimated_pooled_available;
```

### Grafana Configuration
- **Panel Type:** Stat panels (multiple stats)
- **Visualization:** Show max_pooled_connections, estimated_pooled_used, estimated_pooled_available

---

## Panel 4: Real-time Connection Health Status

### Query
```sql
-- Real-time connection health status for alerts
SELECT 
  NOW() as time,
  'connection_health_status' as metric,
  CASE 
    WHEN COUNT(*) <= 144 THEN 'healthy'     -- ≤60% of 240
    WHEN COUNT(*) <= 192 THEN 'warning'     -- 60-80% of 240  
    WHEN COUNT(*) <= 216 THEN 'critical'    -- 80-90% of 240
    ELSE 'emergency'                        -- >90% of 240
  END as health_status,
  COUNT(*) as current_connections,
  240 - COUNT(*) as connections_remaining,
  ROUND((COUNT(*)::float / 240 * 100), 1) as usage_percentage
FROM pg_stat_activity;
```

### Grafana Configuration
- **Panel Type:** Stat
- **Value Mappings:**
  - healthy → Green background
  - warning → Yellow background  
  - critical → Red background
  - emergency → Dark red background

---

## Panel 5: Connection Trends Over Time

### Query
```sql
-- Connection usage trends over time
SELECT 
  $__time(NOW()),
  COUNT(*) as total_connections,
  COUNT(CASE WHEN application_name LIKE '%realtime%' THEN 1 END) as realtime_connections,
  COUNT(CASE WHEN application_name = 'postgrest' THEN 1 END) as api_connections,
  COUNT(CASE WHEN application_name = '' THEN 1 END) as direct_connections,
  240 as connection_limit
FROM pg_stat_activity 
WHERE pid != pg_backend_pid()
GROUP BY time
ORDER BY time;
```

### Grafana Configuration
- **Panel Type:** Time series
- **Multiple Series:** total_connections, realtime_connections, api_connections, direct_connections
- **Reference Line:** connection_limit at 240

---

## Panel 6: Connection Age Analysis

### Query
```sql
-- Analyze connection ages to identify leaks
SELECT 
  NOW() as time,
  'connection_age_analysis' as metric,
  COUNT(CASE WHEN NOW() - backend_start < INTERVAL '5 minutes' THEN 1 END) as connections_under_5min,
  COUNT(CASE WHEN NOW() - backend_start BETWEEN INTERVAL '5 minutes' AND INTERVAL '1 hour' THEN 1 END) as connections_5min_1hour,
  COUNT(CASE WHEN NOW() - backend_start BETWEEN INTERVAL '1 hour' AND INTERVAL '1 day' THEN 1 END) as connections_1hour_1day,
  COUNT(CASE WHEN NOW() - backend_start > INTERVAL '1 day' THEN 1 END) as connections_over_1day,
  COUNT(*) as total_connections
FROM pg_stat_activity 
WHERE pid != pg_backend_pid();
```

### Grafana Configuration
- **Panel Type:** Bar chart or pie chart
- **Purpose:** Identify connection leaks (old connections that should have been closed)

---

## Alert Queries for PagerDuty/Slack Integration

### Critical Alerts

#### Connection Pool Near Exhaustion
```sql
-- Trigger when >80% of direct connections used
SELECT 
  COUNT(*) as current_connections,
  'CRITICAL: Direct connections at ' || ROUND((COUNT(*)::float / 240 * 100), 1) || '% (' || COUNT(*) || '/240)' as alert_message
FROM pg_stat_activity 
HAVING COUNT(*) > 192;
```

#### Connection Leaks Detected
```sql
-- Trigger when too many old connections exist
SELECT 
  COUNT(*) as old_connections,
  'WARNING: ' || COUNT(*) || ' connections older than 1 hour detected' as alert_message
FROM pg_stat_activity 
WHERE NOW() - backend_start > INTERVAL '1 hour'
AND application_name = ''
HAVING COUNT(*) > 10;
```

### Warning Alerts

#### High Connection Usage
```sql
-- Trigger when >60% of direct connections used
SELECT 
  COUNT(*) as current_connections,
  'WARNING: Direct connections at ' || ROUND((COUNT(*)::float / 240 * 100), 1) || '% (' || COUNT(*) || '/240)' as alert_message
FROM pg_stat_activity 
HAVING COUNT(*) > 144;
```

#### Unusual Connection Patterns
```sql
-- Trigger when too many direct admin connections
SELECT 
  COUNT(*) as admin_connections,
  'WARNING: ' || COUNT(*) || ' direct admin connections detected' as alert_message
FROM pg_stat_activity 
WHERE application_name = '' 
AND usename = 'postgres'
HAVING COUNT(*) > 5;
```

---

## Dashboard Layout Recommendations

### Row 1: Overview
- **Panel 1:** Connection Usage Gauge (50% width)
- **Panel 4:** Health Status (25% width)  
- **Reference:** XL Limits Display (25% width)

### Row 2: Detailed Analysis
- **Panel 2:** Connection Breakdown Table (50% width)
- **Panel 3:** Pool Health (50% width)

### Row 3: Trends and Analysis
- **Panel 5:** Connection Trends Time Series (70% width)
- **Panel 6:** Connection Age Analysis (30% width)

---

## Color Scheme Standards

### Connection Health Colors
- **Green (#73BF69):** Healthy operation (0-60% usage)
- **Yellow (#FADE2A):** Warning level (60-80% usage)
- **Red (#F2495C):** Critical level (80-100% usage)
- **Dark Red (#C4162A):** Emergency level (>90% usage)

### Application Type Colors
- **Blue (#5794F2):** System connections (realtime, postgrest)
- **Purple (#B877D9):** Admin/monitoring connections
- **Orange (#FF9830):** Direct user connections
- **Gray (#8B8B8B):** Unknown/other connections

---

## Monitoring Best Practices

### Pre-Event (1 hour before)
- [ ] Verify connection usage < 30% (72 connections)
- [ ] Confirm no connection leaks (old idle connections)
- [ ] Test alert thresholds
- [ ] Check pooled connection estimates

### During Event
- [ ] Monitor connection gauge continuously
- [ ] Watch for sudden spikes in direct connections
- [ ] Alert on any connections > 60% (144 connections)
- [ ] Track connection age for leaks

### Post-Event
- [ ] Analyze peak connection usage
- [ ] Identify any connection leaks
- [ ] Document lessons learned
- [ ] Update alert thresholds if needed

---

## Connection Optimization Notes

### XL Instance Benefits (vs Medium)
- **Direct connections:** 240 vs 120 (100% increase)
- **Pooled connections:** 1,000 vs 600 (67% increase)
- **Headroom for 500 users:** Much improved with 6x safety margin

### Expected Connection Usage for 500-User Event
- **System overhead:** ~25 connections
- **Peak concurrent users:** ~100-150 connections (20-30% of users)
- **Total expected peak:** ~175 connections (73% of limit)
- **Safety margin:** 65 connections remaining

### Connection Pool Strategy
- **Frontend apps:** Should use pooled connections (port 6543)
- **Monitoring tools:** Should use pooled connections (port 6543)  
- **Admin tools:** Can use direct connections sparingly (port 5432)
- **Background jobs:** Should use pooled connections

This monitoring setup provides comprehensive visibility into connection health and will alert you before hitting limits during your high-traffic Art Battle event.
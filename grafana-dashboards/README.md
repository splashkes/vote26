# Art Battle Grafana Dashboards

Complete Grafana dashboard suite for monitoring Art Battle voting app funnel analytics and system health.

## Dashboard Overview

### 1. **Event Health Status** (`art-battle-event-health.json`)
**Traffic Light System for Event Readiness**
- 🔴🟡🟢 Event setup progress indicators
- Admin assignments, QR codes, artist confirmations
- Critical alerts for events <7 days away
- Event readiness percentage tracking

### 2. **QR Funnel Analytics** (`qr-funnel-analytics.json`) 
**QR Code Performance & Conversion Tracking**
- QR scan success rates and error analysis
- QR → Vote → Bid conversion funnels
- Device performance (Mobile/Desktop/Tablet)
- Time-based funnel analysis

### 3. **User Journey & Conversion** (`user-journey-conversion.json`)
**Deep User Behavior Analysis**
- Sankey diagrams for user flow visualization
- Time-to-action histograms (QR→Vote, Vote→Bid)
- User segmentation (High/Medium/Low value)
- Retention and lifetime value tracking

### 4. **Real-time Activity Monitoring** (`real-time-activity-monitoring.json`)
**Live System Monitoring & Alerts**
- Real-time activity feed
- Active user counts (5min windows)
- Revenue tracking and error rate alerts
- Top performing artworks with live bidding

## Prerequisites

### Prometheus Configuration
```yaml
# prometheus.yml
global:
  scrape_interval: 30s

scrape_configs:
  - job_name: 'postgres-exporter'
    static_configs:
      - targets: ['localhost:9187']
    params:
      postgres_database: ['postgres']
```

### PostgreSQL Exporter Setup
```bash
# Install postgres_exporter
docker run -d \
  --name postgres_exporter \
  -p 9187:9187 \
  -e DATA_SOURCE_NAME="postgresql://postgres:6kEtvU9n0KhTVr5@db.xsqdkubgyqwpyvfltnrf.supabase.co:5432/postgres?sslmode=require" \
  prometheuscommunity/postgres-exporter
```

### Key SQL Queries Used

#### Event Health Check
```sql
-- Traffic light indicators for event readiness
SELECT 
  e.eid, e.name, e.event_start_datetime,
  CASE 
    WHEN COUNT(ea.id) > 0 THEN 'green' 
    ELSE 'red' 
  END as admin_status,
  CASE 
    WHEN COUNT(eqs.id) > 0 THEN 'green' 
    ELSE 'red' 
  END as qr_status
FROM events e
LEFT JOIN event_admins ea ON e.id = ea.event_id
LEFT JOIN event_qr_secrets eqs ON e.id = eqs.event_id AND eqs.is_active = true
WHERE e.event_start_datetime > NOW() 
GROUP BY e.id;
```

#### QR Conversion Funnel
```sql
-- QR scan to voting conversion rates
SELECT 
  e.event_id,
  COUNT(DISTINCT e.person_id) as qr_users,
  COUNT(DISTINCT v.person_id) as voting_users,
  ROUND(100.0 * COUNT(DISTINCT v.person_id) / COUNT(DISTINCT e.person_id), 2) as conversion_rate
FROM event_auth_logs e
LEFT JOIN votes v ON e.person_id = v.person_id 
WHERE e.success = true AND e.event_type = 'qr_validation'
GROUP BY e.event_id;
```

#### User Journey Analysis
```sql
-- Time between key user actions
SELECT 
  EXTRACT(EPOCH FROM (v.created_at - e.created_at))/60 as minutes_to_vote
FROM event_auth_logs e
JOIN votes v ON e.person_id = v.person_id
WHERE e.event_type = 'qr_validation' AND e.success = true
  AND v.created_at >= e.created_at;
```

## Dashboard Import Instructions

1. **Open Grafana** → Settings → Data Sources
2. **Add PostgreSQL data source:**
   - Host: `db.xsqdkubgyqwpyvfltnrf.supabase.co:5432`
   - Database: `postgres`
   - User: `postgres`
   - Password: `6kEtvU9n0KhTVr5`
   - SSL Mode: `require`

3. **Import Dashboards:**
   - Navigate to **+ → Import**
   - Upload each `.json` file
   - Select the PostgreSQL data source
   - Set refresh intervals as needed

## Alert Configuration

### Critical Alerts to Setup

1. **Event Health Alerts**
   - Events <3 days with missing QR codes
   - Events <7 days with no admins assigned
   - Events with <6 artworks registered

2. **Performance Alerts**
   - QR scan success rate <80%
   - Error rate >10% in 15min window
   - No active users for >30 minutes during events

3. **Revenue Alerts**
   - Hourly revenue drops >50% during active events
   - Bid activity stops for >20 minutes during auctions

## Usage Tips

- **Event Health**: Check daily for upcoming events
- **QR Analytics**: Monitor during QR code rollouts
- **User Journey**: Weekly reviews for UX optimization
- **Real-time**: Keep open during live events

## Customization

All queries can be modified to:
- Adjust time windows (currently 24h/7d/30d)
- Change conversion rate thresholds
- Add event-specific filters
- Include additional user segments

## Troubleshooting

- **No Data**: Verify PostgreSQL data source connection
- **Slow Queries**: Add database indexes on frequently queried columns
- **Permission Errors**: Ensure postgres user has SELECT permissions on all tables
# Art Battle Funnel Analytics Dashboard

## Overview
This Grafana dashboard provides comprehensive insights into the Art Battle user journey funnel, helping identify where users drop off and optimize conversion rates.

## Dashboard Components

### 1. User Journey Funnel Overview (Table)
**Purpose**: Shows complete funnel with conversion rates and drop-off points
**Key Metrics**:
- Unique users at each stage
- Conversion rates between stages  
- Drop-off counts and percentages
- Total events per stage

### 2. Funnel Distribution (Pie Chart)
**Purpose**: Visual representation of user distribution across funnel stages
**Insight**: Quickly see the relative size of each funnel stage

### 3. Critical Conversion Rates (Bar Gauge)
**Purpose**: Monitors the most important conversion metrics
**Key Rates**:
- **Voting → Bidding**: Currently ~0.1% (CRITICAL)
- **Bidding → Payment**: Currently ~40.6%
- **Payment Success Rate**: Currently ~89.7%

### 4. Daily Funnel Activity Trends (Time Series)
**Purpose**: Track funnel performance over time
**Metrics**: Daily unique users for each funnel stage
**Use**: Identify trends, seasonal patterns, event impacts

### 5. Event-by-Event Performance (Table)
**Purpose**: Compare funnel performance across different events
**Key Insights**:
- Which events generate most revenue
- Event-specific conversion rates
- Geographic performance patterns

### 6. Key Performance Indicators (Stats)
**Metrics**:
- **Total Revenue**: Sum of successful payments
- **Paying Customers**: Unique users who completed payments
- **Avg Revenue Per Customer**: Revenue efficiency metric
- **Total Bids**: Engagement volume

## Setup Instructions

### Prerequisites
1. Grafana instance with PostgreSQL datasource
2. Access to Art Battle database
3. Admin permissions in Grafana

### Installation Steps

1. **Import Dashboard**:
   ```bash
   # In Grafana UI:
   # 1. Go to + → Import
   # 2. Upload art-battle-funnel-dashboard.json
   # 3. Select PostgreSQL datasource
   ```

2. **Configure PostgreSQL Datasource**:
   ```
   Host: db.xsqdkubgyqwpyvfltnrf.supabase.co
   Database: postgres
   User: [your_user]
   SSL Mode: require
   ```

3. **Set Time Range**: Default is 30 days, adjust as needed

## Key Queries Used

### Funnel Overview Query
```sql
WITH funnel_steps AS (
  SELECT 'QR Discovery' as step, 1 as step_order,
         COUNT(DISTINCT person_id) as unique_users
  FROM people_qr_scans 
  WHERE created_at >= NOW() - INTERVAL '30 days'
  -- ... additional stages
)
SELECT step, unique_users, conversion_rates
FROM funnel_with_calculations;
```

### Revenue Analysis
```sql
SELECT 
  COUNT(DISTINCT person_id) as paying_customers,
  SUM(amount) as total_revenue,
  AVG(amount) as avg_order_value
FROM payment_processing
WHERE status IN ('completed', 'succeeded')
  AND created_at >= $__timeFrom();
```

## Critical Insights

### 🚨 Major Drop-off Points
1. **Voting → Bidding (99.9% drop-off)**
   - 101K voters → 101 bidders
   - **Biggest revenue opportunity**
   - Suggests bidding UX or pricing issues

2. **Bidding → Payment (59.4% abandonment)**
   - 101 bidders → 41 payment attempts
   - Payment flow optimization needed

### 💡 Optimization Opportunities
1. **Improve voting-to-bidding conversion**:
   - Even 1% would 10x revenue (101K × 1% = 1,010 bidders)
   - Current: 0.1% conversion rate

2. **Reduce payment abandonment**:
   - 40.6% conversion could improve to 60%+
   - Focus on payment UX and trust signals

3. **Increase average order value**:
   - Current: ~$144 per successful payment
   - Upselling opportunities during checkout

## Monitoring Alerts

### Recommended Alert Thresholds
```yaml
# Critical conversion rate drops
- Voting → Bidding rate < 0.05%
- Payment success rate < 80%
- Daily revenue < $100

# Volume alerts  
- Daily bids < 10
- Daily payments < 5
```

## Usage Tips

1. **Time Ranges**:
   - Use 7 days for operational monitoring
   - Use 30 days for trend analysis
   - Use 90 days for strategic planning

2. **Event Analysis**:
   - Compare before/during/after events
   - Identify high-performing event patterns
   - Geographic performance differences

3. **Optimization Focus**:
   - Priority 1: Voting → Bidding conversion
   - Priority 2: Payment completion rate
   - Priority 3: Average order value

## Refresh Rate
- **Real-time**: 1 minute for current events
- **Historical**: 5-15 minutes for trend analysis
- **Heavy queries**: Cache for 1 hour

## Troubleshooting

### Common Issues
1. **No data showing**: Check time range and datasource connection
2. **Slow queries**: Add indexes on created_at columns
3. **Permission errors**: Ensure datasource user has SELECT access

### Performance Optimization
- Queries are optimized for existing table structure
- Uses DISTINCT person_id for unique user counts
- Time filters applied to all queries for efficiency

## Next Steps
1. Set up automated alerts for critical metrics
2. Add annotations for major events/changes  
3. Create additional dashboards for specific events
4. Implement A/B testing visualization
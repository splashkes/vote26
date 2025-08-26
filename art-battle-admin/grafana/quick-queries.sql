-- Art Battle Funnel Analysis - Quick Queries
-- Use these queries directly in Grafana or for manual analysis

-- ===========================================
-- 1. COMPLETE FUNNEL OVERVIEW (30 DAYS)
-- ===========================================
WITH funnel_steps AS (
  SELECT 
    'QR Discovery' as step,
    1 as step_order,
    COUNT(DISTINCT person_id) as unique_users,
    COUNT(*) as total_events
  FROM people_qr_scans 
  WHERE created_at >= NOW() - INTERVAL '30 days'
  
  UNION ALL
  
  SELECT 
    'Event Registration',
    2,
    COUNT(DISTINCT person_id),
    COUNT(*)
  FROM event_registrations
  WHERE created_at >= NOW() - INTERVAL '30 days'
  
  UNION ALL
  
  SELECT 
    'Voting Participation',
    3, 
    COUNT(DISTINCT person_id),
    COUNT(*)
  FROM votes
  WHERE created_at >= NOW() - INTERVAL '30 days'
  
  UNION ALL
  
  SELECT 
    'Auction Bidding',
    4,
    COUNT(DISTINCT person_id),
    COUNT(*)
  FROM bids 
  WHERE created_at >= NOW() - INTERVAL '30 days'
  
  UNION ALL
  
  SELECT 
    'Payment Completed',
    5,
    COUNT(DISTINCT person_id),
    COUNT(*)
  FROM payment_processing
  WHERE status IN ('completed', 'succeeded')
    AND created_at >= NOW() - INTERVAL '30 days'
),
funnel_with_rates AS (
  SELECT 
    fs.*,
    LAG(fs.unique_users) OVER (ORDER BY fs.step_order) as prev_step_users
  FROM funnel_steps fs
)
SELECT 
  step,
  unique_users,
  total_events,
  CASE 
    WHEN prev_step_users > 0 THEN 
      ROUND((unique_users::numeric / prev_step_users * 100), 2)
    ELSE 100.0
  END as conversion_rate_percent,
  CASE 
    WHEN prev_step_users > 0 THEN 
      (prev_step_users - unique_users)
    ELSE 0
  END as users_lost,
  CASE 
    WHEN prev_step_users > 0 THEN 
      ROUND(((prev_step_users - unique_users)::numeric / prev_step_users * 100), 2)
    ELSE 0.0
  END as drop_off_rate_percent
FROM funnel_with_rates
ORDER BY step_order;

-- ===========================================
-- 2. REVENUE FUNNEL ANALYSIS
-- ===========================================
SELECT 
  'Revenue Funnel (Last 30 Days)' as analysis,
  '==============================' as separator
  
UNION ALL

SELECT
  'Bidders',
  CONCAT(COUNT(DISTINCT person_id), ' people placed ', COUNT(*), ' bids')
FROM bids
WHERE created_at >= NOW() - INTERVAL '30 days'

UNION ALL

SELECT  
  'Payment Attempts',
  CONCAT(COUNT(DISTINCT person_id), ' people, ', COUNT(*), ' attempts')
FROM payment_processing
WHERE created_at >= NOW() - INTERVAL '30 days'

UNION ALL

SELECT
  'Payment Success', 
  CONCAT(COUNT(DISTINCT person_id), ' people, $', ROUND(SUM(amount), 2), ' revenue')
FROM payment_processing
WHERE created_at >= NOW() - INTERVAL '30 days'
  AND status IN ('completed', 'succeeded')

UNION ALL

SELECT
  'Conversion Rates',
  CONCAT(
    ROUND(
      (SELECT COUNT(DISTINCT person_id) FROM payment_processing WHERE created_at >= NOW() - INTERVAL '30 days')::numeric /
      NULLIF((SELECT COUNT(DISTINCT person_id) FROM bids WHERE created_at >= NOW() - INTERVAL '30 days'), 0) * 100,
      2
    ), '% bidders → payment, ',
    ROUND(
      (SELECT COUNT(*) FROM payment_processing WHERE created_at >= NOW() - INTERVAL '30 days' AND status IN ('completed', 'succeeded'))::numeric /
      NULLIF((SELECT COUNT(*) FROM payment_processing WHERE created_at >= NOW() - INTERVAL '30 days'), 0) * 100,
      2
    ), '% payment success'
  );

-- ===========================================
-- 3. EVENT PERFORMANCE COMPARISON
-- ===========================================
SELECT 
  e.name as event_name,
  c.name as city,
  co.name as country,
  DATE(e.event_start_datetime) as event_date,
  COUNT(DISTINCT v.person_id) as voters,
  COUNT(DISTINCT b.person_id) as bidders,
  COUNT(DISTINCT p.person_id) as buyers,
  COUNT(b.id) as total_bids,
  ROUND(COALESCE(SUM(p.amount), 0), 2) as revenue,
  CASE 
    WHEN COUNT(DISTINCT v.person_id) > 0 THEN 
      ROUND((COUNT(DISTINCT b.person_id)::numeric / COUNT(DISTINCT v.person_id) * 100), 3)
    ELSE 0
  END as voting_to_bidding_rate,
  CASE 
    WHEN COUNT(DISTINCT b.person_id) > 0 THEN 
      ROUND((COUNT(DISTINCT p.person_id)::numeric / COUNT(DISTINCT b.person_id) * 100), 2)
    ELSE 0
  END as bidding_to_payment_rate
FROM events e
JOIN cities c ON e.city_id = c.id
JOIN countries co ON c.country_id = co.id
LEFT JOIN votes v ON e.id = v.event_id AND v.created_at >= NOW() - INTERVAL '60 days'
LEFT JOIN bids b ON e.id = b.event_id AND b.created_at >= NOW() - INTERVAL '60 days'
LEFT JOIN payment_processing p ON e.id = p.event_id 
  AND p.created_at >= NOW() - INTERVAL '60 days' 
  AND p.status IN ('completed', 'succeeded')
WHERE e.event_start_datetime >= NOW() - INTERVAL '60 days'
GROUP BY e.id, e.name, c.name, co.name, e.event_start_datetime
HAVING COUNT(DISTINCT v.person_id) > 0 OR COUNT(DISTINCT b.person_id) > 0
ORDER BY revenue DESC, voters DESC;

-- ===========================================
-- 4. DAILY TRENDS (GRAFANA TIME SERIES)
-- ===========================================
-- QR Scans
SELECT 
  DATE(created_at) as time,
  'QR Scans' as metric,
  COUNT(DISTINCT person_id) as value
FROM people_qr_scans 
WHERE created_at >= NOW() - INTERVAL '30 days'
GROUP BY DATE(created_at)
ORDER BY time

UNION ALL

-- Registrations  
SELECT 
  DATE(created_at) as time,
  'Registrations' as metric,
  COUNT(DISTINCT person_id) as value
FROM event_registrations 
WHERE created_at >= NOW() - INTERVAL '30 days'
GROUP BY DATE(created_at)
ORDER BY time

UNION ALL

-- Voting
SELECT 
  DATE(created_at) as time,
  'Votes' as metric,
  COUNT(DISTINCT person_id) as value
FROM votes 
WHERE created_at >= NOW() - INTERVAL '30 days'
GROUP BY DATE(created_at)
ORDER BY time

UNION ALL

-- Bidding
SELECT 
  DATE(created_at) as time,
  'Bids' as metric,
  COUNT(DISTINCT person_id) as value
FROM bids 
WHERE created_at >= NOW() - INTERVAL '30 days'
GROUP BY DATE(created_at)
ORDER BY time

UNION ALL

-- Payments
SELECT 
  DATE(created_at) as time,
  'Payments' as metric,
  COUNT(DISTINCT person_id) as value
FROM payment_processing 
WHERE created_at >= NOW() - INTERVAL '30 days'
  AND status IN ('completed', 'succeeded')
GROUP BY DATE(created_at)
ORDER BY time;

-- ===========================================
-- 5. KEY PERFORMANCE INDICATORS
-- ===========================================

-- Total Revenue (Last 30 Days)
SELECT 
  'Total Revenue' as kpi,
  CONCAT('$', ROUND(COALESCE(SUM(amount), 0), 2)) as value
FROM payment_processing
WHERE status IN ('completed', 'succeeded')
  AND created_at >= NOW() - INTERVAL '30 days'

UNION ALL

-- Paying Customers
SELECT 
  'Paying Customers' as kpi,
  COUNT(DISTINCT person_id)::text as value
FROM payment_processing
WHERE status IN ('completed', 'succeeded')
  AND created_at >= NOW() - INTERVAL '30 days'

UNION ALL

-- Average Revenue Per Customer
SELECT 
  'Avg Revenue Per Customer' as kpi,
  CONCAT('$', ROUND(
    CASE 
      WHEN COUNT(DISTINCT person_id) > 0 THEN 
        SUM(amount) / COUNT(DISTINCT person_id)
      ELSE 0
    END, 2
  )) as value
FROM payment_processing
WHERE status IN ('completed', 'succeeded')
  AND created_at >= NOW() - INTERVAL '30 days'

UNION ALL

-- Total Active Bidders
SELECT 
  'Active Bidders' as kpi,
  COUNT(DISTINCT person_id)::text as value
FROM bids
WHERE created_at >= NOW() - INTERVAL '30 days';

-- ===========================================
-- 6. CRITICAL CONVERSION RATES (FOR ALERTS)
-- ===========================================
SELECT 
  'Critical Conversion Rates' as title,
  '=========================' as separator

UNION ALL

SELECT 
  'Voting → Bidding Rate' as metric,
  CONCAT(
    CASE 
      WHEN voters > 0 THEN ROUND((bidders::numeric / voters * 100), 4)
      ELSE 0
    END, '%'
  ) as rate
FROM (
  SELECT 
    (SELECT COUNT(DISTINCT person_id) FROM votes WHERE created_at >= NOW() - INTERVAL '30 days') as voters,
    (SELECT COUNT(DISTINCT person_id) FROM bids WHERE created_at >= NOW() - INTERVAL '30 days') as bidders
) rates

UNION ALL

SELECT 
  'Bidding → Payment Rate' as metric,
  CONCAT(
    CASE 
      WHEN bidders > 0 THEN ROUND((payers::numeric / bidders * 100), 2)
      ELSE 0
    END, '%'
  ) as rate
FROM (
  SELECT 
    (SELECT COUNT(DISTINCT person_id) FROM bids WHERE created_at >= NOW() - INTERVAL '30 days') as bidders,
    (SELECT COUNT(DISTINCT person_id) FROM payment_processing WHERE status IN ('completed', 'succeeded') AND created_at >= NOW() - INTERVAL '30 days') as payers
) rates

UNION ALL

SELECT 
  'Payment Success Rate' as metric,
  CONCAT(
    CASE 
      WHEN total_attempts > 0 THEN ROUND((successful::numeric / total_attempts * 100), 2)
      ELSE 0
    END, '%'
  ) as rate
FROM (
  SELECT 
    (SELECT COUNT(*) FROM payment_processing WHERE created_at >= NOW() - INTERVAL '30 days') as total_attempts,
    (SELECT COUNT(*) FROM payment_processing WHERE status IN ('completed', 'succeeded') AND created_at >= NOW() - INTERVAL '30 days') as successful
) rates;

-- ===========================================
-- 7. GEOGRAPHICAL PERFORMANCE
-- ===========================================
SELECT 
  co.name as country,
  c.name as city,
  COUNT(DISTINCT v.person_id) as voters,
  COUNT(DISTINCT b.person_id) as bidders,  
  COUNT(DISTINCT p.person_id) as buyers,
  ROUND(COALESCE(SUM(p.amount), 0), 2) as revenue,
  CASE 
    WHEN COUNT(DISTINCT v.person_id) > 0 THEN 
      ROUND((COUNT(DISTINCT b.person_id)::numeric / COUNT(DISTINCT v.person_id) * 100), 3)
    ELSE 0
  END as conversion_rate
FROM countries co
JOIN cities c ON co.id = c.country_id
JOIN events e ON c.id = e.city_id
LEFT JOIN votes v ON e.id = v.event_id AND v.created_at >= NOW() - INTERVAL '60 days'
LEFT JOIN bids b ON e.id = b.event_id AND b.created_at >= NOW() - INTERVAL '60 days'
LEFT JOIN payment_processing p ON e.id = p.event_id 
  AND p.created_at >= NOW() - INTERVAL '60 days'
  AND p.status IN ('completed', 'succeeded')
GROUP BY co.id, co.name, c.id, c.name
HAVING COUNT(DISTINCT v.person_id) > 0
ORDER BY revenue DESC, voters DESC;
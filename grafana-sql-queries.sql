-- Art Battle Artist Activity Dashboard - Grafana SQL Queries
-- Database connection tested with last 7 days data showing active patterns

-- ====================================================================
-- TIMESTAMP FIELD REFERENCE (CRITICAL - each table uses different fields!)
-- ====================================================================
-- artist_profiles:     created_at, updated_at (both timestamptz)
-- artist_applications: applied_at, updated_at (both timestamptz)  
-- artist_invitations:  created_at, updated_at (both timestamp without tz)
-- artist_confirmations: created_at, updated_at (both timestamp without tz)

-- ====================================================================
-- 1. ARTIST PROFILES - NEW REGISTRATIONS (High Resolution - 15min)
-- ====================================================================
SELECT
  date_trunc('minute', created_at - (EXTRACT(minute FROM created_at)::int % 15) * interval '1 minute') as time,
  COUNT(*) as "New Profiles"
FROM artist_profiles 
WHERE $__timeFilter(created_at)
GROUP BY date_trunc('minute', created_at - (EXTRACT(minute FROM created_at)::int % 15) * interval '1 minute')
ORDER BY time;

-- ====================================================================
-- 2. ARTIST PROFILES - UPDATES (High Resolution - 15min)
-- ====================================================================
SELECT
  date_trunc('minute', updated_at - (EXTRACT(minute FROM updated_at)::int % 15) * interval '1 minute') as time,
  COUNT(*) as "Profile Updates"
FROM artist_profiles 
WHERE $__timeFilter(updated_at)
  AND updated_at != created_at  -- Only real updates, not initial creation
GROUP BY date_trunc('minute', updated_at - (EXTRACT(minute FROM updated_at)::int % 15) * interval '1 minute')
ORDER BY time;

-- ====================================================================
-- 3. ARTIST APPLICATIONS - NEW (High Resolution - 15min)
-- ====================================================================
SELECT
  date_trunc('minute', applied_at - (EXTRACT(minute FROM applied_at)::int % 15) * interval '1 minute') as time,
  COUNT(*) as "New Applications"
FROM artist_applications 
WHERE $__timeFilter(applied_at)
GROUP BY date_trunc('minute', applied_at - (EXTRACT(minute FROM applied_at)::int % 15) * interval '1 minute')
ORDER BY time;

-- ====================================================================
-- 4. ARTIST APPLICATIONS - UPDATES (High Resolution - 15min)
-- ====================================================================
SELECT
  date_trunc('minute', updated_at - (EXTRACT(minute FROM updated_at)::int % 15) * interval '1 minute') as time,
  COUNT(*) as "Application Updates"
FROM artist_applications 
WHERE $__timeFilter(updated_at)
  AND updated_at != applied_at  -- Only real updates
GROUP BY date_trunc('minute', updated_at - (EXTRACT(minute FROM updated_at)::int % 15) * interval '1 minute')
ORDER BY time;

-- ====================================================================
-- 5. ARTIST INVITATIONS - NEW (High Resolution - 15min)
-- NOTE: created_at is timestamp WITHOUT time zone
-- ====================================================================
SELECT
  date_trunc('minute', created_at - (EXTRACT(minute FROM created_at)::int % 15) * interval '1 minute') as time,
  COUNT(*) as "New Invitations"
FROM artist_invitations 
WHERE $__timeFilter(created_at)
GROUP BY date_trunc('minute', created_at - (EXTRACT(minute FROM created_at)::int % 15) * interval '1 minute')
ORDER BY time;

-- ====================================================================
-- 6. ARTIST INVITATIONS - UPDATES (High Resolution - 15min)  
-- NOTE: updated_at is timestamp WITHOUT time zone
-- ====================================================================
SELECT
  date_trunc('minute', updated_at - (EXTRACT(minute FROM updated_at)::int % 15) * interval '1 minute') as time,
  COUNT(*) as "Invitation Updates"
FROM artist_invitations 
WHERE $__timeFilter(updated_at)
  AND updated_at != created_at  -- Only real updates
GROUP BY date_trunc('minute', updated_at - (EXTRACT(minute FROM updated_at)::int % 15) * interval '1 minute')
ORDER BY time;

-- ====================================================================
-- 7. ARTIST CONFIRMATIONS - NEW (High Resolution - 15min)
-- NOTE: created_at is timestamp WITHOUT time zone
-- ====================================================================
SELECT
  date_trunc('minute', created_at - (EXTRACT(minute FROM created_at)::int % 15) * interval '1 minute') as time,
  COUNT(*) as "New Confirmations"
FROM artist_confirmations 
WHERE $__timeFilter(created_at)
GROUP BY date_trunc('minute', created_at - (EXTRACT(minute FROM created_at)::int % 15) * interval '1 minute')
ORDER BY time;

-- ====================================================================
-- 8. ARTIST CONFIRMATIONS - UPDATES (High Resolution - 15min)
-- NOTE: updated_at is timestamp WITHOUT time zone
-- ====================================================================
SELECT
  date_trunc('minute', updated_at - (EXTRACT(minute FROM updated_at)::int % 15) * interval '1 minute') as time,
  COUNT(*) as "Confirmation Updates"
FROM artist_confirmations 
WHERE $__timeFilter(updated_at)
  AND updated_at != created_at  -- Only real updates
GROUP BY date_trunc('minute', updated_at - (EXTRACT(minute FROM updated_at)::int % 15) * interval '1 minute')
ORDER BY time;

-- ====================================================================
-- 9. COMBINED ACTIVITY OVERVIEW (Hourly Aggregation)
-- ====================================================================
SELECT
  date_trunc('hour', created_at) as time,
  COUNT(*) as "New Profiles"
FROM artist_profiles 
WHERE $__timeFilter(created_at)
GROUP BY date_trunc('hour', created_at)

UNION ALL

SELECT
  date_trunc('hour', applied_at) as time,
  COUNT(*) as "New Applications"
FROM artist_applications 
WHERE $__timeFilter(applied_at)
GROUP BY date_trunc('hour', applied_at)

UNION ALL

SELECT
  date_trunc('hour', created_at) as time,
  COUNT(*) as "New Invitations"
FROM artist_invitations 
WHERE $__timeFilter(created_at)
GROUP BY date_trunc('hour', created_at)

UNION ALL

SELECT
  date_trunc('hour', created_at) as time,
  COUNT(*) as "New Confirmations"
FROM artist_confirmations 
WHERE $__timeFilter(created_at)
GROUP BY date_trunc('hour', created_at)
ORDER BY time;

-- ====================================================================
-- 10. ACTIVITY BY EVENT (Applications Only - Events Have Best Coverage)
-- ====================================================================
SELECT
  date_trunc('hour', aa.applied_at) as time,
  COALESCE(e.name, 'Unknown Event') as metric,
  COUNT(*) as value
FROM artist_applications aa
LEFT JOIN events e ON aa.event_id = e.id
WHERE $__timeFilter(aa.applied_at)
GROUP BY date_trunc('hour', aa.applied_at), e.name
HAVING COUNT(*) > 0
ORDER BY time, e.name;

-- ====================================================================
-- 11. REAL-TIME CURRENT HOUR STATS
-- ====================================================================
SELECT
  'New Profiles' as metric,
  COUNT(*) as value
FROM artist_profiles 
WHERE created_at >= date_trunc('hour', NOW())

UNION ALL

SELECT
  'New Applications' as metric,
  COUNT(*) as value
FROM artist_applications 
WHERE applied_at >= date_trunc('hour', NOW())

UNION ALL

SELECT
  'New Invitations' as metric,
  COUNT(*) as value
FROM artist_invitations 
WHERE created_at >= date_trunc('hour', NOW())

UNION ALL

SELECT
  'New Confirmations' as metric,
  COUNT(*) as value
FROM artist_confirmations 
WHERE created_at >= date_trunc('hour', NOW());

-- ====================================================================
-- 12. 7-DAY ROLLING TOTALS
-- ====================================================================
SELECT
  'Profiles (7d)' as metric,
  COUNT(*) as value
FROM artist_profiles 
WHERE created_at >= NOW() - INTERVAL '7 days'

UNION ALL

SELECT
  'Applications (7d)' as metric,
  COUNT(*) as value
FROM artist_applications 
WHERE applied_at >= NOW() - INTERVAL '7 days'

UNION ALL

SELECT
  'Invitations (7d)' as metric,
  COUNT(*) as value
FROM artist_invitations 
WHERE created_at >= NOW() - INTERVAL '7 days'

UNION ALL

SELECT
  'Confirmations (7d)' as metric,
  COUNT(*) as value
FROM artist_confirmations 
WHERE created_at >= NOW() - INTERVAL '7 days';

-- ====================================================================
-- 13. APPLICATION STATUS BREAKDOWN (Last 30 Days)
-- ====================================================================
SELECT
  application_status as metric,
  COUNT(*) as value
FROM artist_applications
WHERE applied_at >= NOW() - INTERVAL '30 days'
GROUP BY application_status
ORDER BY COUNT(*) DESC;

-- ====================================================================
-- 14. INVITATION STATUS BREAKDOWN (Last 30 Days)
-- ====================================================================
SELECT
  status as metric,
  COUNT(*) as value
FROM artist_invitations
WHERE created_at >= NOW() - INTERVAL '30 days'
GROUP BY status
ORDER BY COUNT(*) DESC;

-- ====================================================================
-- 15. PHONE VERIFICATION TRACKING (Artist Profiles)
-- ====================================================================
SELECT
  date_trunc('hour', phone_verified_at) as time,
  COUNT(*) as "Phone Verifications"
FROM artist_profiles 
WHERE $__timeFilter(phone_verified_at)
  AND phone_verified_at IS NOT NULL
GROUP BY date_trunc('hour', phone_verified_at)
ORDER BY time;

-- ====================================================================
-- 16. EVENT PARTICIPATION FUNNEL
-- ====================================================================
SELECT 
  e.name as event_name,
  COUNT(DISTINCT aa.artist_profile_id) as "Applications",
  COUNT(DISTINCT ai.artist_profile_id) as "Invitations",
  COUNT(DISTINCT ac.artist_profile_id) as "Confirmations"
FROM events e
LEFT JOIN artist_applications aa ON e.id = aa.event_id 
  AND aa.applied_at >= NOW() - INTERVAL '30 days'
LEFT JOIN artist_invitations ai ON e.eid = ai.event_eid 
  AND ai.created_at >= NOW() - INTERVAL '30 days'
LEFT JOIN artist_confirmations ac ON e.eid = ac.event_eid 
  AND ac.created_at >= NOW() - INTERVAL '30 days'
WHERE e.created_at >= NOW() - INTERVAL '60 days'  -- Recent events only
GROUP BY e.name, e.id
HAVING COUNT(DISTINCT aa.artist_profile_id) > 0 
    OR COUNT(DISTINCT ai.artist_profile_id) > 0 
    OR COUNT(DISTINCT ac.artist_profile_id) > 0
ORDER BY COUNT(DISTINCT aa.artist_profile_id) DESC;

-- ====================================================================
-- PERFORMANCE NOTES:
-- ====================================================================
-- 1. All queries use proper indexes on timestamp fields
-- 2. 15-minute aggregation uses modulo arithmetic for precise intervals  
-- 3. Grafana $__timeFilter() macro handles time range filtering
-- 4. UNION ALL queries are optimized for dashboard responsiveness
-- 5. Test data shows active patterns in last 7 days across all tables
-- 6. Each table has different timestamp field names - queries account for this
-- 7. Some tables use timestamptz, others timestamp without timezone
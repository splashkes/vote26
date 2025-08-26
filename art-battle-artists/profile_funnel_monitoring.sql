-- Profile Creation and Update Funnel Monitoring Queries
-- Use these queries to understand where users get stuck in the profile flow

-- 1. Profile Creation Funnel Analysis
-- Shows the complete flow from function start to successful creation
WITH profile_creation_funnel AS (
  SELECT 
    DATE_TRUNC('day', created_at) as day,
    operation,
    COUNT(*) as total_events,
    COUNT(*) FILTER (WHERE success = true) as success_count,
    COUNT(*) FILTER (WHERE success = false) as failure_count,
    ROUND(100.0 * COUNT(*) FILTER (WHERE success = true) / COUNT(*), 2) as success_rate
  FROM artist_auth_logs 
  WHERE event_type = 'profile_creation'
    AND created_at >= CURRENT_DATE - INTERVAL '7 days'
  GROUP BY DATE_TRUNC('day', created_at), operation
  ORDER BY day DESC, operation
)
SELECT * FROM profile_creation_funnel;

-- 2. Profile Update Funnel Analysis  
-- Shows the complete flow from function start to successful update
WITH profile_update_funnel AS (
  SELECT 
    DATE_TRUNC('day', created_at) as day,
    operation,
    COUNT(*) as total_events,
    COUNT(*) FILTER (WHERE success = true) as success_count,
    COUNT(*) FILTER (WHERE success = false) as failure_count,
    ROUND(100.0 * COUNT(*) FILTER (WHERE success = true) / COUNT(*), 2) as success_rate
  FROM artist_auth_logs 
  WHERE event_type = 'profile_update'
    AND created_at >= CURRENT_DATE - INTERVAL '7 days'
  GROUP BY DATE_TRUNC('day', created_at), operation
  ORDER BY day DESC, operation
)
SELECT * FROM profile_update_funnel;

-- 3. Error Analysis - Most Common Failures
-- Identifies the most frequent errors to prioritize fixes
SELECT 
  event_type,
  operation,
  error_type,
  error_message,
  COUNT(*) as error_count,
  COUNT(DISTINCT auth_user_id) as unique_users_affected,
  AVG(duration_ms) as avg_duration_ms
FROM artist_auth_logs 
WHERE success = false 
  AND created_at >= CURRENT_DATE - INTERVAL '7 days'
GROUP BY event_type, operation, error_type, error_message
ORDER BY error_count DESC
LIMIT 10;

-- 4. User Journey Completion Rates
-- Shows how many users complete each step of the profile flow
WITH user_journey AS (
  SELECT 
    auth_user_id,
    event_type,
    MAX(CASE WHEN operation = 'function_start' AND success = true THEN 1 ELSE 0 END) as started,
    MAX(CASE WHEN operation = 'request_validation' AND success = true THEN 1 ELSE 0 END) as validated,
    MAX(CASE WHEN operation LIKE '%database%success' AND success = true THEN 1 ELSE 0 END) as completed,
    MAX(CASE WHEN success = false THEN 1 ELSE 0 END) as had_error
  FROM artist_auth_logs 
  WHERE event_type IN ('profile_creation', 'profile_update')
    AND created_at >= CURRENT_DATE - INTERVAL '7 days'
    AND auth_user_id IS NOT NULL
  GROUP BY auth_user_id, event_type
)
SELECT 
  event_type,
  COUNT(*) as total_users,
  SUM(started) as users_started,
  SUM(validated) as users_validated, 
  SUM(completed) as users_completed,
  SUM(had_error) as users_with_errors,
  ROUND(100.0 * SUM(validated) / SUM(started), 2) as validation_rate,
  ROUND(100.0 * SUM(completed) / SUM(started), 2) as completion_rate,
  ROUND(100.0 * SUM(had_error) / SUM(started), 2) as error_rate
FROM user_journey
WHERE started = 1
GROUP BY event_type;

-- 5. Performance Analysis
-- Shows timing metrics to identify slow operations
SELECT 
  event_type,
  operation,
  COUNT(*) as operation_count,
  AVG(duration_ms) as avg_duration_ms,
  PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY duration_ms) as median_duration_ms,
  PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY duration_ms) as p95_duration_ms,
  MAX(duration_ms) as max_duration_ms
FROM artist_auth_logs 
WHERE duration_ms IS NOT NULL 
  AND created_at >= CURRENT_DATE - INTERVAL '7 days'
GROUP BY event_type, operation
ORDER BY avg_duration_ms DESC;

-- 6. Real-time Profile Activity Monitor
-- Shows recent profile activity for debugging active issues
SELECT 
  created_at,
  event_type,
  operation,
  success,
  error_type,
  error_message,
  auth_user_id,
  person_id,
  metadata->>'profile_id' as profile_id,
  metadata->>'profile_name' as profile_name,
  duration_ms,
  ip_address
FROM artist_auth_logs 
WHERE event_type IN ('profile_creation', 'profile_update')
  AND created_at >= NOW() - INTERVAL '2 hours'
ORDER BY created_at DESC
LIMIT 50;

-- 7. Field Completion Analysis
-- Shows which profile fields users are filling out most/least
SELECT 
  event_type,
  (metadata->>'has_bio')::boolean as has_bio,
  (metadata->>'has_email')::boolean as has_email,
  (metadata->>'has_social_links')::boolean as has_social_links,
  COUNT(*) as user_count,
  ROUND(100.0 * COUNT(*) / SUM(COUNT(*)) OVER (PARTITION BY event_type), 2) as percentage
FROM artist_auth_logs 
WHERE event_type IN ('profile_creation', 'profile_update')
  AND operation LIKE '%database%start'
  AND created_at >= CURRENT_DATE - INTERVAL '7 days'
GROUP BY event_type, has_bio, has_email, has_social_links
ORDER BY event_type, user_count DESC;
-- QR Security Monitoring Queries
-- Use these queries to monitor the QR system for security issues

-- 1. Check currently blocked IPs
SELECT 
  ip_address,
  reason,
  blocked_at,
  blocked_until,
  attempt_count,
  (blocked_until > NOW()) as is_active
FROM blocked_ips 
WHERE blocked_until > NOW() - INTERVAL '24 hours'
ORDER BY blocked_at DESC;

-- 2. Top IPs by failed validation attempts (last hour)
SELECT 
  ip_address,
  COUNT(*) as failed_attempts,
  MIN(attempt_timestamp) as first_attempt,
  MAX(attempt_timestamp) as last_attempt,
  ARRAY_AGG(DISTINCT qr_code) as attempted_codes
FROM qr_validation_attempts 
WHERE attempt_timestamp > NOW() - INTERVAL '1 hour'
  AND is_successful = false
GROUP BY ip_address
HAVING COUNT(*) > 5
ORDER BY failed_attempts DESC;

-- 3. Suspicious QR code patterns (codes being tried multiple times)
SELECT 
  qr_code,
  COUNT(*) as attempt_count,
  COUNT(DISTINCT ip_address) as unique_ips,
  COUNT(DISTINCT user_id) as unique_users,
  MIN(attempt_timestamp) as first_attempt,
  MAX(attempt_timestamp) as last_attempt
FROM qr_validation_attempts 
WHERE attempt_timestamp > NOW() - INTERVAL '6 hours'
GROUP BY qr_code
HAVING COUNT(*) > 10 OR COUNT(DISTINCT ip_address) > 5
ORDER BY attempt_count DESC;

-- 4. Recent validation attempt summary (last hour)
SELECT 
  DATE_TRUNC('minute', attempt_timestamp) as minute,
  COUNT(*) as total_attempts,
  COUNT(*) FILTER (WHERE is_successful = true) as successful,
  COUNT(*) FILTER (WHERE is_successful = false) as failed,
  COUNT(DISTINCT ip_address) as unique_ips,
  COUNT(DISTINCT user_id) as unique_users
FROM qr_validation_attempts 
WHERE attempt_timestamp > NOW() - INTERVAL '1 hour'
GROUP BY DATE_TRUNC('minute', attempt_timestamp)
ORDER BY minute DESC
LIMIT 20;

-- 5. Check if cleanup is needed
SELECT 
  'qr_validation_attempts' as table_name,
  COUNT(*) as total_records,
  COUNT(*) FILTER (WHERE attempt_timestamp < NOW() - INTERVAL '24 hours') as old_records
FROM qr_validation_attempts
UNION ALL
SELECT 
  'blocked_ips' as table_name,
  COUNT(*) as total_records,
  COUNT(*) FILTER (WHERE blocked_until < NOW()) as expired_blocks
FROM blocked_ips;

-- 6. Manual cleanup command (run if needed)
-- SELECT cleanup_security_logs();

-- 7. Manually block an IP (replace IP_ADDRESS with actual IP)
-- SELECT block_ip_address('IP_ADDRESS', 60, 'manual_block');

-- 8. Check if specific IP is blocked
-- SELECT is_ip_blocked('IP_ADDRESS');

-- 9. Get current rate limit status for IP
-- SELECT check_rate_limit('IP_ADDRESS', 5, 10);

-- 10. Most active legitimate users (successful scans)
SELECT 
  u.email,
  u.phone,
  COUNT(*) as successful_scans,
  COUNT(DISTINCT va.ip_address) as unique_ips,
  MAX(va.attempt_timestamp) as last_scan
FROM qr_validation_attempts va
JOIN people p ON p.id = va.user_id
JOIN auth.users u ON u.id = p.auth_user_id
WHERE va.is_successful = true
  AND va.attempt_timestamp > NOW() - INTERVAL '24 hours'
GROUP BY u.id, u.email, u.phone
ORDER BY successful_scans DESC
LIMIT 10;
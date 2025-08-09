-- QR System Security Enhancements
-- Adds rate limiting and IP blocking for QR validation

-- Table to track validation attempts and rate limiting
CREATE TABLE qr_validation_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ip_address TEXT NOT NULL,
  user_id UUID, -- nullable for unauthenticated attempts
  qr_code TEXT NOT NULL,
  attempt_timestamp TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  is_successful BOOLEAN NOT NULL DEFAULT false,
  user_agent TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Table for IP blocking
CREATE TABLE blocked_ips (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ip_address TEXT NOT NULL UNIQUE,
  blocked_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  blocked_until TIMESTAMP WITH TIME ZONE NOT NULL, -- when block expires
  reason TEXT NOT NULL, -- 'rate_limit', 'suspicious_activity', etc.
  attempt_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_qr_validation_attempts_ip ON qr_validation_attempts (ip_address);
CREATE INDEX idx_qr_validation_attempts_timestamp ON qr_validation_attempts (attempt_timestamp);
CREATE INDEX idx_qr_validation_attempts_user_id ON qr_validation_attempts (user_id);
CREATE INDEX idx_blocked_ips_ip_address ON blocked_ips (ip_address);
CREATE INDEX idx_blocked_ips_blocked_until ON blocked_ips (blocked_until);

-- Function to check if IP is blocked
CREATE OR REPLACE FUNCTION is_ip_blocked(p_ip_address TEXT)
RETURNS BOOLEAN AS $$
DECLARE
  v_is_blocked BOOLEAN;
BEGIN
  -- Check if IP is currently blocked (and not expired)
  SELECT EXISTS(
    SELECT 1 FROM blocked_ips 
    WHERE ip_address = p_ip_address 
      AND blocked_until > NOW()
  ) INTO v_is_blocked;
  
  RETURN COALESCE(v_is_blocked, false);
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Function to check rate limit for IP
CREATE OR REPLACE FUNCTION check_rate_limit(p_ip_address TEXT, p_window_minutes INTEGER DEFAULT 5, p_max_attempts INTEGER DEFAULT 10)
RETURNS BOOLEAN AS $$
DECLARE
  v_attempt_count INTEGER;
  v_is_over_limit BOOLEAN;
BEGIN
  -- Count attempts in the last X minutes
  SELECT COUNT(*) INTO v_attempt_count
  FROM qr_validation_attempts 
  WHERE ip_address = p_ip_address 
    AND attempt_timestamp > (NOW() - INTERVAL '1 minute' * p_window_minutes);
    
  v_is_over_limit := v_attempt_count >= p_max_attempts;
  
  RETURN v_is_over_limit;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Function to record validation attempt
CREATE OR REPLACE FUNCTION record_validation_attempt(
  p_ip_address TEXT,
  p_user_id UUID,
  p_qr_code TEXT,
  p_is_successful BOOLEAN,
  p_user_agent TEXT
)
RETURNS VOID AS $$
BEGIN
  INSERT INTO qr_validation_attempts (
    ip_address,
    user_id,
    qr_code,
    is_successful,
    user_agent
  ) VALUES (
    p_ip_address,
    p_user_id,
    p_qr_code,
    p_is_successful,
    p_user_agent
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to block IP address
CREATE OR REPLACE FUNCTION block_ip_address(
  p_ip_address TEXT,
  p_duration_minutes INTEGER DEFAULT 60,
  p_reason TEXT DEFAULT 'rate_limit'
)
RETURNS VOID AS $$
DECLARE
  v_blocked_until TIMESTAMP WITH TIME ZONE;
  v_attempt_count INTEGER;
BEGIN
  v_blocked_until := NOW() + INTERVAL '1 minute' * p_duration_minutes;
  
  -- Count recent failed attempts for this IP
  SELECT COUNT(*) INTO v_attempt_count
  FROM qr_validation_attempts 
  WHERE ip_address = p_ip_address 
    AND attempt_timestamp > (NOW() - INTERVAL '1 hour')
    AND is_successful = false;
  
  -- Insert or update block record
  INSERT INTO blocked_ips (ip_address, blocked_until, reason, attempt_count)
  VALUES (p_ip_address, v_blocked_until, p_reason, v_attempt_count)
  ON CONFLICT (ip_address) 
  DO UPDATE SET 
    blocked_until = v_blocked_until,
    reason = p_reason,
    attempt_count = blocked_ips.attempt_count + 1,
    blocked_at = NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to clean up old attempts and expired blocks
CREATE OR REPLACE FUNCTION cleanup_security_logs()
RETURNS INTEGER AS $$
DECLARE
  v_deleted_attempts INTEGER;
  v_deleted_blocks INTEGER;
BEGIN
  -- Delete attempts older than 24 hours
  DELETE FROM qr_validation_attempts
  WHERE attempt_timestamp < (NOW() - INTERVAL '24 hours');
  
  GET DIAGNOSTICS v_deleted_attempts = ROW_COUNT;
  
  -- Delete expired blocks
  DELETE FROM blocked_ips
  WHERE blocked_until < NOW();
  
  GET DIAGNOSTICS v_deleted_blocks = ROW_COUNT;
  
  RETURN v_deleted_attempts + v_deleted_blocks;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- RLS Policies for new tables
ALTER TABLE qr_validation_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE blocked_ips ENABLE ROW LEVEL SECURITY;

-- Only allow service role to access these security tables
CREATE POLICY qr_validation_attempts_service_only ON qr_validation_attempts
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY blocked_ips_service_only ON blocked_ips
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

-- Grant permissions
GRANT EXECUTE ON FUNCTION is_ip_blocked(TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION check_rate_limit(TEXT, INTEGER, INTEGER) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION record_validation_attempt(TEXT, UUID, TEXT, BOOLEAN, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION block_ip_address(TEXT, INTEGER, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION cleanup_security_logs() TO authenticated, service_role;

-- Comments for documentation
COMMENT ON TABLE qr_validation_attempts IS 'Tracks all QR validation attempts for rate limiting and security monitoring';
COMMENT ON TABLE blocked_ips IS 'Stores temporarily blocked IP addresses due to suspicious activity';
COMMENT ON FUNCTION is_ip_blocked IS 'Check if an IP address is currently blocked';
COMMENT ON FUNCTION check_rate_limit IS 'Check if an IP has exceeded rate limit in given time window';
COMMENT ON FUNCTION record_validation_attempt IS 'Record a QR validation attempt for security tracking';
COMMENT ON FUNCTION block_ip_address IS 'Block an IP address for specified duration';
COMMENT ON FUNCTION cleanup_security_logs IS 'Clean up old security logs and expired blocks';
-- QR System Tables Implementation
-- Creates tables for QR code generation and scan tracking

-- Table to store generated QR codes with expiration
CREATE TABLE qr_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  generated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Table to store event-specific QR secrets for admin access
CREATE TABLE event_qr_secrets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  secret_token TEXT NOT NULL UNIQUE,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Table to track QR code scans by users
CREATE TABLE people_qr_scans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id UUID NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  qr_code TEXT NOT NULL,
  scan_timestamp TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  ip_address TEXT,
  user_agent TEXT,
  location_data JSONB,
  is_valid BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX idx_qr_codes_event_id ON qr_codes (event_id);
CREATE INDEX idx_qr_codes_code ON qr_codes (code);
CREATE INDEX idx_qr_codes_expires_at ON qr_codes (expires_at);
CREATE INDEX idx_qr_codes_active ON qr_codes (is_active);

CREATE UNIQUE INDEX idx_event_qr_secrets_event_id ON event_qr_secrets (event_id) WHERE is_active = true;
CREATE INDEX idx_event_qr_secrets_token ON event_qr_secrets (secret_token);

CREATE INDEX idx_people_qr_scans_person_id ON people_qr_scans (person_id);
CREATE INDEX idx_people_qr_scans_event_id ON people_qr_scans (event_id);
CREATE INDEX idx_people_qr_scans_qr_code ON people_qr_scans (qr_code);
CREATE INDEX idx_people_qr_scans_valid ON people_qr_scans (is_valid);
CREATE INDEX idx_people_qr_scans_timestamp ON people_qr_scans (scan_timestamp);

-- Function to generate a random secret token
CREATE OR REPLACE FUNCTION generate_qr_secret_token()
RETURNS TEXT AS $$
BEGIN
  RETURN encode(gen_random_bytes(32), 'hex');
END;
$$ LANGUAGE plpgsql;

-- Function to create or update QR secret for an event
CREATE OR REPLACE FUNCTION create_event_qr_secret(p_event_id UUID)
RETURNS TEXT AS $$
DECLARE
  v_secret_token TEXT;
BEGIN
  -- Deactivate existing secrets for this event
  UPDATE event_qr_secrets
  SET is_active = false
  WHERE event_id = p_event_id;
  
  -- Generate new secret token
  v_secret_token := generate_qr_secret_token();
  
  -- Insert new secret
  INSERT INTO event_qr_secrets (event_id, secret_token, is_active)
  VALUES (p_event_id, v_secret_token, true);
  
  RETURN v_secret_token;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get event ID from secret token
CREATE OR REPLACE FUNCTION get_event_from_qr_secret(p_secret_token TEXT)
RETURNS UUID AS $$
DECLARE
  v_event_id UUID;
BEGIN
  SELECT event_id INTO v_event_id
  FROM event_qr_secrets
  WHERE secret_token = p_secret_token 
    AND is_active = true;
    
  RETURN v_event_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to check if person has valid QR scan for event
CREATE OR REPLACE FUNCTION has_valid_qr_scan(p_person_id UUID, p_event_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  v_has_scan BOOLEAN;
BEGIN
  SELECT EXISTS(
    SELECT 1 
    FROM people_qr_scans 
    WHERE person_id = p_person_id 
      AND event_id = p_event_id 
      AND is_valid = true
  ) INTO v_has_scan;
  
  RETURN COALESCE(v_has_scan, false);
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Function to cleanup expired QR codes (older than 90 seconds)
CREATE OR REPLACE FUNCTION cleanup_expired_qr_codes()
RETURNS INTEGER AS $$
DECLARE
  v_deleted_count INTEGER;
BEGIN
  -- Delete codes older than 90 seconds
  DELETE FROM qr_codes
  WHERE generated_at < (NOW() - INTERVAL '90 seconds');
  
  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
  
  RETURN v_deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- RLS Policies
ALTER TABLE qr_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_qr_secrets ENABLE ROW LEVEL SECURITY;
ALTER TABLE people_qr_scans ENABLE ROW LEVEL SECURITY;

-- QR codes can be read by authenticated users
CREATE POLICY qr_codes_select_policy ON qr_codes
  FOR SELECT TO authenticated
  USING (true);

-- Event QR secrets can only be managed by admins
CREATE POLICY event_qr_secrets_select_policy ON event_qr_secrets
  FOR SELECT TO authenticated
  USING (
    EXISTS(
      SELECT 1 FROM event_admins 
      WHERE event_id = event_qr_secrets.event_id 
        AND person_id IN (
          SELECT id FROM people 
          WHERE auth_user_id = auth.uid()
        )
    )
  );

-- People QR scans can be read by the person who scanned or event admins
CREATE POLICY people_qr_scans_select_policy ON people_qr_scans
  FOR SELECT TO authenticated
  USING (
    person_id IN (
      SELECT id FROM people WHERE auth_user_id = auth.uid()
    ) OR
    EXISTS(
      SELECT 1 FROM event_admins 
      WHERE event_id = people_qr_scans.event_id 
        AND person_id IN (
          SELECT id FROM people 
          WHERE auth_user_id = auth.uid()
        )
    )
  );

-- People QR scans can be inserted by authenticated users
CREATE POLICY people_qr_scans_insert_policy ON people_qr_scans
  FOR INSERT TO authenticated
  WITH CHECK (
    person_id IN (
      SELECT id FROM people WHERE auth_user_id = auth.uid()
    )
  );

-- Grant permissions for functions
GRANT EXECUTE ON FUNCTION create_event_qr_secret(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_event_from_qr_secret(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION has_valid_qr_scan(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION cleanup_expired_qr_codes() TO authenticated;
GRANT EXECUTE ON FUNCTION generate_qr_secret_token() TO authenticated;

-- Comments for documentation
COMMENT ON TABLE qr_codes IS 'Stores generated QR codes with 1-minute expiration for event attendance tracking';
COMMENT ON TABLE event_qr_secrets IS 'Stores secret tokens for each event to generate QR display URLs';
COMMENT ON TABLE people_qr_scans IS 'Tracks QR code scans by users for vote weight bonuses';
COMMENT ON FUNCTION has_valid_qr_scan IS 'Check if person has a valid QR scan for a specific event';
COMMENT ON FUNCTION cleanup_expired_qr_codes IS 'Removes QR codes older than 90 seconds';
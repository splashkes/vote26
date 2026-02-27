-- Create table to track SMS conversation task status and history
CREATE TABLE IF NOT EXISTS sms_conversation_status (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_number TEXT NOT NULL,
  is_done BOOLEAN NOT NULL,
  marked_by_email TEXT NOT NULL,
  marked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  notes TEXT, -- Optional notes about what was done
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for fast lookups by phone number
CREATE INDEX idx_sms_conversation_status_phone ON sms_conversation_status(phone_number);
CREATE INDEX idx_sms_conversation_status_marked_at ON sms_conversation_status(marked_at DESC);

-- RLS policies for admin access
ALTER TABLE sms_conversation_status ENABLE ROW LEVEL SECURITY;

-- Admin users can read all status records
CREATE POLICY "ABHQ admins can read sms_conversation_status"
ON sms_conversation_status FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM abhq_admin_users
    WHERE email = (auth.jwt() ->> 'email')
    AND active = true
  )
);

-- Admin users can insert new status records
CREATE POLICY "ABHQ admins can insert sms_conversation_status"
ON sms_conversation_status FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM abhq_admin_users
    WHERE email = (auth.jwt() ->> 'email')
    AND active = true
  )
);

-- Service role has full access
CREATE POLICY "Service role full access to sms_conversation_status"
ON sms_conversation_status
USING (auth.role() = 'service_role');

-- Function to get current status for a phone number
CREATE OR REPLACE FUNCTION get_current_sms_conversation_status(p_phone_number TEXT)
RETURNS TABLE (
  is_done BOOLEAN,
  marked_by_email TEXT,
  marked_at TIMESTAMPTZ,
  notes TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    s.is_done,
    s.marked_by_email,
    s.marked_at,
    s.notes
  FROM sms_conversation_status s
  WHERE s.phone_number = p_phone_number
  ORDER BY s.marked_at DESC
  LIMIT 1;
END;
$$ LANGUAGE plpgsql STABLE;

-- Function to get status history for a phone number
CREATE OR REPLACE FUNCTION get_sms_conversation_status_history(p_phone_number TEXT)
RETURNS TABLE (
  id UUID,
  is_done BOOLEAN,
  marked_by_email TEXT,
  marked_at TIMESTAMPTZ,
  notes TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    s.id,
    s.is_done,
    s.marked_by_email,
    s.marked_at,
    s.notes
  FROM sms_conversation_status s
  WHERE s.phone_number = p_phone_number
  ORDER BY s.marked_at ASC;
END;
$$ LANGUAGE plpgsql STABLE;

-- Enable realtime for status updates
ALTER PUBLICATION supabase_realtime ADD TABLE sms_conversation_status;

COMMENT ON TABLE sms_conversation_status IS 'Tracks done/undone status history for SMS conversations with full audit trail';

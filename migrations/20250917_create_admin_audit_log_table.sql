-- Create admin_audit_log table for security and admin action logging
-- This table is referenced by secure_http_post and other security functions

CREATE TABLE IF NOT EXISTS admin_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id UUID REFERENCES auth.users(id),
  event_id UUID REFERENCES events(id),
  action_type TEXT NOT NULL,
  action_data JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_admin_audit_log_admin_user_id ON admin_audit_log(admin_user_id);
CREATE INDEX IF NOT EXISTS idx_admin_audit_log_event_id ON admin_audit_log(event_id);
CREATE INDEX IF NOT EXISTS idx_admin_audit_log_action_type ON admin_audit_log(action_type);
CREATE INDEX IF NOT EXISTS idx_admin_audit_log_created_at ON admin_audit_log(created_at);

-- Enable RLS
ALTER TABLE admin_audit_log ENABLE ROW LEVEL SECURITY;

-- RLS Policies
-- Only admins can read audit logs
CREATE POLICY "Admins can read audit logs" ON admin_audit_log
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM abhq_admin_users
    WHERE user_id = auth.uid() AND active = true
  )
);

-- System can insert audit logs (for security functions)
CREATE POLICY "System can insert audit logs" ON admin_audit_log
FOR INSERT TO authenticated
WITH CHECK (true);

-- Add table comment
COMMENT ON TABLE admin_audit_log IS 'Audit log for admin actions and security events including SSRF violation attempts';
COMMENT ON COLUMN admin_audit_log.action_type IS 'Type of action: ssrf_violation_attempt, admin_login, data_export, etc.';
COMMENT ON COLUMN admin_audit_log.action_data IS 'JSON data specific to the action type';
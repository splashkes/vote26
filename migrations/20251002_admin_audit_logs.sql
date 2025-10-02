-- Create admin audit logs table for tracking sensitive admin actions
CREATE TABLE IF NOT EXISTS admin_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id UUID NOT NULL,
  admin_email TEXT,
  action TEXT NOT NULL,
  resource_type TEXT,
  resource_id UUID,
  metadata JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes
CREATE INDEX idx_admin_audit_logs_admin_user ON admin_audit_logs(admin_user_id);
CREATE INDEX idx_admin_audit_logs_action ON admin_audit_logs(action);
CREATE INDEX idx_admin_audit_logs_resource ON admin_audit_logs(resource_type, resource_id);
CREATE INDEX idx_admin_audit_logs_created ON admin_audit_logs(created_at DESC);

-- Enable RLS
ALTER TABLE admin_audit_logs ENABLE ROW LEVEL SECURITY;

-- Service role can do everything
CREATE POLICY "Service role full access to audit logs"
  ON admin_audit_logs
  FOR ALL
  TO service_role
  USING (true);

-- Grant permissions
GRANT ALL ON admin_audit_logs TO service_role;

COMMENT ON TABLE admin_audit_logs IS 'Audit trail for sensitive admin actions like viewing payment details';

-- Improve Admin Invitation System
-- Add invitation tracking fields to abhq_admin_users table

-- Add new columns for invitation management
ALTER TABLE abhq_admin_users 
ADD COLUMN IF NOT EXISTS invitation_sent_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS invitation_expires_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS invitation_accepted_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS last_invitation_reminder_sent TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS invitation_reminder_count INTEGER DEFAULT 0;

-- Add indexes for invitation queries
CREATE INDEX IF NOT EXISTS idx_abhq_admin_users_invitation_expires ON abhq_admin_users(invitation_expires_at);
CREATE INDEX IF NOT EXISTS idx_abhq_admin_users_active_sent_at ON abhq_admin_users(active, invitation_sent_at);

-- Create function to get pending/expiring invitations
CREATE OR REPLACE FUNCTION get_pending_admin_invitations(
  expiry_threshold_hours INTEGER DEFAULT 2
)
RETURNS TABLE (
  id UUID,
  email TEXT,
  level TEXT,
  invitation_sent_at TIMESTAMPTZ,
  invitation_expires_at TIMESTAMPTZ,
  hours_until_expiry NUMERIC,
  reminder_count INTEGER,
  last_reminder_sent TIMESTAMPTZ
) 
LANGUAGE plpgsql 
SECURITY DEFINER 
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    au.id,
    au.email,
    au.level,
    au.invitation_sent_at,
    au.invitation_expires_at,
    ROUND(EXTRACT(EPOCH FROM (au.invitation_expires_at - NOW())) / 3600, 1) as hours_until_expiry,
    COALESCE(au.invitation_reminder_count, 0) as reminder_count,
    au.last_invitation_reminder_sent
  FROM abhq_admin_users au
  WHERE au.active = false 
    AND au.invitation_sent_at IS NOT NULL
    AND au.invitation_expires_at > NOW()
    AND au.invitation_expires_at <= NOW() + INTERVAL '1 hour' * expiry_threshold_hours
  ORDER BY au.invitation_expires_at ASC;
END;
$$;

-- Create function to get expired invitations that need resending
CREATE OR REPLACE FUNCTION get_expired_admin_invitations()
RETURNS TABLE (
  id UUID,
  email TEXT,
  level TEXT,
  invitation_sent_at TIMESTAMPTZ,
  invitation_expires_at TIMESTAMPTZ,
  hours_since_expired NUMERIC,
  reminder_count INTEGER
) 
LANGUAGE plpgsql 
SECURITY DEFINER 
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    au.id,
    au.email,
    au.level,
    au.invitation_sent_at,
    au.invitation_expires_at,
    ROUND(EXTRACT(EPOCH FROM (NOW() - au.invitation_expires_at)) / 3600, 1) as hours_since_expired,
    COALESCE(au.invitation_reminder_count, 0) as reminder_count
  FROM abhq_admin_users au
  WHERE au.active = false 
    AND au.invitation_sent_at IS NOT NULL
    AND au.invitation_expires_at < NOW()
  ORDER BY au.invitation_expires_at DESC;
END;
$$;

-- Create function to mark invitation as accepted
CREATE OR REPLACE FUNCTION mark_admin_invitation_accepted(user_email TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  updated_count INTEGER;
BEGIN
  UPDATE abhq_admin_users 
  SET 
    invitation_accepted_at = NOW(),
    active = true,
    updated_at = NOW()
  WHERE email = user_email 
    AND active = false 
    AND invitation_sent_at IS NOT NULL;
  
  GET DIAGNOSTICS updated_count = ROW_COUNT;
  
  RETURN updated_count > 0;
END;
$$;

-- Create function to send invitation reminder
CREATE OR REPLACE FUNCTION record_invitation_reminder_sent(user_email TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  updated_count INTEGER;
BEGIN
  UPDATE abhq_admin_users 
  SET 
    last_invitation_reminder_sent = NOW(),
    invitation_reminder_count = COALESCE(invitation_reminder_count, 0) + 1,
    updated_at = NOW()
  WHERE email = user_email 
    AND active = false 
    AND invitation_sent_at IS NOT NULL;
  
  GET DIAGNOSTICS updated_count = ROW_COUNT;
  
  RETURN updated_count > 0;
END;
$$;

-- Update existing admin records to have proper invitation tracking
-- Note: This is a one-time backfill for existing inactive admin users
UPDATE abhq_admin_users 
SET 
  invitation_sent_at = created_at,
  invitation_expires_at = created_at + INTERVAL '24 hours'
WHERE active = false 
  AND invitation_sent_at IS NULL 
  AND created_at IS NOT NULL;

-- Create view for admin invitation dashboard
CREATE OR REPLACE VIEW admin_invitation_dashboard AS
SELECT 
  au.id,
  au.email,
  au.level,
  au.active,
  au.created_at,
  au.created_by,
  au.invitation_sent_at,
  au.invitation_expires_at,
  au.invitation_accepted_at,
  au.last_invitation_reminder_sent,
  COALESCE(au.invitation_reminder_count, 0) as reminder_count,
  CASE 
    WHEN au.active = true THEN 'Active'
    WHEN au.invitation_expires_at IS NULL THEN 'No invitation sent'
    WHEN au.invitation_expires_at < NOW() THEN 'Expired'
    WHEN au.invitation_expires_at <= NOW() + INTERVAL '2 hours' THEN 'Expiring soon'
    ELSE 'Pending'
  END as status,
  CASE 
    WHEN au.invitation_expires_at IS NULL THEN NULL
    WHEN au.invitation_expires_at < NOW() THEN 
      ROUND(EXTRACT(EPOCH FROM (NOW() - au.invitation_expires_at)) / 3600, 1)
    ELSE 
      ROUND(EXTRACT(EPOCH FROM (au.invitation_expires_at - NOW())) / 3600, 1)
  END as hours_until_expiry_or_since_expired
FROM abhq_admin_users au
ORDER BY 
  au.active ASC,
  au.invitation_expires_at ASC NULLS LAST,
  au.created_at DESC;

-- Grant permissions for the view
GRANT SELECT ON admin_invitation_dashboard TO authenticated;

-- Note: RLS policies cannot be applied to views directly.
-- Access control for this view should be handled in the application layer
-- by checking admin permissions before querying the view.
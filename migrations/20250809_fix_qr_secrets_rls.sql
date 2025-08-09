-- Fix RLS policies for event_qr_secrets table
-- The existing policy is too complex and failing for some admin users

-- Drop existing policies
DROP POLICY IF EXISTS event_qr_secrets_select_policy ON event_qr_secrets;
DROP POLICY IF EXISTS event_qr_secrets_insert_policy ON event_qr_secrets;
DROP POLICY IF EXISTS event_qr_secrets_update_policy ON event_qr_secrets;

-- Create simpler, more reliable policies using the check_event_admin_permission function
CREATE POLICY event_qr_secrets_select_policy ON event_qr_secrets
  FOR SELECT TO authenticated
  USING (check_event_admin_permission(event_id, 'voting', NULL));

CREATE POLICY event_qr_secrets_insert_policy ON event_qr_secrets
  FOR INSERT TO authenticated
  WITH CHECK (check_event_admin_permission(event_id, 'voting', NULL));

CREATE POLICY event_qr_secrets_update_policy ON event_qr_secrets
  FOR UPDATE TO authenticated
  USING (check_event_admin_permission(event_id, 'voting', NULL));

-- Also ensure RLS is enabled
ALTER TABLE event_qr_secrets ENABLE ROW LEVEL SECURITY;
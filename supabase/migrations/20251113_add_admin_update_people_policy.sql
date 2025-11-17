-- Add UPDATE policy for admin users on people table
-- This allows admins to update message_blocked and other fields

CREATE POLICY "ABHQ admins can update people"
ON people
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM abhq_admin_users
    WHERE abhq_admin_users.email = (auth.jwt() ->> 'email')
    AND abhq_admin_users.active = true
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM abhq_admin_users
    WHERE abhq_admin_users.email = (auth.jwt() ->> 'email')
    AND abhq_admin_users.active = true
  )
);

-- Add policy to allow admins to read sms_marketing_campaigns

CREATE POLICY "Admin users can read sms_marketing_campaigns"
ON sms_marketing_campaigns
FOR SELECT
TO public
USING (
  auth.jwt() ->> 'email' IN (
    SELECT email
    FROM admin_users
    WHERE role IN ('admin', 'super_admin')
  )
);

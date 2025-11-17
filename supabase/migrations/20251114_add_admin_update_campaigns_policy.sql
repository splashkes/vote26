-- Add policy to allow admins to update sms_marketing_campaigns
-- This is needed for the edge function to update campaign metadata when scheduling

CREATE POLICY "Admin users can update sms_marketing_campaigns"
ON sms_marketing_campaigns
FOR UPDATE
TO public
USING (
  auth.jwt() ->> 'email' IN (
    SELECT email
    FROM abhq_admin_users
    WHERE level = 'super' AND active = true
  )
);

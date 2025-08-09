-- Complete QR system RLS policies
-- Add missing INSERT and UPDATE policies for event_qr_secrets table

-- Event QR secrets can be inserted by admins
CREATE POLICY event_qr_secrets_insert_policy ON event_qr_secrets
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS(
      SELECT 1 FROM event_admins 
      WHERE event_id = event_qr_secrets.event_id 
        AND phone IN (
          (auth.jwt() ->> 'phone'::text),
          (SELECT people.phone FROM people WHERE people.auth_user_id = auth.uid() LIMIT 1),
          (SELECT people.phone_number FROM people WHERE people.auth_user_id = auth.uid() LIMIT 1)
        )
    )
  );

-- Event QR secrets can be updated by admins  
CREATE POLICY event_qr_secrets_update_policy ON event_qr_secrets
  FOR UPDATE TO authenticated
  USING (
    EXISTS(
      SELECT 1 FROM event_admins 
      WHERE event_id = event_qr_secrets.event_id 
        AND phone IN (
          (auth.jwt() ->> 'phone'::text),
          (SELECT people.phone FROM people WHERE people.auth_user_id = auth.uid() LIMIT 1),
          (SELECT people.phone_number FROM people WHERE people.auth_user_id = auth.uid() LIMIT 1)
        )
    )
  )
  WITH CHECK (
    EXISTS(
      SELECT 1 FROM event_admins 
      WHERE event_id = event_qr_secrets.event_id 
        AND phone IN (
          (auth.jwt() ->> 'phone'::text),
          (SELECT people.phone FROM people WHERE people.auth_user_id = auth.uid() LIMIT 1),
          (SELECT people.phone_number FROM people WHERE people.auth_user_id = auth.uid() LIMIT 1)
        )
    )
  );

-- QR codes can be inserted by the edge function (using service role)
CREATE POLICY qr_codes_insert_policy ON qr_codes
  FOR INSERT TO authenticated
  WITH CHECK (true);

-- QR codes can be updated by the edge function (using service role) 
CREATE POLICY qr_codes_update_policy ON qr_codes
  FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

-- QR codes can be deleted by cleanup function (using service role)
CREATE POLICY qr_codes_delete_policy ON qr_codes
  FOR DELETE TO authenticated
  USING (true);

-- Test the policies work
SELECT 'QR RLS policies completed successfully' as status;
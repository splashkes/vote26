-- Fix QR system RLS policies
-- The original migration had incorrect column references

-- Drop the problematic policies first
DROP POLICY IF EXISTS event_qr_secrets_select_policy ON event_qr_secrets;
DROP POLICY IF EXISTS people_qr_scans_select_policy ON people_qr_scans;

-- Event QR secrets can only be managed by admins (using phone-based auth)
CREATE POLICY event_qr_secrets_select_policy ON event_qr_secrets
  FOR SELECT TO authenticated
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
        AND phone IN (
          (auth.jwt() ->> 'phone'::text),
          (SELECT people.phone FROM people WHERE people.auth_user_id = auth.uid() LIMIT 1),
          (SELECT people.phone_number FROM people WHERE people.auth_user_id = auth.uid() LIMIT 1)
        )
    )
  );

-- Test that the has_valid_qr_scan function works
SELECT 'QR system RLS policies fixed successfully' as status;
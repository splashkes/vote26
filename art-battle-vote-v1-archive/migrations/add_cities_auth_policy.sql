-- Add RLS policy for authenticated users to read cities
CREATE POLICY "auth_read_cities" ON cities
FOR SELECT
TO authenticated
USING (true);
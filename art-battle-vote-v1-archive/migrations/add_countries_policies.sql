-- Enable RLS on countries table
ALTER TABLE countries ENABLE ROW LEVEL SECURITY;

-- Add RLS policies for reading countries
CREATE POLICY "anon_read_countries" ON countries
FOR SELECT
TO anon
USING (true);

CREATE POLICY "auth_read_countries" ON countries
FOR SELECT
TO authenticated
USING (true);
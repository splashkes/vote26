-- Drop existing RLS policies on votes and bids
DROP POLICY IF EXISTS "Enable insert for authenticated users only" ON public.votes;
DROP POLICY IF EXISTS "Enable read for authenticated users only" ON public.votes;
DROP POLICY IF EXISTS "Enable insert for authenticated users only" ON public.bids;
DROP POLICY IF EXISTS "Enable read for authenticated users only" ON public.bids;
DROP POLICY IF EXISTS "Authenticated users can insert votes with their person_id" ON public.votes;
DROP POLICY IF EXISTS "Authenticated users can read their own votes" ON public.votes;
DROP POLICY IF EXISTS "Authenticated users can insert bids with their person_id" ON public.bids;
DROP POLICY IF EXISTS "Authenticated users can read all bids" ON public.bids;

-- Create function to get person_id from auth metadata
CREATE OR REPLACE FUNCTION public.get_auth_person_id() 
RETURNS UUID AS $$
  SELECT ((auth.jwt()->>'user_metadata'::text)::json->>'person_id')::uuid
$$ LANGUAGE SQL STABLE SECURITY DEFINER;

-- Create new RLS policies for votes table
CREATE POLICY "Authenticated users can insert votes with their person_id" 
ON public.votes FOR INSERT 
TO authenticated
WITH CHECK (
  person_id::text = public.get_auth_person_id()::text
);

CREATE POLICY "Authenticated users can read their own votes" 
ON public.votes FOR SELECT 
TO authenticated
USING (
  person_id::text = public.get_auth_person_id()::text
);

-- Create new RLS policies for bids table
CREATE POLICY "Authenticated users can insert bids with their person_id" 
ON public.bids FOR INSERT 
TO authenticated
WITH CHECK (
  person_id::text = public.get_auth_person_id()::text
);

CREATE POLICY "Authenticated users can read all bids" 
ON public.bids FOR SELECT 
TO authenticated
USING (true);

-- Grant execute permission on the function
GRANT EXECUTE ON FUNCTION public.get_auth_person_id() TO authenticated;
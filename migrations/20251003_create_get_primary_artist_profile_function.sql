-- Create a reusable function to get the primary/correct artist profile for a person
-- This implements the authoritative profile selection logic:
-- 1. Only active profiles (superseded_by IS NULL)
-- 2. Prioritize user-selected profile (set_primary_profile_at)
-- 3. Fallback to most recently created

CREATE OR REPLACE FUNCTION get_primary_artist_profile(p_person_id UUID)
RETURNS SETOF artist_profiles AS $$
BEGIN
  RETURN QUERY
  SELECT ap.*
  FROM artist_profiles ap
  WHERE ap.person_id = p_person_id
    AND ap.superseded_by IS NULL
  ORDER BY
    ap.set_primary_profile_at DESC NULLS LAST,
    ap.created_at DESC
  LIMIT 1;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION get_primary_artist_profile(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_primary_artist_profile(UUID) TO anon;

COMMENT ON FUNCTION get_primary_artist_profile IS 'Returns the authoritative artist profile for a person_id using consistent selection logic: user-selected (set_primary_profile_at) > active (superseded_by IS NULL) > most recent (created_at)';

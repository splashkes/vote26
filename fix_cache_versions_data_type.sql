-- Fix data type mismatch in get_event_cache_versions function
-- The EXTRACT() function returns numeric, but we declared bigint

CREATE OR REPLACE FUNCTION get_event_cache_versions(p_event_eid VARCHAR)
RETURNS TABLE(endpoint_path VARCHAR, cache_version BIGINT) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    ecv.endpoint_path,
    (EXTRACT(EPOCH FROM ecv.last_updated) * 1000)::BIGINT AS cache_version
  FROM endpoint_cache_versions ecv
  WHERE ecv.event_eid = p_event_eid OR ecv.event_eid IS NULL
  ORDER BY ecv.endpoint_path;
END;
$$ LANGUAGE plpgsql;

-- Update the comment to reflect the fix
COMMENT ON FUNCTION get_event_cache_versions IS
'Returns all cache versions for endpoints related to a specific event.
Used by client to get cache-busting parameters for initial loads.
Fixed: Cast EXTRACT result to BIGINT to match return type declaration.';
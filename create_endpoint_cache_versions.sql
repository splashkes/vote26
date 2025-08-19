-- Create endpoint cache versions table for per-endpoint cache-busting
-- This allows surgical cache invalidation - only endpoints that changed get cache-busted

CREATE TABLE IF NOT EXISTS endpoint_cache_versions (
  endpoint_path VARCHAR PRIMARY KEY,
  last_updated TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  event_eid VARCHAR,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for efficient lookups by event
CREATE INDEX IF NOT EXISTS idx_endpoint_cache_event ON endpoint_cache_versions(event_eid);

-- RPC function to get all cache versions for an event in one call
CREATE OR REPLACE FUNCTION get_event_cache_versions(p_event_eid VARCHAR)
RETURNS TABLE(endpoint_path VARCHAR, cache_version BIGINT) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    ecv.endpoint_path,
    EXTRACT(EPOCH FROM ecv.last_updated) * 1000 AS cache_version
  FROM endpoint_cache_versions ecv
  WHERE ecv.event_eid = p_event_eid OR ecv.event_eid IS NULL
  ORDER BY ecv.endpoint_path;
END;
$$ LANGUAGE plpgsql;

-- Helper function to update endpoint cache version (upsert)
CREATE OR REPLACE FUNCTION update_endpoint_cache_version(
  p_endpoint_path VARCHAR,
  p_event_eid VARCHAR DEFAULT NULL
)
RETURNS VOID AS $$
BEGIN
  INSERT INTO endpoint_cache_versions (endpoint_path, last_updated, event_eid)
  VALUES (p_endpoint_path, NOW(), p_event_eid)
  ON CONFLICT (endpoint_path)
  DO UPDATE SET 
    last_updated = NOW(),
    event_eid = COALESCE(EXCLUDED.event_eid, endpoint_cache_versions.event_eid);
END;
$$ LANGUAGE plpgsql;

-- Comments for documentation
COMMENT ON TABLE endpoint_cache_versions IS 
'Tracks last update timestamp for each API endpoint to enable surgical cache-busting.
Only endpoints that actually changed get new cache versions, maintaining CDN efficiency.';

COMMENT ON FUNCTION get_event_cache_versions IS
'Returns all cache versions for endpoints related to a specific event.
Used by client to get cache-busting parameters for initial loads.';

COMMENT ON FUNCTION update_endpoint_cache_version IS
'Updates the last_updated timestamp for a specific endpoint.
Called by triggers when data changes to invalidate only affected endpoints.';
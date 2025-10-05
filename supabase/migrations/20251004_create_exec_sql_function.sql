-- Create a function for executing arbitrary SQL queries (for testing/validation only)
-- This is intentionally NOT exposed via RLS - only callable via service role

CREATE OR REPLACE FUNCTION exec_sql(sql text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result jsonb;
BEGIN
  -- Execute the dynamic SQL and return result as JSONB
  EXECUTE format('SELECT jsonb_agg(row_to_json(t)) FROM (%s) t', sql) INTO result;
  RETURN COALESCE(result, '[]'::jsonb);
EXCEPTION
  WHEN OTHERS THEN
    RAISE EXCEPTION 'exec_sql error: %', SQLERRM;
END;
$$;

-- Restrict access - only service role can call this
REVOKE ALL ON FUNCTION exec_sql(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION exec_sql(text) TO service_role;

COMMENT ON FUNCTION exec_sql(text) IS 'Execute arbitrary SQL for validation/testing. SERVICE ROLE ONLY. Returns JSONB array of results.';

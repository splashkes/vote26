-- Function to find problematic phone numbers
CREATE OR REPLACE FUNCTION get_problematic_phones(
  p_limit INTEGER DEFAULT 50,
  p_where_clause TEXT DEFAULT ''
)
RETURNS TABLE (
  user_id UUID,
  phone TEXT,
  issue_type TEXT
) 
LANGUAGE plpgsql 
SECURITY DEFINER
AS $$
DECLARE
  query TEXT;
BEGIN
  query := '
    SELECT 
      id as user_id,
      phone,
      CASE 
        WHEN phone LIKE ''+161%'' AND length(phone) > 13 THEN ''doubled_country_code''
        WHEN phone LIKE ''020%'' AND length(phone) >= 10 THEN ''missing_country_code'' 
        WHEN phone ~ ''\+1614\d{7}$'' THEN ''area_code_duplication''
        WHEN phone LIKE ''+1614%'' AND length(phone) > 12 THEN ''area_code_duplication''
        ELSE ''other''
      END as issue_type
    FROM auth.users 
    WHERE phone IS NOT NULL 
    AND (
      phone LIKE ''+161%'' 
      OR phone LIKE ''020%'' 
      OR phone ~ ''\+1614\d{7}$''
      OR (phone LIKE ''+1614%'' AND length(phone) > 12)
    )' 
    || CASE WHEN p_where_clause != '' THEN ' ' || p_where_clause ELSE '' END ||
    ' ORDER BY phone 
    LIMIT ' || p_limit;
    
  RETURN QUERY EXECUTE query;
END;
$$;

-- Grant access to authenticated users (will be called by edge function with service role)
GRANT EXECUTE ON FUNCTION get_problematic_phones TO authenticated;
GRANT EXECUTE ON FUNCTION get_problematic_phones TO service_role;
-- Function to get available currencies from events table
-- This ensures currency options stay in sync across the system

CREATE OR REPLACE FUNCTION public.get_available_currencies()
RETURNS TABLE (currency_code VARCHAR(3))
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
    RETURN QUERY
    SELECT DISTINCT e.currency
    FROM events e
    WHERE e.currency IS NOT NULL
    ORDER BY e.currency;
END;
$function$;

-- Grant access
GRANT EXECUTE ON FUNCTION public.get_available_currencies() TO authenticated;
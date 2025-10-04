-- Create a function to calculate artist balance and currency
-- This calculates balance based on event locations where money was earned
-- Currency is determined by the primary event location (most recent or highest earning)

CREATE OR REPLACE FUNCTION get_artist_balance_and_currency(p_entry_id INTEGER)
RETURNS TABLE (
  balance NUMERIC,
  currency TEXT,
  artist_profile_id UUID
) AS $$
DECLARE
  v_artist_profile_id UUID;
  v_total_earned NUMERIC := 0;
  v_total_paid NUMERIC := 0;
  v_balance NUMERIC := 0;
  v_primary_country_code TEXT;
  v_currency TEXT;
BEGIN
  -- Get artist_profile_id from entry_id
  SELECT id INTO v_artist_profile_id
  FROM artist_profiles
  WHERE entry_id = p_entry_id
  LIMIT 1;

  IF v_artist_profile_id IS NULL THEN
    RETURN QUERY SELECT 0::NUMERIC, 'USD'::TEXT, NULL::UUID;
    RETURN;
  END IF;

  -- Calculate total earned (50% commission on sold/paid art)
  SELECT COALESCE(SUM(COALESCE(a.final_price, a.current_bid, 0) * 0.5), 0)
  INTO v_total_earned
  FROM art a
  WHERE a.artist_id = v_artist_profile_id
    AND a.status IN ('sold', 'paid');

  -- Calculate total paid
  SELECT COALESCE(SUM(ap.gross_amount), 0)
  INTO v_total_paid
  FROM artist_payments ap
  WHERE ap.artist_profile_id = v_artist_profile_id
    AND ap.status IN ('completed', 'paid', 'verified');

  v_balance := v_total_earned - v_total_paid;

  -- Determine currency based on most recent event where artist earned money
  -- Get the country code from the most recent event with sales
  SELECT c.code INTO v_primary_country_code
  FROM art a
  JOIN events e ON a.event_id = e.id
  LEFT JOIN countries c ON e.country_id = c.id
  WHERE a.artist_id = v_artist_profile_id
    AND a.status IN ('sold', 'paid')
  ORDER BY e.event_start_datetime DESC
  LIMIT 1;

  -- Map country code to currency
  -- EU countries
  IF v_primary_country_code IN ('AT', 'BE', 'CY', 'EE', 'FI', 'FR', 'DE', 'GR', 'IE', 'IT', 'LV', 'LT', 'LU', 'MT', 'NL', 'PT', 'SK', 'SI', 'ES') THEN
    v_currency := 'EUR';
  ELSE
    v_currency := CASE v_primary_country_code
      WHEN 'US' THEN 'USD'
      WHEN 'CA' THEN 'CAD'
      WHEN 'GB' THEN 'GBP'
      WHEN 'AU' THEN 'AUD'
      WHEN 'NZ' THEN 'NZD'
      WHEN 'MX' THEN 'MXN'
      WHEN 'BR' THEN 'BRL'
      WHEN 'AR' THEN 'ARS'
      WHEN 'CL' THEN 'CLP'
      WHEN 'CO' THEN 'COP'
      WHEN 'PE' THEN 'PEN'
      WHEN 'UY' THEN 'UYU'
      WHEN 'CR' THEN 'CRC'
      WHEN 'PA' THEN 'PAB'
      WHEN 'JP' THEN 'JPY'
      WHEN 'KR' THEN 'KRW'
      WHEN 'CN' THEN 'CNY'
      WHEN 'IN' THEN 'INR'
      WHEN 'SG' THEN 'SGD'
      WHEN 'MY' THEN 'MYR'
      WHEN 'TH' THEN 'THB'
      WHEN 'PH' THEN 'PHP'
      WHEN 'ID' THEN 'IDR'
      WHEN 'VN' THEN 'VND'
      WHEN 'ZA' THEN 'ZAR'
      WHEN 'NG' THEN 'NGN'
      WHEN 'KE' THEN 'KES'
      WHEN 'EG' THEN 'EGP'
      WHEN 'MA' THEN 'MAD'
      WHEN 'TN' THEN 'TND'
      WHEN 'DZ' THEN 'DZD'
      WHEN 'GH' THEN 'GHS'
      WHEN 'UG' THEN 'UGX'
      WHEN 'TZ' THEN 'TZS'
      WHEN 'ET' THEN 'ETB'
      WHEN 'CH' THEN 'CHF'
      WHEN 'NO' THEN 'NOK'
      WHEN 'SE' THEN 'SEK'
      WHEN 'DK' THEN 'DKK'
      WHEN 'PL' THEN 'PLN'
      WHEN 'CZ' THEN 'CZK'
      WHEN 'HU' THEN 'HUF'
      WHEN 'RO' THEN 'RON'
      WHEN 'BG' THEN 'BGN'
      WHEN 'HR' THEN 'HRK'
      WHEN 'RU' THEN 'RUB'
      WHEN 'UA' THEN 'UAH'
      WHEN 'TR' THEN 'TRY'
      WHEN 'IL' THEN 'ILS'
      WHEN 'SA' THEN 'SAR'
      WHEN 'AE' THEN 'AED'
      WHEN 'QA' THEN 'QAR'
      WHEN 'KW' THEN 'KWD'
      WHEN 'OM' THEN 'OMR'
      WHEN 'BH' THEN 'BHD'
      WHEN 'JO' THEN 'JOD'
      WHEN 'LB' THEN 'LBP'
      WHEN 'IS' THEN 'ISK'
      ELSE 'USD'
    END;
  END IF;

  RETURN QUERY SELECT v_balance, v_currency, v_artist_profile_id;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION get_artist_balance_and_currency(INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION get_artist_balance_and_currency(INTEGER) TO anon;
GRANT EXECUTE ON FUNCTION get_artist_balance_and_currency(INTEGER) TO service_role;

COMMENT ON FUNCTION get_artist_balance_and_currency IS 'Calculates artist balance and determines currency based on event location (most recent event with sales). Returns balance, currency code, and artist_profile_id.';

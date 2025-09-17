                                   pg_get_functiondef                                   
----------------------------------------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.get_recent_event_artists_with_payment_status()      +
  RETURNS jsonb                                                                        +
  LANGUAGE plpgsql                                                                     +
  SECURITY DEFINER                                                                     +
  SET search_path TO 'public'                                                          +
 AS $function$                                                                         +
  DECLARE                                                                              +
      result jsonb := '[]'::jsonb;                                                     +
      artist_record record;                                                            +
      ledger_data jsonb;                                                               +
  BEGIN                                                                                +
      -- Check if user is admin                                                        +
      IF NOT is_admin() THEN                                                           +
          RAISE EXCEPTION 'Access denied. Admin privileges required.';                 +
      END IF;                                                                          +
                                                                                       +
      -- Get artists who participated in events in last 90 days                        +
      FOR artist_record IN                                                             +
          SELECT DISTINCT                                                              +
              ap.id,                                                                   +
              ap.name,                                                                 +
              ap.email,                                                                +
              ap.entry_id,                                                             +
              ap.phone,                                                                +
              ap.country,                                                              +
              ap.person_id,                                                            +
              ap.created_at,                                                           +
              -- Get payment status                                                    +
              CASE                                                                     +
                  WHEN agp.id IS NOT NULL THEN                                         +
                      CASE agp.status                                                  +
                          WHEN 'completed' THEN 'completed'                            +
                          WHEN 'pending' THEN 'pending'                                +
                          ELSE 'needs_setup'                                           +
                      END                                                              +
                  ELSE 'needs_setup'                                                   +
              END as payment_status                                                    +
          FROM artist_profiles ap                                                      +
          INNER JOIN round_contestants rc ON ap.id = rc.artist_id                      +
          INNER JOIN rounds r ON rc.round_id = r.id                                    +
          INNER JOIN events e ON r.event_id = e.id                                     +
          LEFT JOIN artist_global_payments agp ON ap.id = agp.artist_profile_id        +
          WHERE e.event_start_datetime >= NOW() - INTERVAL '90 days'                   +
          ORDER BY ap.name                                                             +
          LIMIT 20 -- Limit for performance                                            +
      LOOP                                                                             +
          -- Build result without calling ledger function for now (to avoid complexity)+
          result := result || jsonb_build_array(                                       +
              jsonb_build_object(                                                      +
                  'artist_profiles', jsonb_build_object(                               +
                      'id', artist_record.id,                                          +
                      'name', artist_record.name,                                      +
                      'email', artist_record.email,                                    +
                      'entry_id', artist_record.entry_id,                              +
                      'phone', artist_record.phone,                                    +
                      'country', artist_record.country,                                +
                      'person_id', artist_record.person_id,                            +
                      'created_at', artist_record.created_at                           +
                  ),                                                                   +
                  'payment_status', artist_record.payment_status,                      +
                  'current_balance', 0,                                                +
                  'currency_info', jsonb_build_object(                                 +
                      'primary_currency', 'USD',                                       +
                      'has_mixed_currencies', false                                    +
                  )                                                                    +
              )                                                                        +
          );                                                                           +
      END LOOP;                                                                        +
                                                                                       +
      RETURN result;                                                                   +
  END;                                                                                 +
  $function$                                                                           +
 
(1 row)


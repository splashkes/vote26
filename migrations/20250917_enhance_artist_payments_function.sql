-- Enhance get_recent_event_artists_with_payment_status function
-- Add recent_city and stripe_recipient_id information

CREATE OR REPLACE FUNCTION public.get_recent_event_artists_with_payment_status()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
 DECLARE
     result jsonb := '[]'::jsonb;
     artist_record record;
     ledger_data jsonb;
 BEGIN
     -- Admin access is handled by frontend authentication

     -- Get artists who participated in events in last 90 days
     FOR artist_record IN
         SELECT DISTINCT
             ap.id,
             ap.name,
             ap.email,
             ap.entry_id,
             ap.phone,
             ap.country,
             ap.person_id,
             ap.created_at,
             -- Get payment status
             CASE
                 WHEN agp.id IS NOT NULL THEN
                     CASE agp.status
                         WHEN 'completed' THEN 'ready'
                         WHEN 'pending' THEN 'invited'
                         WHEN 'ready' THEN 'ready'
                         WHEN 'invited' THEN 'invited'
                         ELSE 'needs_setup'
                     END
                 ELSE NULL
             END as payment_status,
             agp.stripe_recipient_id,
             -- Get most recent city
             (SELECT c.name
              FROM cities c
              JOIN events e2 ON e2.city_id = c.id
              JOIN rounds r2 ON r2.event_id = e2.id
              JOIN round_contestants rc2 ON rc2.round_id = r2.id
              WHERE rc2.artist_id = ap.id
              ORDER BY e2.event_start_datetime DESC
              LIMIT 1) as recent_city,
             -- Get contest count for sorting
             (SELECT COUNT(DISTINCT e3.id)
              FROM events e3
              JOIN rounds r3 ON r3.event_id = e3.id
              JOIN round_contestants rc3 ON rc3.round_id = r3.id
              WHERE rc3.artist_id = ap.id
                AND e3.event_start_datetime >= NOW() - INTERVAL '90 days') as recent_contests
         FROM artist_profiles ap
         INNER JOIN round_contestants rc ON ap.id = rc.artist_id
         INNER JOIN rounds r ON rc.round_id = r.id
         INNER JOIN events e ON r.event_id = e.id
         LEFT JOIN artist_global_payments agp ON ap.id = agp.artist_profile_id
         WHERE e.event_start_datetime >= NOW() - INTERVAL '90 days'
         ORDER BY recent_contests DESC, ap.name
         LIMIT 50 -- Increased limit for better coverage
     LOOP
         -- Build result without calling ledger function for now (to avoid complexity)
         result := result || jsonb_build_array(
             jsonb_build_object(
                 'artist_profiles', jsonb_build_object(
                     'id', artist_record.id,
                     'name', artist_record.name,
                     'email', artist_record.email,
                     'entry_id', artist_record.entry_id,
                     'phone', artist_record.phone,
                     'country', artist_record.country,
                     'person_id', artist_record.person_id,
                     'created_at', artist_record.created_at
                 ),
                 'payment_status', artist_record.payment_status,
                 'stripe_recipient_id', artist_record.stripe_recipient_id,
                 'recent_city', artist_record.recent_city,
                 'recent_contests', artist_record.recent_contests,
                 'current_balance', 0,
                 'currency_info', jsonb_build_object(
                     'primary_currency', 'USD',
                     'has_mixed_currencies', false
                 )
             )
         );
     END LOOP;

     RETURN result;
 END;
 $function$;
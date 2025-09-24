                                                   pg_get_functiondef                                                    
-------------------------------------------------------------------------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.get_enhanced_payments_admin_data()                                                   +
  RETURNS jsonb                                                                                                         +
  LANGUAGE plpgsql                                                                                                      +
 AS $function$                                                                                                          +
 DECLARE                                                                                                                +
     result jsonb := '{}'::jsonb;                                                                                       +
     artist_record record;                                                                                              +
     artists_owing jsonb := '[]'::jsonb;                                                                                +
     artists_zero_balance jsonb := '[]'::jsonb;                                                                         +
     recent_payments jsonb := '[]'::jsonb;                                                                              +
     payment_record record;                                                                                             +
     invitation_summary record;                                                                                         +
     invitation_summaries jsonb := '{}'::jsonb;                                                                         +
 BEGIN                                                                                                                  +
     -- Get invitation summaries for all artists first                                                                  +
     FOR invitation_summary IN                                                                                          +
         SELECT * FROM get_latest_invitations_summary()                                                                 +
     LOOP                                                                                                               +
         invitation_summaries := invitation_summaries || jsonb_build_object(                                            +
             invitation_summary.artist_profile_id::text,                                                                +
             jsonb_build_object(                                                                                        +
                 'latest_invitation_sent_at', invitation_summary.latest_invitation_sent_at,                             +
                 'latest_invitation_method', invitation_summary.latest_invitation_method,                               +
                 'latest_invitation_status', invitation_summary.latest_invitation_status,                               +
                 'invitation_count', invitation_summary.invitation_count,                                               +
                 'time_since_latest', invitation_summary.time_since_latest                                              +
             )                                                                                                          +
         );                                                                                                             +
     END LOOP;                                                                                                          +
                                                                                                                        +
     -- Get recent payments sent in last 30 days with enhanced payment method info                                      +
     FOR payment_record IN                                                                                              +
         SELECT                                                                                                         +
             ap.id as artist_id,                                                                                        +
             ap.name as artist_name,                                                                                    +
             ap.entry_id,                                                                                               +
             ap.email as artist_email,                                                                                  +
             apm.gross_amount,                                                                                          +
             apm.net_amount,                                                                                            +
             apm.currency,                                                                                              +
             apm.payment_method,                                                                                        +
             apm.payment_type,                                                                                          +
             apm.status as payment_status,                                                                              +
             apm.description,                                                                                           +
             apm.created_at as payment_date,                                                                            +
             apm.metadata,                                                                                              +
             -- Enhanced payment method detection                                                                       +
             CASE                                                                                                       +
                 WHEN apm.payment_method IS NOT NULL THEN apm.payment_method                                            +
                 WHEN apm.payment_type = 'automated' AND apm.metadata->>'stripe_account_id' IS NOT NULL THEN            +
                     CASE                                                                                               +
                         WHEN agp.metadata->>'account_region' = 'international' THEN 'stripe_global_us'                 +
                         WHEN agp.metadata->>'account_region' = 'canada' THEN 'stripe_global_ca'                        +
                         WHEN agp.country = 'US' THEN 'stripe_global_us'                                                +
                         WHEN agp.country = 'CA' THEN 'stripe_global_ca'                                                +
                         ELSE 'stripe_global'                                                                           +
                     END                                                                                                +
                 WHEN apm.payment_type = 'automated' THEN 'stripe_connect'                                              +
                 WHEN apm.payment_type = 'manual' THEN 'manual'                                                         +
                 ELSE 'unknown'                                                                                         +
             END as enhanced_payment_method,                                                                            +
             (SELECT c.name                                                                                             +
              FROM cities c                                                                                             +
              JOIN events e ON e.city_id = c.id                                                                         +
              JOIN rounds r ON r.event_id = e.id                                                                        +
              JOIN round_contestants rc ON rc.round_id = r.id                                                           +
              WHERE rc.artist_id = ap.id                                                                                +
              ORDER BY e.event_start_datetime DESC                                                                      +
              LIMIT 1) as recent_city                                                                                   +
         FROM artist_payments apm                                                                                       +
         JOIN artist_profiles ap ON apm.artist_profile_id = ap.id                                                       +
         LEFT JOIN artist_global_payments agp ON ap.id = agp.artist_profile_id                                          +
             AND apm.metadata->>'stripe_account_id' = agp.stripe_recipient_id                                           +
         WHERE apm.created_at >= NOW() - INTERVAL '30 days'                                                             +
         ORDER BY apm.created_at DESC                                                                                   +
         LIMIT 100                                                                                                      +
     LOOP                                                                                                               +
         recent_payments := recent_payments || jsonb_build_array(                                                       +
             jsonb_build_object(                                                                                        +
                 'artist_id', payment_record.artist_id,                                                                 +
                 'artist_name', payment_record.artist_name,                                                             +
                 'entry_id', payment_record.entry_id,                                                                   +
                 'artist_email', payment_record.artist_email,                                                           +
                 'recent_city', payment_record.recent_city,                                                             +
                 'gross_amount', payment_record.gross_amount,                                                           +
                 'net_amount', payment_record.net_amount,                                                               +
                 'currency', payment_record.currency,                                                                   +
                 'payment_method', payment_record.payment_method,                                                       +
                 'enhanced_payment_method', payment_record.enhanced_payment_method,                                     +
                 'payment_type', payment_record.payment_type,                                                           +
                 'payment_status', payment_record.payment_status,                                                       +
                 'description', payment_record.description,                                                             +
                 'payment_date', payment_record.payment_date,                                                           +
                 'metadata', payment_record.metadata                                                                    +
             )                                                                                                          +
         );                                                                                                             +
     END LOOP;                                                                                                          +
                                                                                                                        +
     -- Get all artists who actually participated in rounds (round_contestants)                                         +
     -- Focus on actual participants rather than just applicants/confirmations                                          +
     FOR artist_record IN                                                                                               +
         SELECT DISTINCT                                                                                                +
             ap.id,                                                                                                     +
             ap.name,                                                                                                   +
             ap.email,                                                                                                  +
             ap.entry_id,                                                                                               +
             ap.phone,                                                                                                  +
             ap.country,                                                                                                +
             ap.person_id,                                                                                              +
             ap.created_at,                                                                                             +
             -- Payment status                                                                                          +
             CASE                                                                                                       +
                 WHEN agp.id IS NOT NULL THEN                                                                           +
                     CASE agp.status                                                                                    +
                         WHEN 'completed' THEN 'ready'                                                                  +
                         WHEN 'pending' THEN 'invited'                                                                  +
                         WHEN 'ready' THEN 'ready'                                                                      +
                         WHEN 'invited' THEN 'invited'                                                                  +
                         ELSE 'needs_setup'                                                                             +
                     END                                                                                                +
                 ELSE NULL                                                                                              +
             END as payment_status,                                                                                     +
             agp.stripe_recipient_id,                                                                                   +
             -- Recent city (from actual participation)                                                                 +
             (SELECT c.name                                                                                             +
              FROM cities c                                                                                             +
              JOIN events e2 ON e2.city_id = c.id                                                                       +
              JOIN rounds r2 ON r2.event_id = e2.id                                                                     +
              JOIN round_contestants rc2 ON rc2.round_id = r2.id                                                        +
              WHERE rc2.artist_id = ap.id                                                                               +
              ORDER BY e2.event_start_datetime DESC                                                                     +
              LIMIT 1) as recent_city,                                                                                  +
             -- Recent contest count (last 180 days - from actual participation)                                        +
             (SELECT COUNT(DISTINCT e3.id)                                                                              +
              FROM events e3                                                                                            +
              JOIN rounds r3 ON r3.event_id = e3.id                                                                     +
              JOIN round_contestants rc3 ON rc3.round_id = r3.id                                                        +
              WHERE rc3.artist_id = ap.id                                                                               +
                AND e3.event_start_datetime >= NOW() - INTERVAL '180 days') as recent_contests,                         +
             -- Check if they have any balance owing (using same logic as artist-account-ledger)                        +
             COALESCE((                                                                                                 +
                 SELECT SUM(CASE WHEN type = 'credit' THEN amount ELSE -amount END)                                     +
                 FROM (                                                                                                 +
                     -- Art sales (credits) - match artist-account-ledger logic                                         +
                     SELECT 'credit' as type,                                                                           +
                            (COALESCE(final_price, current_bid, 0) * 0.5) as amount                                     +
                     FROM art                                                                                           +
                     WHERE artist_id = ap.id                                                                            +
                       AND status IN ('sold', 'paid', 'closed')                                                         +
                       AND (final_price > 0 OR current_bid > 0)                                                         +
                                                                                                                        +
                     UNION ALL                                                                                          +
                                                                                                                        +
                     -- Manual payments (debits) - EXCLUDE pending/processing automated payments                        +
                     SELECT 'debit' as type, gross_amount as amount                                                     +
                     FROM artist_payments                                                                               +
                     WHERE artist_profile_id = ap.id                                                                    +
                       AND status IN ('completed', 'paid')                                                              +
                       AND NOT (payment_type = 'automated' AND status IN ('pending', 'processing', 'failed'))           +
                 ) ledger                                                                                               +
             ), 0) as estimated_balance,                                                                                +
             -- Check for active automated payments                                                                     +
             (SELECT status                                                                                             +
              FROM artist_payments                                                                                      +
              WHERE artist_profile_id = ap.id                                                                           +
                AND payment_type = 'automated'                                                                          +
                AND status IN ('pending', 'processing', 'failed')                                                       +
              ORDER BY created_at DESC                                                                                  +
              LIMIT 1) as active_automated_payment_status                                                               +
         FROM artist_profiles ap                                                                                        +
         LEFT JOIN artist_global_payments agp ON ap.id = agp.artist_profile_id                                          +
         WHERE                                                                                                          +
             -- Focus on artists who actually participated in rounds (not just applied/confirmed)                       +
             ap.id IN (                                                                                                 +
                 SELECT DISTINCT rc.artist_id                                                                           +
                 FROM round_contestants rc                                                                              +
                 JOIN rounds r ON rc.round_id = r.id                                                                    +
                 JOIN events e ON r.event_id = e.id                                                                     +
                 WHERE e.event_start_datetime >= NOW() - INTERVAL '365 days'  -- Last year of actual participants       +
             )                                                                                                          +
             OR                                                                                                         +
             -- Include artists with payment accounts (they might be from older events)                                 +
             (agp.id IS NOT NULL)                                                                                       +
             OR                                                                                                         +
             -- Include artists with art sales (potential balance owing)                                                +
             (ap.id IN (                                                                                                +
                 SELECT DISTINCT artist_id                                                                              +
                 FROM art                                                                                               +
                 WHERE final_price > 0 AND final_price IS NOT NULL                                                      +
             ))                                                                                                         +
         ORDER BY                                                                                                       +
             -- Prioritize those with estimated balance, then recent activity                                           +
             estimated_balance DESC,                                                                                    +
             recent_contests DESC,                                                                                      +
             ap.name                                                                                                    +
         LIMIT 500  -- Comprehensive view                                                                               +
     LOOP                                                                                                               +
         -- Get invitation info for this artist                                                                         +
         DECLARE                                                                                                        +
             artist_invitation_info jsonb := invitation_summaries->artist_record.id::text;                              +
         BEGIN                                                                                                          +
             -- MODIFIED LOGIC: Include in artists_owing if they have balance OR active automated payments              +
             IF artist_record.estimated_balance > 0.01 OR artist_record.active_automated_payment_status IS NOT NULL THEN+
                 artists_owing := artists_owing || jsonb_build_array(                                                   +
                     jsonb_build_object(                                                                                +
                         'artist_profiles', jsonb_build_object(                                                         +
                             'id', artist_record.id,                                                                    +
                             'name', artist_record.name,                                                                +
                             'email', artist_record.email,                                                              +
                             'entry_id', artist_record.entry_id,                                                        +
                             'phone', artist_record.phone,                                                              +
                             'country', artist_record.country,                                                          +
                             'person_id', artist_record.person_id,                                                      +
                             'created_at', artist_record.created_at                                                     +
                         ),                                                                                             +
                         'payment_status', artist_record.payment_status,                                                +
                         'stripe_recipient_id', artist_record.stripe_recipient_id,                                      +
                         'recent_city', artist_record.recent_city,                                                      +
                         'recent_contests', artist_record.recent_contests,                                              +
                         'estimated_balance', artist_record.estimated_balance,                                          +
                         'current_balance', artist_record.estimated_balance,  -- For compatibility                      +
                         'currency_info', jsonb_build_object(                                                           +
                             'primary_currency', 'USD',                                                                 +
                             'has_mixed_currencies', false                                                              +
                         ),                                                                                             +
                         'invitation_info', COALESCE(artist_invitation_info, 'null'::jsonb)                             +
                     )                                                                                                  +
                 );                                                                                                     +
             ELSE                                                                                                       +
                 artists_zero_balance := artists_zero_balance || jsonb_build_array(                                     +
                     jsonb_build_object(                                                                                +
                         'artist_profiles', jsonb_build_object(                                                         +
                             'id', artist_record.id,                                                                    +
                             'name', artist_record.name,                                                                +
                             'email', artist_record.email,                                                              +
                             'entry_id', artist_record.entry_id,                                                        +
                             'phone', artist_record.phone,                                                              +
                             'country', artist_record.country,                                                          +
                             'person_id', artist_record.person_id,                                                      +
                             'created_at', artist_record.created_at                                                     +
                         ),                                                                                             +
                         'payment_status', artist_record.payment_status,                                                +
                         'stripe_recipient_id', artist_record.stripe_recipient_id,                                      +
                         'recent_city', artist_record.recent_city,                                                      +
                         'recent_contests', artist_record.recent_contests,                                              +
                         'estimated_balance', artist_record.estimated_balance,                                          +
                         'current_balance', 0,  -- For compatibility                                                    +
                         'currency_info', jsonb_build_object(                                                           +
                             'primary_currency', 'USD',                                                                 +
                             'has_mixed_currencies', false                                                              +
                         ),                                                                                             +
                         'invitation_info', COALESCE(artist_invitation_info, 'null'::jsonb)                             +
                     )                                                                                                  +
                 );                                                                                                     +
             END IF;                                                                                                    +
         END;                                                                                                           +
     END LOOP;                                                                                                          +
                                                                                                                        +
     -- Build final result                                                                                              +
     result := jsonb_build_object(                                                                                      +
         'artists_owing', artists_owing,                                                                                +
         'artists_zero_balance', artists_zero_balance,                                                                  +
         'recent_payments', recent_payments,                                                                            +
         'summary', jsonb_build_object(                                                                                 +
             'total_artists', jsonb_array_length(artists_owing) + jsonb_array_length(artists_zero_balance),             +
             'artists_owing_count', jsonb_array_length(artists_owing),                                                  +
             'artists_zero_count', jsonb_array_length(artists_zero_balance),                                            +
             'recent_payments_count', jsonb_array_length(recent_payments),                                              +
             'generated_at', NOW()                                                                                      +
         )                                                                                                              +
     );                                                                                                                 +
                                                                                                                        +
     RETURN result;                                                                                                     +
 END;                                                                                                                   +
 $function$                                                                                                             +
 
(1 row)


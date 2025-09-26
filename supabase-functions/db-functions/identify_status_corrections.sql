                                                                                             pg_get_functiondef                                                                                              
-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.identify_status_corrections()                                                                                                                                            +
  RETURNS TABLE(payment_id uuid, current_status text, suggested_status text, transfer_id text, artist_name text, amount numeric, currency text, created_at timestamp with time zone, correction_reason text)+
  LANGUAGE plpgsql                                                                                                                                                                                          +
  SECURITY DEFINER                                                                                                                                                                                          +
 AS $function$                                                                                                                                                                                              +
 BEGIN                                                                                                                                                                                                      +
     RETURN QUERY                                                                                                                                                                                           +
     -- Case 1: Failed payments that have successful transfers (should be 'paid')                                                                                                                           +
     SELECT                                                                                                                                                                                                 +
         ap.id as payment_id,                                                                                                                                                                               +
         ap.status as current_status,                                                                                                                                                                       +
         'paid'::text as suggested_status,                                                                                                                                                                  +
         ap.stripe_transfer_id as transfer_id,                                                                                                                                                              +
         profiles.name::text as artist_name,                                                                                                                                                                +
         ap.gross_amount as amount,                                                                                                                                                                         +
         ap.currency::text,                                                                                                                                                                                 +
         ap.created_at,                                                                                                                                                                                     +
         'has_transfer_id_but_failed'::text as correction_reason                                                                                                                                            +
     FROM artist_payments ap                                                                                                                                                                                +
     JOIN artist_profiles profiles ON ap.artist_profile_id = profiles.id                                                                                                                                    +
     WHERE ap.status = 'failed'                                                                                                                                                                             +
       AND ap.stripe_transfer_id IS NOT NULL                                                                                                                                                                +
       AND LENGTH(ap.stripe_transfer_id) > 0                                                                                                                                                                +
                                                                                                                                                                                                            +
     UNION ALL                                                                                                                                                                                              +
                                                                                                                                                                                                            +
     -- Case 2: Paid payments that have webhook confirmation (should be 'verified')                                                                                                                         +
     SELECT                                                                                                                                                                                                 +
         ap.id as payment_id,                                                                                                                                                                               +
         ap.status as current_status,                                                                                                                                                                       +
         'verified'::text as suggested_status,                                                                                                                                                              +
         ap.stripe_transfer_id as transfer_id,                                                                                                                                                              +
         profiles.name::text as artist_name,                                                                                                                                                                +
         ap.gross_amount as amount,                                                                                                                                                                         +
         ap.currency::text,                                                                                                                                                                                 +
         ap.created_at,                                                                                                                                                                                     +
         'has_webhook_confirmation'::text as correction_reason                                                                                                                                              +
     FROM artist_payments ap                                                                                                                                                                                +
     JOIN artist_profiles profiles ON ap.artist_profile_id = profiles.id                                                                                                                                    +
     WHERE ap.status = 'paid'                                                                                                                                                                               +
       AND (                                                                                                                                                                                                +
           ap.metadata->>'transfer_webhook_processed' IS NOT NULL OR                                                                                                                                        +
           ap.metadata->>'webhook_event_type' = 'transfer.created'                                                                                                                                          +
       )                                                                                                                                                                                                    +
                                                                                                                                                                                                            +
     UNION ALL                                                                                                                                                                                              +
                                                                                                                                                                                                            +
     -- Case 3: Processing payments with successful API conversations (should be 'paid')                                                                                                                    +
     SELECT                                                                                                                                                                                                 +
         ap.id as payment_id,                                                                                                                                                                               +
         ap.status as current_status,                                                                                                                                                                       +
         'paid'::text as suggested_status,                                                                                                                                                                  +
         ap.stripe_transfer_id as transfer_id,                                                                                                                                                              +
         profiles.name::text as artist_name,                                                                                                                                                                +
         ap.gross_amount as amount,                                                                                                                                                                         +
         ap.currency::text,                                                                                                                                                                                 +
         ap.created_at,                                                                                                                                                                                     +
         'api_conversation_success'::text as correction_reason                                                                                                                                              +
     FROM artist_payments ap                                                                                                                                                                                +
     JOIN artist_profiles profiles ON ap.artist_profile_id = profiles.id                                                                                                                                    +
     LEFT JOIN stripe_api_conversations sac ON ap.id = sac.payment_id                                                                                                                                       +
     WHERE ap.status = 'processing'                                                                                                                                                                         +
       AND sac.response_status = 200                                                                                                                                                                        +
       AND sac.error_message IS NULL                                                                                                                                                                        +
       AND ap.stripe_transfer_id IS NOT NULL                                                                                                                                                                +
                                                                                                                                                                                                            +
     ORDER BY created_at DESC;                                                                                                                                                                              +
 END;                                                                                                                                                                                                       +
 $function$                                                                                                                                                                                                 +
 
(1 row)


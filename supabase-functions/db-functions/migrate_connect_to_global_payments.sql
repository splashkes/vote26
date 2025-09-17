                                                                                                pg_get_functiondef                                                                                                
------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.migrate_connect_to_global_payments(p_artist_profile_id uuid, p_stripe_recipient_id text, p_country character DEFAULT 'US'::bpchar, p_currency character DEFAULT 'USD'::bpchar)+
  RETURNS uuid                                                                                                                                                                                                   +
  LANGUAGE plpgsql                                                                                                                                                                                               +
 AS $function$                                                                                                                                                                                                   +
  DECLARE                                                                                                                                                                                                        +
      v_global_payment_id UUID;                                                                                                                                                                                  +
      v_connect_account_id TEXT;                                                                                                                                                                                 +
  BEGIN                                                                                                                                                                                                          +
      -- Get existing Connect account ID for mapping                                                                                                                                                             +
      SELECT stripe_account_id INTO v_connect_account_id                                                                                                                                                         +
      FROM artist_stripe_accounts                                                                                                                                                                                +
      WHERE artist_profile_id = p_artist_profile_id;                                                                                                                                                             +
                                                                                                                                                                                                                 +
      -- Insert new Global Payments record                                                                                                                                                                       +
      INSERT INTO artist_global_payments (                                                                                                                                                                       +
          artist_profile_id,                                                                                                                                                                                     +
          stripe_recipient_id,                                                                                                                                                                                   +
          legacy_stripe_connect_account_id,                                                                                                                                                                      +
          country,                                                                                                                                                                                               +
          default_currency,                                                                                                                                                                                      +
          status,                                                                                                                                                                                                +
          migration_completed_at,                                                                                                                                                                                +
          metadata                                                                                                                                                                                               +
      ) VALUES (                                                                                                                                                                                                 +
          p_artist_profile_id,                                                                                                                                                                                   +
          p_stripe_recipient_id,                                                                                                                                                                                 +
          v_connect_account_id,                                                                                                                                                                                  +
          p_country,                                                                                                                                                                                             +
          p_currency,                                                                                                                                                                                            +
          'ready', -- Assume recipient is ready when migrating                                                                                                                                                   +
          NOW(),                                                                                                                                                                                                 +
          jsonb_build_object(                                                                                                                                                                                    +
              'migrated_from_connect', true,                                                                                                                                                                     +
              'migration_date', NOW()::text                                                                                                                                                                      +
          )                                                                                                                                                                                                      +
      ) RETURNING id INTO v_global_payment_id;                                                                                                                                                                   +
                                                                                                                                                                                                                 +
      RETURN v_global_payment_id;                                                                                                                                                                                +
  END;                                                                                                                                                                                                           +
  $function$                                                                                                                                                                                                     +
 
(1 row)


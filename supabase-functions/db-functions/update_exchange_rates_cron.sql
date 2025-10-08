                                        pg_get_functiondef                                         
---------------------------------------------------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.update_exchange_rates_cron()                                   +
  RETURNS jsonb                                                                                   +
  LANGUAGE plpgsql                                                                                +
  SECURITY DEFINER                                                                                +
 AS $function$                                                                                    +
 DECLARE                                                                                          +
   result jsonb;                                                                                  +
 BEGIN                                                                                            +
   -- Call the update-exchange-rates edge function via pg_net                                     +
   PERFORM net.http_get(                                                                          +
     url := 'https://xsqdkubgyqwpyvfltnrf.supabase.co/functions/v1/update-exchange-rates',        +
     headers := jsonb_build_object(                                                               +
       'X-Cron-Secret', (SELECT secret_value FROM cron_secrets WHERE name = 'exchange_rates_cron')+
     )                                                                                            +
   );                                                                                             +
                                                                                                  +
   result := jsonb_build_object(                                                                  +
     'success', true,                                                                             +
     'timestamp', now()                                                                           +
   );                                                                                             +
                                                                                                  +
   RETURN result;                                                                                 +
 END;                                                                                             +
 $function$                                                                                       +
 
(1 row)


                               pg_get_functiondef                               
--------------------------------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.notify_auth_webhook()                       +
  RETURNS trigger                                                              +
  LANGUAGE plpgsql                                                             +
 AS $function$                                                                 +
 BEGIN                                                                         +
   -- Only process when phone_confirmed_at changes from NULL to a timestamp    +
   IF OLD.phone_confirmed_at IS NOT NULL OR NEW.phone_confirmed_at IS NULL THEN+
     RETURN NEW;                                                               +
   END IF;                                                                     +
                                                                               +
   -- Use pg_net to call our webhook (internal call, no auth needed)           +
   PERFORM net.http_post(                                                      +
     'https://xsqdkubgyqwpyvfltnrf.supabase.co/functions/v1/auth-webhook',     +
     jsonb_build_object(                                                       +
       'type', 'UPDATE',                                                       +
       'table', 'users',                                                       +
       'schema', 'auth',                                                       +
       'record', to_jsonb(NEW),                                                +
       'old_record', to_jsonb(OLD)                                             +
     ),                                                                        +
     '{}',                                                                     +
     '{"Content-Type": "application/json"}'::jsonb                             +
   );                                                                          +
                                                                               +
   RETURN NEW;                                                                 +
 END;                                                                          +
 $function$                                                                    +
 
(1 row)


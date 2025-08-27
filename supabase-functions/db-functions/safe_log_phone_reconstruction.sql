                                                                                    pg_get_functiondef                                                                                    
------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.safe_log_phone_reconstruction(p_auth_user_id uuid, p_original_phone text, p_reconstructed_phone text, p_method text, p_fallback boolean DEFAULT false)+
  RETURNS void                                                                                                                                                                           +
  LANGUAGE plpgsql                                                                                                                                                                       +
  SECURITY DEFINER                                                                                                                                                                       +
 AS $function$                                                                                                                                                                           +
 BEGIN                                                                                                                                                                                   +
   -- Log to database with error handling                                                                                                                                                +
   BEGIN                                                                                                                                                                                 +
     PERFORM log_artist_auth(                                                                                                                                                            +
       p_auth_user_id,                                                                                                                                                                   +
       NULL,                                                                                                                                                                             +
       p_original_phone,                                                                                                                                                                 +
       'phone_reconstruction'::TEXT,                                                                                                                                                     +
       'auth_webhook'::TEXT,                                                                                                                                                             +
       true,                                                                                                                                                                             +
       CASE WHEN p_fallback THEN 'fallback_used'::TEXT ELSE NULL END,                                                                                                                    +
       NULL,                                                                                                                                                                             +
       NULL,                                                                                                                                                                             +
       jsonb_build_object(                                                                                                                                                               +
         'original_phone', p_original_phone,                                                                                                                                             +
         'reconstructed_phone', p_reconstructed_phone,                                                                                                                                   +
         'method', p_method,                                                                                                                                                             +
         'fallback_used', p_fallback,                                                                                                                                                    +
         'corruption_prevented', true                                                                                                                                                    +
       )                                                                                                                                                                                 +
     );                                                                                                                                                                                  +
   EXCEPTION                                                                                                                                                                             +
     WHEN OTHERS THEN                                                                                                                                                                    +
       -- If database logging fails, just continue - don't break user flow                                                                                                               +
       RAISE WARNING 'Failed to log phone reconstruction: %', SQLERRM;                                                                                                                   +
   END;                                                                                                                                                                                  +
                                                                                                                                                                                         +
   -- Send Slack notification with error handling                                                                                                                                        +
   BEGIN                                                                                                                                                                                 +
     DECLARE                                                                                                                                                                             +
       v_slack_message TEXT;                                                                                                                                                             +
     BEGIN                                                                                                                                                                               +
       v_slack_message := CASE                                                                                                                                                           +
         WHEN p_fallback THEN                                                                                                                                                            +
           '⚠️ Phone Reconstruction FALLBACK Used' || E'\n' ||                                                                                                                            +
           'User: ' || p_auth_user_id::text || E'\n' ||                                                                                                                                  +
           'Original: ' || p_original_phone || E'\n' ||                                                                                                                                  +
           'Reconstructed: ' || p_reconstructed_phone || E'\n' ||                                                                                                                        +
           'Method: ' || p_method || E'\n' ||                                                                                                                                            +
           '⚠️ NEEDS MANUAL REVIEW - Unknown phone format!'                                                                                                                               +
         ELSE                                                                                                                                                                            +
           '📞 Phone Corruption Prevented' || E'\n' ||                                                                                                                                    +
           'User: ' || p_auth_user_id::text || E'\n' ||                                                                                                                                  +
           'Original: ' || p_original_phone || E'\n' ||                                                                                                                                  +
           'Reconstructed: ' || p_reconstructed_phone || E'\n' ||                                                                                                                        +
           'Method: ' || p_method                                                                                                                                                        +
       END;                                                                                                                                                                              +
                                                                                                                                                                                         +
       PERFORM queue_slack_notification(                                                                                                                                                 +
         'profile-debug'::TEXT,                                                                                                                                                          +
         'phone_reconstruction'::TEXT,                                                                                                                                                   +
         v_slack_message::TEXT                                                                                                                                                           +
       );                                                                                                                                                                                +
     END;                                                                                                                                                                                +
   EXCEPTION                                                                                                                                                                             +
     WHEN OTHERS THEN                                                                                                                                                                    +
       -- If Slack notification fails, just continue - don't break user flow                                                                                                             +
       RAISE WARNING 'Failed to send phone reconstruction Slack notification: %', SQLERRM;                                                                                               +
   END;                                                                                                                                                                                  +
 END;                                                                                                                                                                                    +
 $function$                                                                                                                                                                              +
 
(1 row)


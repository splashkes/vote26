                                                                            pg_get_functiondef                                                                            
--------------------------------------------------------------------------------------------------------------------------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.secure_http_post(p_url text, p_body jsonb DEFAULT '{}'::jsonb, p_headers jsonb DEFAULT '{}'::jsonb, p_timeout_ms integer DEFAULT 5000)+
  RETURNS bigint                                                                                                                                                         +
  LANGUAGE plpgsql                                                                                                                                                       +
  SECURITY DEFINER                                                                                                                                                       +
  SET search_path TO 'pg_catalog', 'public', 'auth', 'extensions', 'realtime'                                                                                            +
 AS $function$                                                                                                                                                           +
 DECLARE                                                                                                                                                                 +
   v_allowed_domains TEXT[] := ARRAY[                                                                                                                                    +
     'xsqdkubgyqwpyvfltnrf.supabase.co',  -- Your Supabase project                                                                                                       +
     'api.twilio.com',                     -- Twilio API                                                                                                                 +
     'hooks.slack.com'                     -- Slack webhooks                                                                                                             +
   ];                                                                                                                                                                    +
   v_allowed_path_prefixes TEXT[] := ARRAY[                                                                                                                              +
     '/functions/v1/',                     -- Supabase Edge Functions                                                                                                    +
     '/2010-04-01/',                       -- Twilio API paths                                                                                                           +
     '/services/'                          -- Slack webhook paths                                                                                                        +
   ];                                                                                                                                                                    +
   v_domain TEXT;                                                                                                                                                        +
   v_path TEXT;                                                                                                                                                          +
   v_is_allowed BOOLEAN := FALSE;                                                                                                                                        +
   v_path_prefix TEXT;                                                                                                                                                   +
   v_request_id BIGINT;                                                                                                                                                  +
 BEGIN                                                                                                                                                                   +
   -- Parse domain from URL                                                                                                                                              +
   v_domain := substring(p_url from 'https?://([^/]+)');                                                                                                                 +
   v_path := substring(p_url from 'https?://[^/]+(/[^?]*)');                                                                                                             +
                                                                                                                                                                         +
   -- Check if domain is in allowed list                                                                                                                                 +
   IF v_domain = ANY(v_allowed_domains) THEN                                                                                                                             +
     -- Check if path starts with any allowed prefix                                                                                                                     +
     FOREACH v_path_prefix IN ARRAY v_allowed_path_prefixes                                                                                                              +
     LOOP                                                                                                                                                                +
       IF v_path LIKE v_path_prefix || '%' THEN                                                                                                                          +
         v_is_allowed := TRUE;                                                                                                                                           +
         EXIT;                                                                                                                                                           +
       END IF;                                                                                                                                                           +
     END LOOP;                                                                                                                                                           +
                                                                                                                                                                         +
     -- If no path specified, allow (for root level requests)                                                                                                            +
     IF v_path IS NULL OR v_path = '/' THEN                                                                                                                              +
       v_is_allowed := TRUE;                                                                                                                                             +
     END IF;                                                                                                                                                             +
   END IF;                                                                                                                                                               +
                                                                                                                                                                         +
   -- Block the request if not allowed                                                                                                                                   +
   IF NOT v_is_allowed THEN                                                                                                                                              +
     RAISE EXCEPTION 'SSRF Protection: URL not in allowed domains/paths. Domain: %, Path: %', v_domain, v_path;                                                          +
   END IF;                                                                                                                                                               +
                                                                                                                                                                         +
   -- Additional security checks                                                                                                                                         +
   -- Block private IP ranges                                                                                                                                            +
   IF v_domain ~ '^(10\.|172\.(1[6-9]|2[0-9]|3[01])\.|192\.168\.|127\.|169\.254\.|::1|localhost)' THEN                                                                   +
     RAISE EXCEPTION 'SSRF Protection: Private IP addresses not allowed';                                                                                                +
   END IF;                                                                                                                                                               +
                                                                                                                                                                         +
   -- Block suspicious patterns                                                                                                                                          +
   IF p_url ~* '(file://|ftp://|gopher://|dict://|ldap://|jar:)' THEN                                                                                                    +
     RAISE EXCEPTION 'SSRF Protection: Protocol not allowed';                                                                                                            +
   END IF;                                                                                                                                                               +
                                                                                                                                                                         +
   -- Make the HTTP request using net.http_post with correct parameter order                                                                                             +
   SELECT net.http_post(                                                                                                                                                 +
     url := p_url,                                                                                                                                                       +
     body := p_body,                                                                                                                                                     +
     params := '{}',                      -- Empty params                                                                                                                +
     headers := p_headers,                -- Headers in correct position                                                                                                 +
     timeout_milliseconds := p_timeout_ms                                                                                                                                +
   ) INTO v_request_id;                                                                                                                                                  +
                                                                                                                                                                         +
   RETURN v_request_id;                                                                                                                                                  +
 EXCEPTION                                                                                                                                                               +
   WHEN OTHERS THEN                                                                                                                                                      +
     -- Log the security violation attempt if audit table exists                                                                                                         +
     BEGIN                                                                                                                                                               +
       INSERT INTO admin_audit_log (                                                                                                                                     +
         admin_user_id,                                                                                                                                                  +
         event_id,                                                                                                                                                       +
         action_type,                                                                                                                                                    +
         action_data,                                                                                                                                                    +
         created_at                                                                                                                                                      +
       ) VALUES (                                                                                                                                                        +
         auth.uid(),                                                                                                                                                     +
         NULL,                                                                                                                                                           +
         'ssrf_violation_attempt',                                                                                                                                       +
         jsonb_build_object(                                                                                                                                             +
           'attempted_url', p_url,                                                                                                                                       +
           'error_message', SQLERRM,                                                                                                                                     +
           'user_agent', current_setting('application_name', true)                                                                                                       +
         ),                                                                                                                                                              +
         NOW()                                                                                                                                                           +
       );                                                                                                                                                                +
     EXCEPTION                                                                                                                                                           +
       WHEN OTHERS THEN                                                                                                                                                  +
         -- If audit logging fails, continue anyway (don't block the security check)                                                                                     +
         NULL;                                                                                                                                                           +
     END;                                                                                                                                                                +
                                                                                                                                                                         +
     -- Re-raise the original exception                                                                                                                                  +
     RAISE;                                                                                                                                                              +
 END;                                                                                                                                                                    +
 $function$                                                                                                                                                              +
 
(1 row)


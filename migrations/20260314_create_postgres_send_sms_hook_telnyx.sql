-- Postgres Send SMS hook for Supabase Auth
-- Purpose: bypass HTTP hook signature issues by using a Postgres auth hook
-- Strategy: normalize the auth event payload and forward it to the Telnyx edge sender

CREATE OR REPLACE FUNCTION public.send_sms_hook_telnyx(event jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'auth', 'extensions'
AS $$
DECLARE
  v_phone text;
  v_message text;
  v_otp text;
  v_user_id text;
  v_service_role_key text;
  v_request_id bigint;
  v_url text := 'https://xsqdkubgyqwpyvfltnrf.supabase.co/functions/v1/auth-send-sms';
BEGIN
  v_phone := COALESCE(
    event->'user'->>'phone',
    event->>'phone'
  );

  v_otp := COALESCE(
    event->'sms'->>'otp',
    event->'sms_data'->>'otp'
  );

  v_message := COALESCE(
    event->'sms'->>'message',
    event->'sms_data'->>'message',
    CASE
      WHEN v_otp IS NOT NULL AND v_otp <> '' THEN
        'Your Art Battle verification code is ' || v_otp
      ELSE NULL
    END
  );

  v_user_id := COALESCE(
    event->'user'->>'id',
    event->>'user_id'
  );

  IF v_phone IS NULL OR v_phone = '' THEN
    RETURN jsonb_build_object(
      'error',
      jsonb_build_object(
        'http_code', 500,
        'message', 'send_sms_hook_telnyx: missing phone in auth hook payload'
      )
    );
  END IF;

  IF v_message IS NULL OR v_message = '' THEN
    RETURN jsonb_build_object(
      'error',
      jsonb_build_object(
        'http_code', 500,
        'message', 'send_sms_hook_telnyx: missing sms message in auth hook payload'
      )
    );
  END IF;

  SELECT value
  INTO v_service_role_key
  FROM sms_config
  WHERE key = 'service_role_key'
  LIMIT 1;

  IF v_service_role_key IS NULL OR v_service_role_key = '' THEN
    RETURN jsonb_build_object(
      'error',
      jsonb_build_object(
        'http_code', 500,
        'message', 'send_sms_hook_telnyx: sms_config.service_role_key missing'
      )
    );
  END IF;

  SELECT secure_http_post(
    p_url := v_url,
    p_body := jsonb_build_object(
      'to', v_phone,
      'message', v_message,
      'user_id', v_user_id,
      'hook_source', 'postgres-send-sms'
    ),
    p_headers := jsonb_build_object(
      'Authorization', 'Bearer ' || v_service_role_key,
      'Content-Type', 'application/json'
    ),
    p_timeout_ms := 5000
  )
  INTO v_request_id;

  RETURN jsonb_build_object(
    'queued', true,
    'request_id', v_request_id
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'error',
      jsonb_build_object(
        'http_code', 500,
        'message', 'send_sms_hook_telnyx exception: ' || SQLERRM
      )
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.send_sms_hook_telnyx(jsonb) TO supabase_auth_admin;
GRANT USAGE ON SCHEMA public TO supabase_auth_admin;
REVOKE EXECUTE ON FUNCTION public.send_sms_hook_telnyx(jsonb) FROM authenticated, anon, public;

COMMENT ON FUNCTION public.send_sms_hook_telnyx(jsonb) IS
'Supabase Auth Send SMS Postgres hook. Forwards OTP SMS to auth-send-sms edge function via service-role auth.';

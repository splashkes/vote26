-- Fix auth-webhook phone corruption with safe logging and fallback handling
-- Date: August 26, 2025
-- Purpose: Stop corrupting international phone numbers and log all changes safely

CREATE OR REPLACE FUNCTION safe_log_phone_reconstruction(
  p_auth_user_id UUID,
  p_original_phone TEXT,
  p_reconstructed_phone TEXT,
  p_method TEXT,
  p_fallback BOOLEAN DEFAULT FALSE
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $logging_function$
BEGIN
  -- Log to database with error handling
  BEGIN
    PERFORM log_artist_auth(
      p_auth_user_id,
      NULL,
      p_original_phone,
      'phone_reconstruction'::TEXT,
      'auth_webhook'::TEXT,
      true,
      CASE WHEN p_fallback THEN 'fallback_used'::TEXT ELSE NULL END,
      NULL,
      NULL,
      jsonb_build_object(
        'original_phone', p_original_phone,
        'reconstructed_phone', p_reconstructed_phone,
        'method', p_method,
        'fallback_used', p_fallback,
        'corruption_prevented', true
      )
    );
  EXCEPTION
    WHEN OTHERS THEN
      -- If database logging fails, just continue - don't break user flow
      RAISE WARNING 'Failed to log phone reconstruction: %', SQLERRM;
  END;

  -- Send Slack notification with error handling
  BEGIN
    DECLARE
      v_slack_message TEXT;
    BEGIN
      v_slack_message := CASE 
        WHEN p_fallback THEN
          '⚠️ Phone Reconstruction FALLBACK Used' || E'\n' ||
          'User: ' || p_auth_user_id::text || E'\n' ||
          'Original: ' || p_original_phone || E'\n' ||
          'Reconstructed: ' || p_reconstructed_phone || E'\n' ||
          'Method: ' || p_method || E'\n' ||
          '⚠️ NEEDS MANUAL REVIEW - Unknown phone format!'
        ELSE
          '📞 Phone Corruption Prevented' || E'\n' ||
          'User: ' || p_auth_user_id::text || E'\n' ||
          'Original: ' || p_original_phone || E'\n' ||
          'Reconstructed: ' || p_reconstructed_phone || E'\n' ||
          'Method: ' || p_method
      END;

      PERFORM queue_slack_notification(
        'profile-debug'::TEXT,
        'phone_reconstruction'::TEXT,
        v_slack_message::TEXT
      );
    END;
  EXCEPTION
    WHEN OTHERS THEN
      -- If Slack notification fails, just continue - don't break user flow
      RAISE WARNING 'Failed to send phone reconstruction Slack notification: %', SQLERRM;
  END;
END;
$logging_function$;

-- Create enhanced phone reconstruction function
CREATE OR REPLACE FUNCTION reconstruct_e164_phone(
  p_stripped_phone TEXT,
  p_auth_user_id UUID DEFAULT NULL
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $reconstruction_function$
DECLARE
  v_result TEXT;
  v_method TEXT;
  v_fallback BOOLEAN := FALSE;
BEGIN
  -- If phone already has +, return as-is
  IF p_stripped_phone LIKE '+%' THEN
    RETURN p_stripped_phone;
  END IF;

  -- International country codes (most common ones first)
  CASE 
    -- Netherlands
    WHEN p_stripped_phone ~ '^31[0-9]{9}$' THEN
      v_result := '+' || p_stripped_phone;
      v_method := 'netherlands_pattern';
      
    -- UK  
    WHEN p_stripped_phone ~ '^44[0-9]{10}$' THEN
      v_result := '+' || p_stripped_phone;
      v_method := 'uk_pattern';
      
    -- Australia
    WHEN p_stripped_phone ~ '^61[0-9]{9}$' THEN
      v_result := '+' || p_stripped_phone;
      v_method := 'australia_pattern';
      
    -- New Zealand
    WHEN p_stripped_phone ~ '^64[0-9]{8,9}$' THEN
      v_result := '+' || p_stripped_phone;
      v_method := 'newzealand_pattern';
      
    -- Germany
    WHEN p_stripped_phone ~ '^49[0-9]{10,11}$' THEN
      v_result := '+' || p_stripped_phone;
      v_method := 'germany_pattern';
      
    -- France
    WHEN p_stripped_phone ~ '^33[0-9]{9}$' THEN
      v_result := '+' || p_stripped_phone;
      v_method := 'france_pattern';
      
    -- Japan
    WHEN p_stripped_phone ~ '^81[0-9]{10,11}$' THEN
      v_result := '+' || p_stripped_phone;
      v_method := 'japan_pattern';
      
    -- Mexico
    WHEN p_stripped_phone ~ '^52[0-9]{10}$' THEN
      v_result := '+' || p_stripped_phone;
      v_method := 'mexico_pattern';
      
    -- Brazil
    WHEN p_stripped_phone ~ '^55[0-9]{10,11}$' THEN
      v_result := '+' || p_stripped_phone;
      v_method := 'brazil_pattern';
      
    -- US/Canada (10 digits, no country code)
    WHEN p_stripped_phone ~ '^[2-9][0-9]{9}$' THEN
      v_result := '+1' || p_stripped_phone;
      v_method := 'us_canada_10digit';
      
    -- Fallback cases
    ELSE
      v_fallback := TRUE;
      CASE
        -- If starts with 1 and has 11 digits total, might be US/Canada with 1 prefix
        WHEN p_stripped_phone ~ '^1[2-9][0-9]{9}$' THEN
          v_result := '+' || p_stripped_phone;
          v_method := 'us_canada_11digit_fallback';
          
        -- If 10 digits, assume US/Canada
        WHEN length(p_stripped_phone) = 10 THEN
          v_result := '+1' || p_stripped_phone;
          v_method := '10digit_fallback';
          
        -- Otherwise, just add + and hope
        ELSE
          v_result := '+' || p_stripped_phone;
          v_method := 'generic_plus_fallback';
      END CASE;
  END CASE;

  -- Safe logging (will not break user flow if it fails)
  BEGIN
    IF p_auth_user_id IS NOT NULL THEN
      PERFORM safe_log_phone_reconstruction(
        p_auth_user_id,
        p_stripped_phone,
        v_result,
        v_method,
        v_fallback
      );
    END IF;
  EXCEPTION
    WHEN OTHERS THEN
      -- Even if logging fails completely, continue with user flow
      RAISE WARNING 'Phone reconstruction logging failed completely, continuing: %', SQLERRM;
  END;

  RETURN v_result;
END;
$reconstruction_function$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION safe_log_phone_reconstruction(UUID, TEXT, TEXT, TEXT, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION reconstruct_e164_phone(TEXT, UUID) TO authenticated;
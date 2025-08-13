-- Fix set_profile_as_primary function to run with elevated privileges
CREATE OR REPLACE FUNCTION public.set_profile_as_primary(profile_id uuid, target_person_id uuid)
 RETURNS TABLE(success boolean, message text, updated_profile_id uuid)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    profile_exists BOOLEAN;
BEGIN
    -- Check if profile exists
    SELECT EXISTS(SELECT 1 FROM artist_profiles WHERE id = profile_id) INTO profile_exists;
    
    IF NOT profile_exists THEN
        RETURN QUERY SELECT FALSE, 'Profile not found', NULL::UUID;
        RETURN;
    END IF;
    
    -- Clear set_primary_profile_at from any other profiles with the same person_id
    UPDATE artist_profiles 
    SET set_primary_profile_at = NULL
    WHERE person_id = target_person_id 
      AND set_primary_profile_at IS NOT NULL;
    
    -- Set this profile as primary by setting the timestamp and person_id
    UPDATE artist_profiles 
    SET person_id = target_person_id,
        set_primary_profile_at = NOW(),
        updated_at = NOW()
    WHERE id = profile_id;
    
    RETURN QUERY SELECT TRUE, 'Profile set as primary successfully', profile_id;
END;
$function$;
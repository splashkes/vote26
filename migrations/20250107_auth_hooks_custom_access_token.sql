-- Auth Hooks Migration: Custom Access Token Hook
-- Adds person claims to JWT tokens using native Supabase Auth Hooks
-- Date: 2025-01-07
-- Purpose: Replace metadata-based person access with secure JWT claims

-- Step 1: Create Custom Access Token Hook function
CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event jsonb)
RETURNS jsonb
SECURITY DEFINER  -- Execute with elevated privileges
LANGUAGE plpgsql
AS $$
DECLARE
  user_id uuid;
  person_record record;
  claims jsonb;
BEGIN
  -- Extract user ID and current claims from event
  user_id := (event->>'user_id')::uuid;
  claims := event->'claims';
  
  -- Log hook execution for debugging
  RAISE LOG '[AUTH-V2] Custom Access Token Hook fired for user: %', user_id;
  
  -- Get person record using auth-first lookup
  SELECT id, hash, name, verified INTO person_record
  FROM people 
  WHERE auth_user_id = user_id;
  
  IF FOUND THEN
    -- Add person claims to JWT
    claims := claims || jsonb_build_object(
      'person_id', person_record.id,
      'person_hash', person_record.hash,
      'person_name', person_record.name,
      'person_verified', person_record.verified,
      'auth_version', 'v2',  -- Flag indicating new auth system
      'claims_updated_at', extract(epoch from now())
    );
    
    RAISE LOG '[AUTH-V2] Added person claims to JWT for user %, person %', user_id, person_record.id;
  ELSE
    -- No person record found - add flag indicating this
    claims := claims || jsonb_build_object(
      'person_id', null,
      'auth_version', 'v2',
      'person_pending', true,  -- Indicates person creation pending
      'claims_updated_at', extract(epoch from now())
    );
    
    RAISE LOG '[AUTH-V2] No person record found for user %, person creation may be pending', user_id;
  END IF;
  
  -- Return updated claims
  return jsonb_build_object('claims', claims);
  
EXCEPTION
  WHEN OTHERS THEN
    -- Log errors but don't break JWT generation
    RAISE LOG '[AUTH-V2] Error in Custom Access Token Hook: % %', SQLSTATE, SQLERRM;
    
    -- Return original claims with error flag
    claims := event->'claims' || jsonb_build_object(
      'auth_version', 'v2',
      'auth_error', true,
      'claims_updated_at', extract(epoch from now())
    );
    
    return jsonb_build_object('claims', claims);
END;
$$;

-- Step 2: Grant necessary permissions for the hook
-- Supabase Auth needs to execute this function
GRANT EXECUTE ON FUNCTION public.custom_access_token_hook TO supabase_auth_admin;
GRANT USAGE ON SCHEMA public TO supabase_auth_admin;

-- Ensure supabase_auth_admin can read from people table
GRANT SELECT ON public.people TO supabase_auth_admin;

-- Step 3: Revoke access from other roles for security
REVOKE EXECUTE ON FUNCTION public.custom_access_token_hook FROM authenticated, anon, public;

-- Step 4: Add function documentation
COMMENT ON FUNCTION public.custom_access_token_hook(jsonb) IS 
'Auth V2: Custom Access Token Hook for adding person claims to JWT. Replaces metadata-based approach. Created 2025-01-07. 
Configured via Supabase Dashboard > Authentication > Hooks > Custom Access Token.';

-- Verification queries (for testing)
-- After configuring the hook, test JWT claims:
-- SELECT auth.jwt() AS current_jwt_claims;

-- Test person lookup:
-- SELECT 
--   u.id as auth_user_id,
--   u.phone,
--   p.id as person_id,
--   p.name,
--   p.hash,
--   p.verified
-- FROM auth.users u
-- LEFT JOIN people p ON p.auth_user_id = u.id
-- WHERE u.phone_confirmed_at IS NOT NULL
-- ORDER BY u.created_at DESC
-- LIMIT 5;
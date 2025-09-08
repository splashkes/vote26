-- Enhanced Custom Access Token Hook for Art Battle Vote26 Authentication System
-- This function integrates with Supabase Auth Hooks to manage JWT claims and person records
-- Version: Enhanced with automatic person creation for international users
-- Date: 2025-01-07 (Enhanced)
-- 
-- Key Features:
-- - Handles both existing users and new user registration automatically
-- - Creates person records for verified phone users (eliminates manual triggers)
-- - Handles international E.164 phone format differences:
--   * auth.users table: E.164 WITHOUT + prefix (e.g., "14163025959")
--   * people table: E.164 WITH + prefix (e.g., "+14163025959")
-- - Returns proper JWT claims for frontend authentication
-- - Eliminates "CRITICAL ERROR: No person data in JWT" for new users
-- - Works seamlessly with international phone numbers from any country

CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    claims jsonb;
    user_id text;
    user_phone text;
    person_data record;
    new_person_id text;
BEGIN
    user_id := event->>'user_id';
    claims := event->'claims';
    
    -- Get the user's phone from auth.users (E.164 without +)
    SELECT phone INTO user_phone FROM auth.users WHERE id = user_id::uuid;
    
    -- Try to find existing person by auth_user_id first
    SELECT id, name, hash, verified, phone INTO person_data 
    FROM public.people 
    WHERE auth_user_id = user_id::uuid;
    
    IF FOUND THEN
        -- Existing person found
        claims := jsonb_set(claims, '{person_id}', to_jsonb(person_data.id::text));
        claims := jsonb_set(claims, '{person_hash}', to_jsonb(person_data.hash));
        claims := jsonb_set(claims, '{person_name}', to_jsonb(person_data.name));
        claims := jsonb_set(claims, '{person_verified}', to_jsonb(person_data.verified));
        claims := jsonb_set(claims, '{auth_version}', '"v2-http"');
        claims := jsonb_set(claims, '{person_pending}', 'false');
    ELSE
        -- No person found, check if we have a phone to create one
        IF user_phone IS NOT NULL AND user_phone != '' THEN
            -- Create new person record (add + to phone for people table)
            INSERT INTO public.people (
                auth_user_id, 
                phone, 
                name, 
                hash, 
                verified,
                created_at,
                updated_at
            ) VALUES (
                user_id::uuid,
                '+' || user_phone,  -- Add + prefix for people table
                'User',             -- Default name
                substring(md5(random()::text) from 1 for 8), -- Generate hash
                true,               -- Phone verified if they got this far
                now(),
                now()
            ) RETURNING id INTO new_person_id;
            
            -- Return new person data in claims
            claims := jsonb_set(claims, '{person_id}', to_jsonb(new_person_id));
            claims := jsonb_set(claims, '{person_hash}', to_jsonb(substring(md5(random()::text) from 1 for 8)));
            claims := jsonb_set(claims, '{person_name}', '"User"');
            claims := jsonb_set(claims, '{person_verified}', 'true');
            claims := jsonb_set(claims, '{auth_version}', '"v2-http"');
            claims := jsonb_set(claims, '{person_pending}', 'false');
        ELSE
            -- No phone available, person still pending
            claims := jsonb_set(claims, '{person_id}', 'null');
            claims := jsonb_set(claims, '{auth_version}', '"v2-http"');
            claims := jsonb_set(claims, '{person_pending}', 'true');
        END IF;
    END IF;
    
    RETURN jsonb_build_object('claims', claims);
END;
$$;

-- Grant access to function to supabase_auth_admin
GRANT EXECUTE ON FUNCTION public.custom_access_token_hook TO supabase_auth_admin;

-- Grant access to schema to supabase_auth_admin  
GRANT USAGE ON SCHEMA public TO supabase_auth_admin;

-- Grant SELECT on auth.users to supabase_auth_admin (needed to read phone)
GRANT SELECT ON auth.users TO supabase_auth_admin;

-- Grant INSERT, SELECT on people table to supabase_auth_admin (needed to create/read person records)
GRANT SELECT, INSERT ON public.people TO supabase_auth_admin;

-- Revoke function permissions from authenticated, anon and public
REVOKE EXECUTE ON FUNCTION public.custom_access_token_hook FROM authenticated, anon, public;

-- Add comprehensive documentation
COMMENT ON FUNCTION public.custom_access_token_hook(jsonb) IS 
'Enhanced Custom Access Token Hook for Art Battle Vote26 Authentication System.
- Automatically creates person records for new authenticated users
- Handles international E.164 phone format differences (auth.users without +, people with +)
- Eliminates "CRITICAL ERROR: No person data in JWT" issues
- Returns proper JWT claims for seamless frontend authentication
- Created: 2025-01-07 (Enhanced version)';

-- Example usage and testing queries:
-- 
-- Test the hook with a sample event:
-- SELECT public.custom_access_token_hook('{"user_id": "123e4567-e89b-12d3-a456-426614174000", "claims": {"aud": "authenticated"}}');
--
-- Check current JWT after authentication:
-- SELECT auth.jwt() AS current_jwt_claims;
--
-- Verify person creation for new users:
-- SELECT 
--   u.id as auth_user_id,
--   u.phone as auth_phone,
--   p.id as person_id,
--   p.phone as person_phone,
--   p.name,
--   p.hash,
--   p.verified,
--   p.created_at
-- FROM auth.users u
-- LEFT JOIN people p ON p.auth_user_id = u.id
-- WHERE u.phone_confirmed_at IS NOT NULL
-- ORDER BY u.created_at DESC
-- LIMIT 10;
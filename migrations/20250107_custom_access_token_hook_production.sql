-- Production Custom Access Token Hook - Enhanced with automatic person creation
-- Date: 2025-01-07
-- Purpose: Automatically create person records for new verified users

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
    
    -- Get user phone from auth.users (E.164 without +)
    SELECT phone INTO user_phone FROM auth.users WHERE id = user_id::uuid;
    
    -- Try to find existing person by auth_user_id
    SELECT id, name, hash, verified, phone INTO person_data 
    FROM public.people 
    WHERE auth_user_id = user_id::uuid;
    
    IF FOUND THEN
        -- Existing person found - inject claims
        claims := jsonb_set(claims, '{person_id}', to_jsonb(person_data.id::text));
        claims := jsonb_set(claims, '{person_hash}', to_jsonb(person_data.hash));
        claims := jsonb_set(claims, '{person_name}', to_jsonb(person_data.name));
        claims := jsonb_set(claims, '{person_verified}', to_jsonb(person_data.verified));
        claims := jsonb_set(claims, '{auth_version}', '"v2-http"');
        claims := jsonb_set(claims, '{person_pending}', 'false');
    ELSE
        -- No person found - create if phone verified
        IF user_phone IS NOT NULL AND user_phone != '' THEN
            -- Create person record (add + prefix for people table)
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
                '+' || user_phone,
                'User',
                substring(md5(random()::text) from 1 for 8),
                true,
                now(),
                now()
            ) RETURNING id INTO new_person_id;
            
            -- Return new person claims
            claims := jsonb_set(claims, '{person_id}', to_jsonb(new_person_id));
            claims := jsonb_set(claims, '{person_hash}', to_jsonb(substring(md5(random()::text) from 1 for 8)));
            claims := jsonb_set(claims, '{person_name}', '"User"');
            claims := jsonb_set(claims, '{person_verified}', 'true');
            claims := jsonb_set(claims, '{auth_version}', '"v2-http"');
            claims := jsonb_set(claims, '{person_pending}', 'false');
        ELSE
            -- No phone - person pending
            claims := jsonb_set(claims, '{person_id}', 'null');
            claims := jsonb_set(claims, '{auth_version}', '"v2-http"');
            claims := jsonb_set(claims, '{person_pending}', 'true');
        END IF;
    END IF;
    
    RETURN jsonb_build_object('claims', claims);
EXCEPTION
    WHEN OTHERS THEN
        -- Fallback - return safe claims
        claims := jsonb_set(claims, '{auth_version}', '"v2-http"');
        claims := jsonb_set(claims, '{person_pending}', 'true');
        claims := jsonb_set(claims, '{hook_error}', to_jsonb(SQLERRM));
        RETURN jsonb_build_object('claims', claims);
END;
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION public.custom_access_token_hook TO supabase_auth_admin;
GRANT USAGE ON SCHEMA public TO supabase_auth_admin;
GRANT SELECT ON auth.users TO supabase_auth_admin;
GRANT SELECT, INSERT ON public.people TO supabase_auth_admin;
REVOKE EXECUTE ON FUNCTION public.custom_access_token_hook FROM authenticated, anon, public;
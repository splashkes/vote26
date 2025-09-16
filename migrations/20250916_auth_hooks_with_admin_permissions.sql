-- Enhanced Custom Access Token Hook with Admin Permissions for Art Battle Vote26
-- This function integrates with Supabase Auth Hooks to manage JWT claims with admin data
-- Version: Enhanced with admin permissions from event_admins table
-- Date: 2025-09-16
--
-- Key Features:
-- - Handles both existing users and new user registration automatically
-- - Creates person records for verified phone users
-- - Includes admin permissions from event_admins table in JWT
-- - Handles international E.164 phone format differences
-- - Returns proper JWT claims for frontend authentication with admin data
-- - Eliminates need for direct database queries in broadcast version

CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    claims jsonb;
    user_id text;
    user_phone text;
    normalized_phone text;
    person_data record;
    new_person_id text;
    admin_events jsonb;
    admin_record record;
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

    -- Add admin permissions to JWT claims
    IF user_phone IS NOT NULL AND user_phone != '' THEN
        -- Normalize phone for admin lookup (event_admins might use different formats)
        normalized_phone := regexp_replace(user_phone, '^\+', '', 'g');

        -- Build admin events object with eid -> admin_level mapping (not UUID)
        admin_events := '{}';

        FOR admin_record IN
            SELECT e.eid, ea.admin_level
            FROM public.event_admins ea
            JOIN public.events e ON e.id = ea.event_id
            WHERE ea.phone = user_phone
               OR ea.phone = normalized_phone
               OR ea.phone = '+' || normalized_phone
        LOOP
            admin_events := jsonb_set(
                admin_events,
                ('{' || admin_record.eid || '}')::text[],
                to_jsonb(admin_record.admin_level)
            );
        END LOOP;

        -- Add admin events to claims
        claims := jsonb_set(claims, '{admin_events}', admin_events);
    ELSE
        -- No phone, no admin permissions
        claims := jsonb_set(claims, '{admin_events}', '{}');
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

-- Grant SELECT on event_admins table to supabase_auth_admin (needed to read admin permissions)
GRANT SELECT ON public.event_admins TO supabase_auth_admin;

-- Revoke function permissions from authenticated, anon and public
REVOKE EXECUTE ON FUNCTION public.custom_access_token_hook FROM authenticated, anon, public;

-- Add comprehensive documentation
COMMENT ON FUNCTION public.custom_access_token_hook(jsonb) IS
'Enhanced Custom Access Token Hook with Admin Permissions for Art Battle Vote26.
- Automatically creates person records for new authenticated users
- Includes admin permissions from event_admins table in JWT claims
- Handles international E.164 phone format differences (auth.users without +, people with +)
- Eliminates "CRITICAL ERROR: No person data in JWT" issues
- Enables broadcast version to check admin permissions without direct database queries
- Returns JWT with admin_events object: {"event_id": "admin_level", ...}
- Created: 2025-09-16 (Enhanced with admin permissions)';

-- Example JWT claims structure after this enhancement:
-- {
--   "aud": "authenticated",
--   "person_id": "473fb8d6-167f-4134-b37c-e5d65829f047",
--   "person_hash": "jup4iv2g",
--   "person_name": "Simon Plashkes",
--   "person_verified": true,
--   "person_pending": false,
--   "auth_version": "v2-http",
--   "admin_events": {
--     "abc123-def456-789": "super",
--     "xyz789-abc123-456": "producer"
--   }
-- }
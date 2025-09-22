-- EMERGENCY FIX: Handle phone format variations in custom_access_token_hook
-- Fixes cases like auth.users="17819011163" vs people.phone="+17819011163"

CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
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

    -- FIX 1: Handle NULL claims to prevent schema error
    IF claims IS NULL THEN
        claims := '{}'::jsonb;
    END IF;

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
            -- EMERGENCY FIX: Check multiple phone format variations
            SELECT id, name, hash, verified INTO person_data
            FROM public.people
            WHERE (
                phone = '+' || user_phone OR                    -- +17819011163 vs 17819011163
                phone = user_phone OR                           -- 17819011163 vs 17819011163
                phone_number = '+' || user_phone OR             -- phone_number field with +
                phone_number = user_phone OR                    -- phone_number field exact
                RIGHT(phone, LENGTH(user_phone)) = user_phone OR  -- +1234567890 vs 234567890
                RIGHT(phone_number, LENGTH(user_phone)) = user_phone  -- suffix match
            )
            AND auth_user_id IS NULL  -- Only link unlinked persons
            LIMIT 1;

            IF FOUND THEN
                -- Phone exists, link existing person to this auth user
                UPDATE public.people
                SET auth_user_id = user_id::uuid,
                    auth_phone = user_phone,
                    updated_at = now()
                WHERE id = person_data.id;

                claims := jsonb_set(claims, '{person_id}', to_jsonb(person_data.id::text));
                claims := jsonb_set(claims, '{person_hash}', to_jsonb(person_data.hash));
                claims := jsonb_set(claims, '{person_name}', to_jsonb(person_data.name));
                claims := jsonb_set(claims, '{person_verified}', to_jsonb(person_data.verified));
                claims := jsonb_set(claims, '{auth_version}', '"v2-http"');
                claims := jsonb_set(claims, '{person_pending}', 'false');
            ELSE
                -- Only create NEW person if phone doesn't exist in any format
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
            END IF;
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
$function$;
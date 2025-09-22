-- Create RPC function to safely transfer Stripe accounts between artist profiles
-- This handles duplicate profiles where Stripe setup was done on wrong profile

CREATE OR REPLACE FUNCTION public.transfer_stripe_account(
    source_profile_id uuid,
    target_profile_id uuid,
    preserve_source_account boolean DEFAULT false,
    dry_run boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    source_stripe_record record;
    target_stripe_record record;
    source_profile record;
    target_profile record;
    result_log jsonb := '{}'::jsonb;
    transfer_log jsonb := '[]'::jsonb;
BEGIN
    -- Get source profile info
    SELECT * INTO source_profile
    FROM artist_profiles
    WHERE id = source_profile_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Source profile not found',
            'source_profile_id', source_profile_id
        );
    END IF;

    -- Get target profile info
    SELECT * INTO target_profile
    FROM artist_profiles
    WHERE id = target_profile_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Target profile not found',
            'target_profile_id', target_profile_id
        );
    END IF;

    -- Get source Stripe account
    SELECT * INTO source_stripe_record
    FROM artist_global_payments
    WHERE artist_profile_id = source_profile_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'No Stripe account found on source profile',
            'source_profile_id', source_profile_id
        );
    END IF;

    -- Check if target already has a Stripe account
    SELECT * INTO target_stripe_record
    FROM artist_global_payments
    WHERE artist_profile_id = target_profile_id;

    -- Log initial state
    result_log := jsonb_set(result_log, '{source_profile}', jsonb_build_object(
        'id', source_profile.id,
        'name', source_profile.name,
        'email', source_profile.email,
        'entry_id', source_profile.entry_id
    ));

    result_log := jsonb_set(result_log, '{target_profile}', jsonb_build_object(
        'id', target_profile.id,
        'name', target_profile.name,
        'email', target_profile.email,
        'entry_id', target_profile.entry_id
    ));

    result_log := jsonb_set(result_log, '{source_stripe_account}', jsonb_build_object(
        'stripe_recipient_id', source_stripe_record.stripe_recipient_id,
        'status', source_stripe_record.status,
        'country', source_stripe_record.country,
        'default_currency', source_stripe_record.default_currency,
        'created_at', source_stripe_record.created_at
    ));

    -- Handle existing target Stripe account
    IF target_stripe_record.id IS NOT NULL THEN
        result_log := jsonb_set(result_log, '{target_existing_stripe}', jsonb_build_object(
            'stripe_recipient_id', target_stripe_record.stripe_recipient_id,
            'status', target_stripe_record.status,
            'action', CASE WHEN preserve_source_account THEN 'will_keep_both' ELSE 'will_replace' END
        ));

        IF NOT preserve_source_account AND NOT dry_run THEN
            -- Delete existing target Stripe account (it will be replaced)
            DELETE FROM artist_global_payments
            WHERE artist_profile_id = target_profile_id;

            transfer_log := transfer_log || jsonb_build_object(
                'action', 'deleted_target_stripe_account',
                'stripe_recipient_id', target_stripe_record.stripe_recipient_id,
                'timestamp', now()
            );
        END IF;
    END IF;

    -- Transfer the Stripe account
    IF NOT dry_run THEN
        IF preserve_source_account THEN
            -- Copy to target, keep source
            INSERT INTO artist_global_payments (
                artist_profile_id,
                stripe_recipient_id,
                legacy_stripe_connect_account_id,
                status,
                country,
                default_currency,
                metadata,
                created_at,
                updated_at
            )
            SELECT
                target_profile_id,
                stripe_recipient_id,
                legacy_stripe_connect_account_id,
                status,
                country,
                default_currency,
                metadata,
                now(), -- new created_at
                now()  -- new updated_at
            FROM artist_global_payments
            WHERE artist_profile_id = source_profile_id;

            transfer_log := transfer_log || jsonb_build_object(
                'action', 'copied_stripe_account',
                'from_profile', source_profile_id,
                'to_profile', target_profile_id,
                'stripe_recipient_id', source_stripe_record.stripe_recipient_id,
                'timestamp', now()
            );
        ELSE
            -- Move to target, remove from source
            UPDATE artist_global_payments
            SET artist_profile_id = target_profile_id,
                updated_at = now()
            WHERE artist_profile_id = source_profile_id;

            transfer_log := transfer_log || jsonb_build_object(
                'action', 'moved_stripe_account',
                'from_profile', source_profile_id,
                'to_profile', target_profile_id,
                'stripe_recipient_id', source_stripe_record.stripe_recipient_id,
                'timestamp', now()
            );
        END IF;

        -- Update target profile primary designation
        UPDATE artist_profiles
        SET set_primary_profile_at = now(),
            updated_at = now()
        WHERE id = target_profile_id;

        transfer_log := transfer_log || jsonb_build_object(
            'action', 'updated_primary_profile',
            'profile_id', target_profile_id,
            'timestamp', now()
        );
    ELSE
        -- Dry run - log what would happen
        transfer_log := transfer_log || jsonb_build_object(
            'action', 'dry_run_would_transfer',
            'from_profile', source_profile_id,
            'to_profile', target_profile_id,
            'stripe_recipient_id', source_stripe_record.stripe_recipient_id,
            'preserve_source', preserve_source_account,
            'would_replace_existing', target_stripe_record.id IS NOT NULL AND NOT preserve_source_account
        );
    END IF;

    -- Final result
    result_log := jsonb_set(result_log, '{transfer_log}', transfer_log);
    result_log := jsonb_set(result_log, '{summary}', jsonb_build_object(
        'dry_run', dry_run,
        'preserve_source_account', preserve_source_account,
        'completed_at', now(),
        'success', true
    ));

    RETURN jsonb_build_object(
        'success', true,
        'result', result_log
    );

EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object(
        'success', false,
        'error', SQLERRM,
        'sqlstate', SQLSTATE,
        'result_log', result_log
    );
END;
$function$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION public.transfer_stripe_account(uuid, uuid, boolean, boolean) TO authenticated;

-- Create helper function to find profiles with duplicate Stripe accounts by email
CREATE OR REPLACE FUNCTION public.find_duplicate_stripe_accounts(
    artist_email text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    result jsonb := '[]'::jsonb;
    profile_record record;
BEGIN
    FOR profile_record IN
        SELECT
            ap.id,
            ap.name,
            ap.email,
            ap.entry_id,
            ap.created_at,
            ap.set_primary_profile_at,
            agp.stripe_recipient_id,
            agp.status as stripe_status,
            agp.created_at as stripe_created_at,
            -- Count related data
            (SELECT COUNT(*) FROM art WHERE artist_id = ap.id) as art_count,
            (SELECT COUNT(*) FROM round_contestants WHERE artist_id = ap.id) as event_count,
            (SELECT COUNT(*) FROM artist_applications WHERE artist_profile_id = ap.id) as application_count
        FROM artist_profiles ap
        LEFT JOIN artist_global_payments agp ON ap.id = agp.artist_profile_id
        WHERE ap.email = artist_email
        ORDER BY ap.created_at
    LOOP
        result := result || jsonb_build_object(
            'profile_id', profile_record.id,
            'name', profile_record.name,
            'entry_id', profile_record.entry_id,
            'created_at', profile_record.created_at,
            'set_primary_profile_at', profile_record.set_primary_profile_at,
            'stripe_recipient_id', profile_record.stripe_recipient_id,
            'stripe_status', profile_record.stripe_status,
            'stripe_created_at', profile_record.stripe_created_at,
            'data_counts', jsonb_build_object(
                'art', profile_record.art_count,
                'events', profile_record.event_count,
                'applications', profile_record.application_count
            )
        );
    END LOOP;

    RETURN result;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.find_duplicate_stripe_accounts(text) TO authenticated;
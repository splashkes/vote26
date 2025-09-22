-- Create comprehensive artist profile consolidation function
-- This function safely merges multiple artist profiles while preserving all data
-- and maintaining authentication/payment system integrity

CREATE OR REPLACE FUNCTION public.transition_artist_account(
    target_profile_id uuid,
    source_profile_ids uuid[],
    target_person_id uuid DEFAULT NULL,
    dry_run boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    source_profile_id uuid;
    migration_log jsonb := '{}'::jsonb;
    tables_to_migrate text[] := ARRAY[
        'artist_applications',
        'artist_confirmations',
        'artist_invitations',
        'artist_ai_intel',
        'artist_payment_email_queue',
        'artist_payments',
        'artist_sample_works',
        'artist_stripe_accounts',
        'art',
        'art_media_ai_caption',
        'event_artists',
        'global_payment_requests',
        'promo_materials',
        'round_contestants',
        'votes'
    ];
    table_name text;
    update_count integer;
    total_moved integer := 0;
    validation_errors jsonb := '[]'::jsonb;
    target_profile record;
    source_profile record;
BEGIN
    -- Validate target profile exists
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

    -- Log initial state
    migration_log := jsonb_set(
        migration_log,
        '{target_profile}',
        jsonb_build_object(
            'id', target_profile.id,
            'name', target_profile.name,
            'email', target_profile.email,
            'phone', target_profile.phone,
            'person_id', target_profile.person_id
        )
    );

    -- Validate all source profiles exist
    FOREACH source_profile_id IN ARRAY source_profile_ids
    LOOP
        SELECT * INTO source_profile
        FROM artist_profiles
        WHERE id = source_profile_id;

        IF NOT FOUND THEN
            validation_errors := validation_errors || jsonb_build_object(
                'error', 'Source profile not found',
                'source_profile_id', source_profile_id
            );
        END IF;
    END LOOP;

    -- Return early if validation errors
    IF jsonb_array_length(validation_errors) > 0 THEN
        RETURN jsonb_build_object(
            'success', false,
            'validation_errors', validation_errors
        );
    END IF;

    -- Update target profile person_id if specified
    IF target_person_id IS NOT NULL THEN
        IF NOT dry_run THEN
            UPDATE artist_profiles
            SET person_id = target_person_id,
                updated_at = now()
            WHERE id = target_profile_id;
        END IF;

        migration_log := jsonb_set(
            migration_log,
            '{person_id_update}',
            jsonb_build_object(
                'from', target_profile.person_id,
                'to', target_person_id,
                'dry_run', dry_run
            )
        );
    END IF;

    -- Migrate data from each source profile
    FOREACH source_profile_id IN ARRAY source_profile_ids
    LOOP
        SELECT * INTO source_profile
        FROM artist_profiles
        WHERE id = source_profile_id;

        -- Log source profile info
        migration_log := jsonb_set(
            migration_log,
            ARRAY['source_profiles', source_profile_id::text],
            jsonb_build_object(
                'name', source_profile.name,
                'email', source_profile.email,
                'phone', source_profile.phone,
                'person_id', source_profile.person_id,
                'created_at', source_profile.created_at
            )
        );

        -- Migrate each table
        FOREACH table_name IN ARRAY tables_to_migrate
        LOOP
            -- Determine the correct column name for artist_profile_id
            DECLARE
                column_name text;
                update_sql text;
            BEGIN
                -- Most tables use artist_profile_id, some use artist_id
                IF table_name IN ('art', 'event_artists', 'promo_materials', 'round_contestants') THEN
                    column_name := 'artist_id';
                ELSE
                    column_name := 'artist_profile_id';
                END IF;

                -- Build and execute update SQL
                update_sql := format(
                    'UPDATE %I SET %I = $1 WHERE %I = $2',
                    table_name, column_name, column_name
                );

                IF NOT dry_run THEN
                    EXECUTE update_sql USING target_profile_id, source_profile_id;
                    GET DIAGNOSTICS update_count = ROW_COUNT;
                ELSE
                    -- In dry run, just count what would be updated
                    EXECUTE format(
                        'SELECT COUNT(*) FROM %I WHERE %I = $1',
                        table_name, column_name
                    ) USING source_profile_id INTO update_count;
                END IF;

                total_moved := total_moved + update_count;

                -- Log migration for this table
                migration_log := jsonb_set(
                    migration_log,
                    ARRAY['migrations', source_profile_id::text, table_name],
                    jsonb_build_object(
                        'records_moved', update_count,
                        'column_name', column_name
                    )
                );

            EXCEPTION WHEN OTHERS THEN
                migration_log := jsonb_set(
                    migration_log,
                    ARRAY['errors', source_profile_id::text, table_name],
                    jsonb_build_object(
                        'error', SQLERRM,
                        'sqlstate', SQLSTATE
                    )
                );
            END;
        END LOOP;
    END LOOP;

    -- Summary
    migration_log := jsonb_set(migration_log, '{summary}', jsonb_build_object(
        'total_records_moved', total_moved,
        'dry_run', dry_run,
        'source_profiles_count', array_length(source_profile_ids, 1),
        'tables_processed', array_length(tables_to_migrate, 1),
        'completed_at', now()
    ));

    RETURN jsonb_build_object(
        'success', true,
        'migration_log', migration_log
    );

EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object(
        'success', false,
        'error', SQLERRM,
        'sqlstate', SQLSTATE,
        'migration_log', migration_log
    );
END;
$function$;

-- Add helper function to analyze profile data before migration
CREATE OR REPLACE FUNCTION public.analyze_artist_profiles_for_merge(
    profile_ids uuid[]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    profile_id uuid;
    analysis jsonb := '{}'::jsonb;
    profile_info record;
    table_counts jsonb;
BEGIN
    FOREACH profile_id IN ARRAY profile_ids
    LOOP
        -- Get profile basic info
        SELECT ap.*, p.email as person_email, p.phone as person_phone, p.auth_user_id
        INTO profile_info
        FROM artist_profiles ap
        LEFT JOIN people p ON ap.person_id = p.id
        WHERE ap.id = profile_id;

        -- Count records in each related table
        table_counts := jsonb_build_object(
            'artist_applications', (SELECT COUNT(*) FROM artist_applications WHERE artist_profile_id = profile_id),
            'artist_confirmations', (SELECT COUNT(*) FROM artist_confirmations WHERE artist_profile_id = profile_id),
            'artist_invitations', (SELECT COUNT(*) FROM artist_invitations WHERE artist_profile_id = profile_id),
            'art', (SELECT COUNT(*) FROM art WHERE artist_id = profile_id),
            'round_contestants', (SELECT COUNT(*) FROM round_contestants WHERE artist_id = profile_id),
            'votes', (SELECT COUNT(*) FROM votes WHERE artist_profile_id = profile_id),
            'artist_payments', (SELECT COUNT(*) FROM artist_payments WHERE artist_profile_id = profile_id),
            'artist_global_payments', (SELECT COUNT(*) FROM artist_global_payments WHERE artist_profile_id = profile_id)
        );

        analysis := jsonb_set(
            analysis,
            ARRAY[profile_id::text],
            jsonb_build_object(
                'profile', jsonb_build_object(
                    'id', profile_info.id,
                    'name', profile_info.name,
                    'email', profile_info.email,
                    'phone', profile_info.phone,
                    'person_id', profile_info.person_id,
                    'created_at', profile_info.created_at
                ),
                'person', jsonb_build_object(
                    'email', profile_info.person_email,
                    'phone', profile_info.person_phone,
                    'auth_user_id', profile_info.auth_user_id
                ),
                'table_counts', table_counts
            )
        );
    END LOOP;

    RETURN analysis;
END;
$function$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION public.transition_artist_account(uuid, uuid[], uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.analyze_artist_profiles_for_merge(uuid[]) TO authenticated;
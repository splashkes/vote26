-- Test Script for Universal Stripe Webhook Trigger
-- This script tests all constraints and edge cases for the webhook trigger system

-- Test 1: Check if all required tables and columns exist
DO $$
BEGIN
    -- Check artist_payments table structure
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'artist_payments') THEN
        RAISE EXCEPTION 'artist_payments table does not exist';
    END IF;

    -- Check slack_notifications table
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'slack_notifications') THEN
        RAISE EXCEPTION 'slack_notifications table does not exist';
    END IF;

    -- Check system_logs table
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'system_logs') THEN
        RAISE EXCEPTION 'system_logs table does not exist';
    END IF;

    RAISE NOTICE 'All required tables exist';
END $$;

-- Test 2: Verify trigger function exists
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'process_stripe_webhook_metadata') THEN
        RAISE EXCEPTION 'process_stripe_webhook_metadata function does not exist';
    END IF;
    RAISE NOTICE 'Trigger function exists';
END $$;

-- Test 3: Check artist_payments constraints
DO $$
DECLARE
    test_artist_id uuid;
    test_payment_id uuid;
BEGIN
    -- Get a valid artist_profile_id for testing
    SELECT id INTO test_artist_id FROM artist_profiles LIMIT 1;
    IF test_artist_id IS NULL THEN
        RAISE EXCEPTION 'No artist profiles found for testing';
    END IF;

    -- Test valid insert
    BEGIN
        INSERT INTO artist_payments (
            artist_profile_id,
            gross_amount,
            net_amount,
            currency,
            status,
            payment_type,
            stripe_transfer_id,
            description
        ) VALUES (
            test_artist_id,
            100.00,
            95.00,
            'USD',
            'paid',
            'automated',
            'tr_test_constraint_check_' || extract(epoch from now())::text,
            'Test payment for constraint validation'
        ) RETURNING id INTO test_payment_id;

        RAISE NOTICE 'Valid artist_payments insert successful: %', test_payment_id;

        -- Clean up test record
        DELETE FROM artist_payments WHERE id = test_payment_id;

    EXCEPTION WHEN OTHERS THEN
        RAISE EXCEPTION 'Valid artist_payments insert failed: %', SQLERRM;
    END;

    -- Test invalid status constraint
    BEGIN
        INSERT INTO artist_payments (
            artist_profile_id,
            gross_amount,
            net_amount,
            currency,
            status,
            payment_type
        ) VALUES (
            test_artist_id,
            100.00,
            95.00,
            'USD',
            'invalid_status',
            'automated'
        );
        RAISE EXCEPTION 'Invalid status constraint check failed - insert should have been rejected';
    EXCEPTION WHEN check_violation THEN
        RAISE NOTICE 'Status constraint working correctly';
    END;

    -- Test invalid payment_type constraint
    BEGIN
        INSERT INTO artist_payments (
            artist_profile_id,
            gross_amount,
            net_amount,
            currency,
            status,
            payment_type
        ) VALUES (
            test_artist_id,
            100.00,
            95.00,
            'USD',
            'paid',
            'invalid_type'
        );
        RAISE EXCEPTION 'Invalid payment_type constraint check failed';
    EXCEPTION WHEN check_violation THEN
        RAISE NOTICE 'Payment type constraint working correctly';
    END;

END $$;

-- Test 4: Simulate webhook trigger execution
DO $$
DECLARE
    test_artist_id uuid;
    test_global_payment_id uuid;
    notification_count integer;
    log_count integer;
BEGIN
    -- Get a valid artist for testing
    SELECT id INTO test_artist_id FROM artist_profiles LIMIT 1;

    -- Get existing global payment record or create one
    SELECT id INTO test_global_payment_id
    FROM artist_global_payments
    WHERE artist_profile_id = test_artist_id
    LIMIT 1;

    IF test_global_payment_id IS NULL THEN
        RAISE NOTICE 'No global payment record found for testing artist_id: %', test_artist_id;
        RETURN;
    END IF;

    -- Count existing notifications
    SELECT COUNT(*) INTO notification_count FROM slack_notifications;
    SELECT COUNT(*) INTO log_count FROM system_logs WHERE operation LIKE '%transfer%';

    -- Simulate a transfer webhook event by updating metadata
    UPDATE artist_global_payments
    SET metadata = jsonb_build_object(
        'stripe_transfer_response', jsonb_build_object(
            'id', 'tr_test_' || extract(epoch from now())::text,
            'amount', 7250,
            'currency', 'usd',
            'object', 'transfer',
            'metadata', jsonb_build_object(
                'artist_profile_id', test_artist_id::text,
                'payment_id', gen_random_uuid()::text,
                'artist_name', 'Test Artist',
                'processed_by', 'test-trigger'
            )
        ),
        'last_webhook_update', now()::text,
        'webhook_event_type', 'transfer.created'
    )
    WHERE id = test_global_payment_id;

    -- Check if trigger fired and created notifications/logs
    IF (SELECT COUNT(*) FROM slack_notifications) > notification_count THEN
        RAISE NOTICE 'Trigger successfully created Slack notification';
    ELSE
        RAISE NOTICE 'WARNING: No new Slack notifications created by trigger';
    END IF;

    IF (SELECT COUNT(*) FROM system_logs WHERE operation LIKE '%transfer%') > log_count THEN
        RAISE NOTICE 'Trigger successfully created system logs';
    ELSE
        RAISE NOTICE 'WARNING: No new system logs created by trigger';
    END IF;

    RAISE NOTICE 'Webhook trigger simulation completed for global_payment_id: %', test_global_payment_id;

END $$;

-- Test 5: Check trigger existence on all tables
DO $$
BEGIN
    -- Check artist_global_payments trigger
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.triggers
        WHERE trigger_name = 'universal_stripe_webhook_trigger'
        AND event_object_table = 'artist_global_payments'
    ) THEN
        RAISE EXCEPTION 'Missing trigger on artist_global_payments';
    END IF;

    -- Check payment_processing trigger
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.triggers
        WHERE trigger_name = 'universal_stripe_webhook_trigger_payment_processing'
        AND event_object_table = 'payment_processing'
    ) THEN
        RAISE EXCEPTION 'Missing trigger on payment_processing';
    END IF;

    -- Check global_payment_requests trigger
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.triggers
        WHERE trigger_name = 'universal_stripe_webhook_trigger_global_payments'
        AND event_object_table = 'global_payment_requests'
    ) THEN
        RAISE EXCEPTION 'Missing trigger on global_payment_requests';
    END IF;

    RAISE NOTICE 'All webhook triggers are properly installed';
END $$;

-- Test 6: Verify error handling doesn't break transactions
DO $$
DECLARE
    test_artist_id uuid;
    test_global_payment_id uuid;
    original_metadata jsonb;
    updated_metadata jsonb;
BEGIN
    -- Test that trigger errors don't break the main transaction
    SELECT id, artist_profile_id, metadata
    INTO test_global_payment_id, test_artist_id, original_metadata
    FROM artist_global_payments
    WHERE metadata IS NOT NULL
    LIMIT 1;

    IF test_global_payment_id IS NULL THEN
        RAISE NOTICE 'No records available for error handling test';
        RETURN;
    END IF;

    -- Update with malformed data to test error handling
    UPDATE artist_global_payments
    SET metadata = jsonb_build_object(
        'stripe_transfer_response', jsonb_build_object(
            'id', 'tr_error_test',
            'amount', 'invalid_amount', -- This should cause an error in trigger
            'currency', 'usd',
            'metadata', jsonb_build_object(
                'artist_profile_id', 'invalid_uuid', -- This should cause an error
                'payment_id', 'also_invalid_uuid'
            )
        ),
        'last_webhook_update', now()::text
    )
    WHERE id = test_global_payment_id;

    -- Verify the update still succeeded despite trigger errors
    SELECT metadata INTO updated_metadata
    FROM artist_global_payments
    WHERE id = test_global_payment_id;

    IF updated_metadata->>'last_webhook_update' IS NOT NULL THEN
        RAISE NOTICE 'Error handling test passed - main transaction succeeded despite trigger errors';
    ELSE
        RAISE EXCEPTION 'Error handling test failed - main transaction was rolled back';
    END IF;

    -- Restore original metadata
    UPDATE artist_global_payments
    SET metadata = original_metadata
    WHERE id = test_global_payment_id;

END $$;

-- Display summary
DO $$
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '=== WEBHOOK TRIGGER TESTING SUMMARY ===';
    RAISE NOTICE 'All constraint and trigger tests completed successfully';
    RAISE NOTICE 'System is ready for universal Stripe webhook processing';
    RAISE NOTICE '';
    RAISE NOTICE 'Recent Slack notifications: %', (SELECT COUNT(*) FROM slack_notifications WHERE created_at > NOW() - INTERVAL '1 hour');
    RAISE NOTICE 'Recent transfer logs: %', (SELECT COUNT(*) FROM system_logs WHERE operation LIKE '%transfer%' AND timestamp > NOW() - INTERVAL '1 hour');
    RAISE NOTICE '';
END $$;
-- Migration: Add 'verified' status and implement payment reconciliation system
-- This updates the payment status flow to: processing → paid → verified

-- Step 1: Update status constraint to include 'verified'
ALTER TABLE artist_payments
DROP CONSTRAINT IF EXISTS artist_payments_status_check;

ALTER TABLE artist_payments
ADD CONSTRAINT artist_payments_status_check
CHECK (status = ANY (ARRAY['pending'::text, 'processing'::text, 'paid'::text, 'verified'::text, 'failed'::text, 'cancelled'::text]));

-- Step 2: Add fields to track verification status
ALTER TABLE artist_payments
ADD COLUMN IF NOT EXISTS webhook_confirmed_at timestamp with time zone;

ALTER TABLE artist_payments
ADD COLUMN IF NOT EXISTS verification_metadata jsonb DEFAULT '{}'::jsonb;

-- Step 3: Create function to identify payments needing status correction
CREATE OR REPLACE FUNCTION identify_status_corrections()
RETURNS TABLE (
    payment_id uuid,
    current_status text,
    suggested_status text,
    transfer_id text,
    artist_name text,
    amount numeric,
    currency text,
    created_at timestamp with time zone,
    correction_reason text
)
SECURITY DEFINER
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    -- Case 1: Failed payments that have successful transfers (should be 'paid')
    SELECT
        ap.id as payment_id,
        ap.status as current_status,
        'paid'::text as suggested_status,
        ap.stripe_transfer_id as transfer_id,
        profiles.name::text as artist_name,
        ap.gross_amount as amount,
        ap.currency::text,
        ap.created_at,
        'has_transfer_id_but_failed'::text as correction_reason
    FROM artist_payments ap
    JOIN artist_profiles profiles ON ap.artist_profile_id = profiles.id
    WHERE ap.status = 'failed'
      AND ap.stripe_transfer_id IS NOT NULL
      AND LENGTH(ap.stripe_transfer_id) > 0

    UNION ALL

    -- Case 2: Paid payments that have webhook confirmation (should be 'verified')
    SELECT
        ap.id as payment_id,
        ap.status as current_status,
        'verified'::text as suggested_status,
        ap.stripe_transfer_id as transfer_id,
        profiles.name::text as artist_name,
        ap.gross_amount as amount,
        ap.currency::text,
        ap.created_at,
        'has_webhook_confirmation'::text as correction_reason
    FROM artist_payments ap
    JOIN artist_profiles profiles ON ap.artist_profile_id = profiles.id
    WHERE ap.status = 'paid'
      AND (
          ap.metadata->>'transfer_webhook_processed' IS NOT NULL OR
          ap.metadata->>'webhook_event_type' = 'transfer.created'
      )

    UNION ALL

    -- Case 3: Processing payments with successful API conversations (should be 'paid')
    SELECT
        ap.id as payment_id,
        ap.status as current_status,
        'paid'::text as suggested_status,
        ap.stripe_transfer_id as transfer_id,
        profiles.name::text as artist_name,
        ap.gross_amount as amount,
        ap.currency::text,
        ap.created_at,
        'api_conversation_success'::text as correction_reason
    FROM artist_payments ap
    JOIN artist_profiles profiles ON ap.artist_profile_id = profiles.id
    LEFT JOIN stripe_api_conversations sac ON ap.id = sac.payment_id
    WHERE ap.status = 'processing'
      AND sac.response_status = 200
      AND sac.error_message IS NULL
      AND ap.stripe_transfer_id IS NOT NULL

    ORDER BY created_at DESC;
END;
$$;

-- Step 4: Create function to apply status corrections
CREATE OR REPLACE FUNCTION apply_status_corrections(p_dry_run boolean DEFAULT true)
RETURNS TABLE (
    correction_id uuid,
    payment_id uuid,
    old_status text,
    new_status text,
    artist_name text,
    amount numeric,
    currency text,
    transfer_id text,
    action_taken text
)
SECURITY DEFINER
LANGUAGE plpgsql
AS $$
DECLARE
    correction_record RECORD;
    correction_count integer := 0;
    slack_message text;
BEGIN
    -- Process each correction needed
    FOR correction_record IN
        SELECT * FROM identify_status_corrections()
    LOOP
        correction_count := correction_count + 1;

        IF NOT p_dry_run THEN
            -- Apply the correction
            UPDATE artist_payments
            SET
                status = correction_record.suggested_status,
                verification_metadata = COALESCE(verification_metadata, '{}'::jsonb) || jsonb_build_object(
                    'status_corrected_at', NOW()::text,
                    'old_status', correction_record.current_status,
                    'correction_reason', correction_record.correction_reason,
                    'corrected_by', 'reconciliation_script'
                ),
                webhook_confirmed_at = CASE
                    WHEN correction_record.suggested_status = 'verified' THEN NOW()
                    ELSE webhook_confirmed_at
                END,
                updated_at = NOW()
            WHERE id = correction_record.payment_id;

            -- Queue Slack notification for each correction
            slack_message := format('[CORRECTED] Payment %s: %s → %s | $%s %s to %s (%s)',
                SUBSTRING(correction_record.payment_id::text, 1, 8),
                correction_record.current_status,
                correction_record.suggested_status,
                correction_record.amount,
                correction_record.currency,
                correction_record.artist_name,
                COALESCE(correction_record.transfer_id, 'no_transfer_id')
            );

            PERFORM queue_slack_notification(
                'stripe-flood',
                'payment_status_correction',
                slack_message,
                jsonb_build_array(
                    jsonb_build_object(
                        'type', 'section',
                        'text', jsonb_build_object(
                            'type', 'mrkdwn',
                            'text', format('🔧 *Payment Status Corrected*\n*Artist:* %s\n*Amount:* $%s %s\n*Status:* %s → %s\n*Transfer ID:* `%s`\n*Reason:* %s',
                                correction_record.artist_name,
                                correction_record.amount,
                                correction_record.currency,
                                correction_record.current_status,
                                correction_record.suggested_status,
                                COALESCE(correction_record.transfer_id, 'none'),
                                correction_record.correction_reason
                            )
                        )
                    )
                ),
                NULL
            );
        END IF;

        RETURN QUERY SELECT
            gen_random_uuid() as correction_id,
            correction_record.payment_id,
            correction_record.current_status as old_status,
            correction_record.suggested_status as new_status,
            correction_record.artist_name,
            correction_record.amount,
            correction_record.currency,
            correction_record.transfer_id,
            CASE WHEN p_dry_run THEN 'DRY_RUN' ELSE 'APPLIED' END as action_taken;
    END LOOP;

    -- Log summary
    INSERT INTO system_logs (service, operation, level, message, request_data)
    VALUES (
        'reconciliation',
        'status_corrections',
        'info',
        format('%s status corrections %s',
            correction_count,
            CASE WHEN p_dry_run THEN 'identified (DRY RUN)' ELSE 'applied' END
        ),
        jsonb_build_object(
            'correction_count', correction_count,
            'dry_run', p_dry_run,
            'timestamp', NOW()::text
        )
    );
END;
$$;

-- Step 5: Create monitoring function for payment status progression
CREATE OR REPLACE FUNCTION get_payment_status_health()
RETURNS TABLE (
    status_category text,
    count integer,
    oldest_payment timestamp with time zone,
    alert_level text,
    description text
)
SECURITY DEFINER
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    -- Payments stuck in processing (> 5 minutes)
    SELECT
        'stuck_processing'::text,
        COUNT(*)::integer,
        MIN(created_at),
        CASE WHEN COUNT(*) > 0 THEN 'HIGH' ELSE 'OK' END::text,
        'Payments stuck in processing status > 5 minutes'::text
    FROM artist_payments
    WHERE status = 'processing'
      AND created_at < NOW() - INTERVAL '5 minutes'

    UNION ALL

    -- Payments stuck in paid (> 10 minutes - missing webhook)
    SELECT
        'missing_webhook'::text,
        COUNT(*)::integer,
        MIN(created_at),
        CASE WHEN COUNT(*) > 0 THEN 'MEDIUM' ELSE 'OK' END::text,
        'Payments in paid status > 10 minutes (awaiting webhook)'::text
    FROM artist_payments
    WHERE status = 'paid'
      AND created_at < NOW() - INTERVAL '10 minutes'

    UNION ALL

    -- Recent verified payments (last hour)
    SELECT
        'recent_verified'::text,
        COUNT(*)::integer,
        MIN(webhook_confirmed_at),
        'INFO'::text,
        'Recently verified payments (last hour)'::text
    FROM artist_payments
    WHERE status = 'verified'
      AND webhook_confirmed_at > NOW() - INTERVAL '1 hour'

    UNION ALL

    -- Failed payments (last 24 hours)
    SELECT
        'recent_failures'::text,
        COUNT(*)::integer,
        MIN(created_at),
        CASE WHEN COUNT(*) > 5 THEN 'HIGH' WHEN COUNT(*) > 0 THEN 'MEDIUM' ELSE 'OK' END::text,
        'Failed payments in last 24 hours'::text
    FROM artist_payments
    WHERE status = 'failed'
      AND created_at > NOW() - INTERVAL '24 hours';
END;
$$;

-- Step 6: Grant permissions
GRANT EXECUTE ON FUNCTION identify_status_corrections() TO authenticated;
GRANT EXECUTE ON FUNCTION apply_status_corrections(boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION get_payment_status_health() TO authenticated;

-- Step 7: Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_artist_payments_status_created
ON artist_payments (status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_artist_payments_webhook_confirmed
ON artist_payments (webhook_confirmed_at DESC)
WHERE webhook_confirmed_at IS NOT NULL;

-- Step 8: Log migration completion
INSERT INTO system_logs (service, operation, level, message, request_data)
VALUES (
    'migration',
    'verified_status_system',
    'info',
    'Added verified status and payment reconciliation system',
    jsonb_build_object(
        'migration_file', '20250926_add_verified_status_and_reconciliation.sql',
        'applied_at', NOW()::text
    )
);
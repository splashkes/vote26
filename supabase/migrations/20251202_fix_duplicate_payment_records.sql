-- Migration: Fix duplicate payment records issue
-- Date: 2025-12-02
-- Issue 1: Webhook trigger creates new rows instead of updating existing ones by stripe_transfer_id
-- Issue 2: Manual payments don't clear failed automated attempts from "in progress"

-- =============================================================================
-- PART 1: Fix the webhook trigger to prevent duplicate payment records
-- =============================================================================

CREATE OR REPLACE FUNCTION process_stripe_webhook_metadata()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
    webhook_event_type text;
    webhook_event_data jsonb;
    slack_message text;
    slack_blocks jsonb;
    transfer_id text;
    transfer_amount numeric;
    transfer_currency text;
    artist_name text;
    artist_id uuid;
    payment_id uuid;
    existing_payment_id uuid;
    event_description text;
BEGIN
    -- Skip if no metadata or no stripe webhook data
    IF NEW.metadata IS NULL OR NEW.metadata->>'last_webhook_update' IS NULL THEN
        RETURN NEW;
    END IF;

    -- Extract webhook event data from metadata
    webhook_event_data := NEW.metadata->'stripe_account_data';

    -- Handle different source tables
    IF TG_TABLE_NAME = 'artist_global_payments' THEN
        -- Account events from artist_global_payments
        webhook_event_type := 'account.updated';

        -- Check if this contains a transfer event in the metadata
        IF NEW.metadata->'stripe_transfer_response' IS NOT NULL THEN
            webhook_event_type := 'transfer.created';
            webhook_event_data := NEW.metadata->'stripe_transfer_response';
        END IF;

    ELSIF TG_TABLE_NAME = 'payment_processing' THEN
        -- Payment events from payment_processing
        webhook_event_type := COALESCE(NEW.metadata->>'webhook_event', 'payment.unknown');

    ELSIF TG_TABLE_NAME = 'global_payment_requests' THEN
        -- Payout events from global_payment_requests
        webhook_event_type := 'payout.' || COALESCE(NEW.status, 'unknown');
        webhook_event_data := NEW.metadata->'stripe_payout_data';
    END IF;

    -- Create Slack notification for ALL events
    BEGIN
        -- Format message based on event type
        CASE
            WHEN webhook_event_type LIKE 'transfer.%' THEN
                transfer_id := webhook_event_data->>'id';
                transfer_amount := (webhook_event_data->>'amount')::numeric / 100.0;
                transfer_currency := UPPER(webhook_event_data->>'currency');
                artist_name := webhook_event_data->'metadata'->>'artist_name';

                slack_message := format('💰 Transfer %s: $%s %s → %s (%s)',
                    COALESCE(transfer_id, 'unknown'),
                    COALESCE(transfer_amount::text, '0'),
                    COALESCE(transfer_currency, 'USD'),
                    COALESCE(artist_name, 'Unknown Artist'),
                    COALESCE(transfer_id, 'unknown')
                );

                -- Create rich Slack blocks for transfers
                slack_blocks := jsonb_build_array(
                    jsonb_build_object(
                        'type', 'header',
                        'text', jsonb_build_object(
                            'type', 'plain_text',
                            'text', '💰 Artist Payment Transfer',
                            'emoji', true
                        )
                    ),
                    jsonb_build_object(
                        'type', 'section',
                        'text', jsonb_build_object(
                            'type', 'mrkdwn',
                            'text', format('*Amount:* $%s %s\n*Artist:* %s\n*Transfer ID:* `%s`\n*Status:* %s',
                                COALESCE(transfer_amount::text, '0'),
                                COALESCE(transfer_currency, 'USD'),
                                COALESCE(artist_name, 'Unknown Artist'),
                                COALESCE(transfer_id, 'unknown'),
                                CASE WHEN webhook_event_type = 'transfer.created' THEN 'Created' ELSE 'Updated' END
                            )
                        )
                    )
                );

            WHEN webhook_event_type = 'account.updated' THEN
                artist_name := (SELECT name FROM artist_profiles WHERE id = NEW.artist_profile_id);

                slack_message := format('✅ Account Updated: %s (%s) - Charges: %s, Payouts: %s',
                    COALESCE(artist_name, 'Unknown Artist'),
                    COALESCE(webhook_event_data->>'id', 'unknown'),
                    COALESCE(webhook_event_data->>'charges_enabled', 'false'),
                    COALESCE(webhook_event_data->>'payouts_enabled', 'false')
                );

            WHEN webhook_event_type LIKE 'checkout.%' THEN
                slack_message := format('💳 Checkout %s: Session %s',
                    REPLACE(webhook_event_type, 'checkout.', ''),
                    COALESCE(webhook_event_data->>'id', 'unknown')
                );

            WHEN webhook_event_type LIKE 'payout.%' THEN
                slack_message := format('📤 Payout %s: %s',
                    REPLACE(webhook_event_type, 'payout.', ''),
                    COALESCE(webhook_event_data->>'id', 'unknown')
                );

            ELSE
                -- Unknown event type
                slack_message := format('❓ Unknown Stripe Event: %s (Table: %s)',
                    webhook_event_type, TG_TABLE_NAME);
        END CASE;

        -- Queue Slack notification using the proper system function
        PERFORM queue_slack_notification(
            'stripe-flood',
            webhook_event_type,
            slack_message,
            COALESCE(slack_blocks, jsonb_build_array()),
            NULL
        );

    EXCEPTION WHEN OTHERS THEN
        -- Log Slack error but don't fail the trigger
        INSERT INTO system_logs (service, operation, level, message, error_details)
        VALUES (
            'webhook_trigger',
            'slack_notification',
            'error',
            format('Failed to queue Slack notification: %s', SQLERRM),
            jsonb_build_object(
                'webhook_event_type', webhook_event_type,
                'table_name', TG_TABLE_NAME,
                'error', SQLERRM
            )
        );
    END;

    -- Handle transfer events - update artist_payments table with verified status progression
    IF webhook_event_type LIKE 'transfer.%' AND webhook_event_data IS NOT NULL THEN
        BEGIN
            -- Extract transfer data
            transfer_id := webhook_event_data->>'id';
            transfer_amount := (webhook_event_data->>'amount')::numeric / 100.0;
            transfer_currency := webhook_event_data->>'currency';
            payment_id := (webhook_event_data->'metadata'->>'payment_id')::uuid;
            artist_id := (webhook_event_data->'metadata'->>'artist_profile_id')::uuid;
            artist_name := webhook_event_data->'metadata'->>'artist_name';

            -- FIRST: Check if payment already exists with this stripe_transfer_id (PREVENTS DUPLICATES!)
            SELECT id INTO existing_payment_id
            FROM artist_payments
            WHERE stripe_transfer_id = transfer_id
            LIMIT 1;

            -- If found by stripe_transfer_id, use that as the payment_id
            IF existing_payment_id IS NOT NULL THEN
                payment_id := existing_payment_id;
            END IF;

            -- Update existing artist_payments record if payment_id is provided or found
            IF payment_id IS NOT NULL THEN
                DECLARE
                    current_status text;
                    next_status text;
                BEGIN
                    SELECT status INTO current_status FROM artist_payments WHERE id = payment_id;

                    -- Enhanced status progression logic that handles failed → verified
                    CASE
                        WHEN current_status = 'processing' AND webhook_event_type = 'transfer.created' THEN
                            next_status := 'paid';
                        WHEN current_status = 'paid' AND webhook_event_type IN ('transfer.created', 'transfer.updated') THEN
                            next_status := 'verified';
                        WHEN current_status = 'failed' AND webhook_event_type = 'transfer.created' THEN
                            next_status := 'verified';
                        WHEN current_status = 'processing' AND webhook_event_type = 'transfer.failed' THEN
                            next_status := 'failed';
                        ELSE
                            next_status := current_status;
                    END CASE;

                    UPDATE artist_payments
                    SET
                        status = next_status,
                        stripe_transfer_id = CASE WHEN stripe_transfer_id IS NULL THEN transfer_id ELSE stripe_transfer_id END,
                        payment_method = CASE WHEN payment_method IS NULL THEN 'stripe_transfer' ELSE payment_method END,
                        paid_at = CASE WHEN next_status IN ('paid', 'verified') AND paid_at IS NULL THEN NOW() ELSE paid_at END,
                        webhook_confirmed_at = CASE WHEN next_status = 'verified' THEN NOW() ELSE webhook_confirmed_at END,
                        updated_at = NOW(),
                        verification_metadata = COALESCE(verification_metadata, '{}'::jsonb) || jsonb_build_object(
                            'transfer_webhook_processed', NOW()::text,
                            'transfer_amount_cents', (webhook_event_data->>'amount')::numeric,
                            'transfer_currency', transfer_currency,
                            'webhook_event_type', webhook_event_type,
                            'previous_status', current_status,
                            'status_progression', current_status || ' → ' || next_status,
                            'matched_by', CASE WHEN existing_payment_id IS NOT NULL THEN 'stripe_transfer_id' ELSE 'payment_id_metadata' END
                        )
                    WHERE id = payment_id;

                    -- Log status progression
                    INSERT INTO system_logs (service, operation, level, message, request_data)
                    VALUES (
                        'webhook_trigger',
                        CASE WHEN current_status = 'failed' AND next_status = 'verified'
                             THEN 'failed_payment_corrected'
                             ELSE 'status_progression' END,
                        'info',
                        format('Payment %s: %s → %s via %s (matched by %s)',
                            payment_id,
                            current_status,
                            next_status,
                            webhook_event_type,
                            CASE WHEN existing_payment_id IS NOT NULL THEN 'stripe_transfer_id' ELSE 'payment_id_metadata' END
                        ),
                        jsonb_build_object(
                            'payment_id', payment_id,
                            'transfer_id', transfer_id,
                            'previous_status', current_status,
                            'new_status', next_status,
                            'webhook_event_type', webhook_event_type,
                            'artist_id', artist_id,
                            'amount', transfer_amount,
                            'currency', transfer_currency,
                            'matched_by', CASE WHEN existing_payment_id IS NOT NULL THEN 'stripe_transfer_id' ELSE 'payment_id_metadata' END
                        )
                    );
                END;
            ELSIF artist_id IS NOT NULL THEN
                -- No payment_id in metadata AND no existing payment found by transfer_id
                -- This is a NEW transfer we haven't seen before - create a record
                INSERT INTO artist_payments (
                    artist_profile_id,
                    gross_amount,
                    net_amount,
                    currency,
                    status,
                    stripe_transfer_id,
                    payment_type,
                    payment_method,
                    description,
                    paid_at,
                    webhook_confirmed_at,
                    verification_metadata,
                    created_by
                ) VALUES (
                    artist_id,
                    transfer_amount,
                    transfer_amount,
                    UPPER(transfer_currency),
                    'verified',
                    transfer_id,
                    'automated',
                    'stripe_transfer',
                    COALESCE(webhook_event_data->>'description', format('Transfer to %s', artist_name)),
                    NOW(),
                    NOW(),
                    jsonb_build_object(
                        'created_via', 'webhook_transfer',
                        'transfer_webhook_data', webhook_event_data,
                        'processed_at', NOW()::text,
                        'status_progression', 'created → verified'
                    ),
                    'webhook_trigger'
                );

                -- Log new payment creation
                INSERT INTO system_logs (service, operation, level, message, request_data)
                VALUES (
                    'webhook_trigger',
                    'transfer_payment_created',
                    'info',
                    format('Created new payment for transfer %s to artist %s (no existing record found)', transfer_id, artist_id),
                    jsonb_build_object(
                        'transfer_id', transfer_id,
                        'artist_id', artist_id,
                        'amount', transfer_amount,
                        'currency', transfer_currency,
                        'reason', 'no_existing_payment_by_transfer_id_or_metadata'
                    )
                );
            END IF;

        EXCEPTION WHEN OTHERS THEN
            -- Log transfer processing error but don't fail the trigger
            INSERT INTO system_logs (service, operation, level, message, error_details)
            VALUES (
                'webhook_trigger',
                'transfer_processing',
                'error',
                format('Failed to process transfer webhook: %s', SQLERRM),
                jsonb_build_object(
                    'transfer_id', transfer_id,
                    'payment_id', payment_id,
                    'artist_id', artist_id,
                    'webhook_data', webhook_event_data,
                    'error_detail', SQLERRM
                )
            );
        END;
    END IF;

    RETURN NEW;
END;
$function$;

-- =============================================================================
-- PART 2: Clean up existing duplicate records
-- Keep the OLDER record (original payment), delete the duplicate verified one
-- =============================================================================

-- First, log what we're going to delete
INSERT INTO system_logs (service, operation, level, message, request_data)
SELECT
    'migration',
    'cleanup_duplicate_payments',
    'info',
    format('Deleting duplicate payment record: %s (keeping: %s)',
           newer.id, older.id),
    jsonb_build_object(
        'deleted_id', newer.id,
        'kept_id', older.id,
        'stripe_transfer_id', newer.stripe_transfer_id,
        'artist_profile_id', newer.artist_profile_id,
        'deleted_status', newer.status,
        'kept_status', older.status
    )
FROM artist_payments newer
JOIN artist_payments older ON newer.stripe_transfer_id = older.stripe_transfer_id
WHERE newer.id != older.id
  AND newer.created_at > older.created_at;

-- Delete the newer duplicate records (keep the original)
DELETE FROM artist_payments
WHERE id IN (
    SELECT newer.id
    FROM artist_payments newer
    JOIN artist_payments older ON newer.stripe_transfer_id = older.stripe_transfer_id
    WHERE newer.id != older.id
      AND newer.created_at > older.created_at
);

-- Update the original records to verified status if they were paid
UPDATE artist_payments ap
SET
    status = 'verified',
    payment_method = COALESCE(ap.payment_method, 'stripe_transfer'),
    webhook_confirmed_at = COALESCE(ap.webhook_confirmed_at, NOW()),
    verification_metadata = COALESCE(ap.verification_metadata, '{}'::jsonb) || jsonb_build_object(
        'status_upgraded_by_migration', NOW()::text,
        'previous_status', ap.status
    )
WHERE ap.status = 'paid'
  AND ap.stripe_transfer_id IS NOT NULL
  AND ap.payment_type = 'automated';

-- =============================================================================
-- PART 3: Add unique constraint to prevent future duplicates
-- =============================================================================

-- Drop if exists first (in case of re-run)
DROP INDEX IF EXISTS idx_artist_payments_unique_transfer;

-- Create partial unique index on stripe_transfer_id (only for non-null values)
CREATE UNIQUE INDEX idx_artist_payments_unique_transfer
ON artist_payments (stripe_transfer_id)
WHERE stripe_transfer_id IS NOT NULL;

-- =============================================================================
-- PART 4: Clean up existing stuck "in progress" items that have manual payments
-- Mark failed automated payments as cancelled if the artist already has a paid manual payment
-- =============================================================================

-- Log what we're cleaning up
INSERT INTO system_logs (service, operation, level, message, request_data)
SELECT
    'migration',
    'cleanup_stuck_in_progress',
    'info',
    format('Marking failed automated payment as cancelled: %s for artist %s (has manual payment)',
           failed_ap.id, failed_ap.artist_profile_id),
    jsonb_build_object(
        'failed_payment_id', failed_ap.id,
        'artist_profile_id', failed_ap.artist_profile_id,
        'failed_amount', failed_ap.gross_amount,
        'failed_status', failed_ap.status,
        'manual_payment_id', manual_ap.id,
        'manual_amount', manual_ap.gross_amount
    )
FROM artist_payments failed_ap
JOIN artist_payments manual_ap ON failed_ap.artist_profile_id = manual_ap.artist_profile_id
WHERE failed_ap.status = 'failed'
  AND failed_ap.payment_type = 'automated'
  AND manual_ap.payment_type = 'manual'
  AND manual_ap.status = 'paid'
  AND manual_ap.created_at > failed_ap.created_at
  AND failed_ap.created_at > NOW() - INTERVAL '30 days';

-- Update failed automated payments to cancelled where artist has a subsequent manual payment
UPDATE artist_payments
SET
    status = 'cancelled',
    metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
        'superseded_by_manual_payment', true,
        'superseded_at', NOW()::text,
        'superseded_by_migration', '20251202_fix_duplicate_payment_records'
    )
WHERE id IN (
    SELECT failed_ap.id
    FROM artist_payments failed_ap
    JOIN artist_payments manual_ap ON failed_ap.artist_profile_id = manual_ap.artist_profile_id
    WHERE failed_ap.status = 'failed'
      AND failed_ap.payment_type = 'automated'
      AND manual_ap.payment_type = 'manual'
      AND manual_ap.status = 'paid'
      AND manual_ap.created_at > failed_ap.created_at
      AND failed_ap.created_at > NOW() - INTERVAL '30 days'
);

-- Log completion
INSERT INTO system_logs (service, operation, level, message, request_data)
VALUES (
    'migration',
    '20251202_fix_duplicate_payment_records',
    'info',
    'Migration completed: Fixed webhook trigger and cleaned up duplicates',
    jsonb_build_object(
        'timestamp', NOW()::text,
        'changes', ARRAY[
            'Updated process_stripe_webhook_metadata to check stripe_transfer_id before insert',
            'Deleted duplicate payment records',
            'Added unique index on stripe_transfer_id',
            'Marked failed automated payments as cancelled where manual payment exists'
        ]
    )
);

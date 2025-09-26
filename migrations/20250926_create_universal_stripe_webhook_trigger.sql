-- Universal Stripe Webhook Processing Trigger
-- This trigger fires whenever webhook events update metadata in key tables
-- It handles Slack notifications and processes transfer events that update artist_payments

-- First, add transfer event handling to the existing webhook handler
-- We need to insert transfer events into artist_global_payments.metadata for trigger processing
-- This will be done by updating the existing webhook handler to capture transfer events

-- Create the universal webhook processing function
CREATE OR REPLACE FUNCTION process_stripe_webhook_metadata()
RETURNS TRIGGER
SECURITY DEFINER
LANGUAGE plpgsql
AS $$
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
                transfer_amount := (webhook_event_data->>'amount')::numeric / 100.0; -- Convert cents to dollars
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
            'stripe-flood',                              -- p_channel_name
            webhook_event_type,                          -- p_message_type
            slack_message,                              -- p_text
            COALESCE(slack_blocks, jsonb_build_array()), -- p_blocks
            NULL                                        -- p_event_id
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
                'error_message', SQLERRM
            )
        );
    END;

    -- Handle transfer events - update artist_payments table
    IF webhook_event_type = 'transfer.created' AND webhook_event_data IS NOT NULL THEN
        BEGIN
            -- Extract transfer data
            transfer_id := webhook_event_data->>'id';
            transfer_amount := (webhook_event_data->>'amount')::numeric / 100.0;
            transfer_currency := webhook_event_data->>'currency';
            payment_id := (webhook_event_data->'metadata'->>'payment_id')::uuid;
            artist_id := (webhook_event_data->'metadata'->>'artist_profile_id')::uuid;
            artist_name := webhook_event_data->'metadata'->>'artist_name';

            -- Update existing artist_payments record if payment_id is provided
            IF payment_id IS NOT NULL THEN
                UPDATE artist_payments
                SET
                    status = 'paid',
                    stripe_transfer_id = transfer_id,
                    paid_at = NOW(),
                    updated_at = NOW(),
                    metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
                        'transfer_webhook_processed', NOW()::text,
                        'transfer_amount_cents', (webhook_event_data->>'amount')::numeric,
                        'transfer_currency', transfer_currency,
                        'webhook_event_type', 'transfer.created'
                    )
                WHERE id = payment_id;

                -- Log successful update
                INSERT INTO system_logs (service, operation, level, message, request_data)
                VALUES (
                    'webhook_trigger',
                    'transfer_payment_updated',
                    'info',
                    format('Updated payment %s with transfer %s', payment_id, transfer_id),
                    jsonb_build_object(
                        'payment_id', payment_id,
                        'transfer_id', transfer_id,
                        'artist_id', artist_id,
                        'amount', transfer_amount,
                        'currency', transfer_currency
                    )
                );

            ELSE
                -- Create new artist_payments record for transfers without existing payment_id
                -- This handles edge cases where transfers are created outside our normal flow
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
                    metadata,
                    created_by
                ) VALUES (
                    artist_id,
                    transfer_amount,
                    transfer_amount, -- Assume no fees for webhook-created transfers
                    UPPER(transfer_currency),
                    'paid',
                    transfer_id,
                    'automated',
                    'stripe_transfer',
                    COALESCE(webhook_event_data->>'description', format('Transfer to %s', artist_name)),
                    NOW(),
                    jsonb_build_object(
                        'created_via', 'webhook_transfer',
                        'transfer_webhook_data', webhook_event_data,
                        'processed_at', NOW()::text
                    ),
                    'webhook_trigger'
                );

                -- Log new payment creation
                INSERT INTO system_logs (service, operation, level, message, request_data)
                VALUES (
                    'webhook_trigger',
                    'transfer_payment_created',
                    'info',
                    format('Created new payment for transfer %s to artist %s', transfer_id, artist_id),
                    jsonb_build_object(
                        'transfer_id', transfer_id,
                        'artist_id', artist_id,
                        'amount', transfer_amount,
                        'currency', transfer_currency,
                        'reason', 'no_existing_payment_id'
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
$$;

-- Create the trigger on artist_global_payments (primary webhook data store)
DROP TRIGGER IF EXISTS universal_stripe_webhook_trigger ON artist_global_payments;
CREATE TRIGGER universal_stripe_webhook_trigger
    AFTER UPDATE ON artist_global_payments
    FOR EACH ROW
    WHEN (NEW.metadata IS DISTINCT FROM OLD.metadata AND NEW.metadata->>'last_webhook_update' IS NOT NULL)
    EXECUTE FUNCTION process_stripe_webhook_metadata();

-- Create triggers on other webhook tables
DROP TRIGGER IF EXISTS universal_stripe_webhook_trigger_payment_processing ON payment_processing;
CREATE TRIGGER universal_stripe_webhook_trigger_payment_processing
    AFTER UPDATE ON payment_processing
    FOR EACH ROW
    WHEN (NEW.metadata IS DISTINCT FROM OLD.metadata AND NEW.metadata->>'webhook_event' IS NOT NULL)
    EXECUTE FUNCTION process_stripe_webhook_metadata();

DROP TRIGGER IF EXISTS universal_stripe_webhook_trigger_global_payments ON global_payment_requests;
CREATE TRIGGER universal_stripe_webhook_trigger_global_payments
    AFTER UPDATE ON global_payment_requests
    FOR EACH ROW
    WHEN (NEW.metadata IS DISTINCT FROM OLD.metadata AND NEW.metadata->>'last_webhook_update' IS NOT NULL)
    EXECUTE FUNCTION process_stripe_webhook_metadata();

-- Create slack_notifications table if it doesn't exist
CREATE TABLE IF NOT EXISTS slack_notifications (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    channel_name text NOT NULL,
    message_type text,
    text text NOT NULL,
    blocks jsonb DEFAULT '[]'::jsonb,
    event_id text,
    status text DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed')),
    attempts integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT NOW(),
    sent_at timestamp with time zone,
    error_message text
);

-- Create index for efficient processing
CREATE INDEX IF NOT EXISTS idx_slack_notifications_status_created ON slack_notifications (status, created_at);

-- Grant necessary permissions
GRANT SELECT, INSERT, UPDATE ON slack_notifications TO authenticated;
GRANT SELECT, INSERT ON system_logs TO authenticated;
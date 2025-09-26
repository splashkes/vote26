-- Fix payments that show as 'failed' but actually have successful transfers
-- These are the payments that succeeded but the webhook status progression didn't account for failed → verified

-- Update webhook trigger logic to handle failed → verified progression
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

            -- Update existing artist_payments record if payment_id is provided
            IF payment_id IS NOT NULL THEN
                DECLARE
                    current_status text;
                    next_status text;
                BEGIN
                    SELECT status INTO current_status FROM artist_payments WHERE id = payment_id;

                    -- Enhanced status progression logic that handles failed → verified
                    CASE
                        WHEN current_status = 'processing' AND webhook_event_type = 'transfer.created' THEN
                            next_status := 'paid';  -- First confirmation: transfer created
                        WHEN current_status = 'paid' AND webhook_event_type IN ('transfer.created', 'transfer.updated') THEN
                            next_status := 'verified';  -- Final confirmation: webhook received
                        WHEN current_status = 'failed' AND webhook_event_type = 'transfer.created' THEN
                            next_status := 'verified';  -- CORRECTION: Failed payments with successful transfers should be verified
                        WHEN current_status = 'processing' AND webhook_event_type = 'transfer.failed' THEN
                            next_status := 'failed';  -- Transfer failed
                        ELSE
                            next_status := current_status;  -- No status change needed
                    END CASE;

                    UPDATE artist_payments
                    SET
                        status = next_status,
                        stripe_transfer_id = CASE WHEN stripe_transfer_id IS NULL THEN transfer_id ELSE stripe_transfer_id END,
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
                            'corrected_from_failed', CASE WHEN current_status = 'failed' THEN true ELSE false END
                        )
                    WHERE id = payment_id;

                    -- Log status progression with special handling for failed corrections
                    INSERT INTO system_logs (service, operation, level, message, request_data)
                    VALUES (
                        'webhook_trigger',
                        CASE WHEN current_status = 'failed' AND next_status = 'verified'
                             THEN 'failed_payment_corrected'
                             ELSE 'status_progression' END,
                        'info',
                        format('Payment %s: %s → %s via %s%s',
                            payment_id,
                            current_status,
                            next_status,
                            webhook_event_type,
                            CASE WHEN current_status = 'failed' AND next_status = 'verified'
                                 THEN ' [CORRECTED]'
                                 ELSE '' END
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
                            'correction_type', CASE WHEN current_status = 'failed' AND next_status = 'verified'
                                                   THEN 'failed_to_verified'
                                                   ELSE 'normal_progression' END
                        )
                    );

                    -- Send special Slack notification for failed payment corrections
                    IF current_status = 'failed' AND next_status = 'verified' THEN
                        PERFORM queue_slack_notification(
                            'stripe-flood',
                            'payment_correction',
                            format('🔧 [CORRECTED] Payment %s: Failed → Verified | $%s %s to %s',
                                SUBSTRING(payment_id::text, 1, 8),
                                transfer_amount,
                                transfer_currency,
                                artist_name
                            ),
                            jsonb_build_array(
                                jsonb_build_object(
                                    'type', 'section',
                                    'text', jsonb_build_object(
                                        'type', 'mrkdwn',
                                        'text', format('🔧 *Payment Status Corrected*\n*Artist:* %s\n*Amount:* $%s %s\n*Status:* Failed → Verified\n*Transfer ID:* `%s`\n*Reason:* Received successful transfer webhook',
                                            artist_name,
                                            transfer_amount,
                                            transfer_currency,
                                            transfer_id
                                        )
                                    )
                                )
                            ),
                            NULL
                        );
                    END IF;
                END;

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
                    webhook_confirmed_at,
                    verification_metadata,
                    created_by
                ) VALUES (
                    artist_id,
                    transfer_amount,
                    transfer_amount, -- Assume no fees for webhook-created transfers
                    UPPER(transfer_currency),
                    'verified',  -- Start as verified since we have webhook confirmation
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
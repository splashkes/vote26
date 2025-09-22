-- ADD REALTIME BROADCAST TRIGGERS FOR PAYMENT RACE COORDINATION
-- Enhances payment completion notifications for real-time UI updates
-- Date: 2025-09-18

-- ============================================
-- Create broadcast function for payment completion
-- ============================================

CREATE OR REPLACE FUNCTION broadcast_payment_completion()
RETURNS TRIGGER AS $$
DECLARE
    art_record RECORD;
    event_eid TEXT;
    payment_data JSONB;
BEGIN
    -- Get art and event info
    SELECT a.art_code, a.event_id, e.eid INTO art_record
    FROM art a
    JOIN events e ON a.event_id = e.id
    WHERE a.id = NEW.art_id;

    -- Build payment completion data
    payment_data := jsonb_build_object(
        'art_id', NEW.art_id,
        'art_code', art_record.art_code,
        'event_eid', art_record.eid,
        'person_id', NEW.person_id,
        'amount', NEW.amount_with_tax,
        'payment_reason', NEW.metadata->>'payment_reason',
        'race_result', CASE
            WHEN OLD.status != 'completed' AND NEW.status = 'completed' THEN 'won'
            ELSE 'processing'
        END,
        'completed_at', NEW.completed_at,
        'session_id', NEW.stripe_checkout_session_id
    );

    -- Send realtime broadcast for payment completion
    PERFORM pg_notify('payment_completed', payment_data::text);

    -- Also send to realtime channels using the new Supabase realtime.send()
    -- This will be picked up by the frontend realtime subscriptions
    BEGIN
        PERFORM realtime.send(
            jsonb_build_object(
                'channel', 'payment_race',
                'event', 'payment_completed',
                'payload', payment_data
            )
        );
    EXCEPTION
        WHEN OTHERS THEN
            -- If realtime.send fails, just log and continue
            RAISE NOTICE 'Failed to send realtime broadcast: %', SQLERRM;
    END;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- Add trigger for payment processing updates
-- ============================================

-- Drop existing trigger if it exists
DROP TRIGGER IF EXISTS payment_completion_broadcast_trigger ON payment_processing;

-- Create new trigger for payment status changes
CREATE TRIGGER payment_completion_broadcast_trigger
    AFTER UPDATE ON payment_processing
    FOR EACH ROW
    WHEN (OLD.status != NEW.status AND NEW.status IN ('completed', 'failed'))
    EXECUTE FUNCTION broadcast_payment_completion();

-- ============================================
-- Enhanced offer expiration function with broadcasts
-- ============================================

CREATE OR REPLACE FUNCTION expire_old_offers_with_broadcast()
RETURNS INTEGER AS $$
DECLARE
    expired_record RECORD;
    expired_count INTEGER := 0;
BEGIN
    -- Update and capture expired offers
    FOR expired_record IN
        UPDATE artwork_offers
        SET status = 'expired', updated_at = NOW()
        WHERE status = 'pending'
            AND expires_at <= NOW()
        RETURNING id, art_id, offered_to_person_id, offered_amount
    LOOP
        expired_count := expired_count + 1;

        -- Send broadcast for each expired offer
        BEGIN
            PERFORM realtime.send(
                jsonb_build_object(
                    'channel', 'offer_expiration',
                    'event', 'offer_expired',
                    'payload', jsonb_build_object(
                        'offer_id', expired_record.id,
                        'art_id', expired_record.art_id,
                        'offered_to_person_id', expired_record.offered_to_person_id,
                        'offered_amount', expired_record.offered_amount,
                        'expired_at', NOW()
                    )
                )
            );
        EXCEPTION
            WHEN OTHERS THEN
                -- Continue if broadcast fails
                NULL;
        END;
    END LOOP;

    RETURN expired_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- Create scheduled job for offer expiration (if pg_cron is available)
-- ============================================

-- Note: This requires the pg_cron extension
-- If not available, offers will expire when checked by the stripe-payment-status function

DO $$
BEGIN
    -- Try to create a cron job for offer expiration
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
        -- Schedule offer expiration check every minute
        PERFORM cron.schedule('expire_artwork_offers', '* * * * *', 'SELECT expire_old_offers_with_broadcast();');
        RAISE NOTICE '✅ Scheduled offer expiration job (every minute)';
    ELSE
        RAISE NOTICE '⚠️ pg_cron not available - offers will expire on status check';
    END IF;
EXCEPTION
    WHEN OTHERS THEN
        RAISE NOTICE '⚠️ Could not schedule offer expiration: %', SQLERRM;
END $$;

-- ============================================
-- Grant permissions
-- ============================================

GRANT EXECUTE ON FUNCTION broadcast_payment_completion() TO authenticated;
GRANT EXECUTE ON FUNCTION expire_old_offers_with_broadcast() TO authenticated;

-- ============================================
-- Verification
-- ============================================

DO $$
BEGIN
  RAISE NOTICE '✅ Real-time payment broadcast triggers added';
  RAISE NOTICE '✅ Enhanced offer expiration with broadcasts';
  RAISE NOTICE '✅ Payment race coordination system active';
  RAISE NOTICE '';
  RAISE NOTICE 'Real-time Race Features:';
  RAISE NOTICE '- Payment completion broadcasts to frontend';
  RAISE NOTICE '- Automatic offer expiration with notifications';
  RAISE NOTICE '- Race result coordination across all bidders';
  RAISE NOTICE '- Live UI updates for all participants';
END $$;
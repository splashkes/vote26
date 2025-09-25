-- Fix remaining broadcast functions to use correct realtime.send() format
-- These functions were using wrong format (single JSONB object) instead of correct format (4 parameters)

-- 1. Fix broadcast_payment_completion() function
CREATE OR REPLACE FUNCTION public.broadcast_payment_completion()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
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

    -- Also send to realtime channels using CORRECT Supabase realtime.send() format
    -- This will be picked up by the frontend realtime subscriptions
    BEGIN
        PERFORM realtime.send(
            payment_data,                        -- payload (JSONB)
            'payment_completed',                 -- event name
            'payment_race',                      -- topic/channel name
            false                               -- public flag
        );
    EXCEPTION
        WHEN OTHERS THEN
            -- If realtime.send fails, just log and continue
            RAISE NOTICE 'Failed to send realtime broadcast: %', SQLERRM;
    END;

    RETURN NEW;
END;
$function$;

-- 2. Fix expire_old_offers_with_broadcast() function
CREATE OR REPLACE FUNCTION public.expire_old_offers_with_broadcast(expiry_hours integer DEFAULT 48)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    expired_record RECORD;
    expired_count INTEGER := 0;
BEGIN
    -- Loop through all expired offers and update them
    FOR expired_record IN
        SELECT * FROM artwork_offers
        WHERE status = 'pending'
        AND created_at < NOW() - INTERVAL '1 hour' * expiry_hours
    LOOP
        -- Update the offer to expired status
        UPDATE artwork_offers
        SET status = 'expired', expired_at = NOW()
        WHERE id = expired_record.id;

        expired_count := expired_count + 1;

        -- Send broadcast for each expired offer
        BEGIN
            PERFORM realtime.send(
                jsonb_build_object(                                  -- payload (JSONB)
                    'offer_id', expired_record.id,
                    'art_id', expired_record.art_id,
                    'offered_to_person_id', expired_record.offered_to_person_id,
                    'offered_amount', expired_record.offered_amount,
                    'expired_at', NOW()
                ),
                'offer_expired',                     -- event name
                'offer_expiration',                  -- topic/channel name
                false                               -- public flag
            );
        EXCEPTION
            WHEN OTHERS THEN
                -- Continue if broadcast fails
                NULL;
        END;
    END LOOP;

    RETURN expired_count;
END;
$function$;
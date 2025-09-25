-- Add Winner Broadcast Notifications for Auction Status Changes
-- Date: 2025-09-25
-- Issue: PaymentButton doesn't show winner modal when auctions end because no auction_status_change broadcast is sent
-- Fix: Add specific winner broadcast when art status changes to 'sold'

-- Create function to send winner notifications
CREATE OR REPLACE FUNCTION send_auction_winner_broadcast()
RETURNS TRIGGER AS $$
DECLARE
    v_event_eid TEXT;
    v_winning_bid RECORD;
    v_notification_payload JSONB;
BEGIN
    -- Only send winner broadcast when status changes to 'sold'
    IF TG_OP = 'UPDATE' AND NEW.status = 'sold' AND OLD.status != 'sold' THEN
        -- Get event EID
        SELECT e.eid INTO v_event_eid
        FROM events e
        WHERE e.id = NEW.event_id;

        -- Get winning bid details
        SELECT
            b.person_id,
            b.amount,
            e.currency,
            p.nickname,
            p.auth_phone,
            p.phone_number
        INTO v_winning_bid
        FROM bids b
        JOIN people p ON b.person_id = p.id
        JOIN art a ON b.art_id = a.id
        JOIN events e ON a.event_id = e.id
        WHERE b.art_id = NEW.id
        ORDER BY b.amount DESC, b.created_at ASC
        LIMIT 1;

        -- Only send if we found a winning bidder
        IF v_winning_bid.person_id IS NOT NULL THEN
            v_notification_payload := jsonb_build_object(
                'type', 'auction_status_change',
                'event_eid', v_event_eid,
                'art_id', NEW.id,
                'art_code', NEW.art_code,
                'old_status', OLD.status,
                'new_status', NEW.status,
                'is_winning_bidder', true,
                'winning_amount', v_winning_bid.amount,
                'currency', v_winning_bid.currency,
                'winner_person_id', v_winning_bid.person_id,
                'winner_nickname', v_winning_bid.nickname,
                'timestamp', EXTRACT(EPOCH FROM NOW())
            );

            -- Send broadcast notification for winner modal popup
            BEGIN
                PERFORM realtime.send(
                    v_notification_payload,                    -- payload (JSONB)
                    'auction_winner',                          -- event name
                    'auction_winner_' || v_event_eid,          -- topic/channel name
                    false                                      -- public flag
                );

                RAISE NOTICE 'Winner broadcast sent for artwork % to person %', NEW.art_code, v_winning_bid.person_id;
            EXCEPTION
                WHEN OTHERS THEN
                    -- Log error but don't fail the trigger
                    RAISE NOTICE 'Winner broadcast failed for artwork %: %', NEW.art_code, SQLERRM;
            END;
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to send winner broadcasts
DROP TRIGGER IF EXISTS art_winner_broadcast_trigger ON art;
CREATE TRIGGER art_winner_broadcast_trigger
    AFTER UPDATE ON art
    FOR EACH ROW
    EXECUTE FUNCTION send_auction_winner_broadcast();

-- Grant permissions
GRANT EXECUTE ON FUNCTION send_auction_winner_broadcast() TO authenticated;
GRANT EXECUTE ON FUNCTION send_auction_winner_broadcast() TO service_role;
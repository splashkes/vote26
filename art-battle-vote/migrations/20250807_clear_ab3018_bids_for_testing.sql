-- Clear all bids for AB3018 event to test the fixed process_bid_secure function
-- This will allow clean testing of the person record linking logic

DO $$
DECLARE
    v_event_id UUID;
    v_bid_count INTEGER;
BEGIN
    -- Get the event ID for AB3018
    SELECT id INTO v_event_id 
    FROM events 
    WHERE eid = 'AB3018';
    
    IF v_event_id IS NULL THEN
        RAISE WARNING 'Event AB3018 not found';
        RETURN;
    END IF;
    
    -- Count existing bids before deletion
    SELECT COUNT(*) INTO v_bid_count
    FROM bids b
    JOIN art a ON b.art_id = a.id
    WHERE a.event_id = v_event_id;
    
    RAISE WARNING 'Found % bids for event AB3018, deleting them...', v_bid_count;
    
    -- Delete all bids for artworks in this event
    DELETE FROM bids 
    WHERE art_id IN (
        SELECT id FROM art WHERE event_id = v_event_id
    );
    
    -- Reset current_bid and bid_count on all artworks in this event
    UPDATE art 
    SET 
        current_bid = 0,
        bid_count = 0,
        status = 'active',  -- Reset to active for testing
        updated_at = NOW()
    WHERE event_id = v_event_id;
    
    RAISE WARNING 'Cleared all bids for event AB3018 and reset artwork status to active';
    
END $$;
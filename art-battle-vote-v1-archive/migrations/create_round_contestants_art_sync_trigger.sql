-- Create trigger function to sync art table with round_contestants changes
-- This ensures vote and auction views stay in sync with admin artist assignments

-- Drop existing function if it exists
DROP FUNCTION IF EXISTS sync_round_contestants_to_art() CASCADE;

-- Create the trigger function
CREATE OR REPLACE FUNCTION sync_round_contestants_to_art()
RETURNS TRIGGER AS $$
DECLARE
    v_event_id UUID;
    v_event_eid TEXT;
    v_round_number INTEGER;
    v_art_code TEXT;
    v_existing_art_id UUID;
BEGIN
    -- Get event_id and round_number from the rounds table
    SELECT r.event_id, r.round_number, e.eid
    INTO v_event_id, v_round_number, v_event_eid
    FROM rounds r
    JOIN events e ON e.id = r.event_id
    WHERE r.id = COALESCE(NEW.round_id, OLD.round_id);

    -- Generate art_code
    v_art_code := v_event_eid || '-' || v_round_number || '-' || COALESCE(NEW.easel_number, OLD.easel_number);

    -- Handle INSERT and UPDATE
    IF TG_OP IN ('INSERT', 'UPDATE') THEN
        -- Only process if we have a valid easel assignment (not null or 0)
        IF NEW.easel_number IS NOT NULL AND NEW.easel_number > 0 AND NEW.artist_id IS NOT NULL THEN
            -- Check if art record already exists
            SELECT id INTO v_existing_art_id
            FROM art
            WHERE art_code = v_art_code;

            IF v_existing_art_id IS NOT NULL THEN
                -- Update existing art record with new artist
                UPDATE art
                SET artist_id = NEW.artist_id,
                    updated_at = NOW()
                WHERE id = v_existing_art_id;
            ELSE
                -- Create new art record
                INSERT INTO art (
                    art_code,
                    artist_id,
                    event_id,
                    round,
                    easel,
                    status,
                    starting_bid,
                    current_bid,
                    vote_count,
                    bid_count
                ) VALUES (
                    v_art_code,
                    NEW.artist_id,
                    v_event_id,
                    v_round_number,
                    NEW.easel_number,
                    'active'::art_status,
                    50, -- Default starting bid
                    50, -- Current bid starts at starting bid
                    0,  -- Vote count starts at 0
                    0   -- Bid count starts at 0
                );
            END IF;
        END IF;
    END IF;

    -- Handle DELETE or UPDATE that removes artist (sets artist_id to NULL)
    IF TG_OP = 'DELETE' OR (TG_OP = 'UPDATE' AND NEW.artist_id IS NULL AND OLD.artist_id IS NOT NULL) THEN
        -- Find the art record
        SELECT id INTO v_existing_art_id
        FROM art
        WHERE art_code = v_art_code;

        IF v_existing_art_id IS NOT NULL THEN
            -- Set artist_id to NULL but preserve the art record and its data
            UPDATE art
            SET artist_id = NULL,
                updated_at = NOW()
            WHERE id = v_existing_art_id;
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger on round_contestants table
DROP TRIGGER IF EXISTS round_contestants_art_sync ON round_contestants;

CREATE TRIGGER round_contestants_art_sync
AFTER INSERT OR UPDATE OR DELETE ON round_contestants
FOR EACH ROW
EXECUTE FUNCTION sync_round_contestants_to_art();

-- Add comment explaining the trigger
COMMENT ON FUNCTION sync_round_contestants_to_art() IS 
'Automatically syncs art table with round_contestants changes to ensure vote and auction views stay in sync with admin artist assignments. Preserves art_code integrity.';

-- Sync existing data
-- First, create art records for all existing round_contestants with valid easel assignments
INSERT INTO art (art_code, artist_id, event_id, round, easel, status, starting_bid, current_bid, vote_count, bid_count)
SELECT DISTINCT
    e.eid || '-' || r.round_number || '-' || rc.easel_number as art_code,
    rc.artist_id,
    r.event_id,
    r.round_number,
    rc.easel_number,
    'active'::art_status,
    50,
    50,
    0,
    0
FROM round_contestants rc
JOIN rounds r ON rc.round_id = r.id
JOIN events e ON r.event_id = e.id
WHERE rc.easel_number IS NOT NULL 
  AND rc.easel_number > 0 
  AND rc.artist_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM art 
    WHERE art_code = e.eid || '-' || r.round_number || '-' || rc.easel_number
  );

-- Update existing art records that have a matching round_contestant
UPDATE art a
SET artist_id = rc.artist_id
FROM round_contestants rc
JOIN rounds r ON rc.round_id = r.id
JOIN events e ON r.event_id = e.id
WHERE a.art_code = e.eid || '-' || r.round_number || '-' || rc.easel_number
  AND rc.easel_number IS NOT NULL 
  AND rc.easel_number > 0 
  AND rc.artist_id IS NOT NULL;

-- Clear artist_id for art records that no longer have a round_contestant
UPDATE art a
SET artist_id = NULL
WHERE NOT EXISTS (
    SELECT 1 
    FROM round_contestants rc
    JOIN rounds r ON rc.round_id = r.id
    JOIN events e ON r.event_id = e.id
    WHERE a.art_code = e.eid || '-' || r.round_number || '-' || rc.easel_number
      AND rc.artist_id IS NOT NULL
      AND rc.easel_number IS NOT NULL
      AND rc.easel_number > 0
);
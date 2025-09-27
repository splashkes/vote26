-- Add configurable artist auction portion to events
-- This allows events to specify what percentage artists receive from auctions
-- 0.0 = charity events (artists get nothing)
-- 0.5 = standard events (artists get 50%)
-- 1.0 = special events (artists get 100%)

-- Add the column with default 50%
ALTER TABLE events
ADD COLUMN artist_auction_portion DECIMAL(3,2) DEFAULT 0.5 NOT NULL;

-- Add constraint to ensure valid percentage (0.00 to 1.00)
ALTER TABLE events
ADD CONSTRAINT events_artist_auction_portion_check
CHECK (artist_auction_portion >= 0.00 AND artist_auction_portion <= 1.00);

-- Add comment for documentation
COMMENT ON COLUMN events.artist_auction_portion IS 'Percentage of auction proceeds that artists receive (0.00-1.00). 0.00=charity, 0.50=standard, 1.00=artist keeps all';

-- Create index for performance on payment queries
CREATE INDEX idx_events_artist_auction_portion ON events(artist_auction_portion);

-- Set specific values for known event types (if any patterns exist)
-- Note: This would need to be customized based on actual event data
-- UPDATE events SET artist_auction_portion = 0.0 WHERE name ILIKE '%charity%';
-- UPDATE events SET artist_auction_portion = 1.0 WHERE name ILIKE '%new zealand%' OR name ILIKE '%nz%';

-- Verify the change
SELECT
    'Events table updated' as status,
    COUNT(*) as total_events,
    COUNT(CASE WHEN artist_auction_portion = 0.0 THEN 1 END) as charity_events,
    COUNT(CASE WHEN artist_auction_portion = 0.5 THEN 1 END) as standard_events,
    COUNT(CASE WHEN artist_auction_portion = 1.0 THEN 1 END) as full_artist_events
FROM events;
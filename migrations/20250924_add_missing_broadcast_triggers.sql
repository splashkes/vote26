-- Add missing cache invalidation triggers for real-time updates

-- 1. Add cache invalidation trigger for artwork_offers table
-- This will fix payment offer notifications not updating in real-time
CREATE OR REPLACE TRIGGER cache_invalidate_artwork_offers_trigger
    AFTER INSERT OR UPDATE OR DELETE ON artwork_offers
    FOR EACH ROW
    EXECUTE FUNCTION broadcast_cache_invalidation();

-- 2. Add cache invalidation trigger for events table
-- This will fix auction closure notifications not updating in real-time
CREATE OR REPLACE TRIGGER cache_invalidate_events_trigger
    AFTER UPDATE ON events
    FOR EACH ROW
    EXECUTE FUNCTION broadcast_cache_invalidation();

-- 3. Ensure art table has INSERT trigger (not just UPDATE)
-- This will fix new easel assignments on admin local data
CREATE OR REPLACE TRIGGER cache_invalidate_art_insert_trigger
    AFTER INSERT ON art
    FOR EACH ROW
    EXECUTE FUNCTION broadcast_cache_invalidation();

-- 4. Add missing votes UPDATE trigger (we only have INSERT)
-- This will fix vote updates not broadcasting in real-time
CREATE OR REPLACE TRIGGER cache_invalidate_votes_update_trigger
    AFTER UPDATE ON votes
    FOR EACH ROW
    EXECUTE FUNCTION broadcast_cache_invalidation();
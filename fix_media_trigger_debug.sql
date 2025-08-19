-- Fix the debug trigger to properly call the original function
-- Restore the original trigger that works correctly

DROP TRIGGER IF EXISTS cache_invalidate_media_trigger ON art_media;
CREATE TRIGGER cache_invalidate_media_trigger
  AFTER INSERT OR UPDATE ON art_media
  FOR EACH ROW EXECUTE FUNCTION broadcast_cache_invalidation();
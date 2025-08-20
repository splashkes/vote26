-- Recreate all the broadcast triggers that were dropped
CREATE TRIGGER cache_invalidate_art_trigger
  AFTER UPDATE ON art
  FOR EACH ROW
  EXECUTE FUNCTION broadcast_cache_invalidation();

CREATE TRIGGER cache_invalidate_votes_trigger
  AFTER INSERT ON votes
  FOR EACH ROW
  EXECUTE FUNCTION broadcast_cache_invalidation();

CREATE TRIGGER cache_invalidate_bids_trigger
  AFTER INSERT ON bids
  FOR EACH ROW
  EXECUTE FUNCTION broadcast_cache_invalidation();

CREATE TRIGGER cache_invalidate_media_trigger
  AFTER INSERT OR UPDATE ON art_media
  FOR EACH ROW
  EXECUTE FUNCTION broadcast_cache_invalidation();
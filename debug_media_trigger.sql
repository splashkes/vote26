-- Debug media trigger by creating a simple logging trigger
-- This will help us see if the trigger fires at all for real uploads

CREATE OR REPLACE FUNCTION debug_media_trigger()
RETURNS TRIGGER AS $$
BEGIN
  -- Just log that we were called
  RAISE NOTICE 'MEDIA TRIGGER FIRED: table=%, operation=%, art_id=%', TG_TABLE_NAME, TG_OP, NEW.art_id;
  
  -- Call the original function
  PERFORM broadcast_cache_invalidation();
  
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Log any errors
  RAISE NOTICE 'MEDIA TRIGGER ERROR: %', SQLERRM;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Replace the trigger to use our debug version
DROP TRIGGER IF EXISTS cache_invalidate_media_trigger ON art_media;
CREATE TRIGGER cache_invalidate_media_trigger
  AFTER INSERT OR UPDATE ON art_media
  FOR EACH ROW EXECUTE FUNCTION debug_media_trigger();
                trigger_name                | event_manipulation |                    action_statement                    
--------------------------------------------+--------------------+--------------------------------------------------------
 cache_invalidate_round_contestants_trigger | INSERT             | EXECUTE FUNCTION broadcast_events_cache_invalidation()
 cache_invalidate_round_contestants_trigger | DELETE             | EXECUTE FUNCTION broadcast_events_cache_invalidation()
 cache_invalidate_round_contestants_trigger | UPDATE             | EXECUTE FUNCTION broadcast_events_cache_invalidation()
 round_contestants_art_sync                 | INSERT             | EXECUTE FUNCTION sync_round_contestants_to_art()
 round_contestants_art_sync                 | DELETE             | EXECUTE FUNCTION sync_round_contestants_to_art()
 round_contestants_art_sync                 | UPDATE             | EXECUTE FUNCTION sync_round_contestants_to_art()
(6 rows)


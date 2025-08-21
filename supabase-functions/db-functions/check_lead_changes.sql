                                               pg_get_functiondef                                               
----------------------------------------------------------------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.check_lead_changes()                                                        +
  RETURNS trigger                                                                                              +
  LANGUAGE plpgsql                                                                                             +
 AS $function$                                                                                                 +
 DECLARE                                                                                                       +
   v_event_settings RECORD;                                                                                    +
   v_current_leader RECORD;                                                                                    +
   v_previous_leader RECORD;                                                                                   +
   v_round INT;                                                                                                +
   v_channel_id VARCHAR;                                                                                       +
 BEGIN                                                                                                         +
   -- Get round from art                                                                                       +
   SELECT round, event_id INTO v_round, NEW.event_id                                                           +
   FROM art WHERE id = NEW.art_id;                                                                             +
                                                                                                               +
   -- Get event settings                                                                                       +
   SELECT * INTO v_event_settings                                                                              +
   FROM event_slack_settings                                                                                   +
   WHERE event_id = NEW.event_id;                                                                              +
                                                                                                               +
   -- Resolve channel                                                                                          +
   v_channel_id := resolve_slack_channel(COALESCE(v_event_settings.channel_name, v_event_settings.channel_id));+
                                                                                                               +
   IF v_event_settings.vote_notifications AND v_channel_id IS NOT NULL THEN                                    +
     -- Get current leader                                                                                     +
     WITH vote_counts AS (                                                                                     +
       SELECT                                                                                                  +
         a.artist_id,                                                                                          +
         ap.name as artist_name,                                                                               +
         COUNT(v.id) as vote_count,                                                                            +
         ROW_NUMBER() OVER (ORDER BY COUNT(v.id) DESC) as rank                                                 +
       FROM art a                                                                                              +
       JOIN artist_profiles ap ON a.artist_id = ap.id                                                          +
       LEFT JOIN votes v ON v.art_id = a.id                                                                    +
       WHERE a.event_id = NEW.event_id                                                                         +
         AND a.round = v_round                                                                                 +
       GROUP BY a.artist_id, ap.name                                                                           +
     )                                                                                                         +
     SELECT artist_id, artist_name, vote_count                                                                 +
     INTO v_current_leader                                                                                     +
     FROM vote_counts                                                                                          +
     WHERE rank = 1;                                                                                           +
                                                                                                               +
     -- Check if there was a previous notification for this round                                              +
     SELECT payload->>'new_leader' as artist_name,                                                             +
            (payload->>'new_leader_votes')::int as vote_count                                                  +
     INTO v_previous_leader                                                                                    +
     FROM slack_notifications                                                                                  +
     WHERE event_id = NEW.event_id                                                                             +
       AND message_type = 'lead_change'                                                                        +
       AND (payload->>'round')::int = v_round                                                                  +
     ORDER BY created_at DESC                                                                                  +
     LIMIT 1;                                                                                                  +
                                                                                                               +
     -- If no previous leader, check if this is first significant lead                                         +
     IF v_previous_leader.artist_name IS NULL AND v_current_leader.vote_count >= 10 THEN                       +
       INSERT INTO slack_notifications (                                                                       +
         event_id,                                                                                             +
         channel_id,                                                                                           +
         message_type,                                                                                         +
         payload                                                                                               +
       ) VALUES (                                                                                              +
         NEW.event_id,                                                                                         +
         v_channel_id,                                                                                         +
         'lead_change',                                                                                        +
         jsonb_build_object(                                                                                   +
           'round', v_round,                                                                                   +
           'new_leader', v_current_leader.artist_name,                                                         +
           'new_leader_votes', v_current_leader.vote_count,                                                    +
           'previous_leader', 'No previous leader',                                                            +
           'previous_leader_votes', 0,                                                                         +
           'vote_difference', v_current_leader.vote_count                                                      +
         )                                                                                                     +
       );                                                                                                      +
     -- If leader changed                                                                                      +
     ELSIF v_previous_leader.artist_name IS NOT NULL                                                           +
       AND v_previous_leader.artist_name != v_current_leader.artist_name                                       +
       AND v_current_leader.vote_count > v_previous_leader.vote_count THEN                                     +
                                                                                                               +
       INSERT INTO slack_notifications (                                                                       +
         event_id,                                                                                             +
         channel_id,                                                                                           +
         message_type,                                                                                         +
         payload                                                                                               +
       ) VALUES (                                                                                              +
         NEW.event_id,                                                                                         +
         v_channel_id,                                                                                         +
         'lead_change',                                                                                        +
         jsonb_build_object(                                                                                   +
           'round', v_round,                                                                                   +
           'new_leader', v_current_leader.artist_name,                                                         +
           'new_leader_votes', v_current_leader.vote_count,                                                    +
           'previous_leader', v_previous_leader.artist_name,                                                   +
           'previous_leader_votes', v_previous_leader.vote_count,                                              +
           'vote_difference', v_current_leader.vote_count - v_previous_leader.vote_count                       +
         )                                                                                                     +
       );                                                                                                      +
     END IF;                                                                                                   +
   END IF;                                                                                                     +
                                                                                                               +
   RETURN NEW;                                                                                                 +
 END;                                                                                                          +
 $function$                                                                                                    +
 
(1 row)


-- Bridge pg_notify to Supabase broadcast events
-- This allows database triggers to send notifications that Supabase clients can receive

-- Create a function to send Supabase broadcast events
CREATE OR REPLACE FUNCTION send_supabase_broadcast(
  p_channel VARCHAR,
  p_event VARCHAR,
  p_payload JSONB
)
RETURNS VOID AS $$
BEGIN
  -- Send a broadcast event that Supabase clients can receive
  -- This uses the supabase broadcast system instead of pg_notify
  PERFORM extensions.supabase_broadcast(p_channel, p_event, p_payload);
EXCEPTION
  WHEN OTHERS THEN
    -- Fallback to pg_notify if supabase_broadcast doesn't exist
    PERFORM pg_notify(p_channel, p_payload::text);
END;
$$ LANGUAGE plpgsql;
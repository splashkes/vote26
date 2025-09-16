-- Add RLS policy to allow anonymous access to events for timer display
-- Restricted to events within 36 hours (past or future) of current time for security

-- Add policy for timer data access with time restriction
CREATE POLICY "timer_data_anonymous_access" ON events
  FOR SELECT
  TO anon
  USING (
    enabled = true
    AND show_in_app = true
    AND event_start_datetime IS NOT NULL
    AND event_start_datetime > (now() - interval '36 hours')
    AND event_start_datetime < (now() + interval '36 hours')
  );
-- Create audit log table for tracking when artists view competition specifics
CREATE TABLE IF NOT EXISTS competition_specifics_view_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  artist_profile_id uuid REFERENCES artist_profiles(id) ON DELETE CASCADE,
  event_id uuid REFERENCES events(id) ON DELETE CASCADE,
  viewed_at timestamp with time zone DEFAULT now() NOT NULL,

  -- What they viewed
  specifics_viewed jsonb NOT NULL, -- Array of competition_specifics viewed
  specifics_count int NOT NULL DEFAULT 0,

  -- Metadata
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  user_email text,
  event_eid text,
  event_name text,

  -- Session tracking
  ip_address text,
  user_agent text,

  -- Indexes
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

-- Create indexes for common queries
CREATE INDEX IF NOT EXISTS idx_comp_spec_view_log_artist ON competition_specifics_view_log(artist_profile_id);
CREATE INDEX IF NOT EXISTS idx_comp_spec_view_log_event ON competition_specifics_view_log(event_id);
CREATE INDEX IF NOT EXISTS idx_comp_spec_view_log_viewed_at ON competition_specifics_view_log(viewed_at DESC);
CREATE INDEX IF NOT EXISTS idx_comp_spec_view_log_user ON competition_specifics_view_log(user_id);

-- Enable RLS
ALTER TABLE competition_specifics_view_log ENABLE ROW LEVEL SECURITY;

-- Policy: Service role can do everything
CREATE POLICY "Service role full access to view log"
  ON competition_specifics_view_log
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Policy: Artists can read their own view logs
CREATE POLICY "Artists can read own view logs"
  ON competition_specifics_view_log
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Policy: Admins can read all view logs
CREATE POLICY "Admins can read all view logs"
  ON competition_specifics_view_log
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM abhq_admin_users
      WHERE user_id = auth.uid()
      AND active = true
    )
  );

COMMENT ON TABLE competition_specifics_view_log IS 'Audit log tracking when artists view competition specifics for events';
COMMENT ON COLUMN competition_specifics_view_log.specifics_viewed IS 'JSON array of the competition specifics that were viewed';
COMMENT ON COLUMN competition_specifics_view_log.specifics_count IS 'Count of how many specifics were shown to the artist';

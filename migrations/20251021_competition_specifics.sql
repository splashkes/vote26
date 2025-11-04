-- Competition Specifics System
-- Allows reusable competition information blocks that can be attached to events
-- Updated: 2025-10-21

-- Create competition_specifics table
CREATE TABLE IF NOT EXISTS competition_specifics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  content TEXT NOT NULL, -- Markdown formatted
  visibility TEXT NOT NULL CHECK (visibility IN ('public', 'artists_only')) DEFAULT 'public',
  version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES people(id) ON DELETE SET NULL,
  is_deleted BOOLEAN NOT NULL DEFAULT FALSE
);

-- Create index on name for faster lookups
CREATE INDEX IF NOT EXISTS idx_competition_specifics_name ON competition_specifics(name);
CREATE INDEX IF NOT EXISTS idx_competition_specifics_deleted ON competition_specifics(is_deleted);

-- Create competition_specifics_history table for versioning
CREATE TABLE IF NOT EXISTS competition_specifics_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  competition_specific_id UUID NOT NULL REFERENCES competition_specifics(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  content TEXT NOT NULL,
  visibility TEXT NOT NULL,
  version INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES people(id) ON DELETE SET NULL
);

-- Create index for faster history lookups
CREATE INDEX IF NOT EXISTS idx_competition_specifics_history_specific_id
  ON competition_specifics_history(competition_specific_id);

-- Create event_competition_specifics junction table
CREATE TABLE IF NOT EXISTS event_competition_specifics (
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  competition_specific_id UUID NOT NULL REFERENCES competition_specifics(id) ON DELETE CASCADE,
  display_order INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES people(id) ON DELETE SET NULL,
  PRIMARY KEY (event_id, competition_specific_id)
);

-- Create index for faster event lookups
CREATE INDEX IF NOT EXISTS idx_event_competition_specifics_event_id
  ON event_competition_specifics(event_id);

-- Create trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_competition_specifics_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER competition_specifics_updated_at
  BEFORE UPDATE ON competition_specifics
  FOR EACH ROW
  EXECUTE FUNCTION update_competition_specifics_updated_at();

-- Create trigger to save history on update
CREATE OR REPLACE FUNCTION save_competition_specifics_history()
RETURNS TRIGGER AS $$
BEGIN
  -- Only save history if content, name, or visibility changed
  IF OLD.content IS DISTINCT FROM NEW.content
     OR OLD.name IS DISTINCT FROM NEW.name
     OR OLD.visibility IS DISTINCT FROM NEW.visibility THEN

    -- Insert old version into history
    INSERT INTO competition_specifics_history (
      competition_specific_id,
      name,
      content,
      visibility,
      version,
      created_at,
      created_by
    ) VALUES (
      OLD.id,
      OLD.name,
      OLD.content,
      OLD.visibility,
      OLD.version,
      OLD.updated_at,
      OLD.created_by
    );

    -- Increment version
    NEW.version = OLD.version + 1;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER competition_specifics_history_trigger
  BEFORE UPDATE ON competition_specifics
  FOR EACH ROW
  EXECUTE FUNCTION save_competition_specifics_history();

-- Grant permissions (adjust based on your RLS policies)
GRANT SELECT ON competition_specifics TO anon, authenticated;
GRANT SELECT ON competition_specifics_history TO authenticated;
GRANT SELECT ON event_competition_specifics TO anon, authenticated;
GRANT ALL ON competition_specifics TO service_role;
GRANT ALL ON competition_specifics_history TO service_role;
GRANT ALL ON event_competition_specifics TO service_role;

-- Enable RLS
ALTER TABLE competition_specifics ENABLE ROW LEVEL SECURITY;
ALTER TABLE competition_specifics_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_competition_specifics ENABLE ROW LEVEL SECURITY;

-- RLS Policies

-- Public can read public competition specifics
CREATE POLICY "Public can view public competition specifics"
  ON competition_specifics
  FOR SELECT
  TO anon, authenticated
  USING (visibility = 'public' AND is_deleted = FALSE);

-- Artists can read all specifics for their confirmed events
CREATE POLICY "Artists can view competition specifics for their events"
  ON competition_specifics
  FOR SELECT
  TO authenticated
  USING (
    is_deleted = FALSE
    AND (
      visibility = 'public'
      OR EXISTS (
        SELECT 1 FROM event_competition_specifics ecs
        INNER JOIN artist_confirmations ac ON ac.event_eid = (
          SELECT eid FROM events WHERE id = ecs.event_id
        )
        WHERE ecs.competition_specific_id = competition_specifics.id
        AND ac.artist_profile_id IN (
          SELECT id FROM artist_profiles WHERE person_id = auth.uid()
        )
        AND ac.confirmation_status = 'confirmed'
      )
    )
  );

-- Producers can do everything with competition specifics
CREATE POLICY "Producers can manage competition specifics"
  ON competition_specifics
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM people
      WHERE id = auth.uid()
      AND type IN ('producer', 'admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM people
      WHERE id = auth.uid()
      AND type IN ('producer', 'admin')
    )
  );

-- Public can read event_competition_specifics for public events
CREATE POLICY "Public can view event competition specifics"
  ON event_competition_specifics
  FOR SELECT
  TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1 FROM competition_specifics cs
      WHERE cs.id = competition_specific_id
      AND cs.is_deleted = FALSE
    )
  );

-- Producers can manage event_competition_specifics
CREATE POLICY "Producers can manage event competition specifics"
  ON event_competition_specifics
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM people
      WHERE id = auth.uid()
      AND type IN ('producer', 'admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM people
      WHERE id = auth.uid()
      AND type IN ('producer', 'admin')
    )
  );

-- Authenticated users can view history for specifics they have access to
CREATE POLICY "Users can view competition specifics history"
  ON competition_specifics_history
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM competition_specifics cs
      WHERE cs.id = competition_specific_id
      AND (
        cs.visibility = 'public'
        OR EXISTS (
          SELECT 1 FROM people
          WHERE id = auth.uid()
          AND type IN ('producer', 'admin')
        )
      )
    )
  );

-- Producers can manage history
CREATE POLICY "Producers can manage competition specifics history"
  ON competition_specifics_history
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM people
      WHERE id = auth.uid()
      AND type IN ('producer', 'admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM people
      WHERE id = auth.uid()
      AND type IN ('producer', 'admin')
    )
  );

COMMENT ON TABLE competition_specifics IS 'Reusable competition information blocks (rules, timing, venue instructions, etc.)';
COMMENT ON TABLE competition_specifics_history IS 'Historical versions of competition specifics for audit trail';
COMMENT ON TABLE event_competition_specifics IS 'Junction table linking events to competition specifics with display ordering';

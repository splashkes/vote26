-- Add city_id support to linter_suppressions table
-- Date: 2025-10-09
-- Purpose: Support suppressing city-level linter findings

-- Add city_id column
ALTER TABLE linter_suppressions
  ADD COLUMN IF NOT EXISTS city_id uuid;

-- Drop old constraint
ALTER TABLE linter_suppressions
  DROP CONSTRAINT IF EXISTS event_or_artist_required;

-- Add new constraint that requires at least one of event_id, artist_id, or city_id
ALTER TABLE linter_suppressions
  ADD CONSTRAINT event_artist_or_city_required
  CHECK (event_id IS NOT NULL OR artist_id IS NOT NULL OR city_id IS NOT NULL);

-- Drop old unique constraint
ALTER TABLE linter_suppressions
  DROP CONSTRAINT IF EXISTS unique_suppression;

-- Add new unique constraint including city_id
CREATE UNIQUE INDEX IF NOT EXISTS unique_suppression_v2
  ON linter_suppressions (rule_id, event_id, artist_id, city_id)
  NULLS NOT DISTINCT;

-- Drop old index
DROP INDEX IF EXISTS idx_linter_suppressions_lookup;

-- Add new lookup index including city_id
CREATE INDEX IF NOT EXISTS idx_linter_suppressions_lookup_v2
  ON linter_suppressions (rule_id, event_id, artist_id, city_id);

-- Add foreign key for city_id
ALTER TABLE linter_suppressions
  ADD CONSTRAINT linter_suppressions_city_id_fkey
  FOREIGN KEY (city_id) REFERENCES cities(id);

-- Verify
-- SELECT * FROM linter_suppressions LIMIT 1;

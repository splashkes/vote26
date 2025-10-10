-- Add advances_to fields to events table
-- This links an event to a subsequent event that winners advance to

-- Add the UUID reference field
ALTER TABLE events
ADD COLUMN IF NOT EXISTS advances_to_event_id uuid REFERENCES events(id);

-- Add the EID text field for easier manual entry
ALTER TABLE events
ADD COLUMN IF NOT EXISTS advances_to_event_eid varchar(50);

-- Add constraint to ensure advances_to_event_eid exists in events.eid
ALTER TABLE events
ADD CONSTRAINT fk_advances_to_event_eid 
FOREIGN KEY (advances_to_event_eid) 
REFERENCES events(eid)
ON UPDATE CASCADE
ON DELETE SET NULL;

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_events_advances_to_id ON events(advances_to_event_id);
CREATE INDEX IF NOT EXISTS idx_events_advances_to_eid ON events(advances_to_event_eid);

-- Add comments
COMMENT ON COLUMN events.advances_to_event_id IS 'The event ID that winners from this event advance to (e.g., regional winner advances to national championship)';
COMMENT ON COLUMN events.advances_to_event_eid IS 'The event EID that winners advance to (must exist in events.eid)';

-- Add trigger to keep both fields in sync
CREATE OR REPLACE FUNCTION sync_advances_to_fields()
RETURNS TRIGGER AS $$
BEGIN
  -- If EID is set, update ID from it
  IF NEW.advances_to_event_eid IS NOT NULL AND (NEW.advances_to_event_id IS NULL OR OLD.advances_to_event_eid IS DISTINCT FROM NEW.advances_to_event_eid) THEN
    SELECT id INTO NEW.advances_to_event_id 
    FROM events 
    WHERE eid = NEW.advances_to_event_eid;
  END IF;
  
  -- If ID is set, update EID from it
  IF NEW.advances_to_event_id IS NOT NULL AND (NEW.advances_to_event_eid IS NULL OR OLD.advances_to_event_id IS DISTINCT FROM NEW.advances_to_event_id) THEN
    SELECT eid INTO NEW.advances_to_event_eid 
    FROM events 
    WHERE id = NEW.advances_to_event_id;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_sync_advances_to ON events;
CREATE TRIGGER trigger_sync_advances_to
  BEFORE INSERT OR UPDATE OF advances_to_event_id, advances_to_event_eid
  ON events
  FOR EACH ROW
  EXECUTE FUNCTION sync_advances_to_fields();

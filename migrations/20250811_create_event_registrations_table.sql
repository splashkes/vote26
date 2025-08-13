-- Create unified event_registrations table for historical and QR registrations
-- This preserves historical MongoDB registration relationships and integrates with QR system

CREATE TABLE IF NOT EXISTS event_registrations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    person_id UUID NOT NULL REFERENCES people(id) ON DELETE CASCADE,
    
    -- Registration type and source tracking
    registration_type VARCHAR(20) NOT NULL, -- 'historical', 'qr_scan', 'manual', 'admin', etc.
    registration_source VARCHAR(50) NOT NULL, -- 'mongodb_migration', 'qr_system', 'admin_panel', etc.
    
    -- Timestamps
    registered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Historical data fields (for MongoDB migration)
    registration_mongo_id VARCHAR(24), -- Original MongoDB registration._id
    
    -- QR scan specific fields (nullable for non-QR registrations)
    qr_code TEXT,
    qr_scan_id UUID REFERENCES people_qr_scans(id), -- Link back to QR scan record
    
    -- Additional metadata
    metadata JSONB, -- Flexible field for additional registration data
    
    -- Prevent duplicate registrations per event
    UNIQUE(event_id, person_id)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_event_registrations_event ON event_registrations(event_id);
CREATE INDEX IF NOT EXISTS idx_event_registrations_person ON event_registrations(person_id);
CREATE INDEX IF NOT EXISTS idx_event_registrations_type ON event_registrations(registration_type);
CREATE INDEX IF NOT EXISTS idx_event_registrations_source ON event_registrations(registration_source);
CREATE INDEX IF NOT EXISTS idx_event_registrations_mongo_id ON event_registrations(registration_mongo_id);
CREATE INDEX IF NOT EXISTS idx_event_registrations_registered_at ON event_registrations(registered_at);

-- RLS Policies
ALTER TABLE event_registrations ENABLE ROW LEVEL SECURITY;

-- Users can view registrations for events they're admins of, or their own registrations
CREATE POLICY event_registrations_select_policy ON event_registrations
FOR SELECT USING (
    -- Users can see their own registrations
    person_id IN (
        SELECT id FROM people WHERE auth_user_id = auth.uid()
    )
    OR
    -- Event admins can see all registrations for their events
    event_id IN (
        SELECT event_id FROM event_admins WHERE person_id IN (
            SELECT id FROM people WHERE auth_user_id = auth.uid()
        )
    )
);

-- Only authenticated users can insert registrations for themselves
CREATE POLICY event_registrations_insert_policy ON event_registrations
FOR INSERT WITH CHECK (
    auth.uid() IS NOT NULL
    AND person_id IN (
        SELECT id FROM people WHERE auth_user_id = auth.uid()
    )
);

-- Event admins can update registrations for their events
CREATE POLICY event_registrations_update_policy ON event_registrations
FOR UPDATE USING (
    event_id IN (
        SELECT event_id FROM event_admins WHERE person_id IN (
            SELECT id FROM people WHERE auth_user_id = auth.uid()
        )
    )
);

-- Event admins can delete registrations for their events
CREATE POLICY event_registrations_delete_policy ON event_registrations
FOR DELETE USING (
    event_id IN (
        SELECT event_id FROM event_admins WHERE person_id IN (
            SELECT id FROM people WHERE auth_user_id = auth.uid()
        )
    )
);

-- Helper function to get registration count for an event
CREATE OR REPLACE FUNCTION get_event_registration_count(p_event_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN (
        SELECT COUNT(*)::INTEGER
        FROM event_registrations
        WHERE event_id = p_event_id
    );
END;
$$;

-- Helper function to check if a person is registered for an event
CREATE OR REPLACE FUNCTION is_person_registered_for_event(p_person_id UUID, p_event_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1
        FROM event_registrations
        WHERE person_id = p_person_id
          AND event_id = p_event_id
    );
END;
$$;

-- Helper function to get registration details for a person and event
CREATE OR REPLACE FUNCTION get_person_event_registration(p_person_id UUID, p_event_id UUID)
RETURNS TABLE(
    registration_id UUID,
    registration_type VARCHAR(20),
    registration_source VARCHAR(50),
    registered_at TIMESTAMPTZ,
    qr_code TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        er.id,
        er.registration_type,
        er.registration_source,
        er.registered_at,
        er.qr_code
    FROM event_registrations er
    WHERE er.person_id = p_person_id
      AND er.event_id = p_event_id;
END;
$$;

-- Update trigger to maintain updated_at timestamp
CREATE OR REPLACE FUNCTION update_event_registrations_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

CREATE TRIGGER update_event_registrations_updated_at_trigger
    BEFORE UPDATE ON event_registrations
    FOR EACH ROW
    EXECUTE FUNCTION update_event_registrations_updated_at();

-- Comment on table
COMMENT ON TABLE event_registrations IS 'Unified table for all event registrations including historical MongoDB data and QR scan registrations';
COMMENT ON COLUMN event_registrations.registration_type IS 'Type: historical, qr_scan, manual, admin, etc.';
COMMENT ON COLUMN event_registrations.registration_source IS 'Source: mongodb_migration, qr_system, admin_panel, etc.';
COMMENT ON COLUMN event_registrations.registration_mongo_id IS 'Original MongoDB registration._id for historical data';
COMMENT ON COLUMN event_registrations.qr_scan_id IS 'Links to people_qr_scans record for QR-based registrations';
COMMENT ON COLUMN event_registrations.metadata IS 'Additional registration data in JSON format';
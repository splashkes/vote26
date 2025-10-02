-- Migration: Artist Note Dismissals Tracking
-- Purpose: Track when artists dismiss informational notes/announcements
-- Date: 2025-10-02

-- Create artist_note_dismissals table
CREATE TABLE IF NOT EXISTS artist_note_dismissals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    person_id UUID NOT NULL REFERENCES people(id) ON DELETE CASCADE,
    note_id VARCHAR(100) NOT NULL, -- Identifier for the note (e.g., 'payment-alternative-info-2025-10')
    dismissed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    -- Ensure a person can only dismiss a note once
    UNIQUE(person_id, note_id)
);

-- Create indexes for performance
CREATE INDEX idx_artist_note_dismissals_person_id ON artist_note_dismissals(person_id);
CREATE INDEX idx_artist_note_dismissals_note_id ON artist_note_dismissals(note_id);
CREATE INDEX idx_artist_note_dismissals_dismissed_at ON artist_note_dismissals(dismissed_at);

-- Add RLS policies
ALTER TABLE artist_note_dismissals ENABLE ROW LEVEL SECURITY;

-- Users can view their own dismissals
CREATE POLICY "Users can view their own note dismissals"
    ON artist_note_dismissals
    FOR SELECT
    TO authenticated
    USING (person_id = (current_setting('request.jwt.claims', true)::json->>'person_id')::uuid);

-- Users can insert their own dismissals
CREATE POLICY "Users can dismiss notes"
    ON artist_note_dismissals
    FOR INSERT
    TO authenticated
    WITH CHECK (person_id = (current_setting('request.jwt.claims', true)::json->>'person_id')::uuid);

-- Users can delete their own dismissals (to "un-dismiss" if needed in future)
CREATE POLICY "Users can delete their own dismissals"
    ON artist_note_dismissals
    FOR DELETE
    TO authenticated
    USING (person_id = (current_setting('request.jwt.claims', true)::json->>'person_id')::uuid);

-- Grant permissions
GRANT SELECT, INSERT, DELETE ON artist_note_dismissals TO authenticated;
GRANT SELECT, INSERT, DELETE ON artist_note_dismissals TO anon;

COMMENT ON TABLE artist_note_dismissals IS 'Tracks when artists dismiss informational notes and announcements';
COMMENT ON COLUMN artist_note_dismissals.note_id IS 'Unique identifier for the note (e.g., payment-alternative-info-2025-10)';
COMMENT ON COLUMN artist_note_dismissals.dismissed_at IS 'Timestamp when the note was dismissed by the user';

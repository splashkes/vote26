-- Migration: Add superseded_by columns to people and artist_profiles tables
-- Date: 2025-10-02
-- Purpose: Track when records are superseded during duplicate profile reconciliation

-- Add superseded_by column to people table
ALTER TABLE people
ADD COLUMN IF NOT EXISTS superseded_by uuid REFERENCES people(id);

-- Add comment
COMMENT ON COLUMN people.superseded_by IS 'Points to the canonical person record if this person has been superseded during duplicate reconciliation';

-- Add superseded_by column to artist_profiles table
ALTER TABLE artist_profiles
ADD COLUMN IF NOT EXISTS superseded_by uuid REFERENCES artist_profiles(id);

-- Add comment
COMMENT ON COLUMN artist_profiles.superseded_by IS 'Points to the canonical artist_profile record if this profile has been superseded during duplicate reconciliation';

-- Create indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_people_superseded_by ON people(superseded_by);
CREATE INDEX IF NOT EXISTS idx_artist_profiles_superseded_by ON artist_profiles(superseded_by);

-- Create indexes to find active (non-superseded) records quickly
CREATE INDEX IF NOT EXISTS idx_people_active ON people(id) WHERE superseded_by IS NULL;
CREATE INDEX IF NOT EXISTS idx_artist_profiles_active ON artist_profiles(id) WHERE superseded_by IS NULL;

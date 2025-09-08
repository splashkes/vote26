-- Add closing_time column to rounds table for timer functionality
-- This allows each round to have its own end time for countdown display

ALTER TABLE rounds 
ADD COLUMN closing_time TIMESTAMP WITH TIME ZONE;

-- Add comment explaining the column
COMMENT ON COLUMN rounds.closing_time IS 'Timestamp when this round ends - used by the timer display system';

-- Add index for efficient timer queries
CREATE INDEX idx_rounds_closing_time ON rounds(closing_time) WHERE closing_time IS NOT NULL;
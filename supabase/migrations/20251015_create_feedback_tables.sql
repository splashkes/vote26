-- Art Battle Feedback System - Database Schema
-- Created: 2025-10-15
-- Purpose: Create tables for artist and guest feedback collection system

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- Table: feedback_submissions
-- Purpose: Primary table storing all feedback submissions from all user types
-- ============================================================================

CREATE TABLE IF NOT EXISTS feedback_submissions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- Context
  event_id UUID REFERENCES events(id),
  event_eid VARCHAR REFERENCES events(eid),
  feedback_context VARCHAR NOT NULL,              -- 'post_event', 'on_demand', 'auction_end', 'broadcast_trigger'

  -- Respondent (polymorphic - could be artist, guest, buyer, producer)
  respondent_type VARCHAR NOT NULL,               -- 'artist', 'guest', 'auction_buyer', 'producer'
  person_id UUID REFERENCES people(id),           -- NULL if anonymous
  artist_profile_id UUID REFERENCES artist_profiles(id),

  -- Submission metadata
  submitted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  ip_address INET,
  user_agent TEXT,

  -- Follow-up
  requests_followup BOOLEAN DEFAULT FALSE,
  followup_message TEXT,
  followup_status VARCHAR DEFAULT 'pending',      -- 'pending', 'contacted', 'resolved', 'no_action_needed'
  followup_slack_ts VARCHAR,                      -- Slack thread timestamp for tracking

  -- Structured responses (JSONB for flexibility)
  responses JSONB NOT NULL,                       -- { "question_id": response_value, ... }

  -- Demographic data (for guests)
  demographic_data JSONB,                         -- { "age_range": "25-34", "gender": "Female", ... }

  -- Internal tracking
  sentiment_score NUMERIC,                        -- Future: AI sentiment analysis (-1 to 1)
  tags TEXT[],                                    -- Future: AI or manual tags ['payment_issue', 'venue_complaint']
  internal_notes TEXT,                            -- Staff notes

  -- Incentive tracking
  incentive_granted BOOLEAN DEFAULT FALSE,
  incentive_type VARCHAR,                         -- 'free_friend_ticket', null
  incentive_granted_at TIMESTAMP WITH TIME ZONE,

  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for feedback_submissions
CREATE INDEX idx_feedback_event ON feedback_submissions(event_id);
CREATE INDEX idx_feedback_respondent ON feedback_submissions(person_id);
CREATE INDEX idx_feedback_artist ON feedback_submissions(artist_profile_id);
CREATE INDEX idx_feedback_type ON feedback_submissions(respondent_type);
CREATE INDEX idx_feedback_followup ON feedback_submissions(requests_followup) WHERE requests_followup = TRUE;
CREATE INDEX idx_feedback_submitted_at ON feedback_submissions(submitted_at DESC);
CREATE INDEX idx_feedback_context ON feedback_submissions(feedback_context);

-- ============================================================================
-- Table: feedback_question_templates
-- Purpose: Defines reusable question templates for different contexts
-- ============================================================================

CREATE TABLE IF NOT EXISTS feedback_question_templates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- Question definition
  question_id VARCHAR UNIQUE NOT NULL,            -- 'artist_post_event_organization', 'guest_nps', etc.
  question_text TEXT NOT NULL,                    -- "How organized was the event?"
  question_type VARCHAR NOT NULL,                 -- 'slider_1_5', 'slider_1_10', 'multiple_choice', 'text', 'yes_no'

  -- Configuration
  options JSONB,                                  -- For multiple choice: ["Option 1", "Option 2"]
  is_required BOOLEAN DEFAULT FALSE,

  -- Context applicability
  applicable_contexts TEXT[],                     -- ['post_event', 'on_demand']
  applicable_respondent_types TEXT[],             -- ['artist', 'guest']

  -- Display
  display_order INTEGER,
  section_heading VARCHAR,                        -- Groups questions: "Event Experience", "Payment", etc.

  -- Metadata
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for feedback_question_templates
CREATE INDEX idx_question_templates_active ON feedback_question_templates(is_active) WHERE is_active = TRUE;
CREATE INDEX idx_question_templates_context ON feedback_question_templates USING GIN (applicable_contexts);
CREATE INDEX idx_question_templates_respondent ON feedback_question_templates USING GIN (applicable_respondent_types);

-- ============================================================================
-- Table: feedback_broadcast_triggers
-- Purpose: Tracks broadcast feedback requests (for guests in art-battle-broadcast)
-- ============================================================================

CREATE TABLE IF NOT EXISTS feedback_broadcast_triggers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  event_id UUID NOT NULL REFERENCES events(id),
  event_eid VARCHAR REFERENCES events(eid),

  -- Broadcast details
  triggered_by UUID REFERENCES people(id),        -- Admin who triggered it
  triggered_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  broadcast_type VARCHAR DEFAULT 'manual',        -- 'manual', 'auction_end_auto'

  -- Tracking
  guest_count_at_trigger INTEGER,                 -- How many guests were connected
  responses_count INTEGER DEFAULT 0,              -- How many submitted

  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for feedback_broadcast_triggers
CREATE INDEX idx_broadcast_event ON feedback_broadcast_triggers(event_id);
CREATE INDEX idx_broadcast_triggered_at ON feedback_broadcast_triggers(triggered_at DESC);

-- ============================================================================
-- Table: feedback_incentive_redemptions
-- Purpose: Tracks incentive fulfillment (e.g., free friend tickets)
-- ============================================================================

CREATE TABLE IF NOT EXISTS feedback_incentive_redemptions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  feedback_submission_id UUID REFERENCES feedback_submissions(id),
  person_id UUID REFERENCES people(id),

  incentive_type VARCHAR NOT NULL,                -- 'free_friend_ticket'
  incentive_code VARCHAR UNIQUE,                  -- Redemption code (e.g., "FRIEND-2025-ABC123")

  granted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  redeemed_at TIMESTAMP WITH TIME ZONE,
  redeemed_for_event_id UUID REFERENCES events(id),

  expires_at TIMESTAMP WITH TIME ZONE,            -- Optional expiration

  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for feedback_incentive_redemptions
CREATE INDEX idx_incentive_person ON feedback_incentive_redemptions(person_id);
CREATE INDEX idx_incentive_code ON feedback_incentive_redemptions(incentive_code);
CREATE INDEX idx_incentive_redeemed ON feedback_incentive_redemptions(redeemed_at) WHERE redeemed_at IS NOT NULL;

-- ============================================================================
-- Trigger: Update updated_at timestamp
-- ============================================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_feedback_submissions_updated_at
    BEFORE UPDATE ON feedback_submissions
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_feedback_question_templates_updated_at
    BEFORE UPDATE ON feedback_question_templates
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- Comments for documentation
-- ============================================================================

COMMENT ON TABLE feedback_submissions IS 'Stores all feedback submissions from artists, guests, buyers, and producers';
COMMENT ON TABLE feedback_question_templates IS 'Defines reusable question templates for different feedback contexts';
COMMENT ON TABLE feedback_broadcast_triggers IS 'Tracks when admins broadcast feedback requests to connected guests';
COMMENT ON TABLE feedback_incentive_redemptions IS 'Tracks incentive codes (e.g., free friend tickets) granted for feedback';

COMMENT ON COLUMN feedback_submissions.responses IS 'JSONB object with question_id as keys and response values';
COMMENT ON COLUMN feedback_submissions.demographic_data IS 'JSONB object with demographic information for incentive qualification';
COMMENT ON COLUMN feedback_question_templates.question_type IS 'Type: slider_1_5, slider_1_10, multiple_choice, text, yes_no';

-- ============================================================================
-- Grant permissions (adjust based on your RLS policies)
-- ============================================================================

-- Enable RLS on tables
ALTER TABLE feedback_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE feedback_question_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE feedback_broadcast_triggers ENABLE ROW LEVEL SECURITY;
ALTER TABLE feedback_incentive_redemptions ENABLE ROW LEVEL SECURITY;

-- Basic policy: Allow service role full access (adjust based on your needs)
-- These are placeholder policies - you'll need to customize based on your auth system

-- feedback_submissions: Users can read their own submissions, admins can read all
CREATE POLICY feedback_submissions_select ON feedback_submissions
  FOR SELECT
  USING (
    auth.role() = 'service_role'
    OR person_id = auth.uid()
    OR artist_profile_id IN (SELECT id FROM artist_profiles WHERE person_id = auth.uid())
  );

-- feedback_submissions: Users can insert their own feedback
CREATE POLICY feedback_submissions_insert ON feedback_submissions
  FOR INSERT
  WITH CHECK (
    auth.role() = 'service_role'
    OR person_id = auth.uid()
    OR artist_profile_id IN (SELECT id FROM artist_profiles WHERE person_id = auth.uid())
  );

-- feedback_question_templates: Everyone can read active templates
CREATE POLICY feedback_templates_select ON feedback_question_templates
  FOR SELECT
  USING (is_active = TRUE OR auth.role() = 'service_role');

-- feedback_broadcast_triggers: Only service role and admins
CREATE POLICY feedback_broadcast_service ON feedback_broadcast_triggers
  FOR ALL
  USING (auth.role() = 'service_role');

-- feedback_incentive_redemptions: Users can read their own, service role can manage
CREATE POLICY feedback_incentive_select ON feedback_incentive_redemptions
  FOR SELECT
  USING (
    auth.role() = 'service_role'
    OR person_id = auth.uid()
  );

-- ============================================================================
-- End of migration
-- ============================================================================

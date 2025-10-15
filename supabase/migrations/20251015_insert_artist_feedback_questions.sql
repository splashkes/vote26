-- Art Battle Feedback System - Artist Question Templates
-- Created: 2025-10-15
-- Purpose: Insert artist feedback question templates for post-event and on-demand feedback

-- ============================================================================
-- Artist Post-Event Questions
-- ============================================================================

INSERT INTO feedback_question_templates
  (question_id, question_text, question_type, section_heading, display_order, is_required, applicable_contexts, applicable_respondent_types, is_active)
VALUES
  -- Event Experience
  (
    'artist_post_event_organization',
    'How organized was the event?',
    'slider_1_5',
    'Event Experience',
    1,
    FALSE,
    ARRAY['post_event', 'on_demand'],
    ARRAY['artist'],
    TRUE
  ),

  -- Producer & Staff
  (
    'artist_post_event_producer_communication',
    'How satisfied were you with producer communication?',
    'slider_1_5',
    'Producer & Staff',
    2,
    FALSE,
    ARRAY['post_event', 'on_demand'],
    ARRAY['artist'],
    TRUE
  ),

  -- Artwork & Materials
  (
    'artist_post_event_artwork_handling',
    'How well was your artwork handled and stored?',
    'slider_1_5',
    'Artwork & Materials',
    3,
    FALSE,
    ARRAY['post_event', 'on_demand'],
    ARRAY['artist'],
    TRUE
  ),

  -- Technology
  (
    'artist_post_event_technology',
    'How smooth was the technology (voting, displays, timers)?',
    'slider_1_5',
    'Technology',
    4,
    FALSE,
    ARRAY['post_event', 'on_demand'],
    ARRAY['artist'],
    TRUE
  ),

  -- Payment
  (
    'artist_post_event_payment',
    'How easy was it to receive payment?',
    'slider_1_5',
    'Payment',
    5,
    FALSE,
    ARRAY['post_event', 'on_demand'],
    ARRAY['artist'],
    TRUE
  ),

  -- Artists
  (
    'artist_post_event_peer_quality',
    'Quality of fellow artists',
    'slider_1_5',
    'Artists',
    6,
    FALSE,
    ARRAY['post_event', 'on_demand'],
    ARRAY['artist'],
    TRUE
  ),

  -- Venue
  (
    'artist_post_event_venue',
    'How suitable was the venue?',
    'slider_1_5',
    'Venue',
    7,
    FALSE,
    ARRAY['post_event', 'on_demand'],
    ARRAY['artist'],
    TRUE
  ),

  -- Overall NPS (Required)
  (
    'artist_post_event_nps',
    'How likely are you to participate in another Art Battle event?',
    'slider_1_10',
    'Overall',
    8,
    TRUE,
    ARRAY['post_event', 'on_demand'],
    ARRAY['artist'],
    TRUE
  ),

  -- Additional Feedback - Highlights
  (
    'artist_post_event_highlights',
    'What was the highlight of this event?',
    'text',
    'Additional Feedback',
    9,
    FALSE,
    ARRAY['post_event', 'on_demand'],
    ARRAY['artist'],
    TRUE
  ),

  -- Additional Feedback - Improvements
  (
    'artist_post_event_improvements',
    'What could we improve?',
    'text',
    'Additional Feedback',
    10,
    FALSE,
    ARRAY['post_event', 'on_demand'],
    ARRAY['artist'],
    TRUE
  )
ON CONFLICT (question_id) DO UPDATE SET
  question_text = EXCLUDED.question_text,
  question_type = EXCLUDED.question_type,
  section_heading = EXCLUDED.section_heading,
  display_order = EXCLUDED.display_order,
  is_required = EXCLUDED.is_required,
  applicable_contexts = EXCLUDED.applicable_contexts,
  applicable_respondent_types = EXCLUDED.applicable_respondent_types,
  is_active = EXCLUDED.is_active,
  updated_at = NOW();

-- ============================================================================
-- Verification Query (commented out - uncomment to test)
-- ============================================================================

-- SELECT
--   question_id,
--   question_text,
--   question_type,
--   section_heading,
--   display_order,
--   is_required,
--   applicable_contexts,
--   applicable_respondent_types
-- FROM feedback_question_templates
-- WHERE 'artist' = ANY(applicable_respondent_types)
-- ORDER BY display_order;

-- ============================================================================
-- End of migration
-- ============================================================================

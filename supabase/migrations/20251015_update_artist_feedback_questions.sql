-- Art Battle Feedback System - Updated Artist Questions
-- Created: 2025-10-15
-- Purpose: Replace artist feedback questions with new survey format

-- Delete old questions
DELETE FROM feedback_question_templates WHERE 'artist' = ANY(applicable_respondent_types);

-- Insert new artist feedback questions
INSERT INTO feedback_question_templates
  (question_id, question_text, question_type, section_heading, display_order, is_required, applicable_contexts, applicable_respondent_types, options, is_active)
VALUES
  -- ============================================================================
  -- Communication & Preparation
  -- ============================================================================
  (
    'artist_communication_satisfaction',
    'How satisfied were you with communication from Art Battle before the event?',
    'multiple_choice',
    'Communication & Preparation',
    1,
    FALSE,
    ARRAY['post_event', 'on_demand'],
    ARRAY['artist'],
    '["Very Satisfied", "Satisfied", "Neutral", "Unsatisfied", "Very Unsatisfied"]'::jsonb,
    TRUE
  ),
  (
    'artist_preparation_quality',
    'How well did the team prepare you for the event? (rules, timing, expectations, etc.)',
    'multiple_choice',
    'Communication & Preparation',
    2,
    FALSE,
    ARRAY['post_event', 'on_demand'],
    ARRAY['artist'],
    '["Totally prepared", "Well prepared", "Somewhat prepared", "Unprepared", "Not at all prepared"]'::jsonb,
    TRUE
  ),
  (
    'artist_communication_improvements',
    'If communication or preparation wasn''t perfect, how can we improve?',
    'text',
    'Communication & Preparation',
    3,
    FALSE,
    ARRAY['post_event', 'on_demand'],
    ARRAY['artist'],
    NULL,
    TRUE
  ),

  -- ============================================================================
  -- The Experience
  -- ============================================================================
  (
    'artist_overall_satisfaction',
    'How satisfied were you with your overall Art Battle experience?',
    'multiple_choice',
    'The Experience',
    4,
    FALSE,
    ARRAY['post_event', 'on_demand'],
    ARRAY['artist'],
    '["Very Satisfied", "Satisfied", "Neutral", "Unsatisfied", "Very Unsatisfied"]'::jsonb,
    TRUE
  ),
  (
    'artist_materials_satisfaction',
    'How satisfied were you with the art materials provided? (canvas, paint, easel, etc.)',
    'multiple_choice',
    'The Experience',
    5,
    FALSE,
    ARRAY['post_event', 'on_demand'],
    ARRAY['artist'],
    '["Very Satisfied", "Satisfied", "Neutral", "Unsatisfied", "Very Unsatisfied"]'::jsonb,
    TRUE
  ),
  (
    'artist_competition_fairness',
    'How fair did you feel the competition was?',
    'multiple_choice',
    'The Experience',
    6,
    FALSE,
    ARRAY['post_event', 'on_demand'],
    ARRAY['artist'],
    '["Very fair", "Mostly fair", "Somewhat fair", "Somewhat unfair", "Not fair at all"]'::jsonb,
    TRUE
  ),
  (
    'artist_experience_comments',
    'Do you have any comments about your experience, the materials, or the fairness of the event?',
    'text',
    'The Experience',
    7,
    FALSE,
    ARRAY['post_event', 'on_demand'],
    ARRAY['artist'],
    NULL,
    TRUE
  ),

  -- ============================================================================
  -- Auction & Payment
  -- ============================================================================
  (
    'artist_auction_process',
    'If your artwork sold in the auction, did you feel the process was smooth and fair?',
    'multiple_choice',
    'Auction & Payment',
    8,
    FALSE,
    ARRAY['post_event', 'on_demand'],
    ARRAY['artist'],
    '["Yes", "Mostly", "Somewhat", "No", "My work was not in the auction"]'::jsonb,
    TRUE
  ),
  (
    'artist_payment_status',
    'Have you received your artist payment (or are you aware of the process and timeline)?',
    'multiple_choice',
    'Auction & Payment',
    9,
    FALSE,
    ARRAY['post_event', 'on_demand'],
    ARRAY['artist'],
    '["Yes, I''ve been paid", "Yes, I know when to expect it", "No, I haven''t been paid or heard anything", "Not applicable (I didn''t sell or am not owed payment)"]'::jsonb,
    TRUE
  ),
  (
    'artist_auction_payment_comments',
    'Any comments or suggestions about the auction or payment process?',
    'text',
    'Auction & Payment',
    10,
    FALSE,
    ARRAY['post_event', 'on_demand'],
    ARRAY['artist'],
    NULL,
    TRUE
  ),

  -- ============================================================================
  -- Final Thoughts
  -- ============================================================================
  (
    'artist_nps_recommendation',
    'How likely are you to recommend Art Battle to other artists and friends?',
    'slider_1_5',
    'Final Thoughts',
    11,
    TRUE,
    ARRAY['post_event', 'on_demand'],
    ARRAY['artist'],
    NULL,
    TRUE
  ),
  (
    'artist_final_comments',
    'Any final comments or suggestions?',
    'text',
    'Final Thoughts',
    12,
    FALSE,
    ARRAY['post_event', 'on_demand'],
    ARRAY['artist'],
    NULL,
    TRUE
  );

-- ============================================================================
-- Verification Query
-- ============================================================================

SELECT
  question_id,
  question_text,
  question_type,
  section_heading,
  display_order,
  is_required
FROM feedback_question_templates
WHERE 'artist' = ANY(applicable_respondent_types)
ORDER BY display_order;

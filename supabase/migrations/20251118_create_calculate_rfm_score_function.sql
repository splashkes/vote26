-- Create function to calculate RFM score for a person and store in cache
-- This replaces the non-existent rfm-scoring edge function with efficient SQL

CREATE OR REPLACE FUNCTION calculate_rfm_score_for_person(p_person_id UUID)
RETURNS TABLE (
  recency_score INTEGER,
  frequency_score INTEGER,
  monetary_score INTEGER,
  total_score INTEGER,
  segment TEXT,
  segment_code CHAR(3),
  days_since_last_activity INTEGER,
  total_activities INTEGER,
  total_spent NUMERIC(10,2)
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_days_since_last INTEGER;
  v_total_activities INTEGER;
  v_total_spent NUMERIC(10,2);
  v_recency_score INTEGER;
  v_frequency_score INTEGER;
  v_monetary_score INTEGER;
  v_total_score INTEGER;
  v_segment TEXT;
  v_segment_code CHAR(3);

  -- RFM thresholds (quintiles for scoring 1-5)
  v_recency_thresholds INTEGER[] := ARRAY[7, 30, 90, 180, 365]; -- Days
  v_frequency_thresholds INTEGER[] := ARRAY[1, 2, 5, 10, 20]; -- Activities
  v_monetary_thresholds NUMERIC[] := ARRAY[0, 50, 150, 300, 500]; -- Dollars
BEGIN
  -- Get person's activity data
  WITH activity_dates AS (
    SELECT MAX(activity_date) as last_activity, COUNT(*) as activity_count
    FROM (
      -- Event registrations
      SELECT er.created_at::DATE as activity_date
      FROM event_registrations er
      WHERE er.person_id = p_person_id

      UNION ALL

      -- QR scans
      SELECT pqs.scan_timestamp::DATE as activity_date
      FROM people_qr_scans pqs
      WHERE pqs.person_id = p_person_id
      AND pqs.is_valid = true

      UNION ALL

      -- Votes
      SELECT v.created_at::DATE as activity_date
      FROM votes v
      WHERE v.person_id = p_person_id

      UNION ALL

      -- Bids
      SELECT b.created_at::DATE as activity_date
      FROM bids b
      WHERE b.person_id = p_person_id
    ) all_activities
  ),
  spending AS (
    SELECT COALESCE(SUM(b.amount), 0) as total_spent
    FROM bids b
    WHERE b.person_id = p_person_id
  )
  SELECT
    COALESCE(EXTRACT(DAY FROM (NOW() - ad.last_activity)), 9999)::INTEGER,
    COALESCE(ad.activity_count, 0)::INTEGER,
    COALESCE(s.total_spent, 0)
  INTO v_days_since_last, v_total_activities, v_total_spent
  FROM activity_dates ad
  CROSS JOIN spending s;

  -- Calculate Recency Score (1-5, where 5 = most recent)
  v_recency_score := CASE
    WHEN v_days_since_last <= v_recency_thresholds[1] THEN 5
    WHEN v_days_since_last <= v_recency_thresholds[2] THEN 4
    WHEN v_days_since_last <= v_recency_thresholds[3] THEN 3
    WHEN v_days_since_last <= v_recency_thresholds[4] THEN 2
    ELSE 1
  END;

  -- Calculate Frequency Score (1-5, where 5 = most frequent)
  v_frequency_score := CASE
    WHEN v_total_activities >= v_frequency_thresholds[5] THEN 5
    WHEN v_total_activities >= v_frequency_thresholds[4] THEN 4
    WHEN v_total_activities >= v_frequency_thresholds[3] THEN 3
    WHEN v_total_activities >= v_frequency_thresholds[2] THEN 2
    ELSE 1
  END;

  -- Calculate Monetary Score (1-5, where 5 = highest spending)
  v_monetary_score := CASE
    WHEN v_total_spent >= v_monetary_thresholds[5] THEN 5
    WHEN v_total_spent >= v_monetary_thresholds[4] THEN 4
    WHEN v_total_spent >= v_monetary_thresholds[3] THEN 3
    WHEN v_total_spent >= v_monetary_thresholds[2] THEN 2
    ELSE 1
  END;

  v_total_score := v_recency_score + v_frequency_score + v_monetary_score;

  -- Determine segment based on RFM scores
  v_segment_code := v_recency_score::TEXT || v_frequency_score::TEXT || v_monetary_score::TEXT;

  v_segment := CASE
    WHEN v_recency_score >= 4 AND v_frequency_score >= 4 AND v_monetary_score >= 4 THEN 'Champions'
    WHEN v_recency_score >= 4 AND v_frequency_score >= 3 THEN 'Loyal Customers'
    WHEN v_recency_score >= 4 AND v_monetary_score >= 4 THEN 'Big Spenders'
    WHEN v_recency_score >= 4 THEN 'Recent Customers'
    WHEN v_frequency_score >= 4 THEN 'Frequent Visitors'
    WHEN v_recency_score <= 2 AND v_frequency_score >= 3 THEN 'At Risk'
    WHEN v_recency_score <= 2 AND v_frequency_score <= 2 THEN 'Lost'
    ELSE 'Casual'
  END;

  -- Upsert into cache
  INSERT INTO rfm_score_cache (
    person_id,
    recency_score,
    frequency_score,
    monetary_score,
    total_score,
    segment,
    segment_code,
    days_since_last_activity,
    total_activities,
    total_spent,
    calculated_at
  ) VALUES (
    p_person_id,
    v_recency_score,
    v_frequency_score,
    v_monetary_score,
    v_total_score,
    v_segment,
    v_segment_code,
    v_days_since_last,
    v_total_activities,
    v_total_spent,
    NOW()
  )
  ON CONFLICT (person_id)
  DO UPDATE SET
    recency_score = EXCLUDED.recency_score,
    frequency_score = EXCLUDED.frequency_score,
    monetary_score = EXCLUDED.monetary_score,
    total_score = EXCLUDED.total_score,
    segment = EXCLUDED.segment,
    segment_code = EXCLUDED.segment_code,
    days_since_last_activity = EXCLUDED.days_since_last_activity,
    total_activities = EXCLUDED.total_activities,
    total_spent = EXCLUDED.total_spent,
    calculated_at = NOW(),
    updated_at = NOW();

  RETURN QUERY
  SELECT
    v_recency_score,
    v_frequency_score,
    v_monetary_score,
    v_total_score,
    v_segment,
    v_segment_code,
    v_days_since_last,
    v_total_activities,
    v_total_spent;
END;
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION calculate_rfm_score_for_person(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION calculate_rfm_score_for_person(UUID) TO authenticated;

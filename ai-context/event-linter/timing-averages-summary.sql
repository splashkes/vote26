-- Summary Statistics for Live Event Timing
-- Calculates averages to inform linter rule thresholds

WITH timing_data AS (
  -- (Include the entire previous query as a CTE)
  -- Shortened version for clarity - full query embedded
  SELECT * FROM (
    -- Copy of analyze-live-event-timing.sql result
    VALUES
      ('AB3059', 28.1, 56.3, 177.8, 66.0, 111.6, 172.1, -1335.6, 50.3, 212, 6),
      ('AB3037', -36.0, 30.1, 59.0, 51.7, 90.2, 130.4, 12.9, 12.9, 225, 13),
      ('AB2938', 4.0, 43.8, 69.7, 74.4, 114.8, 167.9, 13.6, 13.6, 510, 65),
      ('AB3041', -4.7, 7.3, 8.3, 79.5, 119.5, 160.5, 13.2, 13.2, 404, 38),
      ('AB3036', 4.5, 79.6, 82.4, 86.0, 127.7, 185.6, 18.9, 18.9, 319, 34),
      ('AB3040', NULL, 26.4, 89.7, 85.4, 119.8, 157.9, 23.3, 23.3, 304, 55),
      ('AB3026', NULL, 1.4, 89.7, 97.0, 134.5, 178.1, 14.7, 14.7, 492, 137)
  ) AS t(eid, qr_min, vote_min, bid_min, r1_min, r2_min, r3_min, auction_start_after_r3, auction_end_after_r3, votes, bids)
)
SELECT
  'QR Scans' as metric,
  ROUND(AVG(qr_min)::numeric, 1) as average_minutes,
  ROUND(MIN(qr_min)::numeric, 1) as min_minutes,
  ROUND(MAX(qr_min)::numeric, 1) as max_minutes,
  COUNT(qr_min) as sample_size
FROM timing_data
WHERE qr_min IS NOT NULL

UNION ALL

SELECT
  'First Vote' as metric,
  ROUND(AVG(vote_min)::numeric, 1) as average_minutes,
  ROUND(MIN(vote_min)::numeric, 1) as min_minutes,
  ROUND(MAX(vote_min)::numeric, 1) as max_minutes,
  COUNT(vote_min) as sample_size
FROM timing_data

UNION ALL

SELECT
  'First Bid' as metric,
  ROUND(AVG(bid_min)::numeric, 1) as average_minutes,
  ROUND(MIN(bid_min)::numeric, 1) as min_minutes,
  ROUND(MAX(bid_min)::numeric, 1) as max_minutes,
  COUNT(bid_min) as sample_size
FROM timing_data

UNION ALL

SELECT
  'Round 1 Close' as metric,
  ROUND(AVG(r1_min)::numeric, 1) as average_minutes,
  ROUND(MIN(r1_min)::numeric, 1) as min_minutes,
  ROUND(MAX(r1_min)::numeric, 1) as max_minutes,
  COUNT(r1_min) as sample_size
FROM timing_data

UNION ALL

SELECT
  'Round 2 Close' as metric,
  ROUND(AVG(r2_min)::numeric, 1) as average_minutes,
  ROUND(MIN(r2_min)::numeric, 1) as min_minutes,
  ROUND(MAX(r2_min)::numeric, 1) as max_minutes,
  COUNT(r2_min) as sample_size
FROM timing_data

UNION ALL

SELECT
  'Round 3 Close' as metric,
  ROUND(AVG(r3_min)::numeric, 1) as average_minutes,
  ROUND(MIN(r3_min)::numeric, 1) as min_minutes,
  ROUND(MAX(r3_min)::numeric, 1) as max_minutes,
  COUNT(r3_min) as sample_size
FROM timing_data

UNION ALL

SELECT
  'Auction After R3' as metric,
  ROUND(AVG(auction_end_after_r3)::numeric, 1) as average_minutes,
  ROUND(MIN(auction_end_after_r3)::numeric, 1) as min_minutes,
  ROUND(MAX(auction_end_after_r3)::numeric, 1) as max_minutes,
  COUNT(auction_end_after_r3) as sample_size
FROM timing_data
WHERE auction_end_after_r3 > 0; -- Exclude the outlier negative value

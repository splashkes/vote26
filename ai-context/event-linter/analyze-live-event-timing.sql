-- Timing Analysis for Live Events with Timer
-- Analyzes QR scans, votes, bids, rounds, and auction timing
-- For events with 50+ votes and timer used in all 3 rounds

WITH target_events AS (
  -- Find events with 50+ votes AND timer used in all 3 rounds
  SELECT
    e.id as event_id,
    e.eid,
    e.name,
    e.event_start_datetime,
    e.event_end_datetime
  FROM events e
  JOIN votes v ON v.event_id = e.id
  JOIN rounds r ON r.event_id = e.id
  WHERE e.event_end_datetime < NOW()
  GROUP BY e.id, e.eid, e.name, e.event_start_datetime, e.event_end_datetime
  HAVING
    COUNT(DISTINCT v.id) >= 50
    AND COUNT(DISTINCT r.id) = 3
    AND COUNT(DISTINCT CASE WHEN r.closing_time IS NOT NULL THEN r.id END) = 3
  ORDER BY e.event_end_datetime DESC
  LIMIT 10
),
qr_timing AS (
  SELECT
    te.eid,
    MIN(pqs.scan_timestamp) as first_qr_scan,
    EXTRACT(EPOCH FROM (MIN(pqs.scan_timestamp) - te.event_start_datetime)) / 60 as minutes_after_start_qr,
    COUNT(DISTINCT pqs.id) as total_qr_scans
  FROM target_events te
  LEFT JOIN people_qr_scans pqs ON pqs.event_id = te.event_id
  GROUP BY te.eid, te.event_start_datetime
),
vote_timing AS (
  SELECT
    te.eid,
    MIN(v.created_at) as first_vote,
    EXTRACT(EPOCH FROM (MIN(v.created_at) - te.event_start_datetime)) / 60 as minutes_after_start_vote,
    COUNT(DISTINCT v.id) as total_votes
  FROM target_events te
  LEFT JOIN votes v ON v.event_id = te.event_id
  GROUP BY te.eid, te.event_start_datetime
),
bid_timing AS (
  SELECT
    te.eid,
    MIN(b.created_at) as first_bid,
    EXTRACT(EPOCH FROM (MIN(b.created_at) - te.event_start_datetime)) / 60 as minutes_after_start_bid,
    COUNT(DISTINCT b.id) as total_bids
  FROM target_events te
  LEFT JOIN art a ON a.event_id = te.event_id
  LEFT JOIN bids b ON b.art_id = a.id
  GROUP BY te.eid, te.event_start_datetime
),
round_timing AS (
  SELECT
    te.eid,
    MAX(CASE WHEN r.round_number = 1 THEN r.closing_time END) as round1_close,
    MAX(CASE WHEN r.round_number = 2 THEN r.closing_time END) as round2_close,
    MAX(CASE WHEN r.round_number = 3 THEN r.closing_time END) as round3_close,
    EXTRACT(EPOCH FROM (MAX(CASE WHEN r.round_number = 1 THEN r.closing_time END) - te.event_start_datetime)) / 60 as round1_minutes,
    EXTRACT(EPOCH FROM (MAX(CASE WHEN r.round_number = 2 THEN r.closing_time END) - te.event_start_datetime)) / 60 as round2_minutes,
    EXTRACT(EPOCH FROM (MAX(CASE WHEN r.round_number = 3 THEN r.closing_time END) - te.event_start_datetime)) / 60 as round3_minutes
  FROM target_events te
  LEFT JOIN rounds r ON r.event_id = te.event_id
  GROUP BY te.eid, te.event_start_datetime
),
auction_timing AS (
  SELECT
    te.eid,
    MIN(a.closing_time) as auction_earliest_close,
    MAX(a.closing_time) as auction_latest_close,
    COUNT(DISTINCT CASE WHEN a.status = 'active' THEN a.id END) as active_items,
    COUNT(DISTINCT a.id) as total_items
  FROM target_events te
  LEFT JOIN art a ON a.event_id = te.event_id
  GROUP BY te.eid
),
auction_vs_round3 AS (
  SELECT
    rt.eid,
    EXTRACT(EPOCH FROM (at.auction_earliest_close - rt.round3_close)) / 60 as auction_after_round3_minutes,
    EXTRACT(EPOCH FROM (at.auction_latest_close - rt.round3_close)) / 60 as auction_end_after_round3_minutes
  FROM round_timing rt
  LEFT JOIN auction_timing at ON at.eid = rt.eid
)
SELECT
  te.eid,
  te.name,
  te.event_start_datetime,
  te.event_end_datetime,

  -- QR Scan timing
  qt.first_qr_scan,
  ROUND(qt.minutes_after_start_qr::numeric, 1) as qr_minutes_after_start,
  qt.total_qr_scans,

  -- Vote timing
  vt.first_vote,
  ROUND(vt.minutes_after_start_vote::numeric, 1) as vote_minutes_after_start,
  vt.total_votes,

  -- Bid timing
  bt.first_bid,
  ROUND(bt.minutes_after_start_bid::numeric, 1) as bid_minutes_after_start,
  bt.total_bids,

  -- Round timing
  rt.round1_close,
  ROUND(rt.round1_minutes::numeric, 1) as round1_minutes_after_start,
  rt.round2_close,
  ROUND(rt.round2_minutes::numeric, 1) as round2_minutes_after_start,
  rt.round3_close,
  ROUND(rt.round3_minutes::numeric, 1) as round3_minutes_after_start,

  -- Auction timing
  at.auction_earliest_close,
  at.auction_latest_close,
  ROUND(avr.auction_after_round3_minutes::numeric, 1) as auction_start_after_round3_min,
  ROUND(avr.auction_end_after_round3_minutes::numeric, 1) as auction_end_after_round3_min,
  at.active_items,
  at.total_items

FROM target_events te
LEFT JOIN qr_timing qt ON qt.eid = te.eid
LEFT JOIN vote_timing vt ON vt.eid = te.eid
LEFT JOIN bid_timing bt ON bt.eid = te.eid
LEFT JOIN round_timing rt ON rt.eid = te.eid
LEFT JOIN auction_timing at ON at.eid = te.eid
LEFT JOIN auction_vs_round3 avr ON avr.eid = te.eid
ORDER BY te.event_end_datetime DESC;

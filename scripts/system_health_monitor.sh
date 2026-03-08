#!/bin/bash

# Art Battle System Health Monitor
# Generates timestamped micro-reports for live event monitoring

TIMESTAMP=$(date "+%Y-%m-%d %H:%M:%S")
PGPASSWORD='6kEtvU9n0KhTVr5'
PSQL_CMD="psql -h db.xsqdkubgyqwpyvfltnrf.supabase.co -p 5432 -d postgres -U postgres -t -A -F'|'"

echo "=== ART BATTLE SYSTEM HEALTH REPORT ==="
echo "Timestamp: $TIMESTAMP"
echo "Event: AB3019 (Auckland CBD)"
echo "========================================"

# Auth System Health
echo ""
echo "AUTH SYSTEM METRICS:"
AUTH_METRICS=$(PGPASSWORD='6kEtvU9n0KhTVr5' $PSQL_CMD -c "
SELECT 
  'Total Users|' || COUNT(*) ||
  '|Confirmed|' || COUNT(CASE WHEN phone_confirmed_at IS NOT NULL THEN 1 END) ||
  '|Linked|' || (SELECT COUNT(*) FROM people WHERE auth_user_id IS NOT NULL) ||
  '|Unlinked|' || COUNT(*) - (SELECT COUNT(*) FROM people WHERE auth_user_id IS NOT NULL) ||
  '|Circular_Refs|' || (
    SELECT COUNT(*) FROM auth.users au 
    JOIN people p ON p.auth_user_id = au.id 
    WHERE (au.raw_user_meta_data->>'person_id')::uuid IS NOT NULL 
    AND (au.raw_user_meta_data->>'person_id')::uuid != p.id
  )
FROM auth.users;
")
echo "$AUTH_METRICS" | tr '|' ' '

# Recent Auth Activity (last 10 minutes)
echo ""
echo "RECENT AUTH ACTIVITY (last 10 min):"
RECENT_AUTH=$(PGPASSWORD='6kEtvU9n0KhTVr5' $PSQL_CMD -c "
SELECT 
  'New_Signups|' || COUNT(CASE WHEN created_at > NOW() - INTERVAL '10 minutes' THEN 1 END) ||
  '|Phone_Verified|' || COUNT(CASE WHEN phone_confirmed_at > NOW() - INTERVAL '10 minutes' THEN 1 END) ||
  '|People_Created|' || (SELECT COUNT(*) FROM people WHERE created_at > NOW() - INTERVAL '10 minutes')
FROM auth.users;
")
echo "$RECENT_AUTH" | tr '|' ' '

# AB3019 Event Status
echo ""
echo "AB3019 EVENT METRICS:"
EVENT_STATUS=$(PGPASSWORD='6kEtvU9n0KhTVr5' $PSQL_CMD -c "
SELECT 
  'Current_Round|' || current_round ||
  '|Art_Pieces|' || (SELECT COUNT(*) FROM art WHERE event_id = 'e6e74b4c-8b9d-4abe-be66-e610602980b3') ||
  '|Active_Status|' || (SELECT COUNT(*) FROM art WHERE event_id = 'e6e74b4c-8b9d-4abe-be66-e610602980b3' AND status = 'active') ||
  '|With_Artists|' || (SELECT COUNT(*) FROM art WHERE event_id = 'e6e74b4c-8b9d-4abe-be66-e610602980b3' AND artist_id IS NOT NULL)
FROM events WHERE id = 'e6e74b4c-8b9d-4abe-be66-e610602980b3';
")
echo "$EVENT_STATUS" | tr '|' ' '

# Voting Activity
echo ""
echo "VOTING METRICS:"
VOTING_METRICS=$(PGPASSWORD='6kEtvU9n0KhTVr5' $PSQL_CMD -c "
SELECT 
  'Total_Votes|' || COUNT(*) ||
  '|Last_10min|' || COUNT(CASE WHEN created_at > NOW() - INTERVAL '10 minutes' THEN 1 END) ||
  '|Last_Hour|' || COUNT(CASE WHEN created_at > NOW() - INTERVAL '1 hour' THEN 1 END) ||
  '|Unique_Voters|' || COUNT(DISTINCT person_id)
FROM votes 
WHERE event_id = 'e6e74b4c-8b9d-4abe-be66-e610602980b3';
")
echo "$VOTING_METRICS" | tr '|' ' '

# Bidding Activity  
echo ""
echo "BIDDING METRICS:"
BIDDING_METRICS=$(PGPASSWORD='6kEtvU9n0KhTVr5' $PSQL_CMD -c "
SELECT 
  'Total_Bids|' || COUNT(b.*) ||
  '|Last_10min|' || COUNT(CASE WHEN b.created_at > NOW() - INTERVAL '10 minutes' THEN 1 END) ||
  '|Last_Hour|' || COUNT(CASE WHEN b.created_at > NOW() - INTERVAL '1 hour' THEN 1 END) ||
  '|Unique_Bidders|' || COUNT(DISTINCT b.person_id) ||
  '|Total_Value_NZD|' || COALESCE(SUM(b.amount), 0)
FROM bids b
JOIN art a ON a.id = b.art_id 
WHERE a.event_id = 'e6e74b4c-8b9d-4abe-be66-e610602980b3';
")
echo "$BIDDING_METRICS" | tr '|' ' '

# QR Scanning Activity
echo ""
echo "QR SCAN METRICS:"
QR_METRICS=$(PGPASSWORD='6kEtvU9n0KhTVr5' $PSQL_CMD -c "
SELECT 
  'Total_Scans|' || COUNT(*) ||
  '|Last_10min|' || COUNT(CASE WHEN created_at > NOW() - INTERVAL '10 minutes' THEN 1 END) ||
  '|Last_Hour|' || COUNT(CASE WHEN created_at > NOW() - INTERVAL '1 hour' THEN 1 END) ||
  '|Unique_People|' || COUNT(DISTINCT person_id)
FROM people_qr_scans 
WHERE event_id = 'e6e74b4c-8b9d-4abe-be66-e610602980b3';
")
echo "$QR_METRICS" | tr '|' ' '

# Payment Processing
echo ""
echo "PAYMENT METRICS:"
PAYMENT_METRICS=$(PGPASSWORD='6kEtvU9n0KhTVr5' $PSQL_CMD -c "
SELECT 
  'Payment_Sessions|' || COUNT(*) ||
  '|Completed|' || COUNT(CASE WHEN status = 'completed' THEN 1 END) ||
  '|Pending|' || COUNT(CASE WHEN status IN ('pending', 'processing') THEN 1 END) ||
  '|Failed|' || COUNT(CASE WHEN status = 'failed' THEN 1 END) ||
  '|Last_Hour|' || COUNT(CASE WHEN created_at > NOW() - INTERVAL '1 hour' THEN 1 END)
FROM payment_processing 
WHERE event_id = 'e6e74b4c-8b9d-4abe-be66-e610602980b3';
")
echo "$PAYMENT_METRICS" | tr '|' ' '

# Database Error Indicators
echo ""
echo "ERROR INDICATORS:"
ERROR_METRICS=$(PGPASSWORD='6kEtvU9n0KhTVr5' $PSQL_CMD -c "
SELECT 
  'Auth_No_Metadata|' || (
    SELECT COUNT(*) FROM auth.users 
    WHERE phone_confirmed_at IS NOT NULL 
    AND raw_user_meta_data->>'person_id' IS NULL
  ) ||
  '|Auth_No_Person_Link|' || (
    SELECT COUNT(*) FROM auth.users au
    LEFT JOIN people p ON p.auth_user_id = au.id
    WHERE au.phone_confirmed_at IS NOT NULL AND p.id IS NULL
  ) ||
  '|Duplicate_Auth_Links|' || (
    SELECT COUNT(*) FROM (
      SELECT auth_user_id FROM people 
      WHERE auth_user_id IS NOT NULL 
      GROUP BY auth_user_id HAVING COUNT(*) > 1
    ) sub
  ) ||
  '|Phone_Only_Users|' || (
    SELECT COUNT(*) FROM people 
    WHERE auth_user_id IS NOT NULL 
    AND (name IS NULL OR name = '' OR name = 'User')
  );
")
echo "$ERROR_METRICS" | tr '|' ' '

# Payment Processing Failures
echo ""
echo "PAYMENT FAILURES:"
PAYMENT_FAILURES=$(PGPASSWORD='6kEtvU9n0KhTVr5' $PSQL_CMD -c "
SELECT 
  'Failed_Payments_1h|' || COUNT(CASE WHEN status = 'failed' AND created_at > NOW() - INTERVAL '1 hour' THEN 1 END) ||
  '|Stuck_Processing|' || COUNT(CASE WHEN status = 'processing' AND created_at < NOW() - INTERVAL '30 minutes' THEN 1 END) ||
  '|Missing_Sessions|' || COUNT(CASE WHEN stripe_checkout_session_id IS NULL AND status NOT IN ('failed', 'cancelled') THEN 1 END)
FROM payment_processing 
WHERE event_id = 'e6e74b4c-8b9d-4abe-be66-e610602980b3';
")
echo "$PAYMENT_FAILURES" | tr '|' ' '

# Auth System Failures  
echo ""
echo "AUTH FAILURES:"
AUTH_FAILURES=$(PGPASSWORD='6kEtvU9n0KhTVr5' $PSQL_CMD -c "
SELECT 
  'Verified_No_Metadata_1h|' || COUNT(CASE WHEN phone_confirmed_at > NOW() - INTERVAL '1 hour' AND raw_user_meta_data->>'person_id' IS NULL THEN 1 END) ||
  '|Verified_No_Person_1h|' || (
    SELECT COUNT(*) FROM auth.users au 
    LEFT JOIN people p ON p.auth_user_id = au.id 
    WHERE au.phone_confirmed_at > NOW() - INTERVAL '1 hour' 
    AND p.id IS NULL
  )
FROM auth.users;
")
echo "$AUTH_FAILURES" | tr '|' ' '

# Bid/Vote Data Integrity
echo ""
echo "BID/VOTE ERRORS:"
DATA_ERRORS=$(PGPASSWORD='6kEtvU9n0KhTVr5' $PSQL_CMD -c "
SELECT 
  'Bids_Below_Minimum_1h|' || (
    SELECT COUNT(*) FROM bids b 
    JOIN art a ON a.id = b.art_id 
    WHERE a.event_id = 'e6e74b4c-8b9d-4abe-be66-e610602980b3'
    AND b.created_at > NOW() - INTERVAL '1 hour'
    AND b.amount < COALESCE(a.current_bid + 5, a.starting_bid, 55)
  ) ||
  '|Votes_Missing_Person_1h|' || (
    SELECT COUNT(*) FROM votes 
    WHERE event_id = 'e6e74b4c-8b9d-4abe-be66-e610602980b3'
    AND created_at > NOW() - INTERVAL '1 hour'
    AND person_id IS NULL
  ) ||
  '|Orphaned_Bids|' || (
    SELECT COUNT(*) FROM bids b 
    LEFT JOIN art a ON a.id = b.art_id 
    WHERE a.id IS NULL
  );
")
echo "$DATA_ERRORS" | tr '|' ' '

# Database Performance Issues
echo ""
echo "DB PERFORMANCE:"
DB_ISSUES=$(PGPASSWORD='6kEtvU9n0KhTVr5' $PSQL_CMD -c "
SELECT 
  'Active_Queries|' || (SELECT COUNT(*) FROM pg_stat_activity WHERE state = 'active' AND query != '<IDLE>') ||
  '|Slow_Queries|' || (SELECT COUNT(*) FROM pg_stat_activity WHERE state = 'active' AND NOW() - query_start > INTERVAL '10 seconds') ||
  '|Blocked_Queries|' || (SELECT COUNT(*) FROM pg_locks WHERE NOT granted)
")
echo "$DB_ISSUES" | tr '|' ' '

# Performance Check - Key Query Times
echo ""
echo "PERFORMANCE CHECK:"
echo -n "Event_Query_Time_ms: "
EVENT_PERF=$(PGPASSWORD='6kEtvU9n0KhTVr5' psql -h db.xsqdkubgyqwpyvfltnrf.supabase.co -p 5432 -d postgres -U postgres -c "
EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) 
SELECT COUNT(*) FROM art WHERE event_id = 'e6e74b4c-8b9d-4abe-be66-e610602980b3';
" 2>/dev/null | grep -o '"Execution Time":[0-9.]*' | cut -d: -f2 || echo "0")
echo "$EVENT_PERF"

echo -n "Voting_Query_Time_ms: "
VOTE_PERF=$(PGPASSWORD='6kEtvU9n0KhTVr5' psql -h db.xsqdkubgyqwpyvfltnrf.supabase.co -p 5432 -d postgres -U postgres -c "
EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
SELECT COUNT(*) FROM votes WHERE event_id = 'e6e74b4c-8b9d-4abe-be66-e610602980b3';
" 2>/dev/null | grep -o '"Execution Time":[0-9.]*' | cut -d: -f2 || echo "0")
echo "$VOTE_PERF"

echo ""
echo "========================================"
echo "Report generated: $TIMESTAMP"
echo "========================================"

# Optional: Append to log file with timestamp
echo "$TIMESTAMP|AB3019|$(echo "$AUTH_METRICS $RECENT_AUTH $EVENT_STATUS $VOTING_METRICS $BIDDING_METRICS $QR_METRICS $PAYMENT_METRICS $ERROR_METRICS" | tr ' ' '_')" >> /tmp/artbattle_health.log 2>/dev/null
#!/bin/bash

# Test bidding directly via Supabase RPC with authentication

AUTH_TOKEN="eyJhbGciOiJIUzI1NiIsImtpZCI6IktOUTlNUm5mRGxERWZwUlYiLCJ0eXAiOiJKV1QifQ.eyJpc3MiOiJodHRwczovL3hzcWRrdWJneXF3cHl2Zmx0bnJmLnN1cGFiYXNlLmNvL2F1dGgvdjEiLCJzdWIiOiI4YzNmODczYi04NDMzLTQ5YTMtYTQ0OC1hYjFiODFhYTYwOWYiLCJhdWQiOiJhdXRoZW50aWNhdGVkIiwiZXhwIjoxNzU0MzMzMTI0LCJpYXQiOjE3NTQzMjk1MjQsImVtYWlsIjoiIiwicGhvbmUiOiIxNDE2MzAyNTk1OSIsImFwcF9tZXRhZGF0YSI6eyJwcm92aWRlciI6InBob25lIiwicHJvdmlkZXJzIjpbInBob25lIl19LCJ1c2VyX21ldGFkYXRhIjp7ImVtYWlsX3ZlcmlmaWVkIjpmYWxzZSwicGVyc29uX2hhc2giOiJqdXA0aXYyZyIsInBlcnNvbl9pZCI6IjQ3M2ZiOGQ2LTE2N2YtNDEzNC1iMzdjLWU1ZDY1ODI5ZjA0NyIsInBlcnNvbl9uYW1lIjoiU2ltb24gUGxhc2hrZXMiLCJwaG9uZV92ZXJpZmllZCI6ZmFsc2UsInN1YiI6IjhjM2Y4NzNiLTg0MzMtNDlhMy1hNDQ4LWFiMWI4MWFhNjA5ZiJ9LCJyb2xlIjoiYXV0aGVudGljYXRlZCIsImFhbCI6ImFhbDEiLCJhbXIiOlt7Im1ldGhvZCI6Im90cCIsInRpbWVzdGFtcCI6MTc1NDExNzI2NH1dLCJzZXNzaW9uX2lkIjoiZmFhNmU1M2EtOGE0Mi00YmRiLTgzNjYtYmYxNTc2ZDUxNmExIiwiaXNfYW5vbnltb3VzIjpmYWxzZX0.uoMcTTtPYmWKss-Rhx2etff2eQhn2Xw0-FL_gcdh6d0"

# Supabase URL and anon key
SUPABASE_URL="https://xsqdkubgyqwpyvfltnrf.supabase.co"
ANON_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhzcWRrdWJneXF3cHl2Zmx0bnJmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTM0MjE2OTYsImV4cCI6MjA2ODk5NzY5Nn0.hY8v8IDZQTcdAFa_OvQNFd1CyvabGcOZZMn_J6c4c2U"

echo "Testing process_bid_secure with authentication..."
echo "Art ID: AB3032-1-3"
echo "Bid Amount: 100"
echo ""

# Call process_bid_secure
RESPONSE=$(curl -s -X POST \
  "${SUPABASE_URL}/rest/v1/rpc/process_bid_secure" \
  -H "apikey: ${ANON_KEY}" \
  -H "Authorization: Bearer ${AUTH_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "p_art_id": "AB3032-1-3",
    "p_amount": 100
  }')

echo "Response:"
echo "$RESPONSE" | jq .

# Check if bid was successful
if echo "$RESPONSE" | jq -e '.success == true' > /dev/null; then
  echo ""
  echo "✓ Bid placed successfully!"
  
  # Check message queue for SMS
  echo ""
  echo "Checking message queue for SMS notifications..."
  sleep 2
  
  MESSAGES=$(PGPASSWORD='6kEtvU9n0KhTVr5' psql -h db.xsqdkubgyqwpyvfltnrf.supabase.co -p 5432 -d postgres -U postgres -t -c "SELECT destination, message_body, status FROM message_queue WHERE created_at > NOW() - INTERVAL '1 minute' ORDER BY created_at DESC LIMIT 3;")
  
  echo "Recent messages:"
  echo "$MESSAGES"
else
  echo ""
  echo "✗ Bid failed"
fi
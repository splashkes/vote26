#!/bin/bash

echo "🔍 Testing admin-security-monitor function..."

# Get JWT token
JWT_OUTPUT=$(cd /root/vote_app/vote26/art-battle-admin && ./get_jwt.sh 2>/dev/null | grep "JWT Token:" | cut -d' ' -f3)

if [ -z "$JWT_OUTPUT" ]; then
  echo "❌ Failed to get JWT token"
  exit 1
fi

echo "✅ Got JWT token"

# Test the function
echo ""
echo "📡 Calling admin-security-monitor function..."

RESPONSE=$(curl -s -X POST "https://xsqdkubgyqwpyvfltnrf.supabase.co/functions/v1/admin-security-monitor" \
  -H "Authorization: Bearer $JWT_OUTPUT" \
  -H "apikey: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhzcWRrdWJneXF3cHl2Zmx0bnJmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTM0MjE2OTYsImV4cCI6MjA2ODk5NzY5Nn0.hY8v8IDZQTcdAFa_OvQNFd1CyvabGcOZZMn_J6c4c2U" \
  -H "Content-Type: application/json")

echo "📋 Response:"
echo "$RESPONSE" | jq .

# Check if successful and show summary
SUCCESS=$(echo "$RESPONSE" | jq -r '.success // false')
if [ "$SUCCESS" = "true" ]; then
  echo ""
  echo "✅ Function executed successfully!"
  
  TOTAL_ISSUES=$(echo "$RESPONSE" | jq -r '.summary.total_issues // 0')
  CRITICAL=$(echo "$RESPONSE" | jq -r '.summary.critical_issues // 0')
  HIGH=$(echo "$RESPONSE" | jq -r '.summary.high_issues // 0')
  
  echo "📊 Quick Summary:"
  echo "   Total Issues: $TOTAL_ISSUES"
  echo "   🚨 Critical: $CRITICAL"
  echo "   ⚠️  High: $HIGH"
  
  if [ "$CRITICAL" -gt "0" ] || [ "$HIGH" -gt "0" ]; then
    echo ""
    echo "⚠️  WARNING: Critical or high severity issues found!"
  else
    echo ""
    echo "✅ No critical issues detected"
  fi
else
  echo ""
  echo "❌ Function failed or returned error"
fi
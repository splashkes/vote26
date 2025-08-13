#!/bin/bash

# Script to get JWT token for testing admin functions
SUPABASE_URL="https://xsqdkubgyqwpyvfltnrf.supabase.co"
ANON_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhzcWRrdWJneXF3cHl2Zmx0bnJmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTM0MjE2OTYsImV4cCI6MjA2ODk5NzY5Nn0.hY8v8IDZQTcdAFa_OvQNFd1CyvabGcOZZMn_J6c4c2U"
EMAIL="login@artbattle.com"
PASSWORD="sokkij-xyvQy4-rakgex"

echo "Getting JWT token..."

RESPONSE=$(curl -s -X POST "${SUPABASE_URL}/auth/v1/token?grant_type=password" \
  -H "apikey: ${ANON_KEY}" \
  -H "Content-Type: application/json" \
  -d "{\"email\": \"${EMAIL}\", \"password\": \"${PASSWORD}\"}")

echo "Response: $RESPONSE"

# Extract access_token if successful
JWT=$(echo $RESPONSE | grep -o '"access_token":"[^"]*' | cut -d'"' -f4)

if [ -z "$JWT" ]; then
  echo "Failed to get JWT token"
  exit 1
else
  echo "JWT Token: $JWT"
  
  # Test the admin-artist-workflow function
  echo ""
  echo "Testing admin-artist-workflow function with AB2900..."
  curl -X POST "${SUPABASE_URL}/functions/v1/admin-artist-workflow" \
    -H "Authorization: Bearer ${JWT}" \
    -H "apikey: ${ANON_KEY}" \
    -H "Content-Type: application/json" \
    -d '{"eventEid": "AB2900"}'
fi
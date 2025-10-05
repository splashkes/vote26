#!/bin/bash
# Test script to explore Meta API fields and response structure

# Get token from Supabase secrets
cd /root/vote_app/vote26/supabase
TOKEN=$(supabase secrets get META_ACCESS_TOKEN 2>&1 | grep -v "Usage:" | grep -v "supabase" | grep -v "Available" | grep -v "list" | grep -v "set" | grep -v "unset" | grep -v "Flags" | grep -v "Global" | tail -1)

if [ -z "$TOKEN" ]; then
  echo "ERROR: Could not retrieve META_ACCESS_TOKEN"
  exit 1
fi

ACCOUNT_ID="act_10154340035865743"  # USD account with AB3065 data

echo "========================================="
echo "1. Testing available fields on adsets"
echo "========================================="

# Query metadata endpoint to see available fields
curl -s "https://graph.facebook.com/v23.0/$ACCOUNT_ID/adsets" \
  -G \
  -d "access_token=$TOKEN" \
  -d "metadata=1" \
  -d "limit=1" | jq '{type, fields: .fields | keys}'

echo ""
echo "========================================="
echo "2. Getting actual adset with insights"
echo "========================================="

# Get one adset for AB3065 with full insights
curl -s "https://graph.facebook.com/v23.0/$ACCOUNT_ID/adsets" \
  -G \
  -d "access_token=$TOKEN" \
  -d "fields=id,name,insights{spend,impressions,reach,clicks,actions,action_values,purchase_roas,cost_per_action_type}" \
  -d "filtering=[{\"field\":\"campaign.name\",\"operator\":\"CONTAIN\",\"value\":\"AB3065\"}]" \
  -d "limit=1" | jq '.'

echo ""
echo "========================================="
echo "3. Checking insights fields metadata"
echo "========================================="

# Check what fields are available on insights
curl -s "https://graph.facebook.com/v23.0/insights" \
  -G \
  -d "access_token=$TOKEN" \
  -d "metadata=1" | jq '{fields: .fields | keys}' 2>/dev/null || echo "Metadata not available on insights"

echo ""
echo "========================================="
echo "4. Testing action types available"
echo "========================================="

# Get full action breakdown
curl -s "https://graph.facebook.com/v23.0/$ACCOUNT_ID/adsets" \
  -G \
  -d "access_token=$TOKEN" \
  -d "fields=insights.action_breakdowns(action_type){actions,action_values}" \
  -d "filtering=[{\"field\":\"campaign.name\",\"operator\":\"CONTAIN\",\"value\":\"AB3065\"}]" \
  -d "limit=1" | jq '.data[0].insights.data[0] | {actions: .actions, action_values: .action_values}'

echo ""
echo "========================================="
echo "5. Full insights response for AB3065"
echo "========================================="

# Get complete insights with all conversion-related fields
curl -s "https://graph.facebook.com/v23.0/$ACCOUNT_ID/adsets" \
  -G \
  -d "access_token=$TOKEN" \
  -d "fields=id,name,lifetime_budget,budget_remaining,insights{spend,impressions,reach,clicks,actions,action_values,conversions,conversion_values,purchase_roas,website_purchase_roas,cost_per_action_type,cost_per_conversion}" \
  -d "filtering=[{\"field\":\"campaign.name\",\"operator\":\"CONTAIN\",\"value\":\"AB3065\"}]" \
  -d "limit=2" | jq '.'

echo ""
echo "Done!"

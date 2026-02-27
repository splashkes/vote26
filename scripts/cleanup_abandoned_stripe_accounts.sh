#!/bin/bash
# Cleanup Abandoned Stripe Accounts Script
# This script identifies and optionally deletes abandoned Stripe accounts
# that haven't completed onboarding after 7 days

set -e

# Database connection
DB_HOST="db.xsqdkubgyqwpyvfltnrf.supabase.co"
DB_PORT="5432"
DB_NAME="postgres"
DB_USER="postgres"
export PGPASSWORD='6kEtvU9n0KhTVr5'

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Default: dry run
DRY_RUN=true
DAYS_THRESHOLD=7

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --execute)
      DRY_RUN=false
      shift
      ;;
    --days)
      DAYS_THRESHOLD="$2"
      shift
      shift
      ;;
    --help)
      echo "Usage: $0 [OPTIONS]"
      echo ""
      echo "Options:"
      echo "  --execute       Actually delete accounts (default: dry run)"
      echo "  --days N        Delete accounts older than N days (default: 7)"
      echo "  --help          Show this help message"
      echo ""
      echo "Examples:"
      echo "  $0                    # Dry run with 7 days threshold"
      echo "  $0 --days 14          # Dry run with 14 days threshold"
      echo "  $0 --execute          # Actually delete accounts older than 7 days"
      echo "  $0 --execute --days 30 # Delete accounts older than 30 days"
      exit 0
      ;;
    *)
      echo "Unknown option: $1"
      echo "Use --help for usage information"
      exit 1
      ;;
  esac
done

echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}  Stripe Abandoned Accounts Cleanup Script${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
echo ""
echo -e "Mode: ${YELLOW}$([ "$DRY_RUN" = true ] && echo "DRY RUN (no changes)" || echo "EXECUTE (will delete accounts)")${NC}"
echo -e "Days Threshold: ${YELLOW}${DAYS_THRESHOLD}${NC} days"
echo ""

# Query for abandoned accounts
QUERY=$(cat <<EOF
WITH abandoned_accounts AS (
  SELECT
    agp.id,
    agp.artist_profile_id,
    agp.stripe_recipient_id,
    agp.status,
    agp.country,
    agp.default_currency,
    agp.created_at,
    agp.updated_at,
    agp.metadata,
    EXTRACT(DAY FROM NOW() - agp.created_at) as days_since_created,
    CASE
      WHEN agp.metadata->>'last_webhook_update' IS NOT NULL THEN
        EXTRACT(DAY FROM NOW() - (agp.metadata->>'last_webhook_update')::timestamp)
      ELSE
        EXTRACT(DAY FROM NOW() - agp.updated_at)
    END as days_since_last_activity,
    (agp.metadata->'stripe_account_data'->>'charges_enabled')::boolean as charges_enabled,
    (agp.metadata->'stripe_account_data'->>'payouts_enabled')::boolean as payouts_enabled,
    (agp.metadata->'stripe_account_data'->>'details_submitted')::boolean as details_submitted
  FROM artist_global_payments agp
  WHERE
    agp.status IN ('invited', 'blocked')
    AND agp.created_at < NOW() - INTERVAL '${DAYS_THRESHOLD} days'
    AND (
      agp.metadata->>'onboarding_completed' IS NULL
      OR (agp.metadata->>'onboarding_completed')::boolean = false
    )
)
SELECT
  aa.id,
  aa.stripe_recipient_id,
  ap.name as artist_name,
  ap.email,
  aa.status,
  aa.country,
  aa.default_currency,
  ROUND(aa.days_since_created::numeric, 0) as days_since_created,
  ROUND(aa.days_since_last_activity::numeric, 0) as days_since_activity,
  CASE WHEN aa.charges_enabled THEN 'YES' ELSE 'NO' END as charges_enabled,
  CASE WHEN aa.payouts_enabled THEN 'YES' ELSE 'NO' END as payouts_enabled,
  CASE WHEN aa.details_submitted THEN 'YES' ELSE 'NO' END as details_submitted
FROM abandoned_accounts aa
JOIN artist_profiles ap ON aa.artist_profile_id = ap.id
ORDER BY aa.days_since_created DESC;
EOF
)

# Get the list of accounts
echo -e "${BLUE}Finding abandoned accounts...${NC}"
echo ""

ACCOUNTS=$(psql -h "$DB_HOST" -p "$DB_PORT" -d "$DB_NAME" -U "$DB_USER" -t -A -F'|' -c "$QUERY")

if [ -z "$ACCOUNTS" ]; then
  echo -e "${GREEN}✓ No abandoned accounts found!${NC}"
  exit 0
fi

# Count accounts
TOTAL_COUNT=$(echo "$ACCOUNTS" | wc -l)

echo -e "${YELLOW}Found ${TOTAL_COUNT} abandoned accounts:${NC}"
echo ""
echo "ID | Stripe Account | Artist Name | Email | Status | Days Old | Days Since Activity | Charges | Payouts"
echo "---|----------------|-------------|-------|--------|----------|---------------------|---------|--------"

while IFS='|' read -r id stripe_id name email status country currency days_created days_activity charges payouts details; do
  # Color code by status
  if [ "$status" = "blocked" ]; then
    STATUS_COLOR=$RED
  else
    STATUS_COLOR=$YELLOW
  fi

  echo -e "${id:0:8}... | ${stripe_id} | ${name:0:20} | ${email:0:25} | ${STATUS_COLOR}${status}${NC} | ${days_created} days | ${days_activity} days | ${charges} | ${payouts}"
done <<< "$ACCOUNTS"

echo ""
echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
echo -e "${YELLOW}Summary:${NC}"
echo -e "  Total accounts to delete: ${RED}${TOTAL_COUNT}${NC}"
echo ""

# Get statistics
STATS_QUERY=$(cat <<EOF
WITH abandoned_accounts AS (
  SELECT
    agp.status,
    EXTRACT(DAY FROM NOW() - agp.created_at) as days_since_created,
    (agp.metadata->'stripe_account_data'->>'charges_enabled')::boolean as charges_enabled
  FROM artist_global_payments agp
  WHERE
    agp.status IN ('invited', 'blocked')
    AND agp.created_at < NOW() - INTERVAL '${DAYS_THRESHOLD} days'
    AND (
      agp.metadata->>'onboarding_completed' IS NULL
      OR (agp.metadata->>'onboarding_completed')::boolean = false
    )
)
SELECT
  COUNT(CASE WHEN status = 'invited' THEN 1 END) as invited,
  COUNT(CASE WHEN status = 'blocked' THEN 1 END) as blocked,
  COUNT(CASE WHEN charges_enabled THEN 1 END) as has_charges,
  ROUND(AVG(days_since_created)::numeric, 1) as avg_days
FROM abandoned_accounts;
EOF
)

STATS=$(psql -h "$DB_HOST" -p "$DB_PORT" -d "$DB_NAME" -U "$DB_USER" -t -A -F'|' -c "$STATS_QUERY")
IFS='|' read -r invited blocked has_charges avg_days <<< "$STATS"

echo -e "  - Invited: ${YELLOW}${invited}${NC}"
echo -e "  - Blocked: ${RED}${blocked}${NC}"
echo -e "  - Has charge capability: ${has_charges}"
echo -e "  - Average age: ${avg_days} days"
echo ""

if [ "$DRY_RUN" = true ]; then
  echo -e "${GREEN}═══════════════════════════════════════════════════════════════${NC}"
  echo -e "${GREEN}DRY RUN COMPLETE - No changes made${NC}"
  echo -e "${GREEN}═══════════════════════════════════════════════════════════════${NC}"
  echo ""
  echo "To actually delete these accounts, run:"
  echo -e "${YELLOW}  $0 --execute --days ${DAYS_THRESHOLD}${NC}"
else
  echo -e "${RED}═══════════════════════════════════════════════════════════════${NC}"
  echo -e "${RED}WARNING: This will DELETE ${TOTAL_COUNT} Stripe accounts!${NC}"
  echo -e "${RED}═══════════════════════════════════════════════════════════════${NC}"
  echo ""
  echo -e "This action will:"
  echo -e "  1. Delete accounts from ${RED}Stripe API${NC} (stops reminder emails)"
  echo -e "  2. Delete records from ${RED}artist_global_payments${NC} table"
  echo ""
  read -p "Are you sure you want to continue? Type 'DELETE' to confirm: " confirmation

  if [ "$confirmation" != "DELETE" ]; then
    echo -e "${YELLOW}Cancelled. No changes made.${NC}"
    exit 0
  fi

  echo ""
  echo -e "${BLUE}Deleting accounts via Supabase Edge Function...${NC}"
  echo ""

  # Get service role key
  SERVICE_KEY=$(grep SUPABASE_SERVICE_ROLE_KEY /root/vote_app/vote26/.env | cut -d'=' -f2)
  if [ -z "$SERVICE_KEY" ]; then
    echo -e "${RED}ERROR: SUPABASE_SERVICE_ROLE_KEY not found in .env file${NC}"
    exit 1
  fi

  # Collect account IDs
  ACCOUNT_IDS=$(psql -h "$DB_HOST" -p "$DB_PORT" -d "$DB_NAME" -U "$DB_USER" -t -A -c "
    SELECT agp.id
    FROM artist_global_payments agp
    WHERE
      agp.status IN ('invited', 'blocked')
      AND agp.created_at < NOW() - INTERVAL '${DAYS_THRESHOLD} days'
      AND (
        agp.metadata->>'onboarding_completed' IS NULL
        OR (agp.metadata->>'onboarding_completed')::boolean = false
      )
  ")

  # Convert to JSON array
  JSON_IDS=$(echo "$ACCOUNT_IDS" | jq -R -s -c 'split("\n") | map(select(length > 0))')

  # Call Edge Function
  RESPONSE=$(curl -s -X POST \
    'https://xsqdkubgyqwpyvfltnrf.supabase.co/functions/v1/admin-delete-abandoned-accounts' \
    -H "Authorization: Bearer ${SERVICE_KEY}" \
    -H "Content-Type: application/json" \
    -d "{\"account_ids\": ${JSON_IDS}, \"dry_run\": false}")

  # Parse response
  SUCCESS=$(echo "$RESPONSE" | jq -r '.success')

  if [ "$SUCCESS" = "true" ]; then
    DELETED=$(echo "$RESPONSE" | jq -r '.summary.successful')
    FAILED=$(echo "$RESPONSE" | jq -r '.summary.failed')
    STRIPE_DEL=$(echo "$RESPONSE" | jq -r '.summary.stripe_deleted')
    DB_DEL=$(echo "$RESPONSE" | jq -r '.summary.db_deleted')

    echo -e "${GREEN}✓ Deletion complete!${NC}"
    echo ""
    echo "Results:"
    echo -e "  - Successfully deleted: ${GREEN}${DELETED}${NC}"
    echo -e "  - Failed: ${RED}${FAILED}${NC}"
    echo -e "  - Deleted from Stripe: ${STRIPE_DEL}"
    echo -e "  - Deleted from database: ${DB_DEL}"

    # Show any failures
    if [ "$FAILED" -gt 0 ]; then
      echo ""
      echo -e "${YELLOW}Failed deletions:${NC}"
      echo "$RESPONSE" | jq -r '.results[] | select(.success == false) | "  - \(.artist_name): \(.error)"'
    fi
  else
    echo -e "${RED}✗ Deletion failed!${NC}"
    echo ""
    ERROR=$(echo "$RESPONSE" | jq -r '.error')
    echo "Error: $ERROR"
    echo ""
    echo "Full response:"
    echo "$RESPONSE" | jq '.'
    exit 1
  fi
fi

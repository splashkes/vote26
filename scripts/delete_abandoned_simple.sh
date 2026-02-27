#!/bin/bash
# Simple Abandoned Account Deletion
# Deletes from Stripe API then database
# NO CASCADE DELETES - errors will be reported

set +e  # Don't exit on error, report them instead

# Database connection
DB_HOST="db.xsqdkubgyqwpyvfltnrf.supabase.co"
DB_PORT="5432"
DB_NAME="postgres"
DB_USER="postgres"
export PGPASSWORD='6kEtvU9n0KhTVr5'

echo "========================================="
echo "ABANDONED ACCOUNTS DELETION"
echo "========================================="
echo ""

# Get list of accounts to delete
echo "Fetching accounts older than 7 days..."
echo ""

ACCOUNTS=$(PGPASSWORD='6kEtvU9n0KhTVr5' psql -h "$DB_HOST" -p "$DB_PORT" -d "$DB_NAME" -U "$DB_USER" -t -A -F'|' -c "
SELECT
  agp.id,
  agp.stripe_recipient_id,
  agp.country,
  ap.name,
  ap.email
FROM artist_global_payments agp
JOIN artist_profiles ap ON agp.artist_profile_id = ap.id
WHERE
  agp.status IN ('invited', 'blocked')
  AND agp.created_at < NOW() - INTERVAL '7 days'
  AND (
    agp.metadata->>'onboarding_completed' IS NULL
    OR (agp.metadata->>'onboarding_completed')::boolean = false
  )
ORDER BY agp.created_at DESC
")

if [ -z "$ACCOUNTS" ]; then
  echo "No abandoned accounts found!"
  exit 0
fi

TOTAL=$(echo "$ACCOUNTS" | wc -l)
echo "Found $TOTAL accounts to delete"
echo ""
echo "ID | Stripe Account | Country | Name | Email"
echo "---|----------------|---------|------|------"
echo "$ACCOUNTS" | while IFS='|' read -r id stripe_id country name email; do
  echo "${id:0:8}... | ${stripe_id} | ${country} | ${name:0:20} | ${email:0:30}"
done

echo ""
read -p "Delete these $TOTAL accounts? Type 'YES' to confirm: " confirm

if [ "$confirm" != "YES" ]; then
  echo "Cancelled."
  exit 0
fi

echo ""
echo "========================================="
echo "STEP 1: DELETE FROM STRIPE API"
echo "========================================="

# Stripe API keys
STRIPE_CA_KEY="${stripe_canada_secret_key}"
STRIPE_INTL_KEY="${stripe_intl_secret_key}"

STRIPE_SUCCESS=0
STRIPE_FAIL=0
STRIPE_SKIP=0

echo "$ACCOUNTS" | while IFS='|' read -r id stripe_id country name email; do
  if [ -z "$stripe_id" ]; then
    echo "⚠ SKIP (no Stripe ID): $name"
    STRIPE_SKIP=$((STRIPE_SKIP + 1))
    continue
  fi

  # Select correct API key
  if [ "$country" = "CA" ]; then
    API_KEY="$STRIPE_CA_KEY"
  else
    API_KEY="$STRIPE_INTL_KEY"
  fi

  # Delete from Stripe
  RESPONSE=$(curl -s -w "\n%{http_code}" -X DELETE \
    "https://api.stripe.com/v1/accounts/${stripe_id}" \
    -u "${API_KEY}:")

  HTTP_CODE=$(echo "$RESPONSE" | tail -n1)

  if [ "$HTTP_CODE" = "200" ]; then
    echo "✓ Deleted: $stripe_id ($name)"
    STRIPE_SUCCESS=$((STRIPE_SUCCESS + 1))
  elif [ "$HTTP_CODE" = "404" ]; then
    echo "⚠ Already deleted: $stripe_id ($name)"
    STRIPE_SUCCESS=$((STRIPE_SUCCESS + 1))
  else
    echo "✗ FAILED: $stripe_id ($name) - HTTP $HTTP_CODE"
    ERROR=$(echo "$RESPONSE" | head -n-1 | grep -o '"message":"[^"]*"' | cut -d'"' -f4)
    echo "  Error: $ERROR"
    STRIPE_FAIL=$((STRIPE_FAIL + 1))
  fi
done

echo ""
echo "Stripe deletion summary:"
echo "  Success: $STRIPE_SUCCESS"
echo "  Failed: $STRIPE_FAIL"
echo "  Skipped: $STRIPE_SKIP"
echo ""

echo "========================================="
echo "STEP 2: DELETE FROM DATABASE"
echo "========================================="

# Delete from database (NO CASCADE)
DELETE_RESULT=$(PGPASSWORD='6kEtvU9n0KhTVr5' psql -h "$DB_HOST" -p "$DB_PORT" -d "$DB_NAME" -U "$DB_USER" -c "
DELETE FROM artist_global_payments
WHERE id IN (
  SELECT agp.id
  FROM artist_global_payments agp
  WHERE
    agp.status IN ('invited', 'blocked')
    AND agp.created_at < NOW() - INTERVAL '7 days'
    AND (
      agp.metadata->>'onboarding_completed' IS NULL
      OR (agp.metadata->>'onboarding_completed')::boolean = false
    )
)
" 2>&1)

if echo "$DELETE_RESULT" | grep -q "DELETE"; then
  DB_COUNT=$(echo "$DELETE_RESULT" | grep -o "DELETE [0-9]*" | grep -o "[0-9]*")
  echo "✓ Deleted $DB_COUNT records from database"
else
  echo "✗ Database deletion FAILED:"
  echo "$DELETE_RESULT"
fi

echo ""
echo "========================================="
echo "COMPLETE"
echo "========================================="

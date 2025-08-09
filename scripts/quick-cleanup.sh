#!/bin/bash

# ============================================================================
# Quick Event Cleanup Script
# ============================================================================
# Interactive script to safely clean event test data
# 
# Usage: ./quick-cleanup.sh
# 
# This script will:
# 1. Ask for event EID
# 2. Show what will be deleted
# 3. Confirm before proceeding
# 4. Execute cleanup
# 5. Verify results
# ============================================================================

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Database connection
DB_HOST="db.xsqdkubgyqwpyvfltnrf.supabase.co"
DB_PORT="5432"
DB_NAME="postgres"
DB_USER="postgres"
DB_PASSWORD="${PGPASSWORD:-6kEtvU9n0KhTVr5}"

echo -e "${BLUE}============================================================================${NC}"
echo -e "${BLUE}             ART BATTLE EVENT TEST DATA CLEANUP${NC}"
echo -e "${BLUE}============================================================================${NC}"
echo ""

# Get event EID from user
echo -e "${YELLOW}Enter the Event EID to clean (e.g., AB2900):${NC}"
read -r EVENT_EID

if [[ -z "$EVENT_EID" ]]; then
    echo -e "${RED}Error: Event EID is required!${NC}"
    exit 1
fi

echo ""
echo -e "${BLUE}Checking event: $EVENT_EID${NC}"

# Verify event exists and get details
EVENT_INFO=$(PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -d "$DB_NAME" -U "$DB_USER" -t -c "
SELECT 
  id || '|' || name || '|' || event_start_datetime || '|' || 
  CASE WHEN event_start_datetime > NOW() THEN 'SAFE' ELSE 'WARNING' END
FROM events 
WHERE eid = '$EVENT_EID';
" 2>/dev/null)

if [[ -z "$EVENT_INFO" ]]; then
    echo -e "${RED}Error: Event '$EVENT_EID' not found!${NC}"
    exit 1
fi

IFS='|' read -r EVENT_UUID EVENT_NAME EVENT_START SAFETY_STATUS <<< "$EVENT_INFO"

echo -e "${GREEN}Found event:${NC}"
echo -e "  Name: $EVENT_NAME"
echo -e "  Start: $EVENT_START"
echo -e "  Status: $SAFETY_STATUS"
echo ""

if [[ "$SAFETY_STATUS" == "WARNING" ]]; then
    echo -e "${RED}⚠️  WARNING: This event has already started or is in the past!${NC}"
    echo -e "${YELLOW}Are you ABSOLUTELY sure you want to proceed? (yes/no):${NC}"
    read -r CONFIRM_DANGER
    if [[ "$CONFIRM_DANGER" != "yes" ]]; then
        echo -e "${YELLOW}Cleanup cancelled for safety.${NC}"
        exit 1
    fi
fi

# Show what will be deleted
echo -e "${BLUE}Scanning for test data to clean...${NC}"

TEST_DATA=$(PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -d "$DB_NAME" -U "$DB_USER" -t -c "
-- Count payments
SELECT 'PAYMENTS|' || COUNT(*)
FROM payment_processing pp
JOIN art a ON pp.art_id = a.id
WHERE a.event_id = '$EVENT_UUID'

UNION ALL

-- Count bids  
SELECT 'BIDS|' || COUNT(*)
FROM bids b
JOIN art a ON b.art_id = a.id
WHERE a.event_id = '$EVENT_UUID'

UNION ALL

-- Count votes
SELECT 'VOTES|' || COUNT(*)
FROM votes v
WHERE v.event_id = '$EVENT_UUID'

UNION ALL

-- Count media
SELECT 'MEDIA|' || COUNT(*)
FROM art_media am
JOIN art a ON am.art_id = a.id
WHERE a.event_id = '$EVENT_UUID';
")

echo ""
echo -e "${YELLOW}TEST DATA FOUND:${NC}"
echo "$TEST_DATA" | while IFS='|' read -r TYPE COUNT; do
    if [[ "$COUNT" -gt 0 ]]; then
        echo -e "  ${RED}$TYPE: $COUNT records${NC}"
    else
        echo -e "  ${GREEN}$TYPE: $COUNT records${NC}"
    fi
done

echo ""
echo -e "${YELLOW}This will DELETE ALL test data for event $EVENT_EID${NC}"
echo -e "${YELLOW}Are you sure you want to proceed? (yes/no):${NC}"
read -r CONFIRM

if [[ "$CONFIRM" != "yes" ]]; then
    echo -e "${YELLOW}Cleanup cancelled.${NC}"
    exit 0
fi

echo ""
echo -e "${BLUE}Starting cleanup...${NC}"

# Execute cleanup
PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -d "$DB_NAME" -U "$DB_USER" -c "
BEGIN;

-- 1. Remove payment processing records
DELETE FROM payment_processing 
WHERE art_id IN (SELECT id FROM art WHERE event_id = '$EVENT_UUID');

-- 2. Remove bids
DELETE FROM bids 
WHERE art_id IN (SELECT id FROM art WHERE event_id = '$EVENT_UUID');

-- 3. Remove votes
DELETE FROM votes 
WHERE event_id = '$EVENT_UUID';

-- 4. Remove art_media connections
DELETE FROM art_media 
WHERE art_id IN (SELECT id FROM art WHERE event_id = '$EVENT_UUID');

-- 5. Reset artwork statuses and bids
UPDATE art 
SET 
  status = 'active',
  current_bid = 0
WHERE event_id = '$EVENT_UUID';

COMMIT;

SELECT 'CLEANUP COMPLETED SUCCESSFULLY' as result;
"

if [[ $? -eq 0 ]]; then
    echo -e "${GREEN}✅ Cleanup completed successfully!${NC}"
else
    echo -e "${RED}❌ Cleanup failed!${NC}"
    exit 1
fi

echo ""
echo -e "${BLUE}Verifying results...${NC}"

# Verify cleanup
VERIFICATION=$(PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -d "$DB_NAME" -U "$DB_USER" -t -c "
SELECT 
  COUNT(*) || '|' || 
  SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) || '|' ||
  SUM(current_bid)
FROM art 
WHERE event_id = '$EVENT_UUID';
")

IFS='|' read -r TOTAL_ARTWORKS ACTIVE_ARTWORKS TOTAL_BIDS <<< "$VERIFICATION"

echo -e "${GREEN}VERIFICATION RESULTS:${NC}"
echo -e "  Total artworks: $TOTAL_ARTWORKS"
echo -e "  Active artworks: $ACTIVE_ARTWORKS"
echo -e "  Total current bids: $TOTAL_BIDS"

if [[ "$TOTAL_ARTWORKS" == "$ACTIVE_ARTWORKS" && "$TOTAL_BIDS" == "0.00" ]]; then
    echo ""
    echo -e "${GREEN}🎉 SUCCESS: Event $EVENT_EID is clean and ready for live use!${NC}"
else
    echo ""
    echo -e "${RED}⚠️  WARNING: Some issues remain. Please check manually.${NC}"
fi

echo ""
echo -e "${BLUE}============================================================================${NC}"
echo -e "${BLUE}                            CLEANUP COMPLETE${NC}" 
echo -e "${BLUE}============================================================================${NC}"
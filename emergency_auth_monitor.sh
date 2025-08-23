#!/bin/bash

# Emergency Auth Monitor - Auto-fixes unlinked users during event
# Run this during the live event to prevent auth failures

PGPASSWORD='6kEtvU9n0KhTVr5'
PSQL_CMD="psql -h db.xsqdkubgyqwpyvfltnrf.supabase.co -p 5432 -d postgres -U postgres -t -A"

echo "=== EMERGENCY AUTH MONITOR STARTED ==="
echo "Timestamp: $(date)"
echo "Monitoring for unlinked users every 1 second..."

while true; do
  # Check for unlinked users
  UNLINKED=$(PGPASSWORD='6kEtvU9n0KhTVr5' $PSQL_CMD -c "
    SELECT COUNT(*) 
    FROM auth.users au
    LEFT JOIN people p ON p.auth_user_id = au.id
    WHERE au.phone_confirmed_at IS NOT NULL AND p.id IS NULL;
  ")
  
  MISSING_METADATA=$(PGPASSWORD='6kEtvU9n0KhTVr5' $PSQL_CMD -c "
    SELECT COUNT(*) 
    FROM auth.users 
    WHERE phone_confirmed_at IS NOT NULL 
    AND raw_user_meta_data->>'person_id' IS NULL;
  ")
  
  # Check for unverified users (causing loading loops)
  UNVERIFIED=$(PGPASSWORD='6kEtvU9n0KhTVr5' $PSQL_CMD -c "
    SELECT COUNT(*) 
    FROM people p
    JOIN auth.users au ON p.auth_user_id = au.id
    WHERE au.phone_confirmed_at IS NOT NULL 
    AND p.verified = false;
  ")
  
  if [[ $UNLINKED -gt 0 ]] || [[ $MISSING_METADATA -gt 0 ]] || [[ $UNVERIFIED -gt 0 ]]; then
    echo "$(date): ALERT - Found $UNLINKED unlinked users, $MISSING_METADATA missing metadata, $UNVERIFIED unverified users"
    
    # Get phone numbers of unlinked users before fixing
    if [[ $UNLINKED -gt 0 ]]; then
      UNLINKED_PHONES=$(PGPASSWORD='6kEtvU9n0KhTVr5' $PSQL_CMD -c "
        SELECT COALESCE(au.phone, 'no-phone') as phone
        FROM auth.users au
        LEFT JOIN people p ON p.auth_user_id = au.id
        WHERE au.phone_confirmed_at IS NOT NULL AND p.id IS NULL;
      " | tr '\n' ' ')
      echo "$(date): Unlinked user phones: $UNLINKED_PHONES"
    fi
    
    # Get phone numbers of users with missing metadata before fixing
    if [[ $MISSING_METADATA -gt 0 ]]; then
      MISSING_META_PHONES=$(PGPASSWORD='6kEtvU9n0KhTVr5' $PSQL_CMD -c "
        SELECT COALESCE(phone, 'no-phone') as phone
        FROM auth.users 
        WHERE phone_confirmed_at IS NOT NULL 
        AND raw_user_meta_data->>'person_id' IS NULL;
      " | tr '\n' ' ')
      echo "$(date): Missing metadata phones: $MISSING_META_PHONES"
    fi
    
    # Get phone numbers of unverified users before fixing
    if [[ $UNVERIFIED -gt 0 ]]; then
      UNVERIFIED_PHONES=$(PGPASSWORD='6kEtvU9n0KhTVr5' $PSQL_CMD -c "
        SELECT COALESCE(au.phone, 'no-phone') as phone
        FROM people p
        JOIN auth.users au ON p.auth_user_id = au.id
        WHERE au.phone_confirmed_at IS NOT NULL 
        AND p.verified = false;
      " | tr '\n' ' ')
      echo "$(date): Unverified user phones: $UNVERIFIED_PHONES"
    fi
    
    # Run emergency fix
    FIX_RESULT=$(PGPASSWORD='6kEtvU9n0KhTVr5' $PSQL_CMD -c "SELECT * FROM emergency_fix_unlinked_users();" | tr '|' ' ')
    echo "$(date): Fixed unlinked: $FIX_RESULT"
    
    # Fix unverified users
    if [[ $UNVERIFIED -gt 0 ]]; then
      PGPASSWORD='6kEtvU9n0KhTVr5' $PSQL_CMD -c "
        UPDATE people 
        SET verified = true, updated_at = NOW()
        FROM auth.users au 
        WHERE people.auth_user_id = au.id 
        AND au.phone_confirmed_at IS NOT NULL 
        AND people.verified = false;
      " > /dev/null
      echo "$(date): Fixed verified status for $UNVERIFIED users with phones: $UNVERIFIED_PHONES"
    fi
  else
    echo "$(date): All users properly linked and verified ✓"
  fi
  
  sleep 1
done
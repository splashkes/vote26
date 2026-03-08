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
  
  # Check for wrong metadata (person_id points to wrong person - causes voting errors)
  WRONG_METADATA=$(PGPASSWORD='6kEtvU9n0KhTVr5' $PSQL_CMD -c "
    SELECT COUNT(*) 
    FROM auth.users au 
    JOIN people p ON p.auth_user_id = au.id 
    WHERE au.phone_confirmed_at IS NOT NULL 
    AND au.raw_user_meta_data->>'person_id' IS NOT NULL
    AND au.raw_user_meta_data->>'person_id' <> p.id::text;
  ")
  
  # Check for unverified users (causing loading loops)
  UNVERIFIED=$(PGPASSWORD='6kEtvU9n0KhTVr5' $PSQL_CMD -c "
    SELECT COUNT(*) 
    FROM people p
    JOIN auth.users au ON p.auth_user_id = au.id
    WHERE au.phone_confirmed_at IS NOT NULL 
    AND p.verified = false;
  ")
  
  if [[ $UNLINKED -gt 0 ]] || [[ $MISSING_METADATA -gt 0 ]] || [[ $WRONG_METADATA -gt 0 ]] || [[ $UNVERIFIED -gt 0 ]]; then
    echo "$(date): ALERT - Found $UNLINKED unlinked users, $MISSING_METADATA missing metadata, $WRONG_METADATA wrong metadata, $UNVERIFIED unverified users"
    
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
    
    # Get phone numbers of users with wrong metadata before fixing  
    if [[ $WRONG_METADATA -gt 0 ]]; then
      WRONG_META_PHONES=$(PGPASSWORD='6kEtvU9n0KhTVr5' $PSQL_CMD -c "
        SELECT COALESCE(au.phone, 'no-phone') as phone
        FROM auth.users au 
        JOIN people p ON p.auth_user_id = au.id 
        WHERE au.phone_confirmed_at IS NOT NULL 
        AND au.raw_user_meta_data->>'person_id' IS NOT NULL
        AND au.raw_user_meta_data->>'person_id' <> p.id::text;
      " | tr '\n' ' ')
      echo "$(date): Wrong metadata phones: $WRONG_META_PHONES"
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
    
    # Fix wrong metadata (critical for voting) - one user at a time
    if [[ $WRONG_METADATA -gt 0 ]]; then
      # Get each user individually and fix them
      PGPASSWORD='6kEtvU9n0KhTVr5' $PSQL_CMD -c "
        SELECT au.id || '|' || p.id || '|' || au.phone
        FROM auth.users au 
        JOIN people p ON p.auth_user_id = au.id 
        WHERE au.phone_confirmed_at IS NOT NULL 
        AND au.raw_user_meta_data->>'person_id' IS NOT NULL
        AND au.raw_user_meta_data->>'person_id' <> p.id::text;
      " | while IFS='|' read -r auth_id person_id phone; do
        if [[ -n "$auth_id" && -n "$person_id" ]]; then
          PGPASSWORD='6kEtvU9n0KhTVr5' $PSQL_CMD -c "
            UPDATE auth.users 
            SET raw_user_meta_data = COALESCE(raw_user_meta_data, '{}'::jsonb) || jsonb_build_object(
                'person_id', '"$person_id"',
                'person_hash', encode(sha256(('"$person_id"' || COALESCE(phone, ''))::bytea), 'hex'),
                'person_name', 'User'
            )
            WHERE id = '"$auth_id"';
          " > /dev/null
          echo "$(date): Fixed metadata for user $phone ($auth_id -> $person_id)"
        fi
      done
      echo "$(date): Fixed wrong metadata for $WRONG_METADATA users with phones: $WRONG_META_PHONES"
    fi
    
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
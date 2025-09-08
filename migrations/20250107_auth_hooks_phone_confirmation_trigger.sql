-- Auth Hooks Migration: Phone Confirmation Trigger
-- Replaces auth-webhook with native database trigger for person creation
-- Date: 2025-01-07
-- Purpose: Create person records directly in database when phone is confirmed

-- Step 1: Create enhanced phone confirmation handler
CREATE OR REPLACE FUNCTION public.handle_phone_confirmation_v2()
RETURNS TRIGGER
SECURITY DEFINER
LANGUAGE plpgsql
AS $$
DECLARE
  person_record record;
  auth_phone text;
  people_phone text;
  existing_person record;
  person_hash text;
  new_person_id uuid;
BEGIN
  -- Only act on phone confirmation (null -> not null)
  IF OLD.phone_confirmed_at IS NULL AND NEW.phone_confirmed_at IS NOT NULL THEN
    
    -- Log the trigger execution for debugging
    RAISE LOG '[AUTH-V2] Phone confirmation trigger fired for user: %, phone: %', NEW.id, NEW.phone;
    
    -- Normalize phone formats for matching
    auth_phone := NEW.phone;  -- e.g., '13024386309' (from auth.users)
    people_phone := '+' || NEW.phone;  -- e.g., '+13024386309' (for people table)
    
    -- Check if person already linked to this auth user
    SELECT id, name, phone INTO person_record 
    FROM people 
    WHERE auth_user_id = NEW.id;
    
    IF FOUND THEN
      RAISE LOG '[AUTH-V2] User already has linked person record: %', person_record.id;
      RETURN NEW;
    END IF;
    
    -- Try to find existing person by phone with format variations
    SELECT id, name, phone INTO existing_person 
    FROM people 
    WHERE auth_user_id IS NULL 
      AND (
        phone = people_phone OR           -- Match +13024386309
        phone = auth_phone OR             -- Match 13024386309 (legacy)
        phone = '+1' || auth_phone        -- Handle corruption +113024386309
      )
      AND name IS NOT NULL 
      AND name != '' 
      AND name != 'User'
    ORDER BY created_at DESC 
    LIMIT 1;
    
    IF FOUND THEN
      -- Link existing person to auth user
      RAISE LOG '[AUTH-V2] Linking existing person % to auth user %', existing_person.id, NEW.id;
      
      -- Generate hash if missing
      IF existing_person.hash IS NULL OR existing_person.hash = '' THEN
        person_hash := encode(digest(existing_person.id::text || people_phone, 'sha256'), 'hex');
      ELSE
        person_hash := existing_person.hash;
      END IF;
      
      UPDATE people 
      SET 
        auth_user_id = NEW.id,
        verified = true,
        phone = people_phone,  -- Standardize to +E.164 format
        hash = person_hash,
        updated_at = NOW()
      WHERE id = existing_person.id;
      
    ELSE
      -- Create new person record
      RAISE LOG '[AUTH-V2] Creating new person for auth user %', NEW.id;
      
      -- Generate person hash
      new_person_id := gen_random_uuid();
      person_hash := encode(digest(new_person_id::text || people_phone, 'sha256'), 'hex');
        
        INSERT INTO people (
          id,
          phone, 
          name, 
          nickname,
          auth_user_id, 
          verified,
          hash,
          created_at,
          updated_at
        )
        VALUES (
          new_person_id,
          people_phone,     -- Store in +E.164 format
          'User',
          'User', 
          NEW.id, 
          true,
          person_hash,
          NOW(),
          NOW()
        );
        
        RAISE LOG '[AUTH-V2] Created new person % for auth user %', new_person_id, NEW.id;
    END IF;
    
  END IF;
  
  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    -- Log errors but don't fail the auth process
    RAISE LOG '[AUTH-V2] Error in phone confirmation trigger: % %', SQLSTATE, SQLERRM;
    RETURN NEW;
END;
$$;

-- Step 2: Create the trigger (replace existing if any)
DROP TRIGGER IF EXISTS phone_confirmation_v2_trigger ON auth.users;

CREATE TRIGGER phone_confirmation_v2_trigger
  AFTER UPDATE OF phone_confirmed_at ON auth.users
  FOR EACH ROW
  WHEN (OLD.phone_confirmed_at IS NULL AND NEW.phone_confirmed_at IS NOT NULL)
  EXECUTE FUNCTION public.handle_phone_confirmation_v2();

-- Step 3: Grant necessary permissions for the trigger function
GRANT EXECUTE ON FUNCTION public.handle_phone_confirmation_v2() TO supabase_auth_admin;
GRANT USAGE ON SCHEMA public TO supabase_auth_admin;

-- Step 4: Ensure supabase_auth_admin can access people table
GRANT SELECT, INSERT, UPDATE ON public.people TO supabase_auth_admin;

-- Step 5: Add logging for verification
COMMENT ON FUNCTION public.handle_phone_confirmation_v2() IS 
'Auth V2: Native database trigger for person creation on phone confirmation. Replaces HTTP auth-webhook. Created 2025-01-07.';

-- Verification query (for testing)
-- SELECT id, auth_user_id, phone, verified, hash, created_at 
-- FROM people 
-- WHERE auth_user_id IS NOT NULL 
-- ORDER BY created_at DESC 
-- LIMIT 5;
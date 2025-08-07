-- Fix authentication metadata loop issue
-- The problem: When users log in, if person metadata isn't in the JWT, 
-- the frontend tries to refresh session indefinitely

-- First, let's create a better function that syncs on session refresh too
CREATE OR REPLACE FUNCTION sync_auth_user_metadata()
RETURNS TRIGGER AS $$
DECLARE
  person_record RECORD;
  cleaned_phone TEXT;
  needs_update BOOLEAN := FALSE;
BEGIN
  -- Skip if no phone number
  IF NEW.phone IS NULL THEN
    RETURN NEW;
  END IF;

  -- Check if metadata already exists to avoid unnecessary updates
  IF NEW.raw_user_meta_data IS NOT NULL AND 
     NEW.raw_user_meta_data->>'person_id' IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- Extract and clean phone number
  cleaned_phone := REPLACE(NEW.phone, ' ', '');
  
  -- Try to find person by different phone formats
  SELECT id, hash, name
  INTO person_record
  FROM public.people
  WHERE phone = cleaned_phone
     OR phone = '+' || cleaned_phone
     OR phone = SUBSTRING(cleaned_phone FROM 2)
     OR phone_number = cleaned_phone
     OR phone_number = '+' || cleaned_phone
     OR phone_number = SUBSTRING(cleaned_phone FROM 2)
  LIMIT 1;

  -- If person found, update metadata
  IF person_record.id IS NOT NULL THEN
    NEW.raw_user_meta_data := COALESCE(NEW.raw_user_meta_data, '{}'::jsonb) || 
      jsonb_build_object(
        'person_id', person_record.id,
        'person_hash', person_record.hash,
        'person_name', person_record.name
      );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update trigger to run BEFORE INSERT OR UPDATE
DROP TRIGGER IF EXISTS sync_person_metadata_trigger ON auth.users;
CREATE TRIGGER sync_person_metadata_trigger
  BEFORE INSERT OR UPDATE OF last_sign_in_at, confirmed_at ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION sync_auth_user_metadata();

-- Create a function to handle post-login metadata sync via RPC
-- This can be called from the frontend if metadata is missing
CREATE OR REPLACE FUNCTION refresh_auth_metadata()
RETURNS jsonb AS $$
DECLARE
  v_user_id UUID;
  v_phone TEXT;
  person_record RECORD;
  cleaned_phone TEXT;
BEGIN
  -- Get the current user ID from auth context
  v_user_id := auth.uid();
  
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Get user's phone from auth.users
  SELECT phone INTO v_phone
  FROM auth.users
  WHERE id = v_user_id;

  IF v_phone IS NULL THEN
    RETURN jsonb_build_object('error', 'No phone number found');
  END IF;

  -- Clean phone and find person
  cleaned_phone := REPLACE(v_phone, ' ', '');
  
  SELECT id, hash, name
  INTO person_record
  FROM public.people
  WHERE phone = cleaned_phone
     OR phone = '+' || cleaned_phone
     OR phone = SUBSTRING(cleaned_phone FROM 2)
     OR phone_number = cleaned_phone
     OR phone_number = '+' || cleaned_phone
     OR phone_number = SUBSTRING(cleaned_phone FROM 2)
  LIMIT 1;

  IF person_record.id IS NULL THEN
    RETURN jsonb_build_object('error', 'Person not found');
  END IF;

  -- Update the user's metadata
  UPDATE auth.users
  SET raw_user_meta_data = COALESCE(raw_user_meta_data, '{}'::jsonb) || 
    jsonb_build_object(
      'person_id', person_record.id,
      'person_hash', person_record.hash,
      'person_name', person_record.name
    ),
    updated_at = NOW()
  WHERE id = v_user_id;

  -- Return the person data
  RETURN jsonb_build_object(
    'person_id', person_record.id,
    'person_hash', person_record.hash,
    'person_name', person_record.name
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION refresh_auth_metadata() TO authenticated;

-- Also create a function to check/create person record if needed
CREATE OR REPLACE FUNCTION ensure_person_exists(p_phone TEXT)
RETURNS UUID AS $$
DECLARE
  v_person_id UUID;
  v_cleaned_phone TEXT;
BEGIN
  -- Clean the phone number
  v_cleaned_phone := REPLACE(p_phone, ' ', '');
  
  -- Try to find existing person
  SELECT id INTO v_person_id
  FROM public.people
  WHERE phone = v_cleaned_phone
     OR phone = '+' || v_cleaned_phone
     OR phone = SUBSTRING(v_cleaned_phone FROM 2)
     OR phone_number = v_cleaned_phone
     OR phone_number = '+' || v_cleaned_phone
     OR phone_number = SUBSTRING(v_cleaned_phone FROM 2)
  LIMIT 1;
  
  -- If not found, create new person
  IF v_person_id IS NULL THEN
    INSERT INTO public.people (phone_number, phone)
    VALUES (v_cleaned_phone, v_cleaned_phone)
    RETURNING id INTO v_person_id;
  END IF;
  
  RETURN v_person_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update all existing auth users to have proper metadata
DO $$
DECLARE
  auth_record RECORD;
  person_record RECORD;
  cleaned_phone TEXT;
  update_count INTEGER := 0;
BEGIN
  FOR auth_record IN 
    SELECT id, phone, raw_user_meta_data 
    FROM auth.users 
    WHERE phone IS NOT NULL
      AND (raw_user_meta_data IS NULL OR raw_user_meta_data->>'person_id' IS NULL)
  LOOP
    cleaned_phone := REPLACE(auth_record.phone, ' ', '');
    
    SELECT id, hash, name
    INTO person_record
    FROM public.people
    WHERE phone = cleaned_phone
       OR phone = '+' || cleaned_phone
       OR phone = SUBSTRING(cleaned_phone FROM 2)
       OR phone_number = cleaned_phone
       OR phone_number = '+' || cleaned_phone
       OR phone_number = SUBSTRING(cleaned_phone FROM 2)
    LIMIT 1;

    IF person_record.id IS NOT NULL THEN
      UPDATE auth.users
      SET raw_user_meta_data = COALESCE(raw_user_meta_data, '{}'::jsonb) || 
        jsonb_build_object(
          'person_id', person_record.id,
          'person_hash', person_record.hash,
          'person_name', person_record.name
        )
      WHERE id = auth_record.id;
      
      update_count := update_count + 1;
    END IF;
  END LOOP;
  
  RAISE NOTICE 'Updated % auth user records with person metadata', update_count;
END $$;
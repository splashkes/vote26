-- Function to sync person data to auth metadata after OTP verification
CREATE OR REPLACE FUNCTION sync_person_to_auth_metadata()
RETURNS TRIGGER AS $$
DECLARE
  person_record RECORD;
  cleaned_phone TEXT;
BEGIN
  -- Only process on INSERT (new auth session)
  IF TG_OP != 'INSERT' THEN
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
     OR phone = SUBSTRING(cleaned_phone FROM 2)  -- Remove leading 1
     OR phone_number = cleaned_phone
     OR phone_number = '+' || cleaned_phone
     OR phone_number = SUBSTRING(cleaned_phone FROM 2)
  LIMIT 1;

  -- If person found, update auth metadata
  IF person_record.id IS NOT NULL THEN
    UPDATE auth.users
    SET raw_user_meta_data = 
      COALESCE(raw_user_meta_data, '{}'::jsonb) || 
      jsonb_build_object(
        'person_id', person_record.id,
        'person_hash', person_record.hash,
        'person_name', person_record.name
      )
    WHERE id = NEW.id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger on auth.users
DROP TRIGGER IF EXISTS sync_person_metadata_trigger ON auth.users;
CREATE TRIGGER sync_person_metadata_trigger
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION sync_person_to_auth_metadata();

-- Function to manually sync existing users
CREATE OR REPLACE FUNCTION sync_existing_auth_users()
RETURNS void AS $$
DECLARE
  auth_record RECORD;
  person_record RECORD;
  cleaned_phone TEXT;
BEGIN
  FOR auth_record IN SELECT id, phone FROM auth.users WHERE phone IS NOT NULL
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
      SET raw_user_meta_data = 
        COALESCE(raw_user_meta_data, '{}'::jsonb) || 
        jsonb_build_object(
          'person_id', person_record.id,
          'person_hash', person_record.hash,
          'person_name', person_record.name
        )
      WHERE id = auth_record.id;
    END IF;
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Run sync for existing users
SELECT sync_existing_auth_users();
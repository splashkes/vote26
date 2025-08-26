-- Fix Corrupted International Phone Numbers
-- This script corrects phone numbers that were corrupted by the +1 hardcoding bug

-- Create function to detect correct country code and fix phone number
CREATE OR REPLACE FUNCTION fix_corrupted_phone(auth_phone TEXT) 
RETURNS TEXT AS $$
DECLARE
    result TEXT;
BEGIN
    -- If auth_phone is NULL, return NULL
    IF auth_phone IS NULL THEN
        RETURN NULL;
    END IF;
    
    -- US/Canada: starts with 1 followed by 10 digits
    IF auth_phone ~ '^1[0-9]{10}$' THEN
        RETURN '+' || auth_phone;
    END IF;
    
    -- Netherlands: 31 + 8-9 digits  
    IF auth_phone ~ '^31[0-9]{8,9}$' THEN
        RETURN '+' || auth_phone;
    END IF;
    
    -- UK: 44 + 10 digits
    IF auth_phone ~ '^44[0-9]{10}$' THEN
        RETURN '+' || auth_phone;
    END IF;
    
    -- Germany: 49 + 10-11 digits
    IF auth_phone ~ '^49[0-9]{10,11}$' THEN
        RETURN '+' || auth_phone;
    END IF;
    
    -- France: 33 + 9 digits
    IF auth_phone ~ '^33[0-9]{9}$' THEN
        RETURN '+' || auth_phone;
    END IF;
    
    -- Thailand: 66 + 8-9 digits
    IF auth_phone ~ '^66[0-9]{8,9}$' THEN
        RETURN '+' || auth_phone;
    END IF;
    
    -- Japan: 81 + 10 digits
    IF auth_phone ~ '^81[0-9]{10}$' THEN
        RETURN '+' || auth_phone;
    END IF;
    
    -- China: 86 + 11 digits
    IF auth_phone ~ '^86[0-9]{11}$' THEN
        RETURN '+' || auth_phone;
    END IF;
    
    -- India: 91 + 10 digits
    IF auth_phone ~ '^91[0-9]{10}$' THEN
        RETURN '+' || auth_phone;
    END IF;
    
    -- New Zealand: 64 + 9-10 digits (including mobile patterns)
    IF auth_phone ~ '^64[0-9]{8,10}$' THEN
        RETURN '+' || auth_phone;
    END IF;
    
    -- UK Mobile: 447 + 9 digits (UK mobile numbers starting with 7)
    IF auth_phone ~ '^447[0-9]{9}$' THEN
        RETURN '+' || auth_phone;
    END IF;
    
    -- Australia: 61 + 9 digits
    IF auth_phone ~ '^61[0-9]{9}$' THEN
        RETURN '+' || auth_phone;
    END IF;
    
    -- Canada (alternative pattern): starts with area codes 2-9
    IF auth_phone ~ '^[2-9][0-9]{9}$' AND LENGTH(auth_phone) = 10 THEN
        RETURN '+1' || auth_phone;
    END IF;
    
    -- If no pattern matches, assume it needs a + prefix
    IF NOT auth_phone ~ '^\+' THEN
        RETURN '+' || auth_phone;
    END IF;
    
    -- Already has + prefix
    RETURN auth_phone;
END;
$$ LANGUAGE plpgsql;

-- Test the function on a few samples
SELECT 
    'Test Results' as stage,
    original_auth_phone, 
    corrupted_phone, 
    fix_corrupted_phone(original_auth_phone) as proposed_fix
FROM corrupted_phone_backup 
WHERE original_auth_phone IN (
    '17322615939',  -- Netherlands
    '66847812689',  -- Thailand  
    '447466118852', -- UK Mobile
    '642108344909', -- New Zealand
    '14163025959'   -- US/Canada
)
ORDER BY original_auth_phone;

-- Show summary of what would be fixed
SELECT 
    'Summary' as stage,
    CASE 
        WHEN fix_corrupted_phone(original_auth_phone) != corrupted_phone THEN 'WILL_FIX'
        ELSE 'NO_CHANGE'
    END as fix_status,
    COUNT(*) as count
FROM corrupted_phone_backup
GROUP BY 1, 2
ORDER BY count DESC;
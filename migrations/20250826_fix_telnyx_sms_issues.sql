-- Fix issues found in Telnyx SMS marketing system testing
-- Date: August 26, 2025

-- 1. Fix is_phone_opted_out function - ambiguous column reference
DROP FUNCTION IF EXISTS is_phone_opted_out(TEXT);

CREATE OR REPLACE FUNCTION is_phone_opted_out(phone_number_input TEXT)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM sms_marketing_optouts 
        WHERE sms_marketing_optouts.phone_number = phone_number_input 
        AND sms_marketing_optouts.is_active = true
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Fix template created_by field - should be nullable for system-created templates
ALTER TABLE sms_marketing_templates ALTER COLUMN created_by DROP NOT NULL;
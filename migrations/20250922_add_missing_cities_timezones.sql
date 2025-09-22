-- Add missing cities - Melbourne AU for one
-- Date: 2025-09-22

-- Add Melbourne timezone (Australia/Melbourne)
INSERT INTO timezones (name, timezone_offset, icann)
SELECT 'Melbourne', '+11:00', 'Australia/Melbourne'
WHERE NOT EXISTS (SELECT 1 FROM timezones WHERE icann = 'Australia/Melbourne');

-- Get Australia country ID and add Melbourne city
DO $$
DECLARE
    australia_country_id UUID;
    melbourne_timezone_id UUID;
BEGIN
    -- Get Australia country ID
    SELECT id INTO australia_country_id FROM countries WHERE name = 'Australia';

    -- Get Melbourne timezone ID
    SELECT id INTO melbourne_timezone_id FROM timezones WHERE icann = 'Australia/Melbourne';

    -- Add Melbourne if it doesn't exist
    INSERT INTO cities (name, country_id, state_province, timezone_id)
    SELECT 'Melbourne', australia_country_id, 'Victoria', melbourne_timezone_id
    WHERE NOT EXISTS (
        SELECT 1 FROM cities WHERE name = 'Melbourne' AND country_id = australia_country_id
    );

    RAISE NOTICE 'Successfully added Melbourne, Australia with timezone';

END $$;
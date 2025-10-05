-- One-time backfill of missing timezones for existing events
-- This only updates past data, doesn't create triggers or functions

-- Update events based on city/country mapping
UPDATE events e
SET timezone_icann = CASE
  -- United States - Pacific Time
  WHEN co.code = 'US' AND c.name IN ('Seattle', 'Portland', 'San Francisco', 'Los Angeles', 'San Diego', 'Las Vegas', 'Sacramento', 'Oakland', 'San Jose')
    THEN 'America/Los_Angeles'
  -- United States - Mountain Time
  WHEN co.code = 'US' AND c.name IN ('Denver', 'Phoenix', 'Salt Lake City', 'Albuquerque', 'Boise')
    THEN 'America/Denver'
  -- United States - Central Time
  WHEN co.code = 'US' AND c.name IN ('Chicago', 'Dallas', 'Houston', 'Austin', 'San Antonio', 'Minneapolis', 'St. Louis', 'Kansas City', 'Milwaukee', 'Omaha', 'Wichita Falls')
    THEN 'America/Chicago'
  -- United States - Eastern Time
  WHEN co.code = 'US' AND c.name IN ('New York', 'Philadelphia', 'Boston', 'Washington', 'Atlanta', 'Miami', 'Detroit', 'Charlotte', 'Baltimore', 'Pittsburgh', 'Wilmington', 'Buffalo', 'Rochester', 'Albany')
    THEN 'America/New_York'
  -- United States - Default to Eastern
  WHEN co.code = 'US'
    THEN 'America/New_York'

  -- Canada
  WHEN co.code = 'CA' AND c.name IN ('Vancouver', 'Victoria')
    THEN 'America/Vancouver'
  WHEN co.code = 'CA' AND c.name IN ('Calgary', 'Edmonton')
    THEN 'America/Edmonton'
  WHEN co.code = 'CA' AND c.name IN ('Winnipeg')
    THEN 'America/Winnipeg'
  WHEN co.code = 'CA' AND c.name IN ('Toronto', 'Ottawa', 'Montreal', 'Hamilton', 'London', 'Windsor', 'Kingston')
    THEN 'America/Toronto'
  WHEN co.code = 'CA' AND c.name IN ('Halifax', 'Fredericton', 'Moncton')
    THEN 'America/Halifax'
  WHEN co.code = 'CA'
    THEN 'America/Toronto'

  -- Australia
  WHEN co.code = 'AU' AND c.name IN ('Sydney', 'Melbourne', 'Canberra', 'Brisbane')
    THEN 'Australia/Sydney'
  WHEN co.code = 'AU' AND c.name IN ('Adelaide')
    THEN 'Australia/Adelaide'
  WHEN co.code = 'AU' AND c.name IN ('Perth')
    THEN 'Australia/Perth'
  WHEN co.code = 'AU'
    THEN 'Australia/Sydney'

  -- New Zealand
  WHEN co.code = 'NZ'
    THEN 'Pacific/Auckland'

  -- UK
  WHEN co.code = 'GB'
    THEN 'Europe/London'

  -- Netherlands
  WHEN co.code = 'NL'
    THEN 'Europe/Amsterdam'

  -- Japan
  WHEN co.code = 'JP'
    THEN 'Asia/Tokyo'

  -- Thailand
  WHEN co.code = 'TH'
    THEN 'Asia/Bangkok'

  -- Montenegro
  WHEN co.code = 'ME'
    THEN 'Europe/Podgorica'

  -- Mexico
  WHEN co.code = 'MX' AND c.name IN ('Tijuana', 'Mexicali')
    THEN 'America/Tijuana'
  WHEN co.code = 'MX'
    THEN 'America/Mexico_City'

  ELSE NULL
END
FROM cities c
JOIN countries co ON c.country_id = co.id
WHERE e.city_id = c.id
  AND e.timezone_icann IS NULL;

-- Show results
SELECT
  'Backfill complete' as status,
  COUNT(*) FILTER (WHERE timezone_icann IS NOT NULL) as total_with_timezone,
  COUNT(*) FILTER (WHERE timezone_icann IS NULL) as still_missing_timezone
FROM events;

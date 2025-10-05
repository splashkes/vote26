-- Auto-set timezones for events based on city/country
-- Run this to backfill missing timezones and create a trigger for future events

-- First, create a function to get timezone for a city
CREATE OR REPLACE FUNCTION get_timezone_for_city(city_name TEXT, country_code TEXT)
RETURNS TEXT AS $$
BEGIN
  -- United States city mappings
  IF country_code = 'US' THEN
    -- Pacific Time
    IF city_name IN ('Seattle', 'Portland', 'San Francisco', 'Los Angeles', 'San Diego', 'Las Vegas', 'Sacramento', 'Oakland', 'San Jose') THEN
      RETURN 'America/Los_Angeles';
    -- Mountain Time
    ELSIF city_name IN ('Denver', 'Phoenix', 'Salt Lake City', 'Albuquerque', 'Boise') THEN
      RETURN 'America/Denver';
    -- Central Time
    ELSIF city_name IN ('Chicago', 'Dallas', 'Houston', 'Austin', 'San Antonio', 'Minneapolis', 'St. Louis', 'Kansas City', 'Milwaukee', 'Omaha', 'Wichita Falls') THEN
      RETURN 'America/Chicago';
    -- Eastern Time
    ELSIF city_name IN ('New York', 'Philadelphia', 'Boston', 'Washington', 'Atlanta', 'Miami', 'Detroit', 'Charlotte', 'Baltimore', 'Pittsburgh', 'Wilmington', 'Buffalo', 'Rochester', 'Albany') THEN
      RETURN 'America/New_York';
    -- Default to Eastern for US cities not explicitly listed
    ELSE
      RETURN 'America/New_York';
    END IF;

  -- Canada
  ELSIF country_code = 'CA' THEN
    IF city_name IN ('Vancouver', 'Victoria') THEN
      RETURN 'America/Vancouver';
    ELSIF city_name IN ('Calgary', 'Edmonton') THEN
      RETURN 'America/Edmonton';
    ELSIF city_name IN ('Winnipeg') THEN
      RETURN 'America/Winnipeg';
    ELSIF city_name IN ('Toronto', 'Ottawa', 'Montreal', 'Hamilton', 'London', 'Windsor', 'Kingston') THEN
      RETURN 'America/Toronto';
    ELSIF city_name IN ('Halifax', 'Fredericton', 'Moncton') THEN
      RETURN 'America/Halifax';
    ELSIF city_name IN ('St. John''s') THEN
      RETURN 'America/St_Johns';
    ELSE
      RETURN 'America/Toronto'; -- Default to Toronto
    END IF;

  -- Australia
  ELSIF country_code = 'AU' THEN
    IF city_name IN ('Sydney', 'Melbourne', 'Canberra', 'Brisbane') THEN
      RETURN 'Australia/Sydney';
    ELSIF city_name IN ('Adelaide') THEN
      RETURN 'Australia/Adelaide';
    ELSIF city_name IN ('Perth') THEN
      RETURN 'Australia/Perth';
    ELSIF city_name IN ('Darwin') THEN
      RETURN 'Australia/Darwin';
    ELSE
      RETURN 'Australia/Sydney';
    END IF;

  -- New Zealand
  ELSIF country_code = 'NZ' THEN
    RETURN 'Pacific/Auckland';

  -- United Kingdom
  ELSIF country_code = 'GB' THEN
    RETURN 'Europe/London';

  -- Netherlands
  ELSIF country_code = 'NL' THEN
    RETURN 'Europe/Amsterdam';

  -- Japan
  ELSIF country_code = 'JP' THEN
    RETURN 'Asia/Tokyo';

  -- Thailand
  ELSIF country_code = 'TH' THEN
    RETURN 'Asia/Bangkok';

  -- Montenegro
  ELSIF country_code = 'ME' THEN
    RETURN 'Europe/Podgorica';

  -- Mexico
  ELSIF country_code = 'MX' THEN
    IF city_name IN ('Mexico City', 'Guadalajara', 'Monterrey') THEN
      RETURN 'America/Mexico_City';
    ELSIF city_name IN ('Tijuana', 'Mexicali') THEN
      RETURN 'America/Tijuana';
    ELSE
      RETURN 'America/Mexico_City';
    END IF;

  -- Default: return NULL if we don't know the country
  ELSE
    RETURN NULL;
  END IF;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Backfill missing timezones for existing events
UPDATE events e
SET timezone_icann = get_timezone_for_city(c.name, co.code)
FROM cities c
JOIN countries co ON c.country_id = co.id
WHERE e.city_id = c.id
  AND e.timezone_icann IS NULL
  AND get_timezone_for_city(c.name, co.code) IS NOT NULL;

-- Create a trigger to auto-set timezone when event is created/updated
CREATE OR REPLACE FUNCTION auto_set_event_timezone()
RETURNS TRIGGER AS $$
DECLARE
  city_name TEXT;
  country_code TEXT;
  calculated_timezone TEXT;
BEGIN
  -- Only set timezone if it's NULL and we have a city_id
  IF NEW.timezone_icann IS NULL AND NEW.city_id IS NOT NULL THEN
    -- Get city and country info
    SELECT c.name, co.code INTO city_name, country_code
    FROM cities c
    JOIN countries co ON c.country_id = co.id
    WHERE c.id = NEW.city_id;

    -- Calculate timezone
    IF city_name IS NOT NULL AND country_code IS NOT NULL THEN
      calculated_timezone := get_timezone_for_city(city_name, country_code);

      IF calculated_timezone IS NOT NULL THEN
        NEW.timezone_icann := calculated_timezone;
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop existing trigger if it exists
DROP TRIGGER IF EXISTS trigger_auto_set_event_timezone ON events;

-- Create trigger
CREATE TRIGGER trigger_auto_set_event_timezone
  BEFORE INSERT OR UPDATE OF city_id ON events
  FOR EACH ROW
  EXECUTE FUNCTION auto_set_event_timezone();

-- Show results
SELECT
  'Backfill complete' as status,
  COUNT(*) FILTER (WHERE timezone_icann IS NOT NULL) as events_with_timezone,
  COUNT(*) FILTER (WHERE timezone_icann IS NULL) as events_without_timezone
FROM events
WHERE event_start_datetime > NOW() - INTERVAL '120 days';

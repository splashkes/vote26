-- Set +14163025959 as admin on multiple events
-- First ensure the person exists
INSERT INTO people (phone_number, auth_phone, is_artist)
VALUES ('+14163025959', '+14163025959', false)
ON CONFLICT (phone_number) DO NOTHING;

-- Add admin access for AB3027
INSERT INTO event_admins (event_id, person_id, admin_level)
SELECT 
  '02edcb54-dead-4b4f-abc6-a963740367d3',
  p.id,
  'voting'
FROM people p
WHERE p.phone_number = '+14163025959'
ON CONFLICT (event_id, person_id) 
DO UPDATE SET admin_level = 'voting';

-- Add admin access for AB2964
INSERT INTO event_admins (event_id, person_id, admin_level)
SELECT 
  'd0e50d84-a1e7-4925-a32d-e4730463eae7',
  p.id,
  'voting'
FROM people p
WHERE p.phone_number = '+14163025959'
ON CONFLICT (event_id, person_id) 
DO UPDATE SET admin_level = 'voting';

-- Add admin access for AB2935
INSERT INTO event_admins (event_id, person_id, admin_level)
SELECT 
  '5c684e78-5884-4820-82a7-52a03904c0d0',
  p.id,
  'voting'
FROM people p
WHERE p.phone_number = '+14163025959'
ON CONFLICT (event_id, person_id) 
DO UPDATE SET admin_level = 'voting';

-- Add admin access for AB3018
INSERT INTO event_admins (event_id, person_id, admin_level)
SELECT 
  '649c51b3-2f57-4df1-aa91-c163cb82beff',
  p.id,
  'voting'
FROM people p
WHERE p.phone_number = '+14163025959'
ON CONFLICT (event_id, person_id) 
DO UPDATE SET admin_level = 'voting';

-- Verify the results
SELECT 
  e.eid,
  ea.admin_level,
  p.phone_number
FROM event_admins ea
JOIN events e ON e.id = ea.event_id
JOIN people p ON p.id = ea.person_id
WHERE p.phone_number = '+14163025959'
  AND e.eid IN ('AB3027', 'AB2964', 'AB2935', 'AB3018')
ORDER BY e.eid;
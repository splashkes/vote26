-- Set +14163025959 as admin on multiple events

-- Add admin access for AB3027
INSERT INTO event_admins (event_id, phone, admin_level)
VALUES ('02edcb54-dead-4b4f-abc6-a963740367d3', '+14163025959', 'voting')
ON CONFLICT (event_id, phone) 
DO UPDATE SET admin_level = 'voting';

-- Add admin access for AB2964
INSERT INTO event_admins (event_id, phone, admin_level)
VALUES ('d0e50d84-a1e7-4925-a32d-e4730463eae7', '+14163025959', 'voting')
ON CONFLICT (event_id, phone) 
DO UPDATE SET admin_level = 'voting';

-- Add admin access for AB2935
INSERT INTO event_admins (event_id, phone, admin_level)
VALUES ('5c684e78-5884-4820-82a7-52a03904c0d0', '+14163025959', 'voting')
ON CONFLICT (event_id, phone) 
DO UPDATE SET admin_level = 'voting';

-- Add admin access for AB3018
INSERT INTO event_admins (event_id, phone, admin_level)
VALUES ('649c51b3-2f57-4df1-aa91-c163cb82beff', '+14163025959', 'voting')
ON CONFLICT (event_id, phone) 
DO UPDATE SET admin_level = 'voting';

-- Verify the results
SELECT 
  e.eid,
  ea.admin_level,
  ea.phone
FROM event_admins ea
JOIN events e ON e.id = ea.event_id
WHERE ea.phone = '+14163025959'
  AND e.eid IN ('AB3027', 'AB2964', 'AB2935', 'AB3018')
ORDER BY e.eid;
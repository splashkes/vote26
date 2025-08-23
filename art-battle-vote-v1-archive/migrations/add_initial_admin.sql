-- Add initial admin users to event_admins table
-- Replace the phone numbers and event IDs with real values

-- First, let's see what events exist
SELECT id, eid, name FROM events ORDER BY date DESC LIMIT 10;

-- Example: Add a super admin by phone number
-- Uncomment and modify the following with real values:

/*
INSERT INTO event_admins (event_id, phone, admin_level, notes)
VALUES (
    'YOUR_EVENT_UUID_HERE',  -- Replace with actual event ID
    '+14163025959',          -- Replace with actual phone number
    'super'::admin_level,
    'Initial super admin'
);
*/

-- To add an admin for a specific event by EID:
/*
INSERT INTO event_admins (event_id, phone, admin_level, notes)
SELECT 
    id,
    '+14163025959',  -- Replace with actual phone
    'super'::admin_level,
    'Initial super admin'
FROM events
WHERE eid = 'AB1234';  -- Replace with actual event EID
*/

-- To add multiple admins at once:
/*
INSERT INTO event_admins (event_id, phone, admin_level, notes)
SELECT 
    e.id,
    v.phone,
    v.admin_level::admin_level,
    v.notes
FROM events e
CROSS JOIN (VALUES 
    ('+14163025959', 'super', 'Simon - Super Admin'),
    ('+14165550002', 'producer', 'Event Producer'),
    ('+14165550003', 'photo', 'Photography Team')
) AS v(phone, admin_level, notes)
WHERE e.eid = 'AB1234';  -- Replace with actual event EID
*/

-- To check existing admins for an event:
/*
SELECT 
    ea.*, 
    e.eid, 
    e.name as event_name
FROM event_admins ea
JOIN events e ON ea.event_id = e.id
WHERE e.eid = 'AB1234'  -- Replace with actual event EID
ORDER BY ea.admin_level;
*/
-- Add Simon as super admin for all events
-- Phone: +14163025959

-- First, let's see recent events
SELECT id, eid, name, date 
FROM events 
ORDER BY date DESC 
LIMIT 10;

-- Add Simon as super admin to ALL events
INSERT INTO event_admins (event_id, phone, admin_level, notes)
SELECT 
    id,
    '+14163025959',
    'super'::admin_level,
    'Simon - Super Admin - All Events'
FROM events
ON CONFLICT (event_id, phone) 
DO UPDATE SET 
    admin_level = 'super'::admin_level,
    notes = 'Simon - Super Admin - All Events (updated)';

-- Verify the admin was added
SELECT 
    ea.*, 
    e.eid, 
    e.name as event_name
FROM event_admins ea
JOIN events e ON ea.event_id = e.id
WHERE ea.phone = '+14163025959'
ORDER BY e.date DESC
LIMIT 10;

-- Check if the permission function works
SELECT check_event_admin_permission(
    (SELECT id FROM events ORDER BY date DESC LIMIT 1),
    'producer'::admin_level,
    NULL,
    '+14163025959'
) as has_permission;
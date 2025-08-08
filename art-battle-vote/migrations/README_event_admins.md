# Event Admins System Migration

This migration creates a flexible event-based admin permission system.

## Admin Levels

1. **super** - Full control over event and all admin management
2. **producer** - Can manage event, rounds, artists, but not other admins
3. **photo** - Can upload and manage photos/media
4. **voting** - Can view voting data and results

## Permission Hierarchy

- **super** can do everything
- **producer** can do everything except manage other admins
- **photo** can manage media and view voting data
- **voting** can only view voting data

## To Run Migration

```bash
PGPASSWORD='6kEtvU9n0KhTVr5' psql -h db.xsqdkubgyqwpyvfltnrf.supabase.co -p 5432 -d postgres -U postgres -f migrations/create_event_admins_table.sql
```

## To Add Initial Admins

After running the migration, add initial admins:

```sql
-- Add a super admin by phone number
INSERT INTO event_admins (event_id, phone, admin_level, notes)
SELECT 
    id,
    '+1 (416) 555-0001',  -- Replace with actual phone
    'super'::admin_level,
    'Initial super admin'
FROM events
WHERE eid = 'AB1234';  -- Replace with actual event ID

-- Add a producer by person_id
INSERT INTO event_admins (event_id, person_id, admin_level, notes)
SELECT 
    e.id,
    p.id,
    'producer'::admin_level,
    'Event producer'
FROM events e
CROSS JOIN people p
WHERE e.eid = 'AB1234'
AND p.email = 'producer@example.com';
```

## Usage in Application

The system provides two key functions:

1. **check_event_admin_permission(event_id, required_level, user_id, phone)**
   - Returns true/false if user has required permission level
   
2. **get_user_admin_level(event_id, user_id, phone)**
   - Returns the user's admin level for the event

## Frontend Integration

The frontend should:
1. Check admin permissions when displaying admin controls
2. Pass phone number from auth context when checking permissions
3. Handle different UI based on admin level
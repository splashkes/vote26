-- Debug: Check JWT contents and user info
SELECT 
    auth.uid() as user_id,
    auth.jwt() ->> 'phone' as jwt_phone,
    (SELECT phone FROM auth.users WHERE id = auth.uid()) as auth_users_phone,
    (SELECT phone_number FROM people WHERE id = auth.uid()) as people_phone;

-- Check if there are any event_admins with photo permissions
SELECT 
    phone,
    admin_level,
    e.name as event_name
FROM event_admins ea
JOIN events e ON ea.event_id = e.id
WHERE admin_level IN ('photo', 'producer', 'super')
ORDER BY created_at DESC
LIMIT 10;
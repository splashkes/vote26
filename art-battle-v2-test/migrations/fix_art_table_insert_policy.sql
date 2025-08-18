-- Add INSERT policy for art table to allow event admins to create art records

-- Drop existing INSERT policy if it exists
DROP POLICY IF EXISTS "Event admins can insert art" ON art;

-- Create new INSERT policy that allows event admins to insert art records
CREATE POLICY "Event admins can insert art" ON art
    FOR INSERT
    TO authenticated
    WITH CHECK (
        check_event_admin_permission(event_id, 'voting')
    );

-- Also ensure UPDATE policy exists for admins
DROP POLICY IF EXISTS "Event admins can update art" ON art;

CREATE POLICY "Event admins can update art" ON art
    FOR UPDATE
    TO authenticated
    USING (
        check_event_admin_permission(event_id, 'voting')
    );
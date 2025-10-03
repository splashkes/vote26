-- Helper functions for promo offers system
-- Date: 2025-10-03

-- ============================================
-- Function: Get person's top cities
-- Returns the cities where a person has attended the most events
-- ============================================

CREATE OR REPLACE FUNCTION get_person_top_cities(p_person_id UUID)
RETURNS TABLE (
    city_name TEXT,
    event_count BIGINT
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        e.city as city_name,
        COUNT(*) as event_count
    FROM votes v
    JOIN art a ON v.art_id = a.id
    JOIN events e ON a.event_id = e.id
    WHERE v.person_id = p_person_id
      AND e.city IS NOT NULL
    GROUP BY e.city
    ORDER BY event_count DESC, e.city ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION get_person_top_cities(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION get_person_top_cities(UUID) TO authenticated;

-- ============================================
-- Verification
-- ============================================

DO $$
BEGIN
    RAISE NOTICE '✅ Promo offers helper functions created successfully';
    RAISE NOTICE '  • get_person_top_cities(person_id)';
END $$;

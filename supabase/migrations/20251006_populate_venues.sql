-- Migration: Populate venues from historical event data
-- Date: 2025-10-06

-- Populate venues from existing events (unique venue + city combinations)
INSERT INTO public.venues (name, city_id, default_capacity, created_at)
SELECT DISTINCT ON (TRIM(venue), city_id)
    TRIM(venue) as name,
    city_id,
    200 as default_capacity,
    MIN(created_at) as created_at
FROM public.events
WHERE venue IS NOT NULL
  AND TRIM(venue) != ''
  AND city_id IS NOT NULL
GROUP BY TRIM(venue), city_id
ORDER BY TRIM(venue), city_id, MIN(created_at);

-- Link events to their venues
UPDATE public.events e
SET venue_id = v.id
FROM public.venues v
WHERE TRIM(e.venue) = v.name
  AND e.city_id = v.city_id
  AND e.venue IS NOT NULL
  AND TRIM(e.venue) != ''
  AND e.city_id IS NOT NULL;

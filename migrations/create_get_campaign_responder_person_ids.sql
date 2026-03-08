-- Create function to get person IDs who responded to a given SMS campaign
CREATE OR REPLACE FUNCTION public.get_campaign_responder_person_ids(p_campaign_id uuid)
RETURNS TABLE(person_id text)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  WITH first_sends AS (
    SELECT
      to_phone,
      MIN(COALESCE(sent_at, created_at)) AS first_sent_at
    FROM sms_outbound
    WHERE campaign_id = p_campaign_id
      AND to_phone IS NOT NULL
    GROUP BY to_phone
  ),
  campaign_responders AS (
    SELECT DISTINCT i.from_phone
    FROM sms_inbound i
    JOIN first_sends s ON s.to_phone = i.from_phone
    WHERE i.from_phone IS NOT NULL
      AND i.created_at >= s.first_sent_at
  ),
  normalized_responders AS (
    SELECT DISTINCT regexp_replace(from_phone, '\D', '', 'g') AS phone_digits
    FROM campaign_responders
  )
  SELECT DISTINCT p.id::text AS person_id
  FROM people p
  JOIN normalized_responders r
    ON regexp_replace(COALESCE(NULLIF(p.phone, ''), NULLIF(p.phone_number, ''), ''), '\D', '', 'g') = r.phone_digits
  WHERE r.phone_digits <> '';
$$;

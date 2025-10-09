-- Change ip_address column from inet to text to store full x-forwarded-for chain
-- This allows us to track all IPs in the proxy chain, not just one

ALTER TABLE sponsorship_interactions
ALTER COLUMN ip_address TYPE text USING ip_address::text;

COMMENT ON COLUMN sponsorship_interactions.ip_address IS 'IP address or comma-separated list from x-forwarded-for header';

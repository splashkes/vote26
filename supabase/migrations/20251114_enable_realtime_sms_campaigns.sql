-- Enable realtime for sms_marketing_campaigns table
-- This allows the admin UI to receive live progress updates as campaigns send

ALTER PUBLICATION supabase_realtime ADD TABLE sms_marketing_campaigns;

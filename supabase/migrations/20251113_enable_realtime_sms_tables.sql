-- Enable realtime for SMS tables
-- This allows the admin UI to receive live updates when messages are sent/received

ALTER PUBLICATION supabase_realtime ADD TABLE sms_inbound;
ALTER PUBLICATION supabase_realtime ADD TABLE sms_outbound;

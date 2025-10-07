-- Create table to store exchange rates for currency conversion
CREATE TABLE IF NOT EXISTS exchange_rates (
  currency_code character(3) PRIMARY KEY,
  rate_to_usd numeric(12,6) NOT NULL,
  last_updated timestamp with time zone DEFAULT now(),
  source text DEFAULT 'exchangerate-api.io'
);

-- Create index for quick lookups
CREATE INDEX IF NOT EXISTS idx_exchange_rates_updated
  ON exchange_rates(last_updated DESC);

-- Enable RLS but no policies = API inaccessible, only server-side functions
ALTER TABLE exchange_rates ENABLE ROW LEVEL SECURITY;

-- Insert initial rates (approximate as of Oct 2024)
-- These will be updated by the cron job
INSERT INTO exchange_rates (currency_code, rate_to_usd, source) VALUES
  ('USD', 1.000000, 'base'),
  ('CAD', 0.740000, 'initial'),
  ('AUD', 0.660000, 'initial'),
  ('NZD', 0.610000, 'initial'),
  ('EUR', 1.090000, 'initial'),
  ('GBP', 1.270000, 'initial'),
  ('THB', 0.029000, 'initial'),
  ('JPY', 0.006700, 'initial'),
  ('CNY', 0.140000, 'initial')
ON CONFLICT (currency_code) DO NOTHING;

-- Add comment
COMMENT ON TABLE exchange_rates IS 'Exchange rates to USD, updated daily by cron job';

-- Create database function to update exchange rates via edge function
CREATE OR REPLACE FUNCTION update_exchange_rates_cron()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result jsonb;
BEGIN
  -- Call the update-exchange-rates edge function via pg_net
  PERFORM net.http_get(
    url := 'https://xsqdkubgyqwpyvfltnrf.supabase.co/functions/v1/update-exchange-rates',
    headers := jsonb_build_object(
      'X-Cron-Secret', (SELECT secret_value FROM cron_secrets WHERE name = 'exchange_rates_cron')
    )
  );

  result := jsonb_build_object(
    'success', true,
    'timestamp', now()
  );

  RETURN result;
END;
$$;

-- Schedule exchange rates update cron job to run every day at 9:00 AM UTC (1 hour after meta ads)
SELECT cron.schedule(
  'exchange-rates-daily',
  '0 9 * * *', -- Every day at 9:00 AM UTC
  $$SELECT update_exchange_rates_cron()$$
);

-- Add comment
COMMENT ON FUNCTION update_exchange_rates_cron IS 'Cron function to update exchange rates daily via edge function';

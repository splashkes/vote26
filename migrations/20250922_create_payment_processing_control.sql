-- Payment Processing Control System
-- Enables automated payment processing with pause/resume capability

CREATE TABLE IF NOT EXISTS payment_processing_control (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  system_enabled BOOLEAN DEFAULT true,
  global_payments_enabled BOOLEAN DEFAULT true,
  stripe_connect_enabled BOOLEAN DEFAULT false, -- Deprecated, disabled by default
  last_processed_at TIMESTAMP WITH TIME ZONE,
  processing_batch_size INTEGER DEFAULT 10,
  max_daily_payments INTEGER DEFAULT 100,
  daily_payment_count INTEGER DEFAULT 0,
  daily_reset_date DATE DEFAULT CURRENT_DATE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  metadata JSONB DEFAULT '{}'
);

-- Insert default configuration
INSERT INTO payment_processing_control (
  system_enabled,
  global_payments_enabled,
  stripe_connect_enabled,
  processing_batch_size,
  max_daily_payments,
  metadata
) VALUES (
  true,  -- system_enabled
  true,  -- global_payments_enabled
  false, -- stripe_connect_enabled (deprecated)
  10,    -- processing_batch_size
  100,   -- max_daily_payments
  jsonb_build_object(
    'created_via', 'migration',
    'notes', 'Initial payment processing control setup - Global Payments only',
    'legacy_connect_disabled', true
  )
) ON CONFLICT DO NOTHING;

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_payment_processing_control_system_enabled
ON payment_processing_control(system_enabled);

CREATE INDEX IF NOT EXISTS idx_payment_processing_control_last_processed
ON payment_processing_control(last_processed_at);

-- Add updated_at trigger
CREATE OR REPLACE FUNCTION update_payment_processing_control_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();

    -- Reset daily counter if date changed
    IF NEW.daily_reset_date < CURRENT_DATE THEN
        NEW.daily_payment_count = 0;
        NEW.daily_reset_date = CURRENT_DATE;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER payment_processing_control_updated_at_trigger
    BEFORE UPDATE ON payment_processing_control
    FOR EACH ROW
    EXECUTE FUNCTION update_payment_processing_control_updated_at();

-- Grant access
GRANT SELECT, UPDATE ON payment_processing_control TO authenticated;
GRANT EXECUTE ON FUNCTION update_payment_processing_control_updated_at() TO authenticated;

-- Add admin function to control payment processing
CREATE OR REPLACE FUNCTION toggle_payment_processing(enable_system BOOLEAN DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    control_record payment_processing_control%ROWTYPE;
    result jsonb;
BEGIN
    -- Get current control record
    SELECT * INTO control_record FROM payment_processing_control LIMIT 1;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Payment processing control not initialized';
    END IF;

    -- Update system enabled status if provided
    IF enable_system IS NOT NULL THEN
        UPDATE payment_processing_control
        SET system_enabled = enable_system,
            metadata = metadata || jsonb_build_object(
                'last_manual_toggle', NOW(),
                'toggled_by', 'admin_function'
            )
        WHERE id = control_record.id;

        -- Refresh record
        SELECT * INTO control_record FROM payment_processing_control WHERE id = control_record.id;
    END IF;

    -- Return current status
    result := jsonb_build_object(
        'system_enabled', control_record.system_enabled,
        'global_payments_enabled', control_record.global_payments_enabled,
        'stripe_connect_enabled', control_record.stripe_connect_enabled,
        'processing_batch_size', control_record.processing_batch_size,
        'max_daily_payments', control_record.max_daily_payments,
        'daily_payment_count', control_record.daily_payment_count,
        'last_processed_at', control_record.last_processed_at,
        'status', CASE WHEN control_record.system_enabled THEN 'enabled' ELSE 'disabled' END
    );

    RETURN result;
END;
$function$;

GRANT EXECUTE ON FUNCTION toggle_payment_processing(BOOLEAN) TO authenticated;
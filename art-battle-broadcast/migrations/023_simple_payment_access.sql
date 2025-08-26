-- Simple SECURITY DEFINER functions to bypass RLS for payment data
-- Don't rewrite admin checking - just use existing system

-- Create function to get payment logs with admin bypass  
CREATE OR REPLACE FUNCTION get_payment_logs_admin(p_event_id UUID)
RETURNS TABLE(
  art_id UUID,
  payment_log_id UUID,
  admin_phone TEXT,
  created_at TIMESTAMPTZ,
  payment_type VARCHAR(20),
  actual_amount_collected NUMERIC,
  actual_tax_collected NUMERIC,
  payment_method TEXT,
  collection_notes TEXT,
  amount NUMERIC,
  status_id UUID
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Return payment logs for all artworks in this event
  RETURN QUERY
  SELECT 
    pl.art_id,
    pl.id as payment_log_id,
    pl.admin_phone,
    pl.created_at,
    pl.payment_type,
    pl.actual_amount_collected,
    pl.actual_tax_collected,
    pl.payment_method,
    pl.collection_notes,
    pl.amount,
    pl.status_id
  FROM payment_logs pl
  JOIN art a ON a.id = pl.art_id
  WHERE a.event_id = p_event_id
  ORDER BY pl.created_at DESC;
END;
$$;

-- Create function to get payment statuses with admin bypass
CREATE OR REPLACE FUNCTION get_payment_statuses_admin(p_event_id UUID)
RETURNS TABLE(
  id UUID,
  code VARCHAR,
  description VARCHAR
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Return all payment statuses used by artworks in this event
  RETURN QUERY
  SELECT DISTINCT
    ps.id,
    ps.code,
    ps.description
  FROM payment_statuses ps
  JOIN art a ON a.buyer_pay_recent_status_id = ps.id
  WHERE a.event_id = p_event_id;
END;
$$;
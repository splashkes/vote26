-- Fix admin access to payment data and create missing admin function
-- Issue: Payment logs and payment statuses not accessible due to RLS + missing admin function

-- The get_user_admin_level function should already exist, but let's check if it needs the admin_level column
-- Let's create a simple function that works with existing event_admins table structure

-- Create function to get payment data with admin bypass
CREATE OR REPLACE FUNCTION get_admin_payment_data(
  p_event_id UUID,
  p_user_phone TEXT
)
RETURNS TABLE(
  art_id UUID,
  art_code TEXT,
  payment_log_id UUID,
  payment_type TEXT,
  amount NUMERIC,
  actual_amount_collected NUMERIC,
  actual_tax_collected NUMERIC,
  payment_method TEXT,
  collection_notes TEXT,
  admin_phone TEXT,
  created_at TIMESTAMPTZ,
  status_id UUID,
  payment_status_code TEXT,
  payment_status_description TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_admin_level TEXT;
BEGIN
  -- Check admin level using existing function
  v_admin_level := get_user_admin_level(p_event_id, p_user_phone);
  
  -- Only allow producer+ admins
  IF v_admin_level NOT IN ('super', 'producer') THEN
    RAISE EXCEPTION 'Access denied. Producer+ admin access required.';
  END IF;
  
  -- Return payment data for event artworks
  RETURN QUERY
  SELECT 
    a.id as art_id,
    a.art_code,
    pl.id as payment_log_id,
    pl.payment_type,
    pl.amount,
    pl.actual_amount_collected,
    pl.actual_tax_collected,
    pl.payment_method,
    pl.collection_notes,
    pl.admin_phone,
    pl.created_at,
    pl.status_id,
    ps.code as payment_status_code,
    ps.description as payment_status_description
  FROM art a
  LEFT JOIN payment_logs pl ON a.id = pl.art_id
  LEFT JOIN payment_statuses ps ON pl.status_id = ps.id
  WHERE a.event_id = p_event_id
  AND pl.id IS NOT NULL  -- Only return artworks that have payment logs
  ORDER BY a.art_code, pl.created_at DESC;
END;
$$;

-- Create function to get payment statuses with admin bypass
CREATE OR REPLACE FUNCTION get_admin_payment_statuses(
  p_event_id UUID,
  p_user_phone TEXT
)
RETURNS TABLE(
  id UUID,
  code TEXT,
  description TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_admin_level TEXT;
BEGIN
  -- Check admin level using existing function
  v_admin_level := get_user_admin_level(p_event_id, p_user_phone);
  
  -- Only allow producer+ admins
  IF v_admin_level NOT IN ('super', 'producer') THEN
    RAISE EXCEPTION 'Access denied. Producer+ admin access required.';
  END IF;
  
  -- Get all payment statuses used by this event's artworks
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
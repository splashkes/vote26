-- STRIPE PAYMENT PROCESSING TABLES
-- Keeps payment data separate from art table for cleaner architecture
-- Date: 2025-08-06

-- ============================================
-- Create payment_processing table
-- ============================================

CREATE TABLE IF NOT EXISTS public.payment_processing (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  art_id UUID REFERENCES public.art(id) NOT NULL,
  person_id UUID REFERENCES public.people(id),
  event_id UUID REFERENCES public.events(id) NOT NULL,
  
  -- Stripe specific fields
  stripe_checkout_session_id TEXT,
  stripe_payment_intent_id TEXT,
  stripe_account_region TEXT CHECK (stripe_account_region IN ('canada', 'international')),
  
  -- Payment details
  amount NUMERIC(10,2) NOT NULL,
  currency VARCHAR(3) NOT NULL,
  amount_with_tax NUMERIC(10,2),
  tax_amount NUMERIC(10,2),
  
  -- Status tracking
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'cancelled', 'refunded')),
  payment_method TEXT, -- 'stripe', 'cash', 'manual'
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  
  -- Additional data
  metadata JSONB DEFAULT '{}',
  error_message TEXT,
  
  -- Ensure one active payment per artwork
  UNIQUE(art_id, stripe_checkout_session_id)
);

-- Create indexes for performance
CREATE INDEX idx_payment_processing_art_id ON public.payment_processing(art_id);
CREATE INDEX idx_payment_processing_person_id ON public.payment_processing(person_id);
CREATE INDEX idx_payment_processing_event_id ON public.payment_processing(event_id);
CREATE INDEX idx_payment_processing_status ON public.payment_processing(status);
CREATE INDEX idx_payment_processing_created_at ON public.payment_processing(created_at DESC);
CREATE INDEX idx_payment_processing_stripe_session ON public.payment_processing(stripe_checkout_session_id) WHERE stripe_checkout_session_id IS NOT NULL;

-- ============================================
-- Add stripe_account_region to events table
-- ============================================

ALTER TABLE public.events 
ADD COLUMN IF NOT EXISTS stripe_account_region TEXT DEFAULT 'international' 
CHECK (stripe_account_region IN ('canada', 'international'));

-- Set Canada region for Canadian events
UPDATE public.events e
SET stripe_account_region = 'canada'
WHERE EXISTS (
  SELECT 1 FROM public.countries c
  WHERE c.id = e.country_id
  AND c.code = 'CA'
);

-- ============================================
-- Update countries table with currency data
-- ============================================

-- Add currency data for major countries
UPDATE public.countries SET 
  currency_code = 'CAD',
  currency_symbol = '$'
WHERE code = 'CA';

UPDATE public.countries SET 
  currency_code = 'USD',
  currency_symbol = '$'
WHERE code = 'US';

UPDATE public.countries SET 
  currency_code = 'GBP',
  currency_symbol = '£'
WHERE code = 'GB';

UPDATE public.countries SET 
  currency_code = 'MXN',
  currency_symbol = '$'
WHERE code = 'MX';

-- Add more countries as needed
UPDATE public.countries SET 
  currency_code = 'EUR',
  currency_symbol = '€'
WHERE code IN ('DE', 'FR', 'IT', 'ES', 'NL', 'BE', 'AT', 'PT', 'IE', 'FI', 'GR');

UPDATE public.countries SET 
  currency_code = 'AUD',
  currency_symbol = '$'
WHERE code = 'AU';

UPDATE public.countries SET 
  currency_code = 'NZD',
  currency_symbol = '$'
WHERE code = 'NZ';

UPDATE public.countries SET 
  currency_code = 'JPY',
  currency_symbol = '¥'
WHERE code = 'JP';

UPDATE public.countries SET 
  currency_code = 'CNY',
  currency_symbol = '¥'
WHERE code = 'CN';

UPDATE public.countries SET 
  currency_code = 'INR',
  currency_symbol = '₹'
WHERE code = 'IN';

UPDATE public.countries SET 
  currency_code = 'BRL',
  currency_symbol = 'R$'
WHERE code = 'BR';

-- ============================================
-- Create payment status tracking function
-- ============================================

CREATE OR REPLACE FUNCTION get_payment_status(p_art_id UUID)
RETURNS TABLE (
  has_payment BOOLEAN,
  payment_status TEXT,
  payment_method TEXT,
  amount NUMERIC,
  currency VARCHAR,
  completed_at TIMESTAMPTZ,
  stripe_session_id TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    TRUE as has_payment,
    pp.status as payment_status,
    pp.payment_method,
    pp.amount_with_tax as amount,
    pp.currency,
    pp.completed_at,
    pp.stripe_checkout_session_id as stripe_session_id
  FROM payment_processing pp
  WHERE pp.art_id = p_art_id
  AND pp.status IN ('completed', 'processing')
  ORDER BY pp.created_at DESC
  LIMIT 1;
  
  -- Return null row if no payment found
  IF NOT FOUND THEN
    RETURN QUERY
    SELECT 
      FALSE as has_payment,
      NULL::TEXT as payment_status,
      NULL::TEXT as payment_method,
      NULL::NUMERIC as amount,
      NULL::VARCHAR as currency,
      NULL::TIMESTAMPTZ as completed_at,
      NULL::TEXT as stripe_session_id;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- Create function to mark payment as complete
-- ============================================

CREATE OR REPLACE FUNCTION complete_stripe_payment(
  p_session_id TEXT,
  p_payment_intent_id TEXT,
  p_payment_method TEXT DEFAULT 'stripe'
)
RETURNS JSONB AS $$
DECLARE
  v_payment RECORD;
  v_result JSONB;
BEGIN
  -- Find and update the payment record
  UPDATE payment_processing
  SET 
    status = 'completed',
    stripe_payment_intent_id = p_payment_intent_id,
    payment_method = p_payment_method,
    completed_at = NOW(),
    metadata = metadata || jsonb_build_object(
      'completed_via', 'stripe_webhook',
      'completed_at', NOW()
    )
  WHERE stripe_checkout_session_id = p_session_id
  AND status IN ('pending', 'processing')
  RETURNING * INTO v_payment;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Payment session not found or already completed'
    );
  END IF;
  
  -- Update the art status to paid
  UPDATE public.art
  SET 
    status = 'paid',
    buyer_pay_recent_date = NOW()
  WHERE id = v_payment.art_id;
  
  -- Return success
  RETURN jsonb_build_object(
    'success', true,
    'art_id', v_payment.art_id,
    'amount', v_payment.amount_with_tax,
    'currency', v_payment.currency
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- RLS Policies for payment_processing
-- ============================================

ALTER TABLE public.payment_processing ENABLE ROW LEVEL SECURITY;

-- Allow users to see their own payments
CREATE POLICY "Users can view own payments" ON public.payment_processing
  FOR SELECT
  TO authenticated
  USING (
    person_id = (
      SELECT p.id FROM public.people p
      WHERE p.hash = (auth.jwt()->>'user_metadata')::jsonb->>'person_hash'
    )
  );

-- Allow admins to view all payments for their events
CREATE POLICY "Admins can view event payments" ON public.payment_processing
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.event_admins ea
      WHERE ea.event_id = payment_processing.event_id
      AND ea.phone = auth.jwt()->>'phone'
    )
  );

-- Only allow creation through secure functions
CREATE POLICY "Payment creation via functions only" ON public.payment_processing
  FOR INSERT
  TO authenticated
  WITH CHECK (false);

-- ============================================
-- Add helper view for payment status
-- ============================================

CREATE OR REPLACE VIEW public.art_payment_status AS
SELECT 
  a.id as art_id,
  a.art_code,
  a.status as art_status,
  a.current_bid,
  pp.status as payment_status,
  pp.payment_method,
  pp.amount_with_tax,
  pp.currency,
  pp.completed_at as payment_completed_at,
  pp.stripe_checkout_session_id,
  p.first_name || ' ' || SUBSTRING(p.last_name, 1, 1) as buyer_name
FROM public.art a
LEFT JOIN public.payment_processing pp ON pp.art_id = a.id 
  AND pp.status IN ('completed', 'processing')
LEFT JOIN public.people p ON pp.person_id = p.id
WHERE a.status IN ('sold', 'paid');

-- Grant appropriate permissions
GRANT SELECT ON public.art_payment_status TO authenticated;
GRANT SELECT ON public.art_payment_status TO anon;

-- ============================================
-- Verification
-- ============================================

DO $$
BEGIN
  RAISE NOTICE '✅ Payment processing tables created successfully';
  RAISE NOTICE '✅ Countries updated with currency data';
  RAISE NOTICE '✅ Stripe account regions configured';
  RAISE NOTICE '✅ RLS policies applied';
  RAISE NOTICE '';
  RAISE NOTICE 'Next steps:';
  RAISE NOTICE '1. Add Stripe API keys to Supabase secrets';
  RAISE NOTICE '2. Create edge functions for payment processing';
  RAISE NOTICE '3. Update frontend components';
END $$;
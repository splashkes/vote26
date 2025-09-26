-- Create payment_reminders table for tracking event payment notifications
-- This table tracks payment reminders and runner-up offers sent for specific art pieces

CREATE TABLE IF NOT EXISTS public.payment_reminders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    art_id UUID REFERENCES public.art(id) ON DELETE CASCADE NOT NULL,
    event_id UUID REFERENCES public.events(id) ON DELETE CASCADE NOT NULL,

    -- Type of reminder: 'payment_reminder' | 'runner_up_offer'
    reminder_type TEXT NOT NULL CHECK (reminder_type IN ('payment_reminder', 'runner_up_offer')),

    -- Method: 'email' | 'sms'
    reminder_method TEXT NOT NULL CHECK (reminder_method IN ('email', 'sms')),

    -- The message that was sent
    message TEXT NOT NULL,

    -- Who sent the reminder (admin email/phone)
    sent_by TEXT NOT NULL,

    -- When it was sent
    sent_at TIMESTAMPTZ DEFAULT NOW(),

    -- Status tracking
    status TEXT DEFAULT 'sent' CHECK (status IN ('sent', 'delivered', 'failed', 'opened', 'clicked')),

    -- Additional metadata (JSON)
    metadata JSONB DEFAULT '{}',

    -- Indexes for performance
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes
CREATE INDEX idx_payment_reminders_art_id ON public.payment_reminders(art_id);
CREATE INDEX idx_payment_reminders_event_id ON public.payment_reminders(event_id);
CREATE INDEX idx_payment_reminders_type_method ON public.payment_reminders(reminder_type, reminder_method);
CREATE INDEX idx_payment_reminders_sent_at ON public.payment_reminders(sent_at DESC);

-- Row Level Security
ALTER TABLE public.payment_reminders ENABLE ROW LEVEL SECURITY;

-- Policy: Event admins can view reminders for their events
CREATE POLICY "Event admins can view payment reminders" ON public.payment_reminders
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.event_admins ea
      WHERE ea.event_id = payment_reminders.event_id
      AND ea.phone = auth.jwt()->>'phone'
    )
  );

-- Policy: Event admins can insert reminders for their events
CREATE POLICY "Event admins can create payment reminders" ON public.payment_reminders
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.event_admins ea
      WHERE ea.event_id = payment_reminders.event_id
      AND ea.phone = auth.jwt()->>'phone'
    )
  );

-- Grant permissions
GRANT SELECT, INSERT ON public.payment_reminders TO authenticated;

-- ============================================
-- Create function to get reminder history for an event
-- ============================================

CREATE OR REPLACE FUNCTION public.get_event_reminder_history(p_event_id UUID, p_days_back INTEGER DEFAULT 30)
RETURNS TABLE(
    reminder_id uuid,
    art_id uuid,
    art_code text,
    artist_name text,
    reminder_type text,
    reminder_method text,
    message text,
    sent_by text,
    sent_at timestamp with time zone,
    status text,
    metadata jsonb
)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT
    pr.id as reminder_id,
    pr.art_id,
    a.art_code,
    ap.name as artist_name,
    pr.reminder_type,
    pr.reminder_method,
    pr.message,
    pr.sent_by,
    pr.sent_at,
    pr.status,
    pr.metadata
  FROM payment_reminders pr
  JOIN art a ON pr.art_id = a.id
  JOIN artist_profiles ap ON a.artist_id = ap.id
  WHERE pr.event_id = p_event_id
    AND pr.sent_at >= NOW() - make_interval(days => p_days_back)
  ORDER BY pr.sent_at DESC;
$function$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION get_event_reminder_history(UUID, INTEGER) TO authenticated;

-- ============================================
-- Log migration completion
-- ============================================

INSERT INTO system_logs (service, operation, level, message, request_data)
VALUES (
    'migration',
    'create_payment_reminders_table',
    'info',
    'Created payment_reminders table and related functions for event payment notification tracking',
    jsonb_build_object(
        'migration_file', '20250926_create_payment_reminders_table.sql',
        'applied_at', NOW()::text,
        'table_created', 'payment_reminders',
        'function_created', 'get_event_reminder_history',
        'reminder_types', ARRAY['payment_reminder', 'runner_up_offer'],
        'reminder_methods', ARRAY['email', 'sms']
    )
);
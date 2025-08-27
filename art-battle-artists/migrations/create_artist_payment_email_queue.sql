-- Create artist payment email queue table for managing post-event payment notification emails
-- This system allows super admins to generate, review, approve, and send payment emails to artists

CREATE TABLE IF NOT EXISTS public.artist_payment_email_queue (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
    artist_profile_id uuid NOT NULL REFERENCES public.artist_profiles(id) ON DELETE CASCADE,
    
    -- Email content and metadata
    email_data jsonb NOT NULL DEFAULT '{}'::jsonb,
    template_type text NOT NULL DEFAULT 'payment_notification',
    
    -- Queue status workflow
    status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'ready_for_review', 'approved', 'sent', 'failed')),
    
    -- Audit trail
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    reviewed_by uuid REFERENCES public.abhq_admin_users(id),
    reviewed_at timestamp with time zone,
    approved_by uuid REFERENCES public.abhq_admin_users(id), 
    approved_at timestamp with time zone,
    sent_at timestamp with time zone,
    
    -- Error handling
    error_message text,
    send_attempts integer DEFAULT 0,
    
    -- Prevent duplicates
    UNIQUE(event_id, artist_profile_id, template_type)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_artist_payment_email_queue_event_id ON public.artist_payment_email_queue(event_id);
CREATE INDEX IF NOT EXISTS idx_artist_payment_email_queue_status ON public.artist_payment_email_queue(status);
CREATE INDEX IF NOT EXISTS idx_artist_payment_email_queue_created_at ON public.artist_payment_email_queue(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_artist_payment_email_queue_artist_profile_id ON public.artist_payment_email_queue(artist_profile_id);

-- Row Level Security policies
ALTER TABLE public.artist_payment_email_queue ENABLE ROW LEVEL SECURITY;

-- Super admins can manage all email queue entries
CREATE POLICY "super_admin_email_queue_all" ON public.artist_payment_email_queue
    FOR ALL 
    USING (
        EXISTS (
            SELECT 1 FROM public.abhq_admin_users 
            WHERE email = (auth.jwt() ->> 'email'::text) 
            AND active = true 
            AND level = 'super'
        )
    );

-- Service role can manage all entries (for functions)
CREATE POLICY "service_role_email_queue_all" ON public.artist_payment_email_queue
    FOR ALL 
    USING (auth.role() = 'service_role'::text);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_artist_payment_email_queue_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for updated_at
CREATE TRIGGER trigger_update_artist_payment_email_queue_updated_at
    BEFORE UPDATE ON public.artist_payment_email_queue
    FOR EACH ROW
    EXECUTE FUNCTION public.update_artist_payment_email_queue_updated_at();

-- Grant permissions
GRANT ALL ON public.artist_payment_email_queue TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.artist_payment_email_queue TO authenticated;
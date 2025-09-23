-- Function to get pending payments ready for automated processing
-- Returns artist payments that are pending with Global Payments accounts ready

CREATE OR REPLACE FUNCTION public.get_pending_payments_for_processing(batch_limit INTEGER DEFAULT 10)
RETURNS TABLE (
    id UUID,
    artist_profile_id UUID,
    artist_name TEXT,
    artist_email TEXT,
    gross_amount NUMERIC,
    currency VARCHAR(3),
    description TEXT,
    stripe_recipient_id TEXT,
    payment_status TEXT,
    created_at TIMESTAMP WITH TIME ZONE
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
    RETURN QUERY
    SELECT
        apm.id,
        apm.artist_profile_id,
        ap.name as artist_name,
        ap.email as artist_email,
        apm.gross_amount,
        apm.currency,
        apm.description,
        agp.stripe_recipient_id,
        agp.status as payment_status,
        apm.created_at
    FROM artist_payments apm
    JOIN artist_profiles ap ON apm.artist_profile_id = ap.id
    JOIN artist_global_payments agp ON ap.id = agp.artist_profile_id
    WHERE
        -- Only automated payments (not manual)
        apm.payment_type = 'automated'
        -- Only pending or processing status
        AND apm.status IN ('pending', 'processing')
        -- Only artists with Global Payments accounts
        AND agp.stripe_recipient_id IS NOT NULL
        -- Only ready payment accounts
        AND agp.status = 'ready'
        -- Order by oldest first
    ORDER BY apm.created_at ASC
    LIMIT batch_limit;
END;
$function$;

-- Grant access
GRANT EXECUTE ON FUNCTION public.get_pending_payments_for_processing(INTEGER) TO authenticated;

-- Create function to mark payments as processing
CREATE OR REPLACE FUNCTION public.mark_payment_processing(payment_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
    UPDATE artist_payments
    SET status = 'processing',
        updated_at = NOW(),
        metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
            'processing_started_at', NOW(),
            'processing_system', 'auto_process_edge_function'
        )
    WHERE id = payment_id
      AND status = 'pending';

    RETURN FOUND;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.mark_payment_processing(UUID) TO authenticated;
-- Simplified Payment Setup Invitation Audit Function
-- Checks artists who received payment setup invitations and their basic data

DROP FUNCTION IF EXISTS audit_payment_setup_invitations(INTEGER);

CREATE OR REPLACE FUNCTION audit_payment_setup_invitations(
    days_back INTEGER DEFAULT 7
)
RETURNS TABLE (
    artist_name TEXT,
    artist_profile_id UUID,
    person_id UUID,
    invitation_count BIGINT,
    last_invitation_sent TIMESTAMP WITH TIME ZONE,
    invitation_methods TEXT,
    has_art_sales BOOLEAN,
    art_sales_count BIGINT,
    total_art_earnings NUMERIC,
    has_payments_received BOOLEAN,
    payments_count BIGINT,
    total_payments_received NUMERIC,
    estimated_balance NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
    RETURN QUERY
    WITH invitation_summary AS (
        -- Get summary of invitations per artist
        SELECT
            psi.artist_profile_id,
            COUNT(*) as inv_count,
            MAX(psi.sent_at) as last_sent,
            STRING_AGG(DISTINCT psi.invitation_method, ', ' ORDER BY psi.invitation_method) as methods
        FROM payment_setup_invitations psi
        WHERE psi.sent_at >= (NOW() - INTERVAL '1 day' * days_back)
        GROUP BY psi.artist_profile_id
    ),
    artist_info AS (
        -- Get artist profile details
        SELECT
            inv.artist_profile_id,
            inv.inv_count,
            inv.last_sent,
            inv.methods,
            ap.name as artist_name,
            ap.person_id
        FROM invitation_summary inv
        JOIN artist_profiles ap ON inv.artist_profile_id = ap.id
    ),
    art_sales AS (
        -- Get art sales for these artists (matching artist-account-ledger logic)
        SELECT
            ai.artist_profile_id,
            COUNT(a.id) as sales_count,
            SUM(CASE
                WHEN a.status IN ('sold', 'paid') THEN
                    COALESCE(a.final_price, a.current_bid, 0) * 0.5
                ELSE 0
            END) as total_earnings  -- 50% artist commission, use current_bid fallback
        FROM artist_info ai
        LEFT JOIN art a ON a.artist_id = ai.artist_profile_id
        WHERE a.status IN ('sold', 'paid', 'closed')  -- Match the exact status filter
        AND COALESCE(a.final_price, a.current_bid, 0) > 0
        GROUP BY ai.artist_profile_id
    ),
    payments_received AS (
        -- Get payments made to these artists
        SELECT
            ai.artist_profile_id,
            COUNT(ap.id) as payment_count,
            SUM(ap.net_amount) as total_paid
        FROM artist_info ai
        LEFT JOIN artist_payments ap ON ap.artist_profile_id = ai.artist_profile_id
        WHERE ap.status = 'completed' AND ap.net_amount > 0
        GROUP BY ai.artist_profile_id
    )
    SELECT
        ai.artist_name::TEXT,
        ai.artist_profile_id,
        ai.person_id,
        ai.inv_count,
        ai.last_sent,
        ai.methods::TEXT,
        COALESCE(asales.sales_count, 0) > 0 as has_art_sales,
        COALESCE(asales.sales_count, 0),
        COALESCE(asales.total_earnings, 0),
        COALESCE(apay.payment_count, 0) > 0 as has_payments_received,
        COALESCE(apay.payment_count, 0),
        COALESCE(apay.total_paid, 0),
        COALESCE(asales.total_earnings, 0) - COALESCE(apay.total_paid, 0) as estimated_balance
    FROM artist_info ai
    LEFT JOIN art_sales asales ON ai.artist_profile_id = asales.artist_profile_id
    LEFT JOIN payments_received apay ON ai.artist_profile_id = apay.artist_profile_id
    ORDER BY (COALESCE(asales.total_earnings, 0) - COALESCE(apay.total_paid, 0)) DESC, ai.last_sent DESC;
END;
$function$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION audit_payment_setup_invitations(INTEGER) TO authenticated;

COMMENT ON FUNCTION audit_payment_setup_invitations IS 'Simplified audit of payment setup invitations with basic earnings and payment data';
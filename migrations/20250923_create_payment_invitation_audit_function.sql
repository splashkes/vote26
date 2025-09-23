-- Payment Setup Invitation Audit Function
-- Checks artists who received payment setup invitations and validates if they actually have balances

CREATE OR REPLACE FUNCTION audit_payment_setup_invitations(
    days_back INTEGER DEFAULT 7
)
RETURNS TABLE (
    artist_name TEXT,
    artist_profile_id UUID,
    person_id UUID,
    invitation_count INTEGER,
    last_invitation_sent TIMESTAMP WITH TIME ZONE,
    invitation_methods TEXT,
    current_balance NUMERIC,
    total_earnings NUMERIC,
    total_paid NUMERIC,
    has_outstanding_balance BOOLEAN,
    balance_status TEXT,
    invitation_justified BOOLEAN
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
    payment_calculations AS (
        -- Calculate payment balances using the same logic as artist-account-ledger
        SELECT
            ai.artist_profile_id,
            ai.artist_name,
            ai.person_id,
            ai.inv_count,
            ai.last_sent,
            ai.methods,
            COALESCE(SUM(CASE
                WHEN apl.type = 'credit' THEN apl.amount
                WHEN apl.type = 'debit' THEN -apl.amount
                ELSE 0
            END), 0) as current_balance,
            COALESCE(SUM(CASE WHEN apl.type = 'credit' THEN apl.amount ELSE 0 END), 0) as total_earnings,
            COALESCE(SUM(CASE WHEN apl.type = 'debit' THEN apl.amount ELSE 0 END), 0) as total_paid
        FROM artist_info ai
        LEFT JOIN (
            -- Art sales (credits)
            SELECT
                a.artist_id as artist_profile_id,
                'credit' as type,
                (a.final_price * 0.5) as amount  -- 50% commission
            FROM art a
            WHERE a.status = 'paid'
            AND a.final_price > 0

            UNION ALL

            -- Manual payments (debits)
            SELECT
                ap.artist_profile_id,
                'debit' as type,
                ap.net_amount as amount
            FROM artist_payments ap
            WHERE ap.net_amount > 0
            AND ap.status = 'completed'

            UNION ALL

            -- Global payment payouts (debits)
            SELECT
                agp.artist_profile_id,
                'debit' as type,
                gpr.amount as amount
            FROM global_payment_requests gpr
            JOIN artist_global_payments agp ON gpr.global_payment_account_id = agp.global_payment_account_id
            WHERE gpr.status = 'completed'
            AND gpr.amount > 0
        ) apl ON ai.artist_profile_id = apl.artist_profile_id
        GROUP BY ai.artist_profile_id, ai.artist_name, ai.person_id, ai.inv_count, ai.last_sent, ai.methods
    )
    SELECT
        pc.artist_name::TEXT,
        pc.artist_profile_id,
        pc.person_id,
        pc.inv_count::INTEGER,
        pc.last_sent,
        pc.methods::TEXT,
        pc.current_balance,
        pc.total_earnings,
        pc.total_paid,
        (pc.current_balance > 0) as has_outstanding_balance,
        CASE
            WHEN pc.current_balance > 0 THEN 'HAS OUTSTANDING BALANCE'
            WHEN pc.total_earnings > 0 AND pc.current_balance <= 0 THEN 'HAD EARNINGS (FULLY PAID)'
            WHEN pc.total_earnings = 0 THEN 'NO EARNINGS RECORDED'
            ELSE 'UNKNOWN STATUS'
        END::TEXT as balance_status,
        (pc.current_balance > 0 OR pc.total_earnings > 0) as invitation_justified
    FROM payment_calculations pc
    ORDER BY pc.current_balance DESC, pc.total_earnings DESC, pc.last_sent DESC;
END;
$function$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION audit_payment_setup_invitations(INTEGER) TO authenticated;

COMMENT ON FUNCTION audit_payment_setup_invitations IS 'Audits payment setup invitations sent to artists and validates if they actually have outstanding balances or earnings';
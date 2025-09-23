-- Pre-Send Invitation Validation Function
-- Validates artist profiles before sending payment setup invitations
-- Prevents sending to artists who cannot access their money

CREATE OR REPLACE FUNCTION validate_payment_invitation_targets(
    artist_profile_ids UUID[],
    include_details BOOLEAN DEFAULT true
)
RETURNS TABLE (
    artist_profile_id UUID,
    artist_name TEXT,
    outstanding_balance NUMERIC,
    profile_phone TEXT,
    profile_email TEXT,
    person_id UUID,
    can_receive_invitation BOOLEAN,
    validation_status TEXT,
    auth_person_id UUID,
    auth_person_name TEXT,
    recommended_phone TEXT,
    issues_found TEXT[],
    fix_required TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
    RETURN QUERY
    WITH profile_data AS (
        -- Get basic profile information
        SELECT
            ap.id as profile_id,
            ap.name,
            ap.phone,
            ap.email,
            ap.person_id
        FROM artist_profiles ap
        WHERE ap.id = ANY(artist_profile_ids)
    ),
    balance_calculation AS (
        -- Calculate outstanding balance using correct artist-account-ledger logic
        SELECT
            pd.profile_id,
            pd.name,
            pd.phone,
            pd.email,
            pd.person_id,
            COALESCE(SUM(CASE
                WHEN a.status IN ('sold', 'paid') THEN
                    COALESCE(a.final_price, a.current_bid, 0) * 0.5
                ELSE 0
            END), 0) as balance
        FROM profile_data pd
        LEFT JOIN art a ON a.artist_id = pd.profile_id
        WHERE a.status IN ('sold', 'paid', 'closed')
        AND COALESCE(a.final_price, a.current_bid, 0) > 0
        GROUP BY pd.profile_id, pd.name, pd.phone, pd.email, pd.person_id
    ),
    auth_validation AS (
        -- Check authentication mapping for profile phone
        SELECT
            bc.*,
            p.id as auth_person_id,
            p.name as auth_person_name,
            p.phone as auth_phone,
            p.auth_phone as auth_auth_phone
        FROM balance_calculation bc
        LEFT JOIN people p ON (
            p.auth_phone = bc.phone OR
            p.phone = bc.phone OR
            (bc.person_id IS NOT NULL AND p.id = bc.person_id)
        )
    ),
    validation_analysis AS (
        -- Analyze each profile and determine validation status
        SELECT
            av.*,
            ARRAY[]::TEXT[] as issues,
            '' as fix_needed,
            CASE
                WHEN av.balance <= 0 THEN 'NO_BALANCE'
                WHEN av.person_id IS NULL THEN 'PROFILE_NO_PERSON'
                WHEN av.auth_person_id IS NULL THEN 'PHONE_NOT_IN_AUTH'
                WHEN av.person_id != av.auth_person_id THEN 'WRONG_PERSON_MAPPING'
                ELSE 'VALID'
            END as status
        FROM auth_validation av
    ),
    detailed_analysis AS (
        -- Add detailed issues and fix recommendations
        SELECT
            va.*,
            CASE va.status
                WHEN 'NO_BALANCE' THEN
                    ARRAY['Artist has no outstanding balance ($' || va.balance::text || ')']
                WHEN 'PROFILE_NO_PERSON' THEN
                    ARRAY['Artist profile not linked to person record', 'Cannot authenticate']
                WHEN 'PHONE_NOT_IN_AUTH' THEN
                    ARRAY['Phone number ' || COALESCE(va.phone, 'NULL') || ' not in authentication system', 'Artist cannot log in']
                WHEN 'WRONG_PERSON_MAPPING' THEN
                    ARRAY['Phone maps to wrong person', 'Profile person_id: ' || COALESCE(va.person_id::text, 'NULL'), 'Auth person_id: ' || COALESCE(va.auth_person_id::text, 'NULL')]
                ELSE
                    ARRAY[]::TEXT[]
            END as detailed_issues,
            CASE va.status
                WHEN 'NO_BALANCE' THEN
                    'Skip invitation - no money owed'
                WHEN 'PROFILE_NO_PERSON' THEN
                    'Link profile to person record OR create person record'
                WHEN 'PHONE_NOT_IN_AUTH' THEN
                    'Create person record for phone ' || COALESCE(va.phone, 'NULL') || ' and link to profile'
                WHEN 'WRONG_PERSON_MAPPING' THEN
                    'Use transition_artist_account() to fix person mapping'
                ELSE
                    'Ready to send invitation'
            END as fix_recommendation
        FROM validation_analysis va
    )
    SELECT
        da.profile_id,
        da.name::TEXT,
        da.balance,
        da.phone::TEXT,
        da.email::TEXT,
        da.person_id,
        (da.status = 'VALID') as can_receive_invitation,
        da.status::TEXT,
        da.auth_person_id,
        da.auth_person_name::TEXT,
        COALESCE(da.phone, da.email)::TEXT as recommended_phone,
        da.detailed_issues,
        da.fix_recommendation::TEXT
    FROM detailed_analysis da
    ORDER BY da.balance DESC, da.status;
END;
$function$;

-- Simplified validation for quick checks
CREATE OR REPLACE FUNCTION can_artist_access_payments(
    artist_profile_id UUID,
    test_phone TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    profile_person_id UUID;
    auth_person_id UUID;
    check_phone TEXT;
BEGIN
    -- Get the profile's person_id
    SELECT ap.person_id, COALESCE(test_phone, ap.phone)
    INTO profile_person_id, check_phone
    FROM artist_profiles ap
    WHERE ap.id = artist_profile_id;

    IF profile_person_id IS NULL OR check_phone IS NULL THEN
        RETURN FALSE;
    END IF;

    -- Check if phone maps to the same person
    SELECT p.id INTO auth_person_id
    FROM people p
    WHERE (p.auth_phone = check_phone OR p.phone = check_phone)
    LIMIT 1;

    RETURN (auth_person_id = profile_person_id);
END;
$function$;

-- Quick batch validation
CREATE OR REPLACE FUNCTION quick_invitation_check(
    artist_profile_ids UUID[]
)
RETURNS TABLE (
    artist_profile_id UUID,
    artist_name TEXT,
    balance NUMERIC,
    can_login BOOLEAN,
    status TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
    RETURN QUERY
    SELECT
        v.artist_profile_id,
        v.artist_name,
        v.outstanding_balance,
        v.can_receive_invitation,
        v.validation_status
    FROM validate_payment_invitation_targets(artist_profile_ids, false) v
    ORDER BY v.outstanding_balance DESC;
END;
$function$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION validate_payment_invitation_targets(UUID[], BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION can_artist_access_payments(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION quick_invitation_check(UUID[]) TO authenticated;

COMMENT ON FUNCTION validate_payment_invitation_targets IS 'Validates artist profiles before sending payment setup invitations - prevents sending to artists who cannot access their money';
COMMENT ON FUNCTION can_artist_access_payments IS 'Quick check if an artist can log in with their phone and access their payment profile';
COMMENT ON FUNCTION quick_invitation_check IS 'Batch validation for multiple artists with simplified output';
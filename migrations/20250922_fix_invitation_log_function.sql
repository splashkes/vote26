-- Fix the log payment setup invitation function with proper parameter defaults

CREATE OR REPLACE FUNCTION log_payment_setup_invitation(
    p_artist_profile_id UUID,
    p_invitation_method VARCHAR(20),
    p_sent_by VARCHAR(100),
    p_recipient_email VARCHAR(255) DEFAULT NULL,
    p_recipient_phone VARCHAR(50) DEFAULT NULL,
    p_invitation_type VARCHAR(30) DEFAULT 'payment_setup',
    p_message_content TEXT DEFAULT NULL,
    p_delivery_metadata JSONB DEFAULT '{}'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    invitation_id UUID;
BEGIN
    INSERT INTO payment_setup_invitations (
        artist_profile_id,
        invitation_method,
        recipient_email,
        recipient_phone,
        sent_by,
        invitation_type,
        message_content,
        delivery_metadata,
        status
    ) VALUES (
        p_artist_profile_id,
        p_invitation_method,
        p_recipient_email,
        p_recipient_phone,
        p_sent_by,
        p_invitation_type,
        p_message_content,
        p_delivery_metadata,
        'sent'
    )
    RETURNING id INTO invitation_id;

    RETURN invitation_id;
END;
$function$;

GRANT EXECUTE ON FUNCTION log_payment_setup_invitation(UUID, VARCHAR, VARCHAR, VARCHAR, VARCHAR, VARCHAR, TEXT, JSONB) TO authenticated;
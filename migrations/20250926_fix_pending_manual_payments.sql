-- Fix pending manual payments that should be marked as paid
-- These are legitimate PayPal/Zelle payments entered by admin staff on 2025-09-22

-- First, let's see what we're about to update
DO $$
DECLARE
    payment_record RECORD;
    update_count INTEGER := 0;
BEGIN
    -- Log what we're about to update
    FOR payment_record IN
        SELECT
            apt.id,
            ap.name as artist_name,
            apt.payment_method,
            apt.description,
            apt.net_amount,
            apt.currency,
            apt.created_at
        FROM artist_payments apt
        JOIN artist_profiles ap ON apt.artist_profile_id = ap.id
        WHERE apt.status = 'pending'
          AND apt.payment_type = 'manual'
          AND apt.created_at >= '2025-09-22'::date
          AND apt.created_at < '2025-09-23'::date
          AND apt.created_by = 'usama@artbattle.com'
    LOOP
        -- Log each payment we're about to update
        INSERT INTO system_logs (service, operation, level, message, request_data)
        VALUES (
            'migration',
            'fix_pending_manual_payment',
            'info',
            format('Updating pending manual payment to paid: %s - $%s %s via %s',
                payment_record.artist_name,
                payment_record.net_amount,
                payment_record.currency,
                payment_record.payment_method
            ),
            jsonb_build_object(
                'payment_id', payment_record.id,
                'artist_name', payment_record.artist_name,
                'amount', payment_record.net_amount,
                'method', payment_record.payment_method,
                'description', payment_record.description,
                'created_at', payment_record.created_at
            )
        );

        update_count := update_count + 1;
    END LOOP;

    -- Update the payments from pending to paid
    UPDATE artist_payments
    SET
        status = 'paid',
        paid_at = CASE WHEN paid_at IS NULL THEN created_at ELSE paid_at END,
        updated_at = NOW(),
        verification_metadata = COALESCE(verification_metadata, '{}'::jsonb) || jsonb_build_object(
            'status_updated_from', 'pending',
            'updated_reason', 'manual_payment_completion',
            'updated_at', NOW()::text,
            'updated_by', 'migration_20250926'
        )
    WHERE status = 'pending'
      AND payment_type = 'manual'
      AND created_at >= '2025-09-22'::date
      AND created_at < '2025-09-23'::date
      AND created_by = 'usama@artbattle.com';

    -- Log summary
    INSERT INTO system_logs (service, operation, level, message, request_data)
    VALUES (
        'migration',
        'fix_pending_manual_payments_summary',
        'info',
        format('Updated %s pending manual payments to paid status', update_count),
        jsonb_build_object(
            'migration_file', '20250926_fix_pending_manual_payments.sql',
            'payments_updated', update_count,
            'applied_at', NOW()::text
        )
    );

    RAISE NOTICE 'Updated % pending manual payments to paid status', update_count;
END $$;
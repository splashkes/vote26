-- Reset Vicki Soar's Stripe account so she can re-onboard with recipient service agreement
-- Her current account (acct_1SEKkvBVOySAd1Bw) is under 'full' service agreement which blocks AU transfers

UPDATE artist_global_payments
SET
  metadata = jsonb_set(
    jsonb_set(
      COALESCE(metadata, '{}'::jsonb),
      '{previous_account_full_service_2}',
      to_jsonb(stripe_recipient_id)
    ),
    '{migration_reason_2}',
    '"second_reset_for_recipient_service_agreement"'
  ),
  stripe_recipient_id = NULL,
  status = 'invited',
  updated_at = NOW()
WHERE stripe_recipient_id = 'acct_1SEKkvBVOySAd1Bw'
  AND artist_name ILIKE '%Vicki%Soar%'
RETURNING artist_name, country, stripe_recipient_id AS old_account, status;

-- Update Vicki Soar's record to use her new recipient service agreement account
-- Old account: acct_1SEKkvBVOySAd1Bw (full service agreement - doesn't work for AU)
-- New account: acct_1SIIx6AxQ7p3rywp (recipient service agreement - works for AU)

UPDATE artist_global_payments
SET
  stripe_recipient_id = 'acct_1SIIx6AxQ7p3rywp',
  status = 'ready',
  metadata = jsonb_set(
    jsonb_set(
      COALESCE(metadata, '{}'::jsonb),
      '{previous_account_full_service}',
      '"acct_1SEKkvBVOySAd1Bw"'
    ),
    '{updated_to_recipient_account}',
    to_jsonb(NOW()::text)
  ),
  updated_at = NOW()
WHERE stripe_recipient_id = 'acct_1SEKkvBVOySAd1Bw'
  AND country = 'AU'
RETURNING artist_profile_id, stripe_recipient_id, status;

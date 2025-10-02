// ============================================================================
// Stripe Global Payments Transfer Edge Function
// ============================================================================
// CRITICAL FIX - 2025-10-02:
// Changed from stripe.payouts.create() to stripe.transfers.create()
//
// WHY THIS CHANGE WAS NECESSARY:
// - The old payouts.create() API uses the "recipient" parameter
// - This only works with "full" service agreement accounts
// - "Full" service agreement only supports ~40 countries (not Thailand, etc.)
// - Artists with "custom" accounts (created by stripe-global-payments-onboard)
//   would get error: "Funds can't be sent to accounts located in TH when
//   the account is under the `full` service agreement"
//
// THE FIX:
// - Use transfers.create() with "destination" parameter instead
// - This works with "custom" Connected Accounts (type: 'custom')
// - Supports 50+ countries including Thailand, Philippines, etc.
// - Money transfers to artist's Stripe balance, then THEY withdraw to bank
// - Same fees, same functionality, broader country support
//
// SEARCH KEYWORDS FOR FUTURE REFERENCE:
// - Thailand payment error
// - Custom account transfers
// - Service agreement full vs custom
// - Stripe Connect international payments
//
// Date Created: 2025-09-09
// Date Fixed: 2025-10-02

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import Stripe from 'https://esm.sh/stripe@13.0.0?target=deno';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};

interface PayoutRequest {
  art_id: string;
  amount: number; // Amount in dollars (will be converted to cents)
  currency?: string;
  artist_profile_id?: string; // Optional - will be derived from art_id if not provided
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Get request body
    const requestBody: PayoutRequest = await req.json();
    console.log('Global Payments payout request:', requestBody);
    
    const { 
      art_id,
      amount,
      currency = 'USD',
      artist_profile_id
    } = requestBody;

    if (!art_id || !amount || amount <= 0) {
      throw new Error('art_id and positive amount are required');
    }

    // Initialize Supabase client with service role
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get artwork and verify it exists, plus get artist info
    const { data: artwork, error: artworkError } = await supabase
      .from('art')
      .select(`
        id,
        art_code,
        artist_profile_id,
        current_bid,
        status,
        artist_profiles:artist_profile_id (
          id,
          name,
          person_id,
          people:person_id (
            first_name,
            last_name,
            email
          )
        )
      `)
      .eq('id', art_id)
      .single();

    if (artworkError || !artwork) {
      throw new Error('Artwork not found: ' + (artworkError?.message || 'No artwork found'));
    }

    const targetArtistProfileId = artist_profile_id || artwork.artist_profile_id;

    // Verify artist profile matches if provided
    if (artist_profile_id && artist_profile_id !== artwork.artist_profile_id) {
      throw new Error('Artist profile ID does not match artwork');
    }

    // Get Global Payments account for this artist
    const { data: globalPaymentAccount, error: accountError } = await supabase
      .from('artist_global_payments')
      .select('*')
      .eq('artist_profile_id', targetArtistProfileId)
      .single();

    if (accountError || !globalPaymentAccount) {
      throw new Error('Global Payments account not found for artist: ' + (accountError?.message || 'No account'));
    }

    if (globalPaymentAccount.status !== 'ready') {
      throw new Error(`Global Payments account not ready. Current status: ${globalPaymentAccount.status}`);
    }

    if (!globalPaymentAccount.stripe_recipient_id) {
      throw new Error('No Stripe recipient ID found for artist');
    }

    // Check if payout already exists for this artwork
    const { data: existingPayout, error: existingError } = await supabase
      .from('global_payment_requests')
      .select('id, status, stripe_payout_id')
      .eq('art_id', art_id)
      .single();

    if (existingError && existingError.code !== 'PGRST116') {
      throw new Error('Error checking existing payout: ' + existingError.message);
    }

    if (existingPayout) {
      return new Response(JSON.stringify({
        message: 'Payout already exists for this artwork',
        existing_payout: {
          id: existingPayout.id,
          status: existingPayout.status,
          stripe_payout_id: existingPayout.stripe_payout_id
        },
        system: 'global_payments'
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200
      });
    }

    // Convert amount to minor currency units (cents)
    const amountMinor = Math.round(amount * 100);

    // Generate idempotency key
    const idempotencyKey = crypto.randomUUID();

    // Create payout request record first (before Stripe call)
    const { data: payoutRecord, error: insertError } = await supabase
      .from('global_payment_requests')
      .insert({
        artist_profile_id: targetArtistProfileId,
        art_id: art_id,
        stripe_recipient_id: globalPaymentAccount.stripe_recipient_id,
        amount_minor: amountMinor,
        currency: currency.toUpperCase(),
        status: 'queued',
        idempotency_key: idempotencyKey,
        metadata: {
          artwork_code: artwork.art_code,
          artist_name: artwork.artist_profiles?.name,
          created_via: 'global_payments_payout_function',
          original_amount: amount
        }
      })
      .select()
      .single();

    if (insertError) {
      console.error('Error creating payout record:', insertError);
      throw new Error('Failed to create payout record');
    }

    // Get Stripe secret key
    const stripeSecretKey = Deno.env.get('stripe_intl_secret_key');
    if (!stripeSecretKey) {
      throw new Error('Stripe secret key not configured');
    }

    // Initialize Stripe
    const stripe = new Stripe(stripeSecretKey, {
      apiVersion: '2023-10-16',
      httpClient: Stripe.createFetchHttpClient()
    });

    try {
      // =====================================================================
      // CRITICAL: Using stripe.transfers.create() NOT stripe.payouts.create()
      // =====================================================================
      // OLD CODE (BROKEN - only worked with ~40 countries):
      //   const payout = await stripe.payouts.create({
      //     recipient: globalPaymentAccount.stripe_recipient_id,  // ❌ WRONG
      //     ...
      //   });
      //
      // NEW CODE (WORKS GLOBALLY - 50+ countries):
      //   const transfer = await stripe.transfers.create({
      //     destination: globalPaymentAccount.stripe_recipient_id,  // ✅ CORRECT
      //     ...
      //   });
      //
      // KEY DIFFERENCES:
      // - payouts.create() = direct bank payout (requires "full" agreement)
      // - transfers.create() = transfer to Stripe balance (works with "custom" accounts)
      // - Custom accounts let artists withdraw themselves to their local bank
      // - This enables payments to Thailand (THB), Philippines (PHP), etc.
      // =====================================================================

      const transfer = await stripe.transfers.create({
        amount: amountMinor,
        currency: currency.toLowerCase(),
        destination: globalPaymentAccount.stripe_recipient_id, // Changed from "recipient" to "destination"
        metadata: {
          art_id: art_id,
          art_code: artwork.art_code,
          artist_profile_id: targetArtistProfileId,
          internal_payout_id: payoutRecord.id,
          payment_method: 'stripe_transfer_api' // Track which API we used
        }
      }, {
        idempotencyKey: idempotencyKey
      });

      console.log('Stripe transfer created:', transfer.id, '- Amount:', amountMinor, currency);

      // Update our record with Stripe transfer ID and status
      // NOTE: We store in stripe_payout_id column for backward compatibility
      // but it's actually a transfer ID now (tr_xxx not po_xxx)
      const { error: updateError } = await supabase
        .from('global_payment_requests')
        .update({
          stripe_payout_id: transfer.id, // Actually a transfer ID (tr_xxx)
          status: 'sent', // Transfers are immediately available in recipient balance
          sent_at: new Date().toISOString(),
          metadata: {
            ...payoutRecord.metadata,
            stripe_status: transfer.object, // Will be 'transfer'
            transfer_type: 'stripe_connect_transfer', // Document the method used
            api_used: 'transfers.create', // IMPORTANT: Track which API for future debugging
            created_timestamp: transfer.created ? new Date(transfer.created * 1000).toISOString() : null
          }
        })
        .eq('id', payoutRecord.id);

      if (updateError) {
        console.error('Error updating payout record with Stripe ID:', updateError);
        // Don't throw - the payout was created successfully
      }

      return new Response(JSON.stringify({
        success: true,
        message: 'Transfer sent successfully - funds available immediately in artist Stripe balance',
        payout: {
          id: payoutRecord.id,
          stripe_transfer_id: transfer.id, // Using transfer ID (tr_xxx format)
          stripe_payout_id: transfer.id, // Kept for backward compatibility
          amount: amount,
          currency: currency,
          destination_account: globalPaymentAccount.stripe_recipient_id,
          status: 'sent',
          transfer_type: 'stripe_connect_transfer',
          note: 'Using Stripe Transfers API for global payment support (50+ countries)'
        },
        system: 'global_payments'
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200
      });

    } catch (stripeError) {
      console.error('Stripe transfer failed:', stripeError);

      // Update our record to reflect the failure
      const { error: failureUpdateError } = await supabase
        .from('global_payment_requests')
        .update({
          status: 'failed',
          error_code: stripeError.code || 'unknown_error',
          error_message: stripeError.message,
          metadata: {
            ...payoutRecord.metadata,
            stripe_error: stripeError.message,
            stripe_error_code: stripeError.code,
            api_used: 'transfers.create',
            failed_at: new Date().toISOString()
          }
        })
        .eq('id', payoutRecord.id);

      if (failureUpdateError) {
        console.error('Error updating failed payment record:', failureUpdateError);
      }

      // Re-throw the Stripe error
      throw new Error(`Stripe transfer failed: ${stripeError.message}`);
    }

  } catch (error) {
    console.error('Error in Global Payments payout:', error);
    return new Response(JSON.stringify({
      error: error.message,
      system: 'global_payments'
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400
    });
  }
});

// ============================================================================
// PRODUCTION IMPLEMENTATION NOTES - UPDATED FOR TRANSFERS API
// ============================================================================
//
// IMPORTANT: This function now uses Stripe Transfers API (not Payouts API)
// Search for "stripe.transfers.create" in code above
//
// 1. Balance Management:
//    - Stripe Transfers require prefunded platform Stripe balance
//    - Monitor balance levels and alert when low
//    - Consider automatic top-ups or manual funding processes
//    - Transfers happen instantly once platform has funds
//
// 2. Error Handling:
//    - Implement retry logic for transient failures
//    - Handle insufficient_funds errors gracefully
//    - Track failed transfers for manual review
//    - Monitor for account_invalid errors (artist account issues)
//
// 3. Compliance & Validation:
//    - Validate recipient account is "ready" status before transfer
//    - Check for country-specific requirements
//    - Handle regulatory restrictions (e.g., sanctions lists)
//    - Verify artist has completed Stripe onboarding
//
// 4. Currency Considerations:
//    - Support multi-currency transfers based on event location (not artist country!)
//    - Artists traveling internationally get paid in event currency
//    - Example: Thai artist in Canada event gets CAD, not THB
//    - Handle FX rates if needed in future
//    - Transfers must match currency of connected account's country
//
// 5. Audit & Reconciliation:
//    - Log all transfer attempts and outcomes
//    - Regular reconciliation with Stripe records
//    - Financial reporting and tax implications
//    - Track which API was used (metadata.api_used = 'transfers.create')
//
// 6. Webhook Integration:
//    - Listen for transfer.created, transfer.updated events from Stripe
//    - Listen for transfer.paid events (when funds reach artist)
//    - Update local records based on transfer status
//    - Handle transfer reversals or failures
//
// 7. Artist Withdrawal Process:
//    - After transfer, funds are in artist's Stripe balance
//    - Artist controls when/how to withdraw to their bank
//    - Stripe handles local payment methods (bank transfer, PromptPay, etc.)
//    - No additional code needed on our side for withdrawals
//
// 8. Migration from Old Payouts System:
//    - Old records have po_xxx IDs (payout IDs)
//    - New records have tr_xxx IDs (transfer IDs)
//    - Both stored in stripe_payout_id column for backward compatibility
//    - Check metadata.api_used field to determine which API was used
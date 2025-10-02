// ============================================================================
// Stripe Instant Payout Function - CURRENTLY DISABLED
// ============================================================================
// STATUS: DISABLED (2025-10-02)
//
// REASON FOR DISABLING:
// - Instant Payouts only work with "full" or "express" service agreement accounts
// - Our Global Payments system uses "custom" accounts for international support
// - This caused errors for artists in Thailand and other non-US/CA countries
// - We're focusing on getting basic transfers working first
//
// CURRENT PAYMENT FLOW (USING REGULAR TRANSFERS):
// 1. Use process-pending-payments function (regular transfers)
// 2. Money goes to artist's Stripe balance immediately
// 3. Artist withdraws to their bank on their own schedule
// 4. Works with ALL countries (50+), not just instant payout countries
//
// FUTURE RE-ENABLEMENT:
// If we want instant payouts again, they only work for:
// - United States (USD), Canada (CAD), United Kingdom (GBP)
// - European Union (EUR), Singapore (SGD), Australia (AUD)
// - Norway (NOK), New Zealand (NZD), Malaysia (MYR)
// - Currency MUST match country (e.g., CAD for Canada, not USD)
// - And artist must have "express" account type (not "custom")
//
// ============================================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Max-Age': '86400',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  // ========================================================================
  // INSTANT PAYOUTS ARE DISABLED - Return error immediately
  // ========================================================================
  return new Response(JSON.stringify({
    success: false,
    error: 'Instant Payouts are currently disabled',
    message: 'Instant Payouts have been disabled to support international artists. Please use regular payment processing instead.',
    details: {
      reason: 'Instant Payouts only work with express/full service agreement accounts, but our Global Payments system uses custom accounts for international support (Thailand, Philippines, etc.)',
      alternative: 'Use the "Process Payment" button which uses regular transfers - works with all countries and funds are available immediately in artist Stripe balance',
      disabled_date: '2025-10-02',
      status: 'DISABLED'
    }
  }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    status: 400
  });

  // ========================================================================
  // OLD CODE BELOW - Kept for reference if we re-enable instant payouts
  // ========================================================================
  /*
  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { payment_id } = await req.json();

    if (!payment_id) {
      return new Response(JSON.stringify({
        error: 'payment_id is required',
        success: false
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400
      });
    }

    // Get payment details with Stripe account info
    const { data: payment, error: paymentError } = await supabaseClient
      .from('artist_payments')
      .select(`
        id,
        artist_profile_id,
        gross_amount,
        currency,
        status,
        stripe_transfer_id,
        metadata,
        artist_profiles!inner (
          name,
          email,
          artist_global_payments!inner (
            stripe_recipient_id,
            status
          )
        )
      `)
      .eq('id', payment_id)
      .single();

    if (paymentError || !payment) {
      return new Response(JSON.stringify({
        error: 'Payment not found',
        success: false,
        debug: paymentError
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 404
      });
    }

    // Verify payment is eligible for instant payout
    if (!['completed', 'paid', 'verified'].includes(payment.status)) {
      return new Response(JSON.stringify({
        error: 'Payment not completed - cannot process instant payout',
        payment_status: payment.status,
        success: false
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400
      });
    }

    // Check if instant payout already processed
    if (payment.metadata?.instant_payout_processed) {
      return new Response(JSON.stringify({
        error: 'Instant payout already processed for this payment',
        success: false,
        existing_instant_payout: payment.metadata.instant_payout_details
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400
      });
    }

    const stripeAccountId = payment.artist_profiles.artist_global_payments?.stripe_recipient_id;
    if (!stripeAccountId) {
      return new Response(JSON.stringify({
        error: 'No Stripe account configured for this artist',
        success: false
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400
      });
    }

    // Determine which Stripe API key to use
    let stripeApiKey: string | undefined;
    const currency = payment.currency || 'USD';

    if (currency === 'CAD') {
      stripeApiKey = Deno.env.get('stripe_canada_secret_key');
    } else {
      stripeApiKey = Deno.env.get('stripe_intl_secret_key');
    }

    if (!stripeApiKey) {
      return new Response(JSON.stringify({
        error: `Stripe API key not configured for ${currency}`,
        success: false
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500
      });
    }

    // Calculate instant payout amounts
    const originalAmount = payment.gross_amount;
    const ourFeePercentage = 0.015; // 1.5%
    const ourFee = originalAmount * ourFeePercentage;
    const netToArtist = originalAmount - ourFee;

    // Get eligible external accounts for instant payout
    const externalAccountsResponse = await fetch(
      `https://api.stripe.com/v1/accounts/${stripeAccountId}/external_accounts?limit=10`,
      {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${stripeApiKey}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      }
    );

    if (!externalAccountsResponse.ok) {
      const errorData = await externalAccountsResponse.json();
      return new Response(JSON.stringify({
        error: 'Failed to retrieve external accounts',
        stripe_error: errorData,
        success: false
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500
      });
    }

    const externalAccountsData = await externalAccountsResponse.json();
    const instantEligibleAccounts = externalAccountsData.data?.filter(account =>
      account.available_payout_methods?.includes('instant')
    ) || [];

    if (instantEligibleAccounts.length === 0) {
      return new Response(JSON.stringify({
        error: 'No instant-eligible external accounts found',
        success: false
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400
      });
    }

    // Use the first eligible account (could be enhanced to let artist choose)
    const destinationAccount = instantEligibleAccounts[0];

    // Track API call timing
    const apiCallStart = Date.now();

    // Create instant payout
    const instantPayoutResponse = await fetch('https://api.stripe.com/v1/payouts', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${stripeApiKey}`,
        'Stripe-Account': stripeAccountId,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        amount: Math.round(netToArtist * 100).toString(), // Convert to cents, after fee deduction
        currency: currency.toLowerCase(),
        method: 'instant',
        destination: destinationAccount.id,
        description: `Instant payout for ${payment.artist_profiles.name} - Original: ${currency} ${originalAmount}, Fee: ${currency} ${ourFee.toFixed(2)}`,
        'metadata[original_payment_id]': payment.id,
        'metadata[original_amount]': originalAmount.toString(),
        'metadata[our_fee]': ourFee.toString(),
        'metadata[net_amount]': netToArtist.toString(),
        'metadata[fee_percentage]': '1.5',
        'metadata[processed_by]': 'instant-payout-system'
      }),
    });

    const apiCallDuration = Date.now() - apiCallStart;
    const stripePayoutResponse = await instantPayoutResponse.json();

    // Log the complete API conversation to database
    await supabaseClient
      .from('stripe_api_conversations')
      .insert({
        payment_id: payment.id,
        artist_profile_id: payment.artist_profile_id,
        stripe_account_id: currency === 'CAD' ? 'canada' : 'international',
        api_endpoint: 'https://api.stripe.com/v1/payouts',
        request_method: 'POST',
        request_headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'stripe_account': stripeAccountId
        },
        request_body: {
          amount: Math.round(netToArtist * 100),
          currency: currency.toLowerCase(),
          method: 'instant',
          destination: destinationAccount.id,
          description: `Instant payout for ${payment.artist_profiles.name}`,
          metadata: {
            original_payment_id: payment.id,
            original_amount: originalAmount.toString(),
            our_fee: ourFee.toString(),
            net_amount: netToArtist.toString(),
            fee_percentage: '1.5'
          }
        },
        response_status: instantPayoutResponse.status,
        response_headers: {
          'content-type': instantPayoutResponse.headers.get('content-type'),
          'request-id': instantPayoutResponse.headers.get('request-id')
        },
        response_body: stripePayoutResponse,
        error_message: !instantPayoutResponse.ok ? (stripePayoutResponse.error?.message || 'Instant payout failed') : null,
        processing_duration_ms: apiCallDuration,
        created_by: 'process-instant-payout'
      });

    if (!instantPayoutResponse.ok) {
      return new Response(JSON.stringify({
        error: 'Instant payout failed',
        success: false,
        stripe_error: stripePayoutResponse,
        debug: {
          status: instantPayoutResponse.status,
          payment_id: payment.id,
          stripe_account: stripeAccountId,
          amount_attempted: Math.round(netToArtist * 100),
          api_conversation_logged: true
        }
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400
      });
    }

    // Update payment record with instant payout information
    const updatedMetadata = {
      ...payment.metadata,
      instant_payout_processed: true,
      instant_payout_details: {
        stripe_payout_id: stripePayoutResponse.id,
        processed_at: new Date().toISOString(),
        original_amount: originalAmount,
        our_fee: ourFee,
        net_to_artist: netToArtist,
        fee_percentage: 1.5,
        destination_account: destinationAccount.id,
        destination_type: destinationAccount.object // 'bank_account' or 'card'
      }
    };

    await supabaseClient
      .from('artist_payments')
      .update({
        metadata: updatedMetadata
      })
      .eq('id', payment.id);

    const result = {
      success: true,
      message: 'Instant payout processed successfully',
      payment_id: payment.id,
      artist_name: payment.artist_profiles.name,
      stripe_payout_id: stripePayoutResponse.id,
      original_amount: originalAmount,
      our_fee: ourFee,
      net_to_artist: netToArtist,
      currency: currency,
      destination_account: {
        id: destinationAccount.id,
        type: destinationAccount.object,
        last4: destinationAccount.last4
      },
      estimated_arrival: 'Within 30 minutes',
      api_conversation_logged: true,
      debug: {
        api_call_duration_ms: apiCallDuration,
        stripe_payout_status: stripePayoutResponse.status || 'pending'
      }
    };

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Error processing instant payout:', error);
    return new Response(JSON.stringify({
      error: error.message,
      success: false,
      debug: {
        name: error.name,
        stack: error.stack
      }
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
  */
});
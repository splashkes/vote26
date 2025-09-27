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

    // Payment must be completed/verified to be eligible for instant payout
    if (!['completed', 'paid', 'verified'].includes(payment.status)) {
      return new Response(JSON.stringify({
        eligible: false,
        reason: 'Payment not completed',
        payment_status: payment.status,
        success: true
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const stripeAccountId = payment.artist_profiles.artist_global_payments?.stripe_recipient_id;
    if (!stripeAccountId) {
      return new Response(JSON.stringify({
        eligible: false,
        reason: 'No Stripe account configured',
        success: true
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
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
        eligible: false,
        reason: `Stripe API key not configured for ${currency}`,
        success: true
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Check Stripe balance and instant availability
    const balanceResponse = await fetch(
      `https://api.stripe.com/v1/balance?expand[]=instant_available.net_available`,
      {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${stripeApiKey}`,
          'Stripe-Account': stripeAccountId,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      }
    );

    if (!balanceResponse.ok) {
      const errorData = await balanceResponse.json();
      return new Response(JSON.stringify({
        eligible: false,
        reason: 'Failed to check Stripe balance',
        stripe_error: errorData,
        success: true
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const balanceData = await balanceResponse.json();

    // Check external accounts for instant payout eligibility
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

    let externalAccountsData = { data: [] };
    if (externalAccountsResponse.ok) {
      externalAccountsData = await externalAccountsResponse.json();
    }

    // Find instant-eligible external accounts
    const instantEligibleAccounts = externalAccountsData.data?.filter(account =>
      account.available_payout_methods?.includes('instant')
    ) || [];

    // Check if there's instant available balance
    const instantAvailable = balanceData.instant_available || [];
    const relevantInstantBalance = instantAvailable.find(balance =>
      balance.currency.toLowerCase() === currency.toLowerCase()
    );

    const hasInstantBalance = relevantInstantBalance && relevantInstantBalance.amount > 0;
    const hasEligibleAccount = instantEligibleAccounts.length > 0;

    // Calculate fee amounts (1.5% our fee)
    const originalAmount = payment.gross_amount;
    const ourFeePercentage = 0.015; // 1.5%
    const ourFee = originalAmount * ourFeePercentage;
    const netToArtist = originalAmount - ourFee;

    const result = {
      eligible: hasInstantBalance && hasEligibleAccount,
      payment_id: payment.id,
      artist_name: payment.artist_profiles.name,
      original_amount: originalAmount,
      currency: currency,
      our_fee: ourFee,
      net_to_artist: netToArtist,
      eligibility_details: {
        has_instant_balance: hasInstantBalance,
        instant_balance_amount: relevantInstantBalance?.amount || 0,
        has_eligible_account: hasEligibleAccount,
        eligible_accounts_count: instantEligibleAccounts.length,
        payment_status: payment.status
      },
      reason: !hasInstantBalance ? 'No instant balance available' :
              !hasEligibleAccount ? 'No instant-eligible external accounts' :
              'Eligible for instant payout',
      success: true
    };

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Error checking instant payout eligibility:', error);
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
});
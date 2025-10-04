// Test Australian Payment Transfer
// Diagnostic function to test AUD transfers to Australian account

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import Stripe from 'https://esm.sh/stripe@13.0.0?target=deno';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const ACCOUNT_ID = "acct_1SEKkvBVOySAd1Bw";
    const AMOUNT_AUD = 2750; // 27.50 AUD in cents
    const CURRENCY = "aud";

    // Get Stripe key
    const stripeKey = Deno.env.get('stripe_intl_secret_key');
    if (!stripeKey) {
      throw new Error('Stripe international key not configured');
    }

    const stripe = new Stripe(stripeKey, {
      apiVersion: '2023-10-16',
      typescript: true
    });

    const diagnostics: any = {
      test_timestamp: new Date().toISOString(),
      account_id: ACCOUNT_ID,
      test_amount: AMOUNT_AUD,
      test_currency: CURRENCY
    };

    // STEP 1: Get account details
    console.log('Step 1: Retrieving account details...');
    try {
      const account = await stripe.accounts.retrieve(ACCOUNT_ID);
      diagnostics.account_details = {
        id: account.id,
        type: account.type,
        country: account.country,
        default_currency: account.default_currency,
        capabilities: account.capabilities,
        charges_enabled: account.charges_enabled,
        payouts_enabled: account.payouts_enabled,
        requirements_currently_due: account.requirements?.currently_due || [],
        requirements_disabled_reason: account.requirements?.disabled_reason
      };
      console.log('Account details:', diagnostics.account_details);
    } catch (accountError: any) {
      diagnostics.account_error = {
        message: accountError.message,
        type: accountError.type,
        code: accountError.code
      };
      console.error('Account retrieval error:', accountError);
    }

    // STEP 2: Check platform balance
    console.log('Step 2: Checking platform balance...');
    try {
      const balance = await stripe.balance.retrieve();
      diagnostics.platform_balance = {
        available: balance.available,
        pending: balance.pending,
        aud_available: balance.available?.find((b: any) => b.currency === 'aud') || 'No AUD balance',
        usd_available: balance.available?.find((b: any) => b.currency === 'usd') || 'No USD balance'
      };
      console.log('Platform balance:', diagnostics.platform_balance);
    } catch (balanceError: any) {
      diagnostics.balance_error = {
        message: balanceError.message,
        type: balanceError.type,
        code: balanceError.code
      };
      console.error('Balance retrieval error:', balanceError);
    }

    // STEP 3: Attempt transfer
    console.log('Step 3: Attempting transfer...');
    try {
      const transfer = await stripe.transfers.create({
        amount: AMOUNT_AUD,
        currency: CURRENCY,
        destination: ACCOUNT_ID,
        description: 'Test payment for Australian artist - Vicki Soar',
        metadata: {
          artist_profile_id: '9d8ef7a2-a259-441b-b076-fb3a4cc24e9f',
          test: 'diagnostic_test',
          test_timestamp: new Date().toISOString()
        }
      });

      diagnostics.transfer_success = {
        id: transfer.id,
        amount: transfer.amount,
        currency: transfer.currency,
        destination: transfer.destination,
        status: transfer.object,
        created: transfer.created,
        description: transfer.description
      };
      console.log('✅ Transfer successful!', diagnostics.transfer_success);

    } catch (transferError: any) {
      diagnostics.transfer_error = {
        message: transferError.message,
        type: transferError.type,
        code: transferError.code,
        param: transferError.param,
        doc_url: transferError.doc_url,
        raw_error: transferError.raw
      };
      console.error('❌ Transfer failed:', diagnostics.transfer_error);
    }

    return new Response(JSON.stringify(diagnostics, null, 2), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200
    });

  } catch (error: any) {
    console.error('Test function error:', error);
    return new Response(JSON.stringify({
      error: error.message,
      stack: error.stack
    }, null, 2), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500
    });
  }
});

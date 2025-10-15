import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import Stripe from 'https://esm.sh/stripe@14.21.0?target=deno';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const stripeKey = Deno.env.get('stripe_intl_secret_key');
    if (!stripeKey) {
      throw new Error('Stripe international key not configured');
    }

    const stripe = new Stripe(stripeKey, {
      apiVersion: '2023-10-16',
    });

    const results: any = {
      test: 'Test destination_amount Transfer Parameter',
      timestamp: new Date().toISOString(),
    };

    // Test: Send exactly 5.00 AUD to Vicki Soar
    const VICKI_ACCOUNT_ID = 'acct_1SIIx6AxQ7p3rywp';
    const TARGET_AUD_AMOUNT = 500; // 5.00 AUD in cents

    results.test_params = {
      destination_account: VICKI_ACCOUNT_ID,
      target_amount_aud: '5.00 AUD',
      target_amount_cents: TARGET_AUD_AMOUNT,
      platform_pays_from: 'USD balance'
    };

    // STEP 1: Check platform balance before
    console.log('Step 1: Checking platform balance...');
    const balanceBefore = await stripe.balance.retrieve();
    const usdBefore = balanceBefore.available?.find((b: any) => b.currency === 'usd');

    results.balance_before = {
      usd_available_cents: usdBefore?.amount || 0,
      usd_available_dollars: usdBefore ? (usdBefore.amount / 100).toFixed(2) : '0.00'
    };

    // STEP 2: Verify Vicki's account
    console.log('Step 2: Verifying destination account...');
    const account = await stripe.accounts.retrieve(VICKI_ACCOUNT_ID);
    results.destination_account = {
      id: account.id,
      country: account.country,
      default_currency: account.default_currency,
      service_agreement: account.tos_acceptance?.service_agreement,
      transfers_enabled: account.capabilities?.transfers === 'active'
    };

    // STEP 3: Create transfer with destination_amount
    console.log('Step 3: Creating transfer with destination_amount...');
    try {
      const transfer = await stripe.transfers.create({
        currency: 'usd', // What we're paying FROM (our platform balance)
        destination: VICKI_ACCOUNT_ID,
        // @ts-ignore - destination_amount exists but may not be in types
        destination_amount: TARGET_AUD_AMOUNT, // What artist receives in AUD
        description: 'TEST: destination_amount parameter - 5 AUD to Vicki Soar',
        metadata: {
          test: 'destination_amount_fx_conversion',
          target_aud: '5.00',
          artist_name: 'Vicki Soar'
        }
      });

      results.transfer_success = {
        status: '✅ SUCCESS',
        transfer_id: transfer.id,
        amount_charged_usd_cents: transfer.amount,
        amount_charged_usd_dollars: (transfer.amount / 100).toFixed(2),
        currency_charged: transfer.currency,
        // @ts-ignore
        destination_amount_cents: transfer.destination_amount || 'not returned',
        // @ts-ignore
        destination_amount_aud: transfer.destination_amount ? (transfer.destination_amount / 100).toFixed(2) : 'not returned',
        destination: transfer.destination,
        description: transfer.description,
        created: new Date(transfer.created * 1000).toISOString()
      };

      // STEP 4: Check balance after
      console.log('Step 4: Checking platform balance after transfer...');
      const balanceAfter = await stripe.balance.retrieve();
      const usdAfter = balanceAfter.available?.find((b: any) => b.currency === 'usd');

      results.balance_after = {
        usd_available_cents: usdAfter?.amount || 0,
        usd_available_dollars: usdAfter ? (usdAfter.amount / 100).toFixed(2) : '0.00'
      };

      // STEP 5: Calculate what happened
      const usdChargedCents = (usdBefore?.amount || 0) - (usdAfter?.amount || 0);
      results.calculation = {
        usd_balance_before: (usdBefore?.amount || 0) / 100,
        usd_balance_after: (usdAfter?.amount || 0) / 100,
        usd_charged: (usdChargedCents / 100).toFixed(2),
        target_aud: '5.00',
        effective_fx_rate: ((TARGET_AUD_AMOUNT / 100) / (usdChargedCents / 100)).toFixed(4),
        platform_cost_usd: (usdChargedCents / 100).toFixed(2)
      };

      results.summary = {
        result: '✅ TRANSFER SUCCESSFUL',
        artist_receives: '5.00 AUD',
        platform_pays: `$${results.calculation.usd_charged} USD`,
        fx_rate_used: results.calculation.effective_fx_rate + ' AUD per USD',
        recommendation: 'Use destination_amount for all international transfers'
      };

    } catch (transferError: any) {
      results.transfer_error = {
        status: '❌ FAILED',
        error_type: transferError.type,
        error_code: transferError.code,
        message: transferError.message,
        param: transferError.param,
        doc_url: transferError.doc_url,
        request_log_url: transferError.raw?.request_log_url
      };

      results.summary = {
        result: '❌ TRANSFER FAILED',
        reason: transferError.message,
        next_step: 'Check if destination_amount parameter is available for this account type'
      };
    }

    return new Response(JSON.stringify(results, null, 2), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (error: any) {
    console.error('Error in test-destination-amount-transfer:', error);
    return new Response(
      JSON.stringify({
        error: error.message,
        stack: error.stack
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});

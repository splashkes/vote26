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
      test: 'Simple USD Transfer to AUD Account',
      timestamp: new Date().toISOString(),
    };

    // Test: Send USD to AUD account, let Stripe/account handle conversion
    const VICKI_ACCOUNT_ID = 'acct_1SIIx6AxQ7p3rywp';
    const USD_TO_SEND_CENTS = 330; // $3.30 USD

    results.test_params = {
      destination_account: VICKI_ACCOUNT_ID,
      amount_usd: '$3.30 USD',
      amount_cents: USD_TO_SEND_CENTS,
      approach: 'Send USD, recipient account handles conversion'
    };

    // STEP 1: Check platform balance
    console.log('Step 1: Checking platform balance...');
    const balanceBefore = await stripe.balance.retrieve();
    const usdBefore = balanceBefore.available?.find((b: any) => b.currency === 'usd');

    results.balance_before = {
      usd_available_cents: usdBefore?.amount || 0,
      usd_available_dollars: usdBefore ? (usdBefore.amount / 100).toFixed(2) : '0.00'
    };

    // STEP 2: Get current FX rate for reference
    console.log('Step 2: Getting FX rate for reference...');
    try {
      const fxResponse = await fetch('https://api.exchangerate-api.com/v4/latest/USD');
      const fxData = await fxResponse.json();
      const usdToAud = fxData.rates.AUD;

      results.fx_rate_reference = {
        source: 'exchangerate-api.com',
        usd_to_aud_rate: usdToAud,
        estimated_aud_artist_receives: ((USD_TO_SEND_CENTS / 100) * usdToAud).toFixed(2) + ' AUD'
      };
    } catch (fxError: any) {
      results.fx_rate_reference = {
        error: fxError.message
      };
    }

    // STEP 3: Create simple USD transfer
    console.log('Step 3: Creating USD transfer to AUD account...');
    try {
      const transfer = await stripe.transfers.create({
        amount: USD_TO_SEND_CENTS,
        currency: 'usd',
        destination: VICKI_ACCOUNT_ID,
        description: 'TEST: $3.30 USD to AUD recipient account',
        metadata: {
          test: 'usd_to_aud_simple_transfer',
          amount_usd: '3.30',
          artist_name: 'Vicki Soar'
        }
      });

      results.transfer_success = {
        status: '✅ SUCCESS',
        transfer_id: transfer.id,
        amount_usd_cents: transfer.amount,
        amount_usd_dollars: (transfer.amount / 100).toFixed(2),
        currency: transfer.currency,
        destination: transfer.destination,
        description: transfer.description,
        created: new Date(transfer.created * 1000).toISOString()
      };

      // STEP 4: Check if transfer shows any FX info
      const transferDetails = await stripe.transfers.retrieve(transfer.id);
      results.transfer_details = {
        amount: transferDetails.amount,
        currency: transferDetails.currency,
        destination_payment: transferDetails.destination_payment,
        // @ts-ignore - check if any FX fields exist
        exchange_rate: transferDetails.exchange_rate || 'not provided',
        // @ts-ignore
        destination_amount: transferDetails.destination_amount || 'not provided'
      };

      // STEP 5: Check balance after
      const balanceAfter = await stripe.balance.retrieve();
      const usdAfter = balanceAfter.available?.find((b: any) => b.currency === 'usd');

      results.balance_after = {
        usd_available_cents: usdAfter?.amount || 0,
        usd_available_dollars: usdAfter ? (usdAfter.amount / 100).toFixed(2) : '0.00'
      };

      const usdChargedCents = (usdBefore?.amount || 0) - (usdAfter?.amount || 0);
      results.calculation = {
        usd_charged_dollars: (usdChargedCents / 100).toFixed(2),
        matches_expected: usdChargedCents === USD_TO_SEND_CENTS
      };

      results.summary = {
        result: '✅ TRANSFER SUCCESSFUL',
        platform_paid: `$${(USD_TO_SEND_CENTS / 100).toFixed(2)} USD`,
        artist_receives: 'USD amount (converted to AUD by Stripe on payout)',
        note: 'Stripe handles FX conversion when transferring to recipient account',
        recommendation: 'Use external FX API to calculate USD amount needed for desired AUD amount'
      };

    } catch (transferError: any) {
      results.transfer_error = {
        status: '❌ FAILED',
        error_type: transferError.type,
        error_code: transferError.code,
        message: transferError.message,
        request_log_url: transferError.raw?.request_log_url
      };
    }

    return new Response(JSON.stringify(results, null, 2), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (error: any) {
    console.error('Error in test-usd-to-aud-transfer:', error);
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

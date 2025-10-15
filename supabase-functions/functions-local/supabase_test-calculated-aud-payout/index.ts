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
      test: 'Calculated USD Transfer for Exact AUD Payout',
      timestamp: new Date().toISOString(),
    };

    // GOAL: Artist receives exactly 5.00 AUD
    const TARGET_AUD = 5.00;
    const VICKI_ACCOUNT_ID = 'acct_1SIIx6AxQ7p3rywp';

    results.goal = {
      artist_should_receive: TARGET_AUD + ' AUD',
      question: 'How much USD do we send to achieve this?'
    };

    // STEP 1: Get market FX rate
    console.log('Step 1: Getting market FX rate...');
    const fxResponse = await fetch('https://api.exchangerate-api.com/v4/latest/USD');
    const fxData = await fxResponse.json();
    const marketUsdToAud = fxData.rates.AUD; // e.g., 1 USD = 1.54 AUD

    results.fx_market_rate = {
      source: 'exchangerate-api.com',
      usd_to_aud: marketUsdToAud,
      meaning: `1 USD = ${marketUsdToAud} AUD at market rate`
    };

    // STEP 2: Calculate USD needed with Stripe FX spread
    // Stripe typically charges ~1% FX spread
    const STRIPE_FX_SPREAD = 0.01; // 1%
    const effectiveUsdToAud = marketUsdToAud * (1 - STRIPE_FX_SPREAD);
    const usdNeeded = TARGET_AUD / effectiveUsdToAud;
    const usdNeededCents = Math.ceil(usdNeeded * 100); // Round up to ensure artist gets at least target

    results.calculation = {
      market_rate: marketUsdToAud,
      estimated_stripe_spread: '1%',
      effective_rate_after_spread: effectiveUsdToAud.toFixed(4),
      usd_needed_exact: usdNeeded.toFixed(4),
      usd_to_send_cents: usdNeededCents,
      usd_to_send_dollars: (usdNeededCents / 100).toFixed(2)
    };

    // STEP 3: Check balance
    const balanceBefore = await stripe.balance.retrieve();
    const usdBefore = balanceBefore.available?.find((b: any) => b.currency === 'usd');

    results.balance_before = {
      usd_available: (usdBefore?.amount || 0) / 100
    };

    // STEP 4: Create transfer with calculated USD amount
    console.log(`Step 4: Sending $${(usdNeededCents / 100).toFixed(2)} USD for ${TARGET_AUD} AUD payout...`);

    try {
      const transfer = await stripe.transfers.create({
        amount: usdNeededCents,
        currency: 'usd',
        destination: VICKI_ACCOUNT_ID,
        description: `TEST: Calculated transfer for ${TARGET_AUD} AUD payout`,
        metadata: {
          test: 'calculated_aud_payout',
          target_aud: TARGET_AUD.toString(),
          market_fx_rate: marketUsdToAud.toString(),
          estimated_spread: STRIPE_FX_SPREAD.toString(),
          artist_name: 'Vicki Soar'
        }
      });

      results.transfer_success = {
        status: '✅ SUCCESS',
        transfer_id: transfer.id,
        usd_sent_cents: transfer.amount,
        usd_sent_dollars: (transfer.amount / 100).toFixed(2),
        created: new Date(transfer.created * 1000).toISOString()
      };

      // STEP 5: Calculate verification
      const audArtistShouldReceive = (transfer.amount / 100) * effectiveUsdToAud;

      results.verification = {
        usd_platform_sent: (transfer.amount / 100).toFixed(2) + ' USD',
        aud_artist_receives_estimated: audArtistShouldReceive.toFixed(2) + ' AUD',
        target_was: TARGET_AUD + ' AUD',
        difference: (audArtistShouldReceive - TARGET_AUD).toFixed(2) + ' AUD',
        meets_target: audArtistShouldReceive >= TARGET_AUD
      };

      results.summary = {
        result: '✅ TRANSFER SUCCESSFUL',
        approach: 'Calculate USD using market FX rate with estimated 1% Stripe spread',
        platform_cost: `$${(transfer.amount / 100).toFixed(2)} USD`,
        artist_receives: `~${audArtistShouldReceive.toFixed(2)} AUD (estimated)`,
        note: 'Actual AUD amount depends on Stripe\'s FX rate at settlement time',
        recommendation: 'This approach ensures artist receives at least target AUD (rounded up)'
      };

    } catch (transferError: any) {
      results.transfer_error = {
        status: '❌ FAILED',
        message: transferError.message,
        type: transferError.type,
        code: transferError.code
      };
    }

    return new Response(JSON.stringify(results, null, 2), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (error: any) {
    console.error('Error in test-calculated-aud-payout:', error);
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

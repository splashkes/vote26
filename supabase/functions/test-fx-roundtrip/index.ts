// Test FX Round-Trip Cost
// Tests what we lose converting THB→USD→THB through Stripe

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
    const THAI_ACCOUNT = "acct_1SFRmCPka2JQHZ1n";
    const STARTING_THB = 161750; // 1,617.50 THB (what customer pays)

    const stripeKey = Deno.env.get('stripe_intl_secret_key');
    if (!stripeKey) {
      throw new Error('Stripe key not configured');
    }

    const stripe = new Stripe(stripeKey, {
      apiVersion: '2023-10-16',
      typescript: true
    });

    const results: any = {
      timestamp: new Date().toISOString(),
      scenario: 'Customer pays THB → Platform receives USD → Artist receives THB',
      starting_amount_thb: STARTING_THB / 100,
    };

    // STEP 1: Customer pays in THB, we receive in USD
    // (Simulating what happens when customer pays in local currency)
    console.log('STEP 1: Creating FX quote for THB → USD (customer payment)...');

    try {
      // Use direct API call for FX Quotes (preview feature)
      const quoteResponse1 = await fetch('https://api.stripe.com/v1/fx_quotes', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${stripeKey}`,
          'Content-Type': 'application/x-www-form-urlencoded',
          'Stripe-Version': '2025-09-30.preview; fx_quote_preview=v1',
        },
        body: new URLSearchParams({
          'from_currencies[]': 'thb',
          to_currency: 'usd',
          amount: STARTING_THB.toString(),
          lock_duration: 'five_minutes',
        }),
      });

      const quote1 = await quoteResponse1.json();

      if (!quoteResponse1.ok) {
        throw new Error(quote1.error?.message || 'FX Quote 1 failed');
      }

      results.step1_customer_payment = {
        customer_pays_thb: STARTING_THB / 100,
        exchange_rate: quote1.exchange_rate,
        platform_receives_usd_cents: quote1.target_amount,
        platform_receives_usd_dollars: quote1.target_amount / 100,
        quote_id: quote1.id,
      };

      console.log('Customer pays:', STARTING_THB / 100, 'THB');
      console.log('Platform receives:', quote1.target_amount / 100, 'USD');

      // STEP 2: We pay artist in THB using our USD balance
      console.log('STEP 2: Creating FX quote for USD → THB (artist payout)...');

      const usdAmount = quote1.target_amount; // Use what we received

      const quoteResponse2 = await fetch('https://api.stripe.com/v1/fx_quotes', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${stripeKey}`,
          'Content-Type': 'application/x-www-form-urlencoded',
          'Stripe-Version': '2025-09-30.preview; fx_quote_preview=v1',
        },
        body: new URLSearchParams({
          'from_currencies[]': 'usd',
          to_currency: 'thb',
          amount: usdAmount.toString(),
          lock_duration: 'five_minutes',
          'usage[type]': 'transfer',
          'usage[transfer][destination]': THAI_ACCOUNT,
        }),
      });

      const quote2 = await quoteResponse2.json();

      if (!quoteResponse2.ok) {
        throw new Error(quote2.error?.message || 'FX Quote 2 failed');
      }

      results.step2_artist_payout = {
        platform_sends_usd_cents: usdAmount,
        platform_sends_usd_dollars: usdAmount / 100,
        exchange_rate: quote2.exchange_rate,
        artist_receives_thb: quote2.target_amount / 100,
        quote_id: quote2.id,
      };

      console.log('Platform sends:', usdAmount / 100, 'USD');
      console.log('Artist receives:', quote2.target_amount / 100, 'THB');

      // CALCULATE THE LOSS
      const startingTHB = STARTING_THB / 100;
      const endingTHB = quote2.target_amount / 100;
      const lostTHB = startingTHB - endingTHB;
      const lostPercent = (lostTHB / startingTHB) * 100;

      results.fx_cost_analysis = {
        customer_paid_thb: startingTHB,
        artist_received_thb: endingTHB,
        lost_in_conversion_thb: lostTHB,
        lost_percentage: lostPercent.toFixed(3) + '%',
        explanation: 'This is the total FX spread from both conversions (THB→USD→THB)',
      };

      // ALTERNATIVE: What if we just send USD to Thai artist?
      console.log('ALTERNATIVE: What if artist receives USD instead?');

      results.alternative_usd_payment = {
        platform_sends_usd_dollars: usdAmount / 100,
        artist_receives_usd_dollars: usdAmount / 100,
        note: 'Artist gets USD in Stripe, converts to THB when withdrawing to Thai bank',
        artist_bank_will_convert: 'Artist\'s Thai bank will convert USD → THB with their own rate',
      };

      // COMPARISON
      results.recommendation = {
        option_a: {
          name: 'Platform converts USD → THB via Stripe FX Quotes',
          artist_receives: endingTHB + ' THB (exact)',
          platform_cost: lostPercent.toFixed(3) + '% FX spread',
          pros: ['Artist gets exact THB amount', 'Predictable', 'Professional'],
          cons: ['Platform pays FX fees', 'Requires FX Quotes API'],
        },
        option_b: {
          name: 'Send USD directly, artist converts locally',
          artist_receives: (usdAmount / 100) + ' USD',
          artist_converts_to_thb: '~' + (usdAmount / 100 * 30.5).toFixed(2) + ' THB (varies by bank)',
          platform_cost: '0% (artist pays FX fees)',
          pros: ['No platform FX cost', 'Simpler code', 'Works now'],
          cons: ['Artist gets less (bank rates worse)', 'Amount uncertain', 'Less professional'],
        },
        best_choice: lostPercent < 2 ? 'Option A (platform converts)' : 'Option B (artist converts)',
        reasoning: lostPercent < 2
          ? 'Stripe FX spread is reasonable, provide better UX for artists'
          : 'FX spread too high, let artists handle conversion',
      };

    } catch (quoteError: any) {
      results.error = {
        message: quoteError.message,
        type: quoteError.type,
        code: quoteError.code,
        note: 'FX Quotes API may require specific Stripe account configuration or API version',
      };
      console.error('FX Quote error:', quoteError);
    }

    return new Response(JSON.stringify(results, null, 2), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200
    });

  } catch (error: any) {
    console.error('Test error:', error);
    return new Response(JSON.stringify({
      error: error.message,
      stack: error.stack
    }, null, 2), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500
    });
  }
});

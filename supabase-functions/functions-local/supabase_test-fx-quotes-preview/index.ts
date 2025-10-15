import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

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

    const results: any = {
      test: 'FX Quotes API (Preview) - Test Access',
      timestamp: new Date().toISOString(),
    };

    const authHeader = 'Basic ' + btoa(stripeKey + ':');

    // TEST 1: Try FX Quotes API with preview version
    console.log('Test 1: FX Quotes API - USD to AUD for 5 AUD target');
    try {
      // We want to know: How much USD to send so artist gets 5 AUD
      // So we need: from_currency=usd, to_currency=aud
      const response = await fetch('https://api.stripe.com/v1/fx_quotes', {
        method: 'POST',
        headers: {
          'Authorization': authHeader,
          'Stripe-Version': '2025-07-30.preview',
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: new URLSearchParams({
          'to_currency': 'aud',
          'from_currencies[]': 'usd',
          'lock_duration': 'hour'
        })
      });

      const text = await response.text();

      if (response.ok) {
        const fxQuote = JSON.parse(text);

        results.test1_fx_quote_api = {
          status: '✅ SUCCESS - API ACCESS GRANTED!',
          fx_quote_id: fxQuote.id,
          lock_duration: fxQuote.lock_duration,
          lock_expires_at: new Date(fxQuote.lock_expires_at * 1000).toISOString(),
          to_currency: fxQuote.to_currency,
          rates: fxQuote.rates,
          usd_rate: fxQuote.rates?.usd
        };

        // Calculate how much USD needed for 5 AUD
        if (fxQuote.rates?.usd?.exchange_rate) {
          const TARGET_AUD = 5.00;
          const exchangeRate = fxQuote.rates.usd.exchange_rate;
          const usdNeeded = TARGET_AUD / exchangeRate;

          results.calculation = {
            target_aud: TARGET_AUD,
            stripe_exchange_rate: exchangeRate,
            rate_details: fxQuote.rates.usd.rate_details,
            usd_needed: usdNeeded.toFixed(4),
            usd_needed_cents: Math.ceil(usdNeeded * 100),
            quote_valid_for: '1 hour',
            duration_premium_pct: (fxQuote.rates.usd.rate_details.duration_premium * 100).toFixed(3) + '%'
          };
        }
      } else {
        results.test1_fx_quote_api = {
          status: '❌ ACCESS DENIED',
          http_status: response.status,
          response: text,
          next_step: 'Request access via form at https://docs.stripe.com/payments/currencies/localize-prices/fx-quotes-api'
        };
      }
    } catch (error: any) {
      results.test1_fx_quote_api = {
        status: '❌ ERROR',
        error: error.message
      };
    }

    // TEST 2: Try with lock_duration: none (current live rate - free)
    console.log('Test 2: FX Quotes API - Live rate (no lock)');
    try {
      const response = await fetch('https://api.stripe.com/v1/fx_quotes', {
        method: 'POST',
        headers: {
          'Authorization': authHeader,
          'Stripe-Version': '2025-07-30.preview',
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: new URLSearchParams({
          'to_currency': 'aud',
          'from_currencies[]': 'usd',
          'lock_duration': 'none'
        })
      });

      const text = await response.text();

      if (response.ok) {
        const fxQuote = JSON.parse(text);

        results.test2_live_rate = {
          status: '✅ SUCCESS',
          note: 'Live rate (no lock) - FREE, no duration premium',
          fx_quote_id: fxQuote.id,
          lock_status: fxQuote.lock_status,
          rates: fxQuote.rates
        };
      } else {
        results.test2_live_rate = {
          status: '❌ FAILED',
          response: text
        };
      }
    } catch (error: any) {
      results.test2_live_rate = {
        status: '❌ ERROR',
        error: error.message
      };
    }

    // SUMMARY
    if (results.test1_fx_quote_api?.status?.includes('SUCCESS')) {
      results.summary = {
        result: '🎉 FX QUOTES API AVAILABLE!',
        recommendation: 'Use this API for all international transfers',
        how_it_works: [
          '1. Create FX Quote with target currency (AUD, THB, etc)',
          '2. Get exact Stripe exchange rate (valid for 1 hour)',
          '3. Calculate USD amount needed for desired local currency amount',
          '4. Create transfer with calculated USD amount',
          '5. Artist receives exact local currency amount expected'
        ],
        cost: 'Group 1 currencies: 0.10% for 1-hour lock',
        next_step: 'Implement in payment processing function'
      };
    } else {
      results.summary = {
        result: '❌ FX Quotes API not accessible yet',
        next_step: 'Request access at https://docs.stripe.com/payments/currencies/localize-prices/fx-quotes-api',
        note: 'Fill out form at bottom of documentation page'
      };
    }

    return new Response(JSON.stringify(results, null, 2), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (error: any) {
    console.error('Error in test-fx-quotes-preview:', error);
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

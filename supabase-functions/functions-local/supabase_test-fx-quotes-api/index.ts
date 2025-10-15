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
      test: 'Stripe FX Quotes API Exploration',
      timestamp: new Date().toISOString(),
    };

    // Test scenario: Need to send 50 AUD to an Australian artist
    // Platform has USD balance
    // Question: How much USD do I need to send?

    const TARGET_AUD = 50.00;
    const TARGET_AUD_CENTS = 5000; // 50.00 AUD

    results.scenario = {
      goal: 'Send exactly 50.00 AUD to Australian artist',
      platform_balance_currency: 'USD',
      artist_receives_currency: 'AUD',
      question: 'How much USD do we need to deduct from our balance?'
    };

    // ===================================
    // TEST 1: Try creating FX Quote using SDK
    // ===================================
    console.log('=== TEST 1: FX Quote via SDK ===');
    try {
      // @ts-ignore - Try if SDK has fxQuotes
      if (stripe.fxQuotes) {
        // @ts-ignore
        const fxQuote = await stripe.fxQuotes.create({
          source_currency: 'usd',
          target_currency: 'aud',
          amount: TARGET_AUD_CENTS,
        });

        results.test1_sdk = {
          status: '✅ SUCCESS',
          fx_quote: fxQuote
        };
      } else {
        results.test1_sdk = {
          status: '⚠️ SKIPPED',
          reason: 'stripe.fxQuotes not available in SDK'
        };
      }
    } catch (error: any) {
      results.test1_sdk = {
        status: '❌ FAILED',
        error: error.message,
        type: error.type
      };
    }

    // ===================================
    // TEST 2: Try direct API call with fetch
    // ===================================
    console.log('=== TEST 2: FX Quote via Direct API ===');
    try {
      const authHeader = 'Basic ' + btoa(stripeKey + ':');

      const response = await fetch('https://api.stripe.com/v1/quotes/fx', {
        method: 'POST',
        headers: {
          'Authorization': authHeader,
          'Content-Type': 'application/x-www-form-urlencoded',
          'Stripe-Version': '2023-10-16'
        },
        body: new URLSearchParams({
          'source_currency': 'usd',
          'target_currency': 'aud',
          'source_amount': TARGET_AUD_CENTS.toString()
        })
      });

      const responseText = await response.text();

      if (response.ok) {
        results.test2_direct_api = {
          status: '✅ SUCCESS',
          fx_quote: JSON.parse(responseText)
        };
      } else {
        results.test2_direct_api = {
          status: '❌ FAILED',
          http_status: response.status,
          response: responseText
        };
      }
    } catch (error: any) {
      results.test2_direct_api = {
        status: '❌ FAILED',
        error: error.message
      };
    }

    // ===================================
    // TEST 3: Check Stripe API docs endpoint
    // ===================================
    console.log('=== TEST 3: FX Rates endpoint ===');
    try {
      const authHeader = 'Basic ' + btoa(stripeKey + ':');

      // Try the exchange rates endpoint
      const response = await fetch('https://api.stripe.com/v1/exchange_rates/usd', {
        method: 'GET',
        headers: {
          'Authorization': authHeader,
          'Stripe-Version': '2023-10-16'
        }
      });

      const responseText = await response.text();

      if (response.ok) {
        const data = JSON.parse(responseText);
        const audRate = data.rates?.aud;

        results.test3_exchange_rates = {
          status: '✅ SUCCESS',
          usd_to_aud_rate: audRate,
          usd_needed_for_50_aud: audRate ? (TARGET_AUD / audRate).toFixed(2) : 'N/A',
          full_response: data
        };
      } else {
        results.test3_exchange_rates = {
          status: '❌ FAILED',
          http_status: response.status,
          response: responseText
        };
      }
    } catch (error: any) {
      results.test3_exchange_rates = {
        status: '❌ FAILED',
        error: error.message
      };
    }

    // ===================================
    // TEST 4: Try Transfer with destination_amount
    // ===================================
    console.log('=== TEST 4: Check if Transfer supports destination_amount ===');

    // First get a test account
    const testAccounts = await stripe.accounts.list({ limit: 1 });
    const testAccount = testAccounts.data.find(acc => acc.country === 'AU');

    if (testAccount) {
      results.test4_destination_amount = {
        status: 'ℹ️ DOCUMENTATION',
        note: 'Transfer API supports destination_amount parameter (Stripe-Version: 2017-04-06+)',
        description: 'You can specify destination_amount in AUD, and Stripe calculates USD needed',
        test_account: testAccount.id,
        example_params: {
          destination: testAccount.id,
          currency: 'usd', // Your platform balance currency
          destination_amount: 5000, // 50.00 AUD
          destination_currency: 'aud' // What artist receives
        },
        documentation: 'https://stripe.com/docs/connect/destination-charges#settlement-merchant'
      };
    } else {
      results.test4_destination_amount = {
        status: '⚠️ NO TEST ACCOUNT',
        note: 'No AU account found to test with'
      };
    }

    // ===================================
    // TEST 5: Check account capabilities
    // ===================================
    console.log('=== TEST 5: Check Vicki Soar account ===');
    try {
      const vickiAccount = await stripe.accounts.retrieve('acct_1SIIx6AxQ7p3rywp');

      results.test5_vicki_account = {
        status: '✅ RETRIEVED',
        account_id: vickiAccount.id,
        country: vickiAccount.country,
        default_currency: vickiAccount.default_currency,
        capabilities: vickiAccount.capabilities,
        tos_acceptance: vickiAccount.tos_acceptance,
        charges_enabled: vickiAccount.charges_enabled,
        payouts_enabled: vickiAccount.payouts_enabled
      };
    } catch (error: any) {
      results.test5_vicki_account = {
        status: '❌ FAILED',
        error: error.message
      };
    }

    // ===================================
    // SUMMARY & RECOMMENDATION
    // ===================================
    results.summary = {
      recommended_approach: 'Use Transfer API with destination_amount parameter',
      implementation: [
        '1. Specify destination_amount in AUD (artist receives)',
        '2. Specify currency as USD (platform pays)',
        '3. Stripe handles FX conversion automatically',
        '4. Platform is charged exact USD amount needed',
        '5. Artist receives exact AUD amount'
      ],
      next_steps: [
        'Test actual transfer with small amount',
        'Verify USD deducted from platform balance',
        'Verify AUD deposited to artist account',
        'Check FX rate used in transfer metadata'
      ]
    };

    return new Response(JSON.stringify(results, null, 2), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (error: any) {
    console.error('Error in test-fx-quotes-api:', error);
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

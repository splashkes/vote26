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
      test: 'Comprehensive Stripe FX Rate Search',
      timestamp: new Date().toISOString(),
    };

    const authHeader = 'Basic ' + btoa(stripeKey + ':');

    // TEST 1: Try newer API version (2024-06-20 is latest)
    console.log('Test 1: Try latest API version for exchange_rates');
    try {
      const response = await fetch('https://api.stripe.com/v1/exchange_rates/usd', {
        method: 'GET',
        headers: {
          'Authorization': authHeader,
          'Stripe-Version': '2024-06-20'
        }
      });

      const text = await response.text();
      results.test1_latest_api = {
        status: response.ok ? '✅ SUCCESS' : '❌ FAILED',
        api_version: '2024-06-20',
        response: response.ok ? JSON.parse(text) : text
      };
    } catch (error: any) {
      results.test1_latest_api = {
        status: '❌ ERROR',
        error: error.message
      };
    }

    // TEST 2: Check for Treasury API FX rates
    console.log('Test 2: Treasury API');
    try {
      const response = await fetch('https://api.stripe.com/v1/treasury/exchange_rates', {
        method: 'GET',
        headers: {
          'Authorization': authHeader,
          'Stripe-Version': '2023-10-16'
        }
      });

      const text = await response.text();
      results.test2_treasury = {
        status: response.ok ? '✅ SUCCESS' : '❌ FAILED',
        response: response.ok ? JSON.parse(text) : text
      };
    } catch (error: any) {
      results.test2_treasury = {
        status: '❌ ERROR',
        error: error.message
      };
    }

    // TEST 3: Check for Issuing API FX rates
    console.log('Test 3: Issuing API');
    try {
      const response = await fetch('https://api.stripe.com/v1/issuing/exchange_rates', {
        method: 'GET',
        headers: {
          'Authorization': authHeader,
          'Stripe-Version': '2023-10-16'
        }
      });

      const text = await response.text();
      results.test3_issuing = {
        status: response.ok ? '✅ SUCCESS' : '❌ FAILED',
        response: response.ok ? JSON.parse(text) : text
      };
    } catch (error: any) {
      results.test3_issuing = {
        status: '❌ ERROR',
        error: error.message
      };
    }

    // TEST 4: Try /v1/rates endpoint
    console.log('Test 4: /v1/rates endpoint');
    try {
      const response = await fetch('https://api.stripe.com/v1/rates', {
        method: 'GET',
        headers: {
          'Authorization': authHeader,
          'Stripe-Version': '2023-10-16'
        }
      });

      const text = await response.text();
      results.test4_rates = {
        status: response.ok ? '✅ SUCCESS' : '❌ FAILED',
        response: response.ok ? JSON.parse(text) : text
      };
    } catch (error: any) {
      results.test4_rates = {
        status: '❌ ERROR',
        error: error.message
      };
    }

    // TEST 5: Check if SDK has any FX-related methods
    console.log('Test 5: Check Stripe SDK for FX methods');
    results.test5_sdk_methods = {
      stripe_object_keys: Object.keys(stripe),
      has_fxRates: 'fxRates' in stripe,
      has_exchangeRates: 'exchangeRates' in stripe,
      has_rates: 'rates' in stripe,
      has_fx: 'fx' in stripe,
      has_treasury: 'treasury' in stripe,
      has_issuing: 'issuing' in stripe
    };

    // TEST 6: Try getting latest transfer's FX rate as reference
    console.log('Test 6: Get most recent FX rate from balance transactions');
    try {
      const VICKI_ACCOUNT_ID = 'acct_1SIIx6AxQ7p3rywp';
      const balanceTransactions = await stripe.balanceTransactions.list({
        limit: 1,
        stripeAccount: VICKI_ACCOUNT_ID
      });

      if (balanceTransactions.data.length > 0) {
        const latestTxn = balanceTransactions.data[0];
        results.test6_latest_fx_rate = {
          status: '✅ FOUND',
          approach: 'Use most recent FX rate from previous transaction',
          latest_transaction: {
            id: latestTxn.id,
            currency: latestTxn.currency,
            exchange_rate: latestTxn.exchange_rate || 'not present',
            created: new Date(latestTxn.created * 1000).toISOString(),
            age_minutes: Math.floor((Date.now() - latestTxn.created * 1000) / 60000)
          },
          limitation: 'This is historical rate, may not match current rate'
        };
      }
    } catch (error: any) {
      results.test6_latest_fx_rate = {
        status: '❌ ERROR',
        error: error.message
      };
    }

    // TEST 7: Try creating a $0.01 test transfer to get current FX rate
    console.log('Test 7: Micro-transfer to get current FX rate');
    try {
      const VICKI_ACCOUNT_ID = 'acct_1SIIx6AxQ7p3rywp';

      // Create 1 cent transfer
      const microTransfer = await stripe.transfers.create({
        amount: 1,
        currency: 'usd',
        destination: VICKI_ACCOUNT_ID,
        description: 'FX rate probe - 1 cent',
        metadata: {
          test: 'fx_rate_probe',
          purpose: 'determine_current_fx_rate'
        }
      });

      // Immediately check the balance transaction
      const balanceTxn = await stripe.balanceTransactions.retrieve(
        microTransfer.balance_transaction as string
      );

      // Get the destination account's balance transaction
      const destBalanceTxns = await stripe.balanceTransactions.list({
        limit: 1,
        stripeAccount: VICKI_ACCOUNT_ID
      });

      const destTxn = destBalanceTxns.data[0];

      results.test7_micro_transfer = {
        status: '✅ SUCCESS',
        approach: 'Send 1 cent to get real-time FX rate',
        transfer_id: microTransfer.id,
        usd_sent_cents: 1,
        destination_balance_transaction: {
          id: destTxn.id,
          amount_aud_cents: destTxn.amount,
          currency: destTxn.currency,
          exchange_rate: destTxn.exchange_rate,
          created: new Date(destTxn.created * 1000).toISOString()
        },
        current_fx_rate: destTxn.exchange_rate || 'not found',
        recommendation: 'Use this rate for current transfers (costs $0.01 per rate check)'
      };
    } catch (error: any) {
      results.test7_micro_transfer = {
        status: '❌ ERROR',
        error: error.message
      };
    }

    // FINAL SUMMARY
    results.summary = {
      question: 'Can we get Stripe FX rates before a transfer?',
      findings: [],
      best_approach: null
    };

    // Analyze which tests succeeded
    if (results.test1_latest_api?.status === '✅ SUCCESS') {
      results.summary.findings.push('Exchange rates API exists in latest version');
      results.summary.best_approach = 'Use official exchange_rates API';
    }

    if (results.test7_micro_transfer?.status === '✅ SUCCESS') {
      results.summary.findings.push('Micro-transfer method works ($0.01 cost per rate check)');
      if (!results.summary.best_approach) {
        results.summary.best_approach = 'Use micro-transfer to get current FX rate before main transfer';
      }
    }

    if (results.test6_latest_fx_rate?.status === '✅ FOUND') {
      results.summary.findings.push('Can use historical rate from previous transfer (free but may be outdated)');
      if (!results.summary.best_approach) {
        results.summary.best_approach = 'Use most recent FX rate from balance transactions';
      }
    }

    if (!results.summary.best_approach) {
      results.summary.best_approach = 'No reliable method found - contact Stripe Support for FX API access';
    }

    return new Response(JSON.stringify(results, null, 2), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (error: any) {
    console.error('Error in test-stripe-fx-comprehensive:', error);
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

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
      test: 'Find Stripe Official FX Rates',
      timestamp: new Date().toISOString(),
    };

    const authHeader = 'Basic ' + btoa(stripeKey + ':');

    // TEST 1: Try /v1/exchange_rates endpoint (documented but may be internal)
    console.log('Test 1: /v1/exchange_rates endpoint');
    try {
      const response = await fetch('https://api.stripe.com/v1/exchange_rates', {
        method: 'GET',
        headers: {
          'Authorization': authHeader,
          'Stripe-Version': '2023-10-16'
        }
      });

      const text = await response.text();
      results.test1_exchange_rates = {
        status: response.ok ? '✅ SUCCESS' : '❌ FAILED',
        http_status: response.status,
        response: response.ok ? JSON.parse(text) : text
      };
    } catch (error: any) {
      results.test1_exchange_rates = {
        status: '❌ ERROR',
        error: error.message
      };
    }

    // TEST 2: Try getting rates for specific currency pairs
    console.log('Test 2: Specific currency pair (USD to AUD)');
    try {
      const response = await fetch('https://api.stripe.com/v1/exchange_rates/usd', {
        method: 'GET',
        headers: {
          'Authorization': authHeader,
          'Stripe-Version': '2023-10-16'
        }
      });

      const text = await response.text();
      results.test2_usd_rates = {
        status: response.ok ? '✅ SUCCESS' : '❌ FAILED',
        http_status: response.status,
        response: response.ok ? JSON.parse(text) : text
      };
    } catch (error: any) {
      results.test2_usd_rates = {
        status: '❌ ERROR',
        error: error.message
      };
    }

    // TEST 3: Check if we can get FX info from a completed transfer
    console.log('Test 3: Retrieve previous transfer to see FX info');
    try {
      // Use one of our test transfer IDs
      const transferId = 'tr_1SIXjLBlGBXM2ss3koPSta60'; // The 5 AUD test
      const response = await fetch(`https://api.stripe.com/v1/transfers/${transferId}`, {
        method: 'GET',
        headers: {
          'Authorization': authHeader,
          'Stripe-Version': '2023-10-16'
        }
      });

      const transfer = await response.json();

      results.test3_transfer_details = {
        status: '✅ RETRIEVED',
        transfer_id: transfer.id,
        amount: transfer.amount,
        currency: transfer.currency,
        destination: transfer.destination,
        destination_payment: transfer.destination_payment,
        // Check for any FX-related fields
        all_keys: Object.keys(transfer),
        possible_fx_fields: {
          exchange_rate: transfer.exchange_rate || 'not present',
          destination_amount: transfer.destination_amount || 'not present',
          fx_rate: transfer.fx_rate || 'not present',
          source_transaction: transfer.source_transaction || 'not present'
        }
      };

      // Try to get the destination payment details
      if (transfer.destination_payment) {
        console.log('Test 3b: Get destination payment details');
        const paymentId = transfer.destination_payment;
        const paymentResponse = await fetch(`https://api.stripe.com/v1/charges/${paymentId}`, {
          method: 'GET',
          headers: {
            'Authorization': authHeader,
            'Stripe-Version': '2023-10-16',
            'Stripe-Account': transfer.destination // Use connect account
          }
        });

        if (paymentResponse.ok) {
          const payment = await paymentResponse.json();
          results.test3b_destination_payment = {
            status: '✅ RETRIEVED',
            payment_id: payment.id,
            amount: payment.amount,
            currency: payment.currency,
            all_keys: Object.keys(payment)
          };
        }
      }
    } catch (error: any) {
      results.test3_transfer_details = {
        status: '❌ ERROR',
        error: error.message
      };
    }

    // TEST 4: Try balance transactions endpoint (shows FX details)
    console.log('Test 4: Balance transactions (may show FX info)');
    try {
      const response = await fetch('https://api.stripe.com/v1/balance_transactions?limit=5', {
        method: 'GET',
        headers: {
          'Authorization': authHeader,
          'Stripe-Version': '2023-10-16'
        }
      });

      const balanceTxns = await response.json();

      results.test4_balance_transactions = {
        status: '✅ RETRIEVED',
        count: balanceTxns.data?.length || 0,
        sample: balanceTxns.data?.[0] ? {
          id: balanceTxns.data[0].id,
          type: balanceTxns.data[0].type,
          amount: balanceTxns.data[0].amount,
          currency: balanceTxns.data[0].currency,
          exchange_rate: balanceTxns.data[0].exchange_rate || 'not present',
          all_keys: Object.keys(balanceTxns.data[0])
        } : 'no transactions'
      };
    } catch (error: any) {
      results.test4_balance_transactions = {
        status: '❌ ERROR',
        error: error.message
      };
    }

    // SUMMARY
    results.summary = {
      question: 'Can we get Stripe\'s actual FX rate before making a transfer?',
      findings: 'See test results above',
      next_steps: [
        'If exchange_rates API works, use that',
        'If balance_transactions shows FX rate, check after transfer',
        'If neither works, may need to contact Stripe Support for FX API access'
      ]
    };

    return new Response(JSON.stringify(results, null, 2), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (error: any) {
    console.error('Error in test-stripe-fx-rates:', error);
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

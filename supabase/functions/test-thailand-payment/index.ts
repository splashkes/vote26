// Test Thailand Payment - Recipient Service Agreement
// Tests both THB and USD transfers to new Thai recipient account

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
    const ACCOUNT_ID = "acct_1SFRmCPka2JQHZ1n";
    const AMOUNT_THB = 161750; // 1,617.50 THB

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
      artist: 'Pimpisuth Chootiwat (Thailand)',
      account_id: ACCOUNT_ID,
    };

    // Check account details
    const account = await stripe.accounts.retrieve(ACCOUNT_ID);
    results.account_info = {
      country: account.country,
      type: account.type,
      service_agreement: account.tos_acceptance?.service_agreement,
      capabilities: account.capabilities,
      charges_enabled: account.charges_enabled,
      payouts_enabled: account.payouts_enabled,
    };

    // Check platform balance
    const balance = await stripe.balance.retrieve();
    results.platform_balance = {
      usd: balance.available?.find((b: any) => b.currency === 'usd')?.amount || 0,
      thb: balance.available?.find((b: any) => b.currency === 'thb')?.amount || 0,
    };

    // TEST 1: Try THB transfer
    console.log('TEST 1: Attempting THB transfer...');
    try {
      const thbTransfer = await stripe.transfers.create({
        amount: AMOUNT_THB,
        currency: 'thb',
        destination: ACCOUNT_ID,
        description: 'Test: THB to Thai recipient account',
      });

      results.test1_thb_transfer = {
        status: '✅ SUCCESS',
        transfer_id: thbTransfer.id,
        amount: AMOUNT_THB,
        currency: 'thb',
      };
    } catch (thbError: any) {
      results.test1_thb_transfer = {
        status: '❌ FAILED',
        error: thbError.message,
        code: thbError.code,
      };
    }

    // TEST 2: Convert to USD and try USD transfer
    console.log('TEST 2: Getting exchange rate and trying USD...');
    try {
      // Get exchange rate
      const rateResponse = await fetch('https://api.exchangerate-api.com/v4/latest/THB');
      const rateData = await rateResponse.json();
      const thbToUsd = rateData.rates.USD;
      const usdAmount = Math.round((AMOUNT_THB / 100) * thbToUsd * 100); // Convert THB to USD cents

      results.currency_conversion = {
        thb_amount: AMOUNT_THB / 100,
        thb_to_usd_rate: thbToUsd,
        usd_amount_cents: usdAmount,
        usd_amount_dollars: usdAmount / 100,
      };

      const usdTransfer = await stripe.transfers.create({
        amount: usdAmount,
        currency: 'usd',
        destination: ACCOUNT_ID,
        description: `Payment for artwork sales - ${AMOUNT_THB / 100} THB converted to USD`,
        metadata: {
          original_currency: 'THB',
          original_amount: (AMOUNT_THB / 100).toString(),
          exchange_rate: thbToUsd.toString(),
        },
      });

      results.test2_usd_transfer = {
        status: '✅ SUCCESS',
        transfer_id: usdTransfer.id,
        amount_usd_cents: usdAmount,
        amount_usd_dollars: usdAmount / 100,
        original_thb: AMOUNT_THB / 100,
        stripe_dashboard: `https://dashboard.stripe.com/transfers/${usdTransfer.id}`,
      };
    } catch (usdError: any) {
      results.test2_usd_transfer = {
        status: '❌ FAILED',
        error: usdError.message,
        code: usdError.code,
      };
    }

    results.recommendation = results.test2_usd_transfer?.status === '✅ SUCCESS'
      ? 'Use USD conversion - send USD equivalent to Thai artists'
      : 'Need to fund THB balance on platform account';

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

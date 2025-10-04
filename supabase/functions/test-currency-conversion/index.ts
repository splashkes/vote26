// Test Real USD Payment to Australian Account
// Sends $20 USD to Vicki Soar's account

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
    const AMOUNT_USD = 2000; // $20.00 USD in cents

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
      test_description: 'Attempting to send $20 USD to Australian artist account',
      amount_usd_cents: AMOUNT_USD,
      amount_usd_dollars: AMOUNT_USD / 100,
      destination_account: ACCOUNT_ID,
      artist_name: 'Vicki Soar',
      artist_country: 'Australia'
    };

    console.log('Attempting $20 USD transfer to Australian account...');

    try {
      const transfer = await stripe.transfers.create({
        amount: AMOUNT_USD,
        currency: 'usd',
        destination: ACCOUNT_ID,
        description: 'Test payment - $20 USD to Australian artist',
        metadata: {
          artist_name: 'Vicki Soar',
          artist_profile_id: '9d8ef7a2-a259-441b-b076-fb3a4cc24e9f',
          payment_id: crypto.randomUUID(),
          test_payment: 'true',
          amount_usd: '20.00',
          processed_by: 'manual-test'
        }
      });

      results.success = true;
      results.transfer = {
        id: transfer.id,
        object: transfer.object,
        amount: transfer.amount,
        amount_dollars: transfer.amount / 100,
        currency: transfer.currency,
        destination: transfer.destination,
        created: transfer.created,
        created_date: new Date(transfer.created * 1000).toISOString(),
        description: transfer.description,
        stripe_dashboard: `https://dashboard.stripe.com/transfers/${transfer.id}`,
        status: 'Transfer created successfully!'
      };

      console.log('✅ SUCCESS! Transfer ID:', transfer.id);

    } catch (transferError: any) {
      results.success = false;
      results.error = {
        message: transferError.message,
        type: transferError.type,
        code: transferError.code,
        param: transferError.param,
        doc_url: transferError.doc_url,
        request_log_url: transferError.raw?.request_log_url,
        status_code: transferError.statusCode
      };

      console.error('❌ Transfer failed:', transferError.message);
    }

    // Also check current balance
    try {
      const balance = await stripe.balance.retrieve();
      results.platform_balance_after = {
        usd_available: balance.available?.find((b: any) => b.currency === 'usd')?.amount || 0,
        usd_available_dollars: (balance.available?.find((b: any) => b.currency === 'usd')?.amount || 0) / 100
      };
    } catch (balanceError) {
      console.error('Balance check failed:', balanceError);
    }

    return new Response(JSON.stringify(results, null, 2), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: results.success ? 200 : 400
    });

  } catch (error: any) {
    console.error('Test error:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error.message,
      stack: error.stack
    }, null, 2), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500
    });
  }
});

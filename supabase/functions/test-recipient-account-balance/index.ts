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
      test: 'Check Recipient Account Balance After USD Transfer',
      timestamp: new Date().toISOString(),
    };

    const VICKI_ACCOUNT_ID = 'acct_1SIIx6AxQ7p3rywp';

    // Check Vicki's account balance
    const balance = await stripe.balance.retrieve({
      stripeAccount: VICKI_ACCOUNT_ID
    });

    results.vicki_balance = {
      account_id: VICKI_ACCOUNT_ID,
      country: 'AU',
      default_currency: 'aud',
      available: balance.available,
      pending: balance.pending,
      usd_balance: balance.available?.find((b: any) => b.currency === 'usd') || 'none',
      aud_balance: balance.available?.find((b: any) => b.currency === 'aud') || 'none'
    };

    // Check recent balance transactions on her account
    const balanceTransactions = await stripe.balanceTransactions.list({
      limit: 10,
      stripeAccount: VICKI_ACCOUNT_ID
    });

    results.recent_transactions = balanceTransactions.data.map((txn: any) => ({
      id: txn.id,
      type: txn.type,
      amount: txn.amount,
      currency: txn.currency,
      exchange_rate: txn.exchange_rate || 'none',
      description: txn.description,
      created: new Date(txn.created * 1000).toISOString()
    }));

    // Summary
    const hasUSD = balance.available?.some((b: any) => b.currency === 'usd' && b.amount > 0);
    const hasAUD = balance.available?.some((b: any) => b.currency === 'aud' && b.amount > 0);

    results.summary = {
      question: 'What currency does the recipient account hold after USD transfer?',
      has_usd_balance: hasUSD,
      has_aud_balance: hasAUD,
      answer: hasUSD ? 'Holds USD - FX conversion happens at payout time' :
              hasAUD ? 'Converted to AUD immediately' :
              'No balance found - may have already been paid out'
    };

    return new Response(JSON.stringify(results, null, 2), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (error: any) {
    console.error('Error in test-recipient-account-balance:', error);
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

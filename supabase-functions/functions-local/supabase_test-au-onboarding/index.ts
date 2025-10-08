// Test Australian Artist Onboarding with Recipient Service Agreement
// Creates a test account to verify recipient agreement enables cross-border transfers

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
    const stripeKey = Deno.env.get('stripe_intl_secret_key');
    if (!stripeKey) {
      throw new Error('Stripe international key not configured');
    }

    const stripe = new Stripe(stripeKey, {
      apiVersion: '2023-10-16',
      typescript: true
    });

    const results: any = {
      timestamp: new Date().toISOString(),
      test: 'Australian Artist - Recipient Service Agreement',
    };

    // STEP 1: Create test account with RECIPIENT service agreement
    console.log('Creating Australian test account with recipient service agreement...');

    try {
      const account = await stripe.accounts.create({
        type: 'custom',
        country: 'AU',
        email: 'test-au-artist@artbattle.com',
        capabilities: {
          transfers: { requested: true },
          // NO card_payments for recipient accounts
        },
        business_type: 'individual',
        individual: {
          first_name: 'Test',
          last_name: 'Artist AU',
          email: 'test-au-artist@artbattle.com',
        },
        business_profile: {
          mcc: '5971',
          product_description: 'Test artist for recipient service agreement',
          url: 'https://artbattle.com',
        },
        tos_acceptance: {
          service_agreement: 'recipient'
        },
        metadata: {
          test: 'recipient_service_agreement_test',
          created_at: new Date().toISOString()
        }
      });

      results.account_created = {
        id: account.id,
        country: account.country,
        type: account.type,
        capabilities: account.capabilities,
        tos_acceptance: account.tos_acceptance,
        message: '✅ Account created successfully with recipient service agreement'
      };

      console.log('✅ Account created:', account.id);

      // STEP 2: Try to transfer $20 USD to this new account
      console.log('Attempting $20 USD transfer to new recipient account...');

      try {
        const transfer = await stripe.transfers.create({
          amount: 2000, // $20 USD
          currency: 'usd',
          destination: account.id,
          description: 'Test transfer to recipient service agreement account',
          metadata: {
            test: 'recipient_transfer_test',
            account_id: account.id
          }
        });

        results.transfer_success = {
          id: transfer.id,
          amount: transfer.amount,
          amount_dollars: transfer.amount / 100,
          currency: transfer.currency,
          destination: transfer.destination,
          created: new Date(transfer.created * 1000).toISOString(),
          message: '🎉 SUCCESS! Transfer to recipient account worked!',
          stripe_dashboard: `https://dashboard.stripe.com/transfers/${transfer.id}`
        };

        console.log('🎉 Transfer successful:', transfer.id);

      } catch (transferError: any) {
        results.transfer_error = {
          message: transferError.message,
          type: transferError.type,
          code: transferError.code,
          status: '❌ Transfer failed - recipient accounts may have additional requirements'
        };
        console.error('Transfer failed:', transferError.message);
      }

      // STEP 3: Check account details
      const accountDetails = await stripe.accounts.retrieve(account.id);
      results.account_verification = {
        charges_enabled: accountDetails.charges_enabled,
        payouts_enabled: accountDetails.payouts_enabled,
        requirements_currently_due: accountDetails.requirements?.currently_due || [],
        requirements_disabled_reason: accountDetails.requirements?.disabled_reason,
        note: 'Recipient accounts may need additional verification before transfers work'
      };

    } catch (accountError: any) {
      results.account_creation_error = {
        message: accountError.message,
        type: accountError.type,
        code: accountError.code
      };
      console.error('Account creation failed:', accountError.message);
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

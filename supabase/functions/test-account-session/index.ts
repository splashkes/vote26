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
    const stripeCanadaKey = Deno.env.get('stripe_canada_secret_key');
    if (!stripeCanadaKey) {
      throw new Error('Canada Stripe key not configured');
    }

    const stripe = new Stripe(stripeCanadaKey, {
      apiVersion: '2023-10-16',
    });

    const results: any = {
      test: 'Account Session API Test',
      timestamp: new Date().toISOString(),
    };

    // TEST 1: Create test account
    console.log('Creating test account...');
    const testAccount = await stripe.accounts.create({
      type: 'custom',
      country: 'CA',
      email: 'test-session@example.com',
      capabilities: {
        transfers: { requested: true },
        card_payments: { requested: true }
      },
      business_type: 'individual',
      individual: {
        first_name: 'Test',
        last_name: 'Artist',
        email: 'test-session@example.com',
        phone: '+14165551234'
      },
      metadata: {
        test: 'account_session_diagnostic'
      }
    });

    results.test_account = {
      id: testAccount.id,
      created: '✅ SUCCESS'
    };

    // TEST 2: Try creating Account Session (new API)
    console.log('Testing Account Session API...');
    try {
      // Account Sessions require specific components to be enabled
      const accountSession = await stripe.accountSessions.create({
        account: testAccount.id,
        components: {
          account_onboarding: {
            enabled: true,
            features: {
              external_account_collection: true
            }
          }
        }
      });

      results.account_session = {
        status: '✅ SUCCESS',
        client_secret: accountSession.client_secret,
        expires_at: new Date(accountSession.expires_at * 1000).toISOString(),
        livemode: accountSession.livemode,
        note: 'Account Session created - no 5 min expiration!'
      };

    } catch (sessionError: any) {
      results.account_session = {
        status: '❌ FAILED',
        error: sessionError.message,
        type: sessionError.type,
        code: sessionError.code,
        note: 'Account Session API may not be available for this account type'
      };
    }

    // TEST 3: Compare with Account Link (old method)
    console.log('Creating Account Link for comparison...');
    try {
      const accountLink = await stripe.accountLinks.create({
        account: testAccount.id,
        refresh_url: 'https://example.com/refresh',
        return_url: 'https://example.com/return',
        type: 'account_onboarding',
      });

      results.account_link_comparison = {
        status: '✅ CREATED',
        expires_at: new Date(accountLink.expires_at * 1000).toISOString(),
        created: new Date(accountLink.created * 1000).toISOString(),
        expires_in_seconds: accountLink.expires_at - accountLink.created,
        expires_in_minutes: Math.round((accountLink.expires_at - accountLink.created) / 60),
        note: 'Old method - expires quickly'
      };
    } catch (linkError: any) {
      results.account_link_comparison = {
        status: '❌ FAILED',
        error: linkError.message
      };
    }

    // TEST 4: Check if Connect JS SDK is needed
    results.implementation_notes = {
      account_session_approach: [
        '1. Backend: Create Account Session with accountSessions.create()',
        '2. Frontend: Use Connect JS SDK to render onboarding UI',
        '3. Frontend: Pass client_secret to ConnectAccountOnboarding component',
        '4. Session persists until completed (no 5-min timeout)',
        '5. Use webhooks to track completion'
      ],
      account_link_approach: [
        '1. Backend: Create Account Link with accountLinks.create()',
        '2. Backend: Return URL, redirect user',
        '3. Link expires in 5 minutes',
        '4. User must complete quickly or start over',
        '5. Poor UX for complex forms'
      ],
      recommendation: 'Switch to Account Session for better UX'
    };

    // Cleanup
    try {
      await stripe.accounts.del(testAccount.id);
      results.cleanup = '✅ Test account deleted';
    } catch (e) {
      results.cleanup = '⚠️ Could not delete test account';
    }

    return new Response(JSON.stringify(results, null, 2), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (error: any) {
    console.error('Error in test-account-session:', error);
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

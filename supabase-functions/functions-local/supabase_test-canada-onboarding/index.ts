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
      test: 'Canadian Account Onboarding Diagnostic',
      timestamp: new Date().toISOString(),
    };

    // TEST 1: Check platform account type
    const platformAccount = await stripe.accounts.retrieve();
    results.platform_account = {
      id: platformAccount.id,
      country: platformAccount.country,
      type: platformAccount.type,
      capabilities: platformAccount.capabilities,
      tos_acceptance: platformAccount.tos_acceptance,
      business_type: platformAccount.business_type
    };

    // TEST 2: Try creating a Canadian custom account like we do in onboarding
    console.log('TEST 2: Creating Canadian custom account');
    try {
      const testAccount = await stripe.accounts.create({
        type: 'custom',
        country: 'CA',
        email: 'test-artist@example.com',
        capabilities: {
          transfers: { requested: true },
          card_payments: { requested: true }
        },
        business_type: 'individual',
        individual: {
          first_name: 'Test',
          last_name: 'Artist',
          email: 'test-artist@example.com',
        },
        business_profile: {
          mcc: '5971',
          product_description: 'Independent visual artist participating in Art Battle live painting competitions and exhibitions.',
          url: 'https://artbattle.com',
          support_email: 'payments@artbattle.com',
          support_phone: '+14163025959',
          support_url: 'https://artbattle.com/contact'
        },
        metadata: {
          test: 'diagnostic',
          created_at: new Date().toISOString()
        }
      });

      results.test_account_creation = {
        status: '✅ SUCCESS',
        account_id: testAccount.id,
        capabilities: testAccount.capabilities,
        requirements: testAccount.requirements,
        charges_enabled: testAccount.charges_enabled,
        payouts_enabled: testAccount.payouts_enabled,
        details_submitted: testAccount.details_submitted
      };

      // TEST 3: Try creating account link
      console.log('TEST 3: Creating account link');
      try {
        const accountLink = await stripe.accountLinks.create({
          account: testAccount.id,
          refresh_url: 'https://xsqdkubgyqwpyvfltnrf.supabase.co/functions/v1/stripe-onboarding-return?status=refresh',
          return_url: 'https://xsqdkubgyqwpyvfltnrf.supabase.co/functions/v1/stripe-onboarding-return?status=completed',
          type: 'account_onboarding',
        });

        results.account_link = {
          status: '✅ SUCCESS',
          url: accountLink.url,
          expires_at: new Date(accountLink.expires_at * 1000).toISOString(),
          created: new Date(accountLink.created * 1000).toISOString()
        };
      } catch (linkError: any) {
        results.account_link = {
          status: '❌ FAILED',
          error: linkError.message,
          type: linkError.type,
          code: linkError.code
        };
      }

      // TEST 4: Check account requirements
      console.log('TEST 4: Detailed requirements check');
      results.requirements_analysis = {
        currently_due: testAccount.requirements?.currently_due || [],
        eventually_due: testAccount.requirements?.eventually_due || [],
        past_due: testAccount.requirements?.past_due || [],
        pending_verification: testAccount.requirements?.pending_verification || [],
        disabled_reason: testAccount.requirements?.disabled_reason || 'none',
        errors: testAccount.requirements?.errors || []
      };

      // Clean up test account
      try {
        await stripe.accounts.del(testAccount.id);
        results.cleanup = '✅ Test account deleted';
      } catch (delError) {
        results.cleanup = '⚠️ Could not delete test account: ' + delError.message;
      }

    } catch (accountError: any) {
      results.test_account_creation = {
        status: '❌ FAILED',
        error: accountError.message,
        type: accountError.type,
        code: accountError.code,
        param: accountError.param,
        doc_url: accountError.doc_url
      };
    }

    // TEST 5: Check if service agreement matters for Canada
    console.log('TEST 5: Try with recipient service agreement');
    try {
      const recipientAccount = await stripe.accounts.create({
        type: 'custom',
        country: 'CA',
        email: 'test-artist2@example.com',
        capabilities: {
          transfers: { requested: true }
        },
        business_type: 'individual',
        individual: {
          first_name: 'Test',
          last_name: 'Artist',
          email: 'test-artist2@example.com',
        },
        business_profile: {
          mcc: '5971',
          product_description: 'Artist',
          url: 'https://artbattle.com'
        },
        tos_acceptance: {
          service_agreement: 'recipient'
        },
        metadata: {
          test: 'diagnostic_recipient',
          created_at: new Date().toISOString()
        }
      });

      results.recipient_service_agreement_test = {
        status: '✅ SUCCESS',
        account_id: recipientAccount.id,
        capabilities: recipientAccount.capabilities,
        tos_acceptance: recipientAccount.tos_acceptance
      };

      // Clean up
      try {
        await stripe.accounts.del(recipientAccount.id);
      } catch (e) {
        // Ignore cleanup errors
      }

    } catch (recipientError: any) {
      results.recipient_service_agreement_test = {
        status: '❌ FAILED',
        error: recipientError.message,
        note: 'CA platform cannot use recipient for CA accounts'
      };
    }

    // SUMMARY
    results.summary = {
      platform_country: results.platform_account.country,
      custom_account_creation: results.test_account_creation?.status || 'NOT_TESTED',
      account_link_creation: results.account_link?.status || 'NOT_TESTED',
      key_issues: []
    };

    if (results.test_account_creation?.status?.includes('FAILED')) {
      results.summary.key_issues.push('Cannot create custom accounts');
    }
    if (results.account_link?.status?.includes('FAILED')) {
      results.summary.key_issues.push('Cannot generate onboarding links');
    }
    if (results.requirements_analysis?.currently_due?.length > 0) {
      results.summary.key_issues.push(`${results.requirements_analysis.currently_due.length} requirements due immediately`);
    }

    return new Response(JSON.stringify(results, null, 2), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (error: any) {
    console.error('Error in test-canada-onboarding:', error);
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

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
    const results: any = {
      test: 'Canada vs International Requirements Comparison',
      timestamp: new Date().toISOString(),
    };

    // TEST CANADA
    console.log('Testing Canada account...');
    const stripeCanadaKey = Deno.env.get('stripe_canada_secret_key');
    const stripeCA = new Stripe(stripeCanadaKey, { apiVersion: '2023-10-16' });

    const canadaAccount = await stripeCA.accounts.create({
      type: 'custom',
      country: 'CA',
      email: 'test-ca@example.com',
      capabilities: {
        transfers: { requested: true },
        card_payments: { requested: true }
      },
      business_type: 'individual',
      individual: {
        first_name: 'Test',
        last_name: 'Artist',
        email: 'test-ca@example.com',
        phone: '+14165551234'
      }
    });

    results.canada = {
      account_id: canadaAccount.id,
      service_agreement: 'full (default)',
      requirements_count: canadaAccount.requirements?.currently_due?.length || 0,
      requirements: canadaAccount.requirements?.currently_due || [],
      capabilities: canadaAccount.capabilities
    };

    // TEST INTERNATIONAL (Australia)
    console.log('Testing International account (AU)...');
    const stripeIntlKey = Deno.env.get('stripe_intl_secret_key');
    const stripeIntl = new Stripe(stripeIntlKey, { apiVersion: '2023-10-16' });

    const auAccount = await stripeIntl.accounts.create({
      type: 'custom',
      country: 'AU',
      email: 'test-au@example.com',
      capabilities: {
        transfers: { requested: true }
      },
      business_type: 'individual',
      individual: {
        first_name: 'Test',
        last_name: 'Artist',
        email: 'test-au@example.com',
        phone: '+61412345678'
      },
      tos_acceptance: {
        service_agreement: 'recipient'
      }
    });

    results.australia = {
      account_id: auAccount.id,
      service_agreement: 'recipient',
      requirements_count: auAccount.requirements?.currently_due?.length || 0,
      requirements: auAccount.requirements?.currently_due || [],
      capabilities: auAccount.capabilities
    };

    // COMPARISON
    results.comparison = {
      canada_requirements: results.canada.requirements_count,
      australia_requirements: results.australia.requirements_count,
      difference: results.canada.requirements_count - results.australia.requirements_count,
      canada_unique: results.canada.requirements.filter(
        (r: string) => !results.australia.requirements.includes(r)
      ),
      australia_unique: results.australia.requirements.filter(
        (r: string) => !results.canada.requirements.includes(r)
      ),
      both_require: results.canada.requirements.filter(
        (r: string) => results.australia.requirements.includes(r)
      )
    };

    results.analysis = {
      theory: results.canada.requirements_count > results.australia.requirements_count
        ? 'Canada requires MORE fields - takes longer to fill out'
        : results.canada.requirements_count < results.australia.requirements_count
        ? 'International requires MORE fields - takes longer to fill out'
        : 'Same number of requirements - not the issue',
      likely_cause: results.canada.requirements_count > results.australia.requirements_count
        ? 'Canadian artists hit 5-min timeout because they have more fields to complete'
        : 'Something else is causing the issue'
    };

    // Cleanup
    try {
      await stripeCA.accounts.del(canadaAccount.id);
      await stripeIntl.accounts.del(auAccount.id);
      results.cleanup = '✅ Test accounts deleted';
    } catch (e) {
      results.cleanup = '⚠️ Cleanup error';
    }

    return new Response(JSON.stringify(results, null, 2), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (error: any) {
    console.error('Error:', error);
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

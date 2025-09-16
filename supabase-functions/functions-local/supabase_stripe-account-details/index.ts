// Stripe Account Details Admin API
// Fetches detailed Stripe account information for admin dashboard
// Stores results in database metadata for caching

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import Stripe from 'https://esm.sh/stripe@13.0.0?target=deno';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

interface AccountDetailsRequest {
  stripe_account_id: string;
  artist_profile_id?: string;
}

serve(async (req) => {
  try {
    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
      return new Response('ok', { headers: corsHeaders });
    }

    // Get request body
    const requestBody: AccountDetailsRequest = await req.json();
    console.log('Account details request:', requestBody);

    const { stripe_account_id, artist_profile_id } = requestBody;

    if (!stripe_account_id) {
      throw new Error('stripe_account_id is required');
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get auth token and verify admin user
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('No authorization header');
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      throw new Error('Unauthorized');
    }

    // Check if user is admin (you may want to add proper admin check here)
    console.log('Admin request from user:', user.id);

    // Determine which Stripe instance to use based on account ID pattern or database lookup
    let stripe: Stripe;
    let accountRegion = 'international';

    // If we have artist_profile_id, check their country to determine Stripe account
    if (artist_profile_id) {
      const { data: globalPayment } = await supabase
        .from('artist_global_payments')
        .select('country')
        .eq('stripe_recipient_id', stripe_account_id)
        .single();

      if (globalPayment?.country === 'CA') {
        accountRegion = 'canada';
      }
    }

    // Initialize appropriate Stripe client
    const stripeKey = accountRegion === 'canada'
      ? Deno.env.get('stripe_canada_secret_key')
      : Deno.env.get('stripe_intl_secret_key');

    if (!stripeKey) {
      throw new Error(`Stripe ${accountRegion} key not configured`);
    }

    stripe = new Stripe(stripeKey, {
      apiVersion: '2023-10-16',
      typescript: true
    });

    console.log(`Fetching account details for ${stripe_account_id} using ${accountRegion} Stripe`);

    // Fetch detailed account information from Stripe
    const account = await stripe.accounts.retrieve(stripe_account_id);

    // Extract the key information
    const accountDetails = {
      // Basic account info
      id: account.id,
      email: account.email,
      country: account.country,
      default_currency: account.default_currency,
      type: account.type,

      // Verification status
      charges_enabled: account.charges_enabled,
      payouts_enabled: account.payouts_enabled,
      details_submitted: account.details_submitted,

      // Capabilities
      capabilities: Object.entries(account.capabilities || {}).map(([key, status]) => ({
        capability: key,
        status: status
      })),

      // Business details
      business_type: account.business_type,
      business_profile: {
        mcc: account.business_profile?.mcc,
        name: account.business_profile?.name,
        product_description: account.business_profile?.product_description,
        support_email: account.business_profile?.support_email,
        support_phone: account.business_profile?.support_phone,
        url: account.business_profile?.url
      },

      // Individual details (if business_type is individual)
      individual: account.individual ? {
        first_name: account.individual.first_name,
        last_name: account.individual.last_name,
        email: account.individual.email,
        phone: account.individual.phone,
        verification: {
          status: account.individual.verification?.status,
          document_status: account.individual.verification?.document?.status,
          details_code: account.individual.verification?.details_code
        }
      } : null,

      // Requirements
      requirements: {
        currently_due: account.requirements?.currently_due || [],
        eventually_due: account.requirements?.eventually_due || [],
        past_due: account.requirements?.past_due || [],
        pending_verification: account.requirements?.pending_verification || [],
        disabled_reason: account.requirements?.disabled_reason
      },

      // Transfer schedule
      settings: {
        payouts: {
          schedule: account.settings?.payouts?.schedule,
          statement_descriptor: account.settings?.payouts?.statement_descriptor
        }
      },

      // Timestamps
      created: new Date(account.created * 1000).toISOString(),

      // Metadata from our system
      metadata: account.metadata
    };

    // Store the fetched details in database metadata for caching
    if (artist_profile_id) {
      const { error: updateError } = await supabase
        .from('artist_global_payments')
        .update({
          metadata: {
            stripe_account_details: accountDetails,
            last_details_fetch: new Date().toISOString(),
            account_region: accountRegion
          }
        })
        .eq('stripe_recipient_id', stripe_account_id);

      if (updateError) {
        console.error('Error storing account details in metadata:', updateError);
        // Continue anyway - we still return the data
      } else {
        console.log('Account details cached in database metadata');
      }
    }

    return new Response(JSON.stringify({
      success: true,
      account_details: accountDetails,
      account_region: accountRegion,
      fetched_at: new Date().toISOString(),
      cached: !!artist_profile_id
    }), {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      },
      status: 200
    });

  } catch (error) {
    console.error('Account details fetch error:', error);

    return new Response(JSON.stringify({
      error: error.message || 'Failed to fetch account details',
      success: false,
      timestamp: new Date().toISOString()
    }), {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      },
      status: 400
    });
  }
});
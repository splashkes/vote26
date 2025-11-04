// Stripe Connect Account Onboarding Edge Function
// Creates Stripe Connect accounts and onboarding links for artists
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import Stripe from 'https://esm.sh/stripe@13.0.0?target=deno';
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};
serve(async (req)=>{
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: corsHeaders
    });
  }
  try {
    // Get request body
    const requestBody = await req.json();
    console.log('Request body:', requestBody);
    const { person_id, stripe_account_id, return_url, refresh_url } = requestBody;
    if (!person_id || !return_url || !refresh_url) {
      console.error('Missing required parameters:', {
        person_id: !!person_id,
        return_url: !!return_url,
        refresh_url: !!refresh_url
      });
      throw new Error('person_id, return_url, and refresh_url are required');
    }
    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    // Get auth token and verify user
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('No authorization header');
    }
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      throw new Error('Unauthorized');
    }
    // Get person record and verify it matches the authenticated user
    console.log('Looking up person with auth_user_id:', user.id, 'and person_id:', person_id);
    const { data: person, error: personError } = await supabase.from('people').select('id, first_name, last_name, email, phone').eq('auth_user_id', user.id).single();
    if (personError || !person) {
      console.error('Person lookup error:', personError);
      throw new Error('Person not found for authenticated user: ' + (personError?.message || 'No person found'));
    }
    // Verify the person_id matches (security check)
    if (person.id !== person_id) {
      throw new Error('Person ID mismatch - access denied');
    }
    console.log('Person found:', person);
    // Get artist profile
    const { data: artistProfile, error: profileError } = await supabase.from('artist_profiles').select('id, name, email').eq('person_id', person.id).single();
    if (profileError || !artistProfile) {
      throw new Error('Artist profile not found');
    }
    // Get Stripe keys (using international account by default)
    const stripeSecretKey = Deno.env.get('stripe_intl_secret_key');
    if (!stripeSecretKey) {
      throw new Error('Stripe secret key not configured');
    }
    // Initialize Stripe
    const stripe = new Stripe(stripeSecretKey, {
      apiVersion: '2023-10-16',
      httpClient: Stripe.createFetchHttpClient()
    });
    let accountId = stripe_account_id;
    let isNewAccount = false;
    // Create Stripe Connect account if not provided
    if (!accountId) {
      const account = await stripe.accounts.create({
        type: 'express',
        country: 'US',
        email: artistProfile.email || person.email,
        capabilities: {
          transfers: {
            requested: true
          }
        },
        business_type: 'individual',
        individual: {
          first_name: person.first_name,
          last_name: person.last_name,
          email: artistProfile.email || person.email
        },
        metadata: {
          artist_profile_id: artistProfile.id,
          person_id: person.id
        }
      });
      accountId = account.id;
      isNewAccount = true;
      // Store the new Stripe account in database
      const { error: insertError } = await supabase.from('artist_stripe_accounts').insert({
        artist_profile_id: artistProfile.id,
        stripe_account_id: accountId,
        stripe_account_type: 'express',
        onboarding_status: 'not_started',
        charges_enabled: false,
        payouts_enabled: false,
        details_submitted: false,
        country: 'US',
        currency: 'USD',
        metadata: {
          created_via: 'edge_function',
          created_at: new Date().toISOString()
        }
      });
      if (insertError) {
        console.error('Error storing Stripe account:', insertError);
      // Continue anyway, account was created in Stripe
      }
    }
    // Create account link for onboarding
    const accountLink = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: refresh_url,
      return_url: return_url,
      type: 'account_onboarding'
    });
    // Update the database with the onboarding URL and expiration
    if (isNewAccount || accountLink.url) {
      const { error: updateError } = await supabase.from('artist_stripe_accounts').update({
        onboarding_url: accountLink.url,
        onboarding_url_expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        updated_at: new Date().toISOString()
      }).eq('stripe_account_id', accountId);
      if (updateError) {
        console.error('Error updating onboarding URL:', updateError);
      // Continue anyway
      }
    }
    // Return the onboarding URL
    return new Response(JSON.stringify({
      onboarding_url: accountLink.url,
      stripe_account_id: accountId,
      expires_at: accountLink.expires_at,
      is_new_account: isNewAccount
    }), {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      },
      status: 200
    });
  } catch (error) {
    console.error('Error creating Stripe Connect onboarding:', error);
    return new Response(JSON.stringify({
      error: error.message
    }), {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      },
      status: 400
    });
  }
});

// Stripe Global Payments Onboarding Edge Function
// Creates recipients and onboarding links for Global Payouts system
// Date: 2025-09-09

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};

interface OnboardingRequest {
  person_id: string;
  return_url: string;
  refresh_url: string;
  country?: string;
  currency?: string;
  stripe_recipient_id?: string; // For refreshing existing recipient
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Get request body
    const requestBody: OnboardingRequest = await req.json();
    console.log('Global Payments onboarding request:', requestBody);
    
    const { 
      person_id, 
      return_url, 
      refresh_url, 
      country = 'US', 
      currency = 'USD',
      stripe_recipient_id 
    } = requestBody;

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
    const { data: person, error: personError } = await supabase
      .from('people')
      .select('id, first_name, last_name, email, phone')
      .eq('auth_user_id', user.id)
      .single();

    if (personError || !person) {
      console.error('Person lookup error:', personError);
      throw new Error('Person not found for authenticated user: ' + (personError?.message || 'No person found'));
    }

    // Verify the person_id matches (security check)
    if (person.id !== person_id) {
      throw new Error('Person ID mismatch - access denied');
    }

    console.log('Person verified:', person);

    // Get artist profile
    const { data: artistProfile, error: profileError } = await supabase
      .from('artist_profiles')
      .select('id, name, email')
      .eq('person_id', person.id)
      .single();

    if (profileError || !artistProfile) {
      throw new Error('Artist profile not found');
    }

    // Check if Global Payments account already exists
    const { data: existingGlobalPayment, error: existingError } = await supabase
      .from('artist_global_payments')
      .select('*')
      .eq('artist_profile_id', artistProfile.id)
      .single();

    if (existingError && existingError.code !== 'PGRST116') {
      console.error('Error checking existing Global Payments account:', existingError);
      throw new Error('Failed to check existing account');
    }

    let globalPaymentRecord = existingGlobalPayment;
    let isNewAccount = false;

    // For Global Payouts, we create the recipient record in database first
    // The actual Stripe recipient will be created via Stripe Dashboard or API
    if (!globalPaymentRecord) {
      // Create new Global Payments record
      const { data: newRecord, error: insertError } = await supabase
        .from('artist_global_payments')
        .insert({
          artist_profile_id: artistProfile.id,
          stripe_recipient_id: stripe_recipient_id || null, // May be null initially
          country: country,
          default_currency: currency,
          status: 'invited', // Initial status for Global Payouts
          metadata: {
            created_via: 'global_payments_onboard_function',
            created_at: new Date().toISOString(),
            person_email: artistProfile.email || person.email,
            person_name: `${person.first_name} ${person.last_name}`
          }
        })
        .select()
        .single();

      if (insertError) {
        console.error('Error creating Global Payments record:', insertError);
        throw new Error('Failed to create Global Payments account');
      }

      globalPaymentRecord = newRecord;
      isNewAccount = true;
    }

    // For Global Payouts, we generate a hosted onboarding form URL
    // This is typically done through Stripe Dashboard or a dedicated endpoint
    // For now, we'll create a placeholder implementation that would integrate with Stripe's hosted forms
    
    // IMPORTANT: In production, you would:
    // 1. Create a recipient via Stripe API or Dashboard
    // 2. Generate an onboarding link for the hosted form
    // 3. Store the recipient ID and onboarding URL

    const onboardingUrl = `https://connect.stripe.com/global-payouts/onboard?recipient=${globalPaymentRecord.id}&return_url=${encodeURIComponent(return_url)}&refresh_url=${encodeURIComponent(refresh_url)}`;
    
    // Update the record with onboarding URL
    const { error: updateError } = await supabase
      .from('artist_global_payments')
      .update({
        onboarding_url: onboardingUrl,
        onboarding_url_expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // 24 hours
        updated_at: new Date().toISOString()
      })
      .eq('id', globalPaymentRecord.id);

    if (updateError) {
      console.error('Error updating onboarding URL:', updateError);
      // Continue anyway
    }

    // Return the onboarding information
    return new Response(JSON.stringify({
      onboarding_url: onboardingUrl,
      recipient_id: globalPaymentRecord.stripe_recipient_id,
      status: globalPaymentRecord.status,
      is_new_account: isNewAccount,
      system: 'global_payments',
      expires_at: Math.floor(Date.now() / 1000) + (24 * 60 * 60), // 24 hours from now
      instructions: {
        message: 'Complete your payment account setup using Stripe Global Payouts',
        benefits: [
          'Simpler onboarding process',
          'Faster setup for receiving payments', 
          'Reduced verification requirements',
          'Direct payouts to your account'
        ]
      }
    }), {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      },
      status: 200
    });

  } catch (error) {
    console.error('Error in Global Payments onboarding:', error);
    return new Response(JSON.stringify({
      error: error.message,
      system: 'global_payments'
    }), {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      },
      status: 400
    });
  }
});

// TODO: Production Implementation Notes
// 
// 1. Stripe Global Payouts Recipient Creation:
//    - Use Stripe Dashboard to create recipients
//    - Or use Stripe API: POST /v1/recipients
//    - Store the returned recipient ID in stripe_recipient_id
//
// 2. Hosted Onboarding Forms:
//    - Stripe provides hosted forms for Global Payouts
//    - Generate onboarding links via Dashboard or API
//    - Forms collect KYC and payout method details
//
// 3. Webhook Integration:
//    - Listen for recipient.created, recipient.updated events
//    - Update status in artist_global_payments table
//    - Handle recipient.requirements_due for compliance
//
// 4. Country-Specific Requirements:
//    - Different countries have different onboarding requirements
//    - Global Payouts supports 100+ countries
//    - Validate country codes and supported currencies
//
// 5. Migration from Connect:
//    - Check for existing Stripe Connect accounts
//    - Offer migration path in UI
//    - Maintain mapping in legacy_stripe_connect_account_id
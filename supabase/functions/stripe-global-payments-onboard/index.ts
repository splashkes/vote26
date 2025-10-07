// Stripe Global Payments Onboarding Edge Function
// Creates recipients and onboarding links for Global Payouts system
// Date: 2025-09-09

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import Stripe from 'https://esm.sh/stripe@13.0.0?target=deno';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
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
  try {
    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
      return new Response('ok', { headers: corsHeaders });
    }
    // Get request body
    const requestBody: OnboardingRequest = await req.json();
    console.log('Global Payments onboarding request:', requestBody);
    
    const { 
      person_id, 
      return_url, 
      refresh_url, 
      country, 
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

    // Extract person data from JWT claims (V2 auth system support)
    let authenticatedPersonId = null;
    let jwtPayload = null;

    // Try to parse JWT payload
    try {
      const tokenParts = token.split('.');
      if (tokenParts.length === 3) {
        jwtPayload = JSON.parse(atob(tokenParts[1]));
        console.log('JWT payload extracted:', {
          auth_version: jwtPayload.auth_version,
          person_id: jwtPayload.person_id,
          user_id: user.id
        });
      }
    } catch (parseError) {
      console.warn('JWT parsing failed (non-fatal):', parseError);
      // Continue with V1 fallback
    }

    // Check if V2 auth
    if (jwtPayload?.auth_version === 'v2-http') {
      if (jwtPayload.person_pending === true) {
        throw new Error('User profile not fully initialized - person pending');
      }
      if (!jwtPayload.person_id) {
        throw new Error('No person data found in authentication token');
      }
      authenticatedPersonId = jwtPayload.person_id;
    } else {
      // V1 auth system - lookup by auth_user_id
      console.log('Using V1 auth fallback - looking up by auth_user_id:', user.id);
      const { data: person, error: personError } = await supabase
        .from('people')
        .select('id, first_name, last_name, name, email, phone')
        .eq('auth_user_id', user.id)
        .single();

      if (personError || !person) {
        console.error('Person lookup error:', personError);
        throw new Error('Person not found for authenticated user: ' + (personError?.message || 'No person found'));
      }
      authenticatedPersonId = person.id;
    }

    // Final verification
    if (!authenticatedPersonId) {
      throw new Error('Failed to determine authenticated person ID');
    }

    // Verify the person_id matches (security check)
    if (authenticatedPersonId !== person_id) {
      throw new Error('Person ID mismatch - access denied');
    }

    // Get the person record for the authenticated person
    const { data: person, error: personError } = await supabase
      .from('people')
      .select('id, first_name, last_name, name, email, phone')
      .eq('id', authenticatedPersonId)
      .single();

    if (personError || !person) {
      console.error('Person record lookup error:', personError);
      throw new Error('Person record not found: ' + (personError?.message || 'No person found'));
    }

    console.log('Person verified:', person);

    // Get primary artist profile using the authoritative selection function
    const { data: profileData, error: profileError } = await supabase
      .rpc('get_primary_artist_profile', { p_person_id: person.id });

    if (profileError) {
      console.error('Error getting primary artist profile:', profileError);
      throw new Error('Failed to retrieve artist profile');
    }

    const artistProfile = profileData?.[0];

    if (!artistProfile) {
      throw new Error('Artist profile not found');
    }

    // Validate required profile information for payments setup (using only artist profile data)
    const missingFields = [];
    if (!artistProfile.name) {
      missingFields.push('name');
    }
    if (!artistProfile.email) {
      missingFields.push('email');
    }
    if (!artistProfile.phone) {
      missingFields.push('phone');
    }
    if (!artistProfile.country) {
      missingFields.push('country');
    }

    if (missingFields.length > 0) {
      throw new Error(`Please add ${missingFields.join(', ')} to profile before setting up payments`);
    }

    // Always use country from artist profile (ignore request parameter)
    const finalCountry = artistProfile.country;

    console.log('=== COUNTRY DEBUG ===');
    console.log('country from request:', country);
    console.log('artistProfile.country:', artistProfile.country);
    console.log('finalCountry:', finalCountry);
    console.log('artistProfile.name:', artistProfile.name);
    console.log('artistProfile.email:', artistProfile.email);
    
    // Select appropriate Stripe key based on country
    const useCanadaKey = (finalCountry === 'CA' || finalCountry === 'Canada');
    console.log('useCanadaKey decision:', useCanadaKey, '(finalCountry === CA:', finalCountry === 'CA', ', finalCountry === Canada:', finalCountry === 'Canada', ')');
    
    const stripeSecretKey = useCanadaKey 
      ? Deno.env.get('stripe_canada_secret_key')
      : Deno.env.get('stripe_intl_secret_key');
      
    console.log('Selected Stripe key type:', useCanadaKey ? 'CANADA' : 'INTERNATIONAL');
    console.log('Stripe key length:', stripeSecretKey?.length || 'KEY_NOT_FOUND');
    
    if (!stripeSecretKey) {
      throw new Error(`Stripe configuration error - ${useCanadaKey ? 'Canada' : 'International'} secret key not available`);
    }

    const stripe = new Stripe(stripeSecretKey, { 
      apiVersion: '2023-10-16',
      typescript: true 
    });

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
    let stripeAccount = null;
    let onboardingUrl = null;

    // If refreshing existing recipient
    if (stripe_recipient_id && globalPaymentRecord?.stripe_recipient_id) {
      console.log('Refreshing existing Stripe account:', stripe_recipient_id);
      try {
        // Retrieve existing account to check status
        stripeAccount = await stripe.accounts.retrieve(stripe_recipient_id);
        console.log('Retrieved Stripe account:', stripeAccount.id, 'status:', stripeAccount.requirements?.disabled_reason);
        
        // Generate account link for onboarding continuation  
        const returnHandler = 'https://xsqdkubgyqwpyvfltnrf.supabase.co/functions/v1/stripe-onboarding-return';
        const accountLink = await stripe.accountLinks.create({
          account: stripe_recipient_id,
          refresh_url: `${returnHandler}?account=${stripe_recipient_id}&status=refresh`,
          return_url: `${returnHandler}?account=${stripe_recipient_id}&status=completed`,
          type: 'account_onboarding',
        });
        
        onboardingUrl = accountLink.url;
      } catch (stripeError) {
        console.error('Error refreshing Stripe account:', stripeError);
        throw new Error('Failed to refresh onboarding: ' + stripeError.message);
      }
    } else {
      // Create new Stripe account using v2 core accounts API
      console.log('Creating new Stripe Global Payments account...');
      
      try {
        console.log('=== STRIPE ACCOUNT CREATION ===');
        console.log('Creating Stripe account with country:', finalCountry);
        console.log('Using Stripe key type:', useCanadaKey ? 'CANADA' : 'INTERNATIONAL');
        console.log('Artist email:', artistProfile.email);
        console.log('Artist name parts:', {
          first: artistProfile.name.split(' ')[0] || 'Artist',
          last: artistProfile.name.split(' ').slice(1).join(' ') || 'Profile'
        });

        // Determine if US/Canada (full service agreement) or International (recipient service agreement)
        const isUSorCA = (finalCountry === 'US' || finalCountry === 'CA' || finalCountry === 'Canada' || finalCountry === 'United States');
        const serviceAgreement = isUSorCA ? 'full' : 'recipient';

        console.log('=== SERVICE AGREEMENT SELECTION ===');
        console.log('Country:', finalCountry);
        console.log('Is US/CA:', isUSorCA);
        console.log('Service Agreement:', serviceAgreement);

        const accountData: any = {
          type: 'custom',
          country: finalCountry,
          email: artistProfile.email,
          capabilities: {
            transfers: { requested: true },
          },
          business_type: 'individual',
          individual: {
            first_name: artistProfile.name.split(' ')[0] || 'Artist',
            last_name: artistProfile.name.split(' ').slice(1).join(' ') || 'Profile',
            email: artistProfile.email,
          },
          business_profile: {
            mcc: '5971', // Art dealers and galleries
            product_description: 'Independent visual artist participating in Art Battle live painting competitions and exhibitions.',
            url: 'https://artbattle.com',
            support_email: 'payments@artbattle.com',
            support_phone: '+14163025959',
            support_url: 'https://artbattle.com/contact'
          },
        };

        // Add service agreement for recipient accounts (international)
        if (!isUSorCA) {
          accountData.tos_acceptance = {
            service_agreement: 'recipient'
          };
          console.log('Added recipient service agreement for international artist');
        } else {
          // For US/CA, add card_payments capability (full service agreement - default)
          accountData.capabilities.card_payments = { requested: true };
          console.log('Using full service agreement (default) for US/CA artist');
        }
        
        console.log('Account data being sent to Stripe:', JSON.stringify(accountData, null, 2));
        
        // Create the account with Global Payouts configuration
        stripeAccount = await stripe.accounts.create({
          ...accountData,
          metadata: {
            artist_profile_id: artistProfile.id.toString(),
            person_id: person.id.toString(),
            created_via: 'global_payments_onboard_function',
            system: 'global_payments'
          }
        });

        console.log('Created Stripe account:', stripeAccount.id);

        // Generate onboarding link with our return handler
        const returnHandler = 'https://xsqdkubgyqwpyvfltnrf.supabase.co/functions/v1/stripe-onboarding-return';
        const accountLink = await stripe.accountLinks.create({
          account: stripeAccount.id,
          refresh_url: `${returnHandler}?account=${stripeAccount.id}&status=refresh`,
          return_url: `${returnHandler}?account=${stripeAccount.id}&status=completed`,
          type: 'account_onboarding',
        });

        onboardingUrl = accountLink.url;

        // Queue Slack notification for Global Payments initiation
        try {
          const slackBlocks = [
            {
              type: 'header',
              text: {
                type: 'plain_text',
                text: '💳 Global Payments Setup Initiated',
                emoji: true
              }
            },
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: `*Artist:* ${artistProfile.name}\n*Email:* ${artistProfile.email}\n*Country:* ${finalCountry} (from profile: ${artistProfile.country})\n*Service Agreement:* ${serviceAgreement}\n*Stripe Key:* ${useCanadaKey ? 'CANADA' : 'INTERNATIONAL'}\n*Stripe Account:* ${stripeAccount.id}\n*Profile ID:* ${artistProfile.id}`
              }
            },
            {
              type: 'context',
              elements: [
                {
                  type: 'mrkdwn',
                  text: `Initiated at ${new Date().toISOString()} | Using ${useCanadaKey ? 'Canada' : 'International'} Stripe account`
                }
              ]
            }
          ];

          await supabase.rpc('queue_slack_notification', {
            p_channel_name: 'admin-notifications',
            p_message_type: 'global_payments_initiated', 
            p_text: `💳 ${artistProfile.name} initiated Global Payments setup`,
            p_blocks: slackBlocks,
            p_event_id: null
          });
          
          console.log('Slack notification queued for Global Payments initiation');
        } catch (slackError) {
          console.error('Failed to queue Slack notification:', slackError);
          // Don't fail the main process for Slack notification errors
        }
        
        // Create or update Global Payments record in database
        if (!globalPaymentRecord) {
          const { data: newRecord, error: insertError } = await supabase
            .from('artist_global_payments')
            .insert({
              artist_profile_id: artistProfile.id,
              stripe_recipient_id: stripeAccount.id,
              country: finalCountry,
              default_currency: currency,
              status: 'invited',
              metadata: {
                created_via: 'global_payments_onboard_function',
                created_at: new Date().toISOString(),
                person_email: artistProfile.email,
                person_name: artistProfile.name,
                stripe_account_type: 'custom',
                service_agreement: serviceAgreement,
                onboarding_started_at: new Date().toISOString()
              }
            })
            .select()
            .single();

          if (insertError) {
            console.error('Error creating Global Payments record:', insertError);
            throw new Error('Failed to create Global Payments account');
          }

          globalPaymentRecord = newRecord;
        } else {
          // Update existing record
          const { error: updateError } = await supabase
            .from('artist_global_payments')
            .update({
              stripe_recipient_id: stripeAccount.id,
              status: 'invited',
              updated_at: new Date().toISOString(),
              metadata: {
                ...globalPaymentRecord.metadata,
                stripe_account_type: 'custom',
                service_agreement: serviceAgreement,
                onboarding_restarted_at: new Date().toISOString()
              }
            })
            .eq('id', globalPaymentRecord.id);

          if (updateError) {
            console.error('Error updating Global Payments record:', updateError);
          }
        }

      } catch (stripeError) {
        console.error('Error creating Stripe account:', stripeError);
        throw new Error('Failed to create Stripe account: ' + stripeError.message);
      }
    }

    // Return the onboarding URL for immediate redirect
    return new Response(JSON.stringify({
      success: true,
      system: 'global_payments',
      onboarding_type: 'direct_redirect',
      onboarding_url: onboardingUrl,
      stripe_account_id: stripeAccount.id,
      message: 'Redirecting to Stripe onboarding',
      debug_info: {
        country_from_request: country,
        country_from_profile: artistProfile.country,
        final_country: finalCountry,
        using_canada_key: useCanadaKey,
        stripe_key_type: useCanadaKey ? 'CANADA' : 'INTERNATIONAL',
        artist_name: artistProfile.name,
        artist_email: artistProfile.email
      },
      contact_info: {
        email: artistProfile.email,
        name: artistProfile.name,
        artist_profile_id: artistProfile.id,
        internal_id: globalPaymentRecord?.id
      }
    }), {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      },
      status: 200
    });

  } catch (error) {
    return new Response(JSON.stringify({
      error: error.message || 'Unknown error occurred',
      success: false,
      system: 'global_payments',
      debug: {
        timestamp: new Date().toISOString(),
        function_name: 'stripe-global-payments-onboard',
        error_type: error.name || 'UnknownError',
        error_message: error.message,
        error_stack: error.stack,
        country_provided: typeof country !== 'undefined' ? country : 'not_provided',
        country_from_profile: typeof artistProfile !== 'undefined' ? artistProfile?.country : 'profile_not_loaded',
        final_country: typeof finalCountry !== 'undefined' ? finalCountry : 'not_determined',
        using_canada_key: typeof finalCountry !== 'undefined' ? (finalCountry === 'CA' || finalCountry === 'Canada') : false,
        artist_profile_name: typeof artistProfile !== 'undefined' ? artistProfile?.name : 'profile_not_loaded',
        stripe_canada_key_available: !!Deno.env.get('stripe_canada_secret_key'),
        stripe_intl_key_available: !!Deno.env.get('stripe_intl_secret_key'),
        supabase_url_available: !!Deno.env.get('SUPABASE_URL'),
        supabase_service_key_available: !!Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),
        request_method: req.method,
        has_auth_header: !!req.headers.get('Authorization')
      }
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
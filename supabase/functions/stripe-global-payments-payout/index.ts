// Stripe Global Payments Payout Edge Function
// Creates direct payouts to recipients using Global Payouts system
// Date: 2025-09-09

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import Stripe from 'https://esm.sh/stripe@13.0.0?target=deno';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};

interface PayoutRequest {
  art_id: string;
  amount: number; // Amount in dollars (will be converted to cents)
  currency?: string;
  artist_profile_id?: string; // Optional - will be derived from art_id if not provided
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Get request body
    const requestBody: PayoutRequest = await req.json();
    console.log('Global Payments payout request:', requestBody);
    
    const { 
      art_id,
      amount,
      currency = 'USD',
      artist_profile_id
    } = requestBody;

    if (!art_id || !amount || amount <= 0) {
      throw new Error('art_id and positive amount are required');
    }

    // Initialize Supabase client with service role
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get artwork and verify it exists, plus get artist info
    const { data: artwork, error: artworkError } = await supabase
      .from('art')
      .select(`
        id,
        art_code,
        artist_profile_id,
        current_bid,
        status,
        artist_profiles:artist_profile_id (
          id,
          name,
          person_id,
          people:person_id (
            first_name,
            last_name,
            email
          )
        )
      `)
      .eq('id', art_id)
      .single();

    if (artworkError || !artwork) {
      throw new Error('Artwork not found: ' + (artworkError?.message || 'No artwork found'));
    }

    const targetArtistProfileId = artist_profile_id || artwork.artist_profile_id;

    // Verify artist profile matches if provided
    if (artist_profile_id && artist_profile_id !== artwork.artist_profile_id) {
      throw new Error('Artist profile ID does not match artwork');
    }

    // Get Global Payments account for this artist
    const { data: globalPaymentAccount, error: accountError } = await supabase
      .from('artist_global_payments')
      .select('*')
      .eq('artist_profile_id', targetArtistProfileId)
      .single();

    if (accountError || !globalPaymentAccount) {
      throw new Error('Global Payments account not found for artist: ' + (accountError?.message || 'No account'));
    }

    if (globalPaymentAccount.status !== 'ready') {
      throw new Error(`Global Payments account not ready. Current status: ${globalPaymentAccount.status}`);
    }

    if (!globalPaymentAccount.stripe_recipient_id) {
      throw new Error('No Stripe recipient ID found for artist');
    }

    // Check if payout already exists for this artwork
    const { data: existingPayout, error: existingError } = await supabase
      .from('global_payment_requests')
      .select('id, status, stripe_payout_id')
      .eq('art_id', art_id)
      .single();

    if (existingError && existingError.code !== 'PGRST116') {
      throw new Error('Error checking existing payout: ' + existingError.message);
    }

    if (existingPayout) {
      return new Response(JSON.stringify({
        message: 'Payout already exists for this artwork',
        existing_payout: {
          id: existingPayout.id,
          status: existingPayout.status,
          stripe_payout_id: existingPayout.stripe_payout_id
        },
        system: 'global_payments'
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200
      });
    }

    // Convert amount to minor currency units (cents)
    const amountMinor = Math.round(amount * 100);

    // Generate idempotency key
    const idempotencyKey = crypto.randomUUID();

    // Create payout request record first (before Stripe call)
    const { data: payoutRecord, error: insertError } = await supabase
      .from('global_payment_requests')
      .insert({
        artist_profile_id: targetArtistProfileId,
        art_id: art_id,
        stripe_recipient_id: globalPaymentAccount.stripe_recipient_id,
        amount_minor: amountMinor,
        currency: currency.toUpperCase(),
        status: 'queued',
        idempotency_key: idempotencyKey,
        metadata: {
          artwork_code: artwork.art_code,
          artist_name: artwork.artist_profiles?.name,
          created_via: 'global_payments_payout_function',
          original_amount: amount
        }
      })
      .select()
      .single();

    if (insertError) {
      console.error('Error creating payout record:', insertError);
      throw new Error('Failed to create payout record');
    }

    // Get Stripe secret key
    const stripeSecretKey = Deno.env.get('stripe_intl_secret_key');
    if (!stripeSecretKey) {
      throw new Error('Stripe secret key not configured');
    }

    // Initialize Stripe
    const stripe = new Stripe(stripeSecretKey, {
      apiVersion: '2023-10-16',
      httpClient: Stripe.createFetchHttpClient()
    });

    try {
      // Create the payout using Global Payouts
      const payout = await stripe.payouts.create({
        amount: amountMinor,
        currency: currency.toLowerCase(),
        recipient: globalPaymentAccount.stripe_recipient_id,
        metadata: {
          art_id: art_id,
          art_code: artwork.art_code,
          artist_profile_id: targetArtistProfileId,
          internal_payout_id: payoutRecord.id
        }
      }, {
        idempotencyKey: idempotencyKey
      });

      console.log('Stripe payout created:', payout.id);

      // Update our record with Stripe payout ID and status
      const { error: updateError } = await supabase
        .from('global_payment_requests')
        .update({
          stripe_payout_id: payout.id,
          status: 'sent', // Global Payouts start as 'sent'
          sent_at: new Date().toISOString(),
          metadata: {
            ...payoutRecord.metadata,
            stripe_status: payout.status,
            stripe_arrival_date: payout.arrival_date ? new Date(payout.arrival_date * 1000).toISOString() : null
          }
        })
        .eq('id', payoutRecord.id);

      if (updateError) {
        console.error('Error updating payout record with Stripe ID:', updateError);
        // Don't throw - the payout was created successfully
      }

      return new Response(JSON.stringify({
        success: true,
        message: 'Payout sent successfully',
        payout: {
          id: payoutRecord.id,
          stripe_payout_id: payout.id,
          amount: amount,
          currency: currency,
          recipient_id: globalPaymentAccount.stripe_recipient_id,
          status: 'sent',
          arrival_date: payout.arrival_date ? new Date(payout.arrival_date * 1000).toISOString() : null
        },
        system: 'global_payments'
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200
      });

    } catch (stripeError) {
      console.error('Stripe payout failed:', stripeError);
      
      // Update our record to reflect the failure
      const { error: failureUpdateError } = await supabase
        .from('global_payment_requests')
        .update({
          status: 'failed',
          error_code: stripeError.code || 'unknown_error',
          error_message: stripeError.message,
          metadata: {
            ...payoutRecord.metadata,
            stripe_error: stripeError.message,
            failed_at: new Date().toISOString()
          }
        })
        .eq('id', payoutRecord.id);

      if (failureUpdateError) {
        console.error('Error updating failed payout record:', failureUpdateError);
      }

      // Re-throw the Stripe error
      throw new Error(`Stripe payout failed: ${stripeError.message}`);
    }

  } catch (error) {
    console.error('Error in Global Payments payout:', error);
    return new Response(JSON.stringify({
      error: error.message,
      system: 'global_payments'
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400
    });
  }
});

// TODO: Production Implementation Notes
//
// 1. Balance Management:
//    - Global Payouts require prefunded Stripe balance
//    - Monitor balance levels and alert when low
//    - Consider automatic top-ups or manual funding processes
//
// 2. Error Handling:
//    - Implement retry logic for transient failures
//    - Handle insufficient_funds errors gracefully
//    - Track failed payouts for manual review
//
// 3. Compliance & Validation:
//    - Validate recipient eligibility before payout
//    - Check for country-specific requirements
//    - Handle regulatory restrictions (e.g., sanctions lists)
//
// 4. Currency Considerations:
//    - Support multi-currency payouts based on recipient country
//    - Handle FX rates and conversion fees
//    - Maintain currency-specific balances
//
// 5. Audit & Reconciliation:
//    - Log all payout attempts and outcomes
//    - Regular reconciliation with Stripe records
//    - Financial reporting and tax implications
//
// 6. Webhook Integration:
//    - Listen for payout.updated events from Stripe
//    - Update local records based on final payout status
//    - Handle payout reversals or failures
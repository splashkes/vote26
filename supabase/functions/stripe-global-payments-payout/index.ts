// Stripe Global Payments Payout Edge Function with FX Quotes Integration
// SINGLE SOURCE OF TRUTH for all artist payments with automatic FX conversion
// Date: 2025-10-16 - Unified payment processor

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import Stripe from 'https://esm.sh/stripe@14.21.0?target=deno';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};

const STRIPE_PREVIEW_API_VERSION = '2025-07-30.preview';

interface PayoutRequest {
  // NEW: Support both payment types
  art_id?: string;                    // For art-based payments (global_payment_requests)
  artist_payment_id?: string;         // For direct artist payments (artist_payments)

  // Optional overrides
  amount?: number;                    // Amount in artist's local currency (dollars)
  currency?: string;                  // Artist's currency (AUD, THB, USD, etc)
  artist_profile_id?: string;         // Optional - will be derived if not provided
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
      artist_payment_id,
      amount: amountOverride,
      currency: currencyOverride,
      artist_profile_id: artistProfileIdOverride
    } = requestBody;

    // Validate: must have either art_id OR artist_payment_id
    if (!art_id && !artist_payment_id) {
      throw new Error('Either art_id or artist_payment_id is required');
    }
    if (art_id && artist_payment_id) {
      throw new Error('Provide either art_id OR artist_payment_id, not both');
    }

    // Initialize Supabase client with service role
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get payment details and artist info based on payment type
    let targetArtistProfileId: string;
    let artistName: string;
    let paymentAmount: number;
    let paymentCurrency: string;
    let paymentDescription: string;
    let referenceId: string;
    let existingPaymentId: string | null = null;

    if (artist_payment_id) {
      // CASE 1: Direct artist payment from artist_payments table
      console.log(`Processing artist_payment: ${artist_payment_id}`);

      const { data: payment, error: paymentError } = await supabase
        .from('artist_payments')
        .select(`
          id,
          artist_profile_id,
          gross_amount,
          currency,
          description,
          status,
          stripe_transfer_id,
          artist_profiles:artist_profile_id (
            name,
            person_id
          )
        `)
        .eq('id', artist_payment_id)
        .single();

      if (paymentError || !payment) {
        throw new Error('Artist payment not found: ' + (paymentError?.message || 'No payment found'));
      }

      // Check if already processed
      if (payment.status === 'paid' && payment.stripe_transfer_id) {
        return new Response(JSON.stringify({
          message: 'Payment already processed',
          existing_transfer_id: payment.stripe_transfer_id,
          status: payment.status,
          system: 'global_payments'
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200
        });
      }

      targetArtistProfileId = artistProfileIdOverride || payment.artist_profile_id;
      artistName = payment.artist_profiles?.name || 'Unknown Artist';
      paymentAmount = amountOverride || payment.gross_amount;
      paymentCurrency = currencyOverride || payment.currency;
      paymentDescription = payment.description || `Payment to ${artistName}`;
      referenceId = artist_payment_id;
      existingPaymentId = artist_payment_id;

    } else {
      // CASE 2: Art-based payment from art table (legacy/new global_payment_requests)
      console.log(`Processing art_payment: ${art_id}`);

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
            person_id
          )
        `)
        .eq('id', art_id)
        .single();

      if (artworkError || !artwork) {
        throw new Error('Artwork not found: ' + (artworkError?.message || 'No artwork found'));
      }

      targetArtistProfileId = artistProfileIdOverride || artwork.artist_profile_id;
      artistName = artwork.artist_profiles?.name || 'Unknown Artist';
      paymentAmount = amountOverride;
      if (!paymentAmount) {
        throw new Error('amount is required for art-based payments');
      }
      paymentCurrency = currencyOverride || 'USD';
      paymentDescription = `Payment for ${artwork.art_code} - ${artistName}`;
      referenceId = art_id!;

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

    // Determine which Stripe key to use based on payment currency
    const isCanadian = (paymentCurrency.toUpperCase() === 'CAD');
    const stripeSecretKey = isCanadian
      ? Deno.env.get('stripe_canada_secret_key')
      : Deno.env.get('stripe_intl_secret_key');

    if (!stripeSecretKey) {
      throw new Error(`Stripe secret key not configured for ${isCanadian ? 'Canada' : 'International'}`);
    }

    console.log(`Using ${isCanadian ? 'Canadian' : 'International'} Stripe account for ${paymentCurrency} payment`);

    // Initialize Stripe
    const stripe = new Stripe(stripeSecretKey, {
      apiVersion: '2023-10-16',
      httpClient: Stripe.createFetchHttpClient()
    });

    // Get artist's Stripe account info
    const artistAccount = await stripe.accounts.retrieve(globalPaymentAccount.stripe_recipient_id);
    const artistCountry = artistAccount.country;
    const artistAccountCurrency = (artistAccount.default_currency || globalPaymentAccount.default_currency || 'USD').toUpperCase();

    // IMPORTANT: Payment currency = debt currency (based on event location)
    // For artist_payments: Use the payment's currency (the actual debt)
    // For art_payments: Use provided currency or account default
    const targetCurrency = paymentCurrency.toUpperCase();

    console.log(`Artist: ${artistName}, Country: ${artistCountry}`);
    console.log(`Debt: ${paymentAmount} ${targetCurrency} (event currency)`);
    console.log(`Artist account currency: ${artistAccountCurrency}`);

    // Determine if international (non-US/CA) payment requiring FX
    const isUSCA = (artistCountry === 'US' || artistCountry === 'CA');
    const targetAmount = paymentAmount; // Amount in debt currency

    // Determine platform currency based on which Stripe account we're using
    const platformCurrency = isCanadian ? 'CAD' : 'USD';

    let platformAmountToSend = paymentAmount;
    let fxQuoteId = null;
    let exchangeRate = null;
    let fxMetadata: any = {};

    // For Canadian payments: CAD → CAD (no FX)
    // For US payments: USD → USD (no FX)
    // For International payments: USD → target currency (FX needed if not USD)
    if (isCanadian && targetCurrency === 'CAD') {
      // Canadian platform sending CAD to Canadian artist - direct transfer
      console.log(`🍁 Canadian domestic payment: ${targetAmount} CAD → CAD`);
      platformAmountToSend = targetAmount;
      fxMetadata = {
        payment_type: 'canadian_domestic',
        note: 'Direct CAD to CAD transfer, no FX conversion needed'
      };
    } else if (!isCanadian && !isUSCA && targetCurrency !== 'USD') {
      // International platform sending USD with FX conversion
      console.log(`🌍 International payment: ${targetAmount} ${targetCurrency}`);

      try {
        // Create FX Quote using preview API
        const authHeader = 'Basic ' + btoa(stripeSecretKey + ':');
        const fxResponse = await fetch('https://api.stripe.com/v1/fx_quotes', {
          method: 'POST',
          headers: {
            'Authorization': authHeader,
            'Stripe-Version': STRIPE_PREVIEW_API_VERSION,
            'Content-Type': 'application/x-www-form-urlencoded'
          },
          body: new URLSearchParams({
            'to_currency': targetCurrency.toLowerCase(),
            'from_currencies[]': 'usd',
            'lock_duration': 'hour' // Lock rate for 1 hour
          })
        });

        if (!fxResponse.ok) {
          const errorText = await fxResponse.text();
          throw new Error(`FX Quote API failed: ${errorText}`);
        }

        const fxQuote = await fxResponse.json();
        fxQuoteId = fxQuote.id;
        exchangeRate = fxQuote.rates.usd.exchange_rate;

        // Calculate USD amount needed for target local currency amount
        platformAmountToSend = targetAmount / exchangeRate;

        fxMetadata = {
          fx_quote_id: fxQuoteId,
          exchange_rate: exchangeRate,
          target_currency: targetCurrency,
          target_amount: targetAmount,
          usd_amount_calculated: platformAmountToSend,
          fx_rate_details: fxQuote.rates.usd.rate_details,
          fx_quote_expires_at: new Date(fxQuote.lock_expires_at * 1000).toISOString()
        };

        console.log(`💱 FX Quote: ${fxQuoteId}, rate: ${exchangeRate}`);
        console.log(`💵 Sending ${platformAmountToSend.toFixed(2)} USD → ${targetAmount} ${targetCurrency}`);

      } catch (fxError: any) {
        console.error('FX Quote API error:', fxError);
        throw new Error(`Failed to get FX rate: ${fxError.message}`);
      }
    } else {
      // US domestic or other direct transfers
      console.log(`🏠 Domestic payment: ${targetAmount} ${platformCurrency}`);
      platformAmountToSend = targetAmount;
      fxMetadata = {
        payment_type: 'domestic',
        note: `No FX conversion needed for ${platformCurrency} payment`
      };
    }

    // Convert to cents in platform currency
    const amountMinor = Math.ceil(platformAmountToSend * 100);

    // Generate idempotency key
    const idempotencyKey = crypto.randomUUID();

    // Log API conversation to database
    const logApiConversation = async (status: number, response: any, error: string | null) => {
      await supabase
        .from('stripe_api_conversations')
        .insert({
          payment_id: existingPaymentId,
          artist_profile_id: targetArtistProfileId,
          stripe_account_id: globalPaymentAccount.stripe_recipient_id,
          api_endpoint: 'https://api.stripe.com/v1/transfers',
          request_method: 'POST',
          request_body: {
            amount: amountMinor,
            currency: platformCurrency.toLowerCase(),
            destination: globalPaymentAccount.stripe_recipient_id,
            description: paymentDescription,
            metadata: {
              artist_profile_id: targetArtistProfileId,
              artist_name: artistName,
              target_currency: targetCurrency,
              target_amount: targetAmount.toString(),
              fx_quote_id: fxQuoteId || 'none',
              reference_id: referenceId,
              platform_currency: platformCurrency
            }
          },
          response_status: status,
          response_body: response,
          error_message: error,
          created_by: 'stripe-global-payments-payout'
        });
    };

    try {
      // Create the Stripe transfer
      console.log(`🚀 Creating transfer: ${amountMinor} cents ${platformCurrency} to ${globalPaymentAccount.stripe_recipient_id}`);

      const transfer = await stripe.transfers.create({
        amount: amountMinor,
        currency: platformCurrency.toLowerCase(), // Use platform currency (CAD for Canadian, USD for International)
        destination: globalPaymentAccount.stripe_recipient_id,
        description: paymentDescription,
        metadata: {
          artist_profile_id: targetArtistProfileId,
          artist_name: artistName,
          target_currency: targetCurrency,
          target_amount: targetAmount.toString(),
          fx_quote_id: fxQuoteId || 'none',
          exchange_rate: exchangeRate?.toString() || 'none',
          reference_id: referenceId,
          payment_type: artist_payment_id ? 'artist_payment' : 'art_payment',
          platform_currency: platformCurrency
        }
      }, {
        idempotencyKey: idempotencyKey
      });

      console.log(`✅ Stripe transfer created: ${transfer.id}`);

      // Log successful API call
      await logApiConversation(200, transfer, null);

      // Update the appropriate table based on payment type
      if (artist_payment_id) {
        // Update artist_payments table
        const { error: updateError } = await supabase
          .from('artist_payments')
          .update({
            status: 'paid',
            stripe_transfer_id: transfer.id,
            paid_at: new Date().toISOString(),
            metadata: {
              stripe_transfer_id: transfer.id,
              platform_amount_sent: platformAmountToSend.toFixed(2),
              platform_amount_sent_minor: amountMinor,
              platform_currency: platformCurrency,
              processed_by: 'stripe-global-payments-payout',
              processed_at: new Date().toISOString(),
              ...fxMetadata
            }
          })
          .eq('id', artist_payment_id);

        if (updateError) {
          console.error('Error updating artist_payments:', updateError);
          // Don't throw - transfer succeeded
        }

      } else {
        // Create global_payment_requests record
        const { error: insertError } = await supabase
          .from('global_payment_requests')
          .insert({
            artist_profile_id: targetArtistProfileId,
            art_id: art_id,
            stripe_recipient_id: globalPaymentAccount.stripe_recipient_id,
            stripe_payout_id: transfer.id,
            amount_minor: Math.round(targetAmount * 100),
            currency: targetCurrency,
            status: 'sent',
            sent_at: new Date().toISOString(),
            idempotency_key: idempotencyKey,
            metadata: {
              artist_name: artistName,
              artist_country: artistCountry,
              created_via: 'stripe-global-payments-payout-v3',
              original_amount: targetAmount,
              original_currency: targetCurrency,
              platform_amount_sent: platformAmountToSend.toFixed(2),
              platform_amount_sent_minor: amountMinor,
              platform_currency: platformCurrency,
              stripe_transfer_id: transfer.id,
              ...fxMetadata
            }
          });

        if (insertError) {
          console.error('Error creating global_payment_requests:', insertError);
          // Don't throw - transfer succeeded
        }
      }

      return new Response(JSON.stringify({
        success: true,
        message: 'Payment sent successfully',
        payout: {
          stripe_transfer_id: transfer.id,
          artist_name: artistName,
          target_amount: targetAmount,
          target_currency: targetCurrency,
          platform_amount_sent: platformAmountToSend.toFixed(2),
          platform_currency: platformCurrency,
          recipient_id: globalPaymentAccount.stripe_recipient_id,
          status: 'sent',
          fx_used: !isUSCA && targetCurrency !== 'USD',
          fx_rate: exchangeRate || null,
          fx_quote_id: fxQuoteId || null
        },
        system: 'global_payments'
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200
      });

    } catch (stripeError: any) {
      console.error('❌ Stripe transfer failed:', stripeError);

      // Log failed API call
      await logApiConversation(400, { error: stripeError.message }, stripeError.message);

      // Update payment record to reflect failure
      if (artist_payment_id) {
        await supabase
          .from('artist_payments')
          .update({
            status: 'failed',
            error_message: stripeError.message,
            metadata: {
              error_message: stripeError.message,
              failed_at: new Date().toISOString(),
              processed_by: 'stripe-global-payments-payout'
            }
          })
          .eq('id', artist_payment_id);
      }

      // Re-throw the Stripe error
      throw new Error(`Stripe transfer failed: ${stripeError.message}`);
    }

  } catch (error: any) {
    console.error('❌ Error in Global Payments payout:', error);
    return new Response(JSON.stringify({
      error: error.message,
      system: 'global_payments'
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400
    });
  }
});

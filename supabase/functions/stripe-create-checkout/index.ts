// Stripe Checkout Session Creation Edge Function
// Creates a Stripe Checkout session for artwork payment
// Handles multi-currency and determines which Stripe account to use

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import Stripe from 'https://esm.sh/stripe@13.0.0?target=deno'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Get request body
    const { art_id, success_url, cancel_url } = await req.json()
    
    if (!art_id) {
      throw new Error('art_id is required')
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Get auth token and verify user
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      throw new Error('No authorization header')
    }

    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    
    if (authError || !user) {
      throw new Error('Unauthorized')
    }

    // Get person record by auth_user_id (consistent with payment-status function)
    const { data: person, error: personError } = await supabase
      .from('people')
      .select('id, first_name, last_name, email, phone, nickname')
      .eq('auth_user_id', user.id)
      .single()

    if (personError || !person) {
      throw new Error('Person not found - user not properly linked')
    }

    // Get artwork details with event info
    const { data: artwork, error: artError } = await supabase
      .from('art')
      .select(`
        id,
        art_code,
        status,
        current_bid,
        event_id,
        round,
        easel,
        events (
          id,
          name,
          currency,
          stripe_account_region,
          tax,
          country_id,
          countries (
            code,
            currency_code,
            currency_symbol
          )
        ),
        artist_profiles (
          name
        )
      `)
      .eq('id', art_id)
      .single()

    if (artError || !artwork) {
      throw new Error('Artwork not found')
    }

    // Verify artwork is available for payment (sold or closed status)
    if (!['sold', 'closed'].includes(artwork.status)) {
      throw new Error('Artwork is not available for payment')
    }

    // Get the winning bid to verify this person is the winner
    const { data: winningBid, error: bidError } = await supabase
      .from('bids')
      .select('person_id, amount')
      .eq('art_id', art_id)
      .order('amount', { ascending: false })
      .limit(1)
      .single()

    if (bidError || !winningBid) {
      throw new Error('No winning bid found')
    }

    if (winningBid.person_id !== person.id) {
      throw new Error('You are not the winning bidder')
    }

    // Check if payment already exists
    const { data: existingPayment } = await supabase
      .from('payment_processing')
      .select('id, status')
      .eq('art_id', art_id)
      .eq('status', 'completed')
      .single()

    if (existingPayment) {
      throw new Error('Payment already completed for this artwork')
    }

    // Determine currency and Stripe account
    const event = artwork.events
    const country = event.countries
    
    // Primary currency is always from event→country→currency relationship
    let currency = country?.currency_code || event.currency || 'USD'
    let stripeAccountRegion = event.stripe_account_region || 'international'
    
    // Set region based on country
    if (country?.code === 'CA') {
      stripeAccountRegion = 'canada'
    }

    // Calculate amounts
    const taxRate = event.tax || 0
    const baseAmount = winningBid.amount
    const taxAmount = baseAmount * (taxRate / 100)
    const totalAmount = baseAmount + taxAmount

    // Get the appropriate Stripe key
    const stripeSecretKey = stripeAccountRegion === 'canada'
      ? Deno.env.get('stripe_canada_secret_key')
      : Deno.env.get('stripe_intl_secret_key')

    if (!stripeSecretKey) {
      throw new Error(`Stripe key not configured for ${stripeAccountRegion}`)
    }

    // Initialize Stripe
    const stripe = new Stripe(stripeSecretKey, {
      apiVersion: '2023-10-16',
      httpClient: Stripe.createFetchHttpClient(),
    })

    // Create checkout session
    const lineItems = [
      {
        price_data: {
          currency: currency.toLowerCase(),
          product_data: {
            name: `${artwork.art_code} - ${artwork.artist_profiles?.name || 'Artist'}`,
            description: `Art Battle artwork from Round ${artwork.round}, Easel ${artwork.easel}`,
            metadata: {
              art_id: artwork.id,
              art_code: artwork.art_code,
              event_id: event.id,
              event_name: event.name,
            },
          },
          unit_amount: Math.round(baseAmount * 100), // Convert to cents
        },
        quantity: 1,
      },
    ];

    // Add tax as a separate line item if applicable
    if (taxAmount > 0) {
      lineItems.push({
        price_data: {
          currency: currency.toLowerCase(),
          product_data: {
            name: `Tax (${taxRate}%)`,
            description: 'Sales tax',
          },
          unit_amount: Math.round(taxAmount * 100),
        },
        quantity: 1,
      });
    }

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: lineItems,
      mode: 'payment',
      success_url: success_url || `https://artb.art/payment/{CHECKOUT_SESSION_ID}`,
      cancel_url: cancel_url || `https://artb.art/event/${event.id}?payment=cancelled`,
      customer_email: person.email || undefined, // Don't pass null to Stripe
      metadata: {
        art_id: artwork.id,
        person_id: person.id,
        event_id: event.id,
      },
      payment_intent_data: {
        metadata: {
          art_id: artwork.id,
          art_code: artwork.art_code,
          person_id: person.id,
          event_id: event.id,
        },
      },
    })

    // Store payment record
    const { error: paymentError } = await supabase
      .from('payment_processing')
      .insert({
        art_id: artwork.id,
        person_id: person.id,
        event_id: event.id,
        stripe_checkout_session_id: session.id,
        stripe_account_region: stripeAccountRegion,
        amount: baseAmount,
        currency: currency,
        amount_with_tax: totalAmount,
        tax_amount: taxAmount,
        status: 'pending',
        metadata: {
          stripe_session_url: session.url,
          art_code: artwork.art_code,
          artist_name: artwork.artist_profiles?.name,
          buyer_name: [person.first_name, person.last_name].filter(Boolean).join(' ') || person.nickname || 'Art Buyer',
          buyer_email: person.email || null,
          buyer_phone: person.phone,
        },
      })

    if (paymentError) {
      console.error('Error storing payment record:', paymentError)
      // Don't fail the request, payment can still proceed
    }

    // Return the checkout URL
    return new Response(
      JSON.stringify({
        url: session.url,
        session_id: session.id,
        amount: totalAmount,
        currency: currency,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    )

  } catch (error) {
    console.error('Error creating checkout session:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      }
    )
  }
})
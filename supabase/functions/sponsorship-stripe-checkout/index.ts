// Sponsorship Stripe Checkout Session Creation Edge Function
// Creates a Stripe Checkout session for sponsorship package payment
// Handles multi-event sponsorships and add-ons

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
    const {
      invite_hash,
      main_package_id,
      addon_package_ids = [],
      event_ids = [], // Array of event IDs for multi-event sponsorship
      buyer_name,
      buyer_email,
      buyer_company,
      buyer_phone,
      success_url,
      cancel_url
    } = await req.json()

    if (!invite_hash || !main_package_id) {
      throw new Error('invite_hash and main_package_id are required')
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Get invite details
    const { data: invite, error: inviteError } = await supabase
      .from('sponsorship_invites')
      .select(`
        id,
        event_id,
        discount_percent,
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
          ),
          cities (
            name
          )
        )
      `)
      .eq('hash', invite_hash)
      .eq('active', true)
      .single()

    if (inviteError || !invite) {
      throw new Error('Invite not found or expired')
    }

    const event = invite.events
    const country = event.countries
    const cityName = event.cities?.name || 'Unknown City'

    // Determine currency and Stripe account
    let currency = country?.currency_code || event.currency || 'USD'
    let stripeAccountRegion = event.stripe_account_region || 'international'

    // Set region based on country
    if (country?.code === 'CA') {
      stripeAccountRegion = 'canada'
    }

    // Get main package details
    const { data: mainPackage, error: mainPackageError } = await supabase
      .from('event_sponsorship_packages')
      .select('id, name, description, base_price, benefits, is_addon')
      .eq('id', main_package_id)
      .single()

    if (mainPackageError || !mainPackage || mainPackage.is_addon) {
      throw new Error('Main package not found or invalid')
    }

    // Get addon packages if any
    let addons = []
    if (addon_package_ids.length > 0) {
      const { data: addonData, error: addonError } = await supabase
        .from('event_sponsorship_packages')
        .select('id, name, description, base_price, benefits, is_addon')
        .in('id', addon_package_ids)
        .eq('is_addon', true)

      if (!addonError && addonData) {
        addons = addonData
      }
    }

    // Calculate pricing
    const basePackagePrice = mainPackage.base_price
    const addonsTotal = addons.reduce((sum, addon) => sum + addon.base_price, 0)
    const subtotalPerEvent = basePackagePrice + addonsTotal

    // Apply recipient discount
    const discountPercent = invite.discount_percent || 0
    const priceAfterRecipientDiscount = subtotalPerEvent * (1 - discountPercent / 100)

    // Multi-event discount calculation
    const totalEvents = Math.max(1, event_ids.length)
    let multiEventDiscountPercent = 0
    if (totalEvents >= 4) multiEventDiscountPercent = 50
    else if (totalEvents === 3) multiEventDiscountPercent = 40
    else if (totalEvents === 2) multiEventDiscountPercent = 25

    const pricePerEvent = priceAfterRecipientDiscount * (1 - multiEventDiscountPercent / 100)
    const subtotal = pricePerEvent * totalEvents

    // Calculate tax
    const taxRate = event.tax || 0
    const taxAmount = subtotal * (taxRate / 100)
    const totalAmount = subtotal + taxAmount

    // Calculate total discount amount
    const originalTotal = subtotalPerEvent * totalEvents
    const recipientDiscountAmount = (subtotalPerEvent * totalEvents) * (discountPercent / 100)
    const multiEventDiscountAmount = ((subtotalPerEvent * totalEvents) - recipientDiscountAmount) * (multiEventDiscountPercent / 100)
    const totalDiscountAmount = recipientDiscountAmount + multiEventDiscountAmount

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

    // Build line items
    const lineItems = [
      {
        price_data: {
          currency: currency.toLowerCase(),
          product_data: {
            name: `Art Battle ${cityName} - ${mainPackage.name}`,
            description: totalEvents > 1
              ? `${mainPackage.name} for ${totalEvents} events${addons.length > 0 ? ' + add-ons' : ''}`
              : `${mainPackage.name}${addons.length > 0 ? ' + add-ons' : ''}`,
            metadata: {
              main_package_id: mainPackage.id,
              event_id: event.id,
              invite_id: invite.id,
              total_events: totalEvents,
            },
          },
          unit_amount: Math.round(subtotal * 100), // Convert to cents
        },
        quantity: 1,
      },
    ]

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
      })
    }

    // Create checkout session
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: lineItems,
      mode: 'payment',
      success_url: success_url || `https://artb.art/sponsor/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: cancel_url || `https://artb.art/sponsor/${invite_hash}?payment=cancelled`,
      customer_email: buyer_email || undefined,
      metadata: {
        invite_id: invite.id,
        event_id: event.id,
        main_package_id: mainPackage.id,
        total_events: totalEvents,
        payment_type: 'sponsorship',
      },
      payment_intent_data: {
        metadata: {
          invite_id: invite.id,
          event_id: event.id,
          main_package_id: mainPackage.id,
          payment_type: 'sponsorship',
        },
      },
    })

    // Store purchase record
    const { data: purchase, error: purchaseError } = await supabase
      .from('sponsorship_purchases')
      .insert({
        event_id: event.id,
        invite_id: invite.id,
        stripe_checkout_session_id: session.id,
        buyer_name: buyer_name,
        buyer_email: buyer_email,
        buyer_company: buyer_company || null,
        buyer_phone: buyer_phone || null,
        main_package_id: mainPackage.id,
        addon_package_ids: addon_package_ids,
        package_details: {
          main_package: mainPackage,
          addons: addons,
          event_ids: event_ids,
          total_events: totalEvents,
          city_name: cityName,
          stripe_session_url: session.url,
        },
        subtotal: subtotal,
        discount_percent: discountPercent,
        discount_amount: totalDiscountAmount,
        tax_amount: taxAmount,
        total_amount: totalAmount,
        currency: currency,
        payment_status: 'pending',
        fulfillment_status: 'pending',
      })
      .select()
      .single()

    if (purchaseError) {
      console.error('Error storing purchase record:', purchaseError)
      // Don't fail the request, payment can still proceed
    }

    // Return the checkout URL
    return new Response(
      JSON.stringify({
        url: session.url,
        session_id: session.id,
        purchase_id: purchase?.id,
        amount: totalAmount,
        currency: currency,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    )

  } catch (error) {
    console.error('Error creating sponsorship checkout session:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      }
    )
  }
})

// Promo Offers Redeem API
// Allows users to redeem an offer using their hash

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1'

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
    // Create service client
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Parse request body
    const { offerId, userHash } = await req.json()

    if (!offerId || !userHash) {
      return new Response(
        JSON.stringify({ error: 'offerId and userHash are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Look up person by hash
    const { data: person, error: personError } = await supabaseClient
      .from('people')
      .select('id, email, first_name, name')
      .eq('hash', userHash)
      .single()

    if (personError || !person) {
      return new Response(
        JSON.stringify({ error: 'Invalid hash' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Get offer details
    const { data: offer, error: offerError } = await supabaseClient
      .from('offers')
      .select('*')
      .eq('id', offerId)
      .single()

    if (offerError || !offer) {
      return new Response(
        JSON.stringify({ error: 'Offer not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Check if offer is active
    if (!offer.active) {
      return new Response(
        JSON.stringify({ error: 'This offer is no longer active' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Check if offer has expired
    if (offer.end_date && new Date(offer.end_date) < new Date()) {
      return new Response(
        JSON.stringify({ error: 'This offer has expired' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Check inventory
    const remaining = offer.total_inventory - (offer.redeemed_count || 0)
    if (offer.total_inventory > 0 && remaining <= 0) {
      return new Response(
        JSON.stringify({ error: 'This offer is sold out' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Check if user has already redeemed this offer
    const { data: existingRedemption } = await supabaseClient
      .from('offer_redemptions')
      .select('id')
      .eq('offer_id', offerId)
      .eq('user_id', person.id)
      .single()

    if (existingRedemption) {
      return new Response(
        JSON.stringify({ error: 'You have already redeemed this offer' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Generate redemption code
    const redemptionCode = generateRedemptionCode()

    // Create redemption record
    const { data: redemption, error: redemptionError } = await supabaseClient
      .from('offer_redemptions')
      .insert({
        offer_id: offerId,
        user_id: person.id,
        user_email: person.email,
        redemption_code: redemptionCode,
        status: 'redeemed',
        metadata: {
          redeemed_via: 'public_link',
          user_hash: userHash,
          user_name: person.first_name || person.name
        }
      })
      .select()
      .single()

    if (redemptionError) {
      console.error('Redemption error:', redemptionError)
      return new Response(
        JSON.stringify({ error: 'Failed to redeem offer' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Increment redeemed count on offer
    await supabaseClient
      .from('offers')
      .update({
        redeemed_count: (offer.redeemed_count || 0) + 1
      })
      .eq('id', offerId)

    // Send Slack notification about redemption
    try {
      const userName = person.first_name || person.name || 'User'
      const slackText = `${userName} redeemed: ${offer.name}\nCode: ${redemptionCode}\nEmail: ${person.email || 'N/A'}\nValue: ${offer.currency} $${offer.value}`

      await supabaseClient.rpc('queue_slack_notification', {
        p_channel_name: 'offers',
        p_message_type: 'promo_offer_redemption',
        p_text: slackText,
        p_blocks: null,
        p_event_id: null
      })
    } catch (slackError) {
      // Don't fail redemption if Slack notification fails
      console.error('Failed to send Slack notification:', slackError)
    }

    return new Response(
      JSON.stringify({
        success: true,
        redemption: {
          id: redemption.id,
          redemptionCode,
          redeemedAt: redemption.redeemed_at
        },
        redemptionLink: offer.redemption_link,
        redemptionMessage: offer.redemption_message
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )

  } catch (error) {
    console.error('Error:', error)
    return new Response(
      JSON.stringify({
        error: 'Internal server error',
        details: error.message
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )
  }
})

function generateRedemptionCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // Removed ambiguous chars
  let code = ''
  for (let i = 0; i < 8; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return code
}

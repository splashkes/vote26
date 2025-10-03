// Promo Offers Public API
// Fetches personalized offers for a user based on their hash
// Checks RFM scores and geography to determine eligible offers

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
    // Create service client for database access
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Get user hash from query params
    const url = new URL(req.url)
    const userHash = url.searchParams.get('hash')

    if (!userHash) {
      return new Response(
        JSON.stringify({ error: 'Hash parameter is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Look up person by hash
    const { data: person, error: personError } = await supabaseClient
      .from('people')
      .select('id, first_name, name, email')
      .eq('hash', userHash)
      .single()

    if (personError || !person) {
      return new Response(
        JSON.stringify({ error: 'Invalid hash' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Get RFM score for this person
    const { data: rfmData, error: rfmError } = await supabaseClient
      .from('rfm_score_cache')
      .select('*')
      .eq('person_id', person.id)
      .single()

    // Default RFM scores if not found
    const rfmScore = rfmData || {
      recency_score: 0,
      frequency_score: 0,
      monetary_score: 0,
      segment_code: 'LLL'
    }

    // Get user's top cities (from event interactions)
    const { data: topCities } = await supabaseClient
      .rpc('get_person_top_cities', { p_person_id: person.id })
      .limit(3)

    // Fetch all active offers
    const { data: offers, error: offersError } = await supabaseClient
      .from('offers')
      .select('*')
      .eq('active', true)
      .lte('start_date', new Date().toISOString())
      .gte('end_date', new Date().toISOString())

    if (offersError) {
      throw offersError
    }

    // Categorize offers as eligible or ineligible
    const eligibleOffers = []
    const ineligibleOffers = []

    for (const offer of offers || []) {
      const reasons = []

      // Check RFM scores
      if (offer.min_recency_score && rfmScore.recency_score < offer.min_recency_score) {
        reasons.push('recency_too_low')
      }
      if (offer.max_recency_score && rfmScore.recency_score > offer.max_recency_score) {
        reasons.push('recency_too_high')
      }
      if (offer.min_frequency_score && rfmScore.frequency_score < offer.min_frequency_score) {
        reasons.push('frequency_too_low')
      }
      if (offer.max_frequency_score && rfmScore.frequency_score > offer.max_frequency_score) {
        reasons.push('frequency_too_high')
      }
      if (offer.min_monetary_score && rfmScore.monetary_score < offer.min_monetary_score) {
        reasons.push('monetary_too_low')
      }
      if (offer.max_monetary_score && rfmScore.monetary_score > offer.max_monetary_score) {
        reasons.push('monetary_too_high')
      }

      // Check geography
      if (offer.geography_scope && offer.geography_scope.length > 0 && topCities) {
        const userCities = topCities.map((c: any) => c.city_name)
        const hasMatchingCity = offer.geography_scope.some(city =>
          userCities.some(userCity => userCity.toLowerCase() === city.toLowerCase())
        )
        if (!hasMatchingCity) {
          reasons.push('geography_mismatch')
        }
      }

      // Check inventory
      const remaining = offer.total_inventory - (offer.redeemed_count || 0)
      if (offer.total_inventory > 0 && remaining <= 0) {
        reasons.push('sold_out')
      }

      // Check if expired
      if (offer.end_date && new Date(offer.end_date) < new Date()) {
        reasons.push('expired')
      }

      // Convert snake_case to camelCase for frontend
      const formattedOffer = {
        id: offer.id,
        name: offer.name,
        description: offer.description,
        terms: offer.terms,
        type: offer.type,
        value: offer.value,
        currency: offer.currency,
        geographyScope: offer.geography_scope,
        totalInventory: offer.total_inventory,
        redeemedCount: offer.redeemed_count || 0,
        startDate: offer.start_date,
        endDate: offer.end_date,
        tileColor: offer.tile_color,
        imageUrl: offer.image_url,
        redemptionLink: offer.redemption_link,
        redemptionMessage: offer.redemption_message,
        displayOrder: offer.display_order,
        minRecencyScore: offer.min_recency_score,
        maxRecencyScore: offer.max_recency_score,
        minFrequencyScore: offer.min_frequency_score,
        maxFrequencyScore: offer.max_frequency_score,
        minMonetaryScore: offer.min_monetary_score,
        maxMonetaryScore: offer.max_monetary_score
      }

      if (reasons.length === 0) {
        eligibleOffers.push(formattedOffer)
      } else {
        ineligibleOffers.push({
          offer: formattedOffer,
          reasons
        })
      }
    }

    // Sort by display order
    eligibleOffers.sort((a, b) => (a.displayOrder || 0) - (b.displayOrder || 0))

    return new Response(
      JSON.stringify({
        user: {
          firstName: person.first_name,
          displayName: person.name,
          email: person.email
        },
        rfmScore: {
          recencyScore: rfmScore.recency_score,
          frequencyScore: rfmScore.frequency_score,
          monetaryScore: rfmScore.monetary_score,
          segmentCode: rfmScore.segment_code,
          segment: rfmScore.segment
        },
        topCities: topCities || [],
        eligibleOffers,
        ineligibleOffers
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

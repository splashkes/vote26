// Stripe Payment Status Edge Function
// Checks payment status for an artwork
// Returns payment details for display

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

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
    // Get art_id from query params or body
    const url = new URL(req.url)
    const art_id = url.searchParams.get('art_id')
    
    if (!art_id) {
      throw new Error('art_id is required')
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Get auth token if provided (optional for public status check)
    const authHeader = req.headers.get('Authorization')
    let userId = null
    let personId = null
    
    if (authHeader) {
      const token = authHeader.replace('Bearer ', '')
      const { data: { user } } = await supabase.auth.getUser(token)
      
      if (user) {
        userId = user.id
        
        // Use the same person lookup logic as process_bid_secure
        // First try to find person by auth_user_id
        const { data: person } = await supabase
          .from('people')
          .select('id')
          .eq('auth_user_id', user.id)
          .single()
        
        if (person) {
          personId = person.id
        }
      }
    }

    // Get payment status
    const { data: paymentStatus, error: statusError } = await supabase
      .from('payment_processing')
      .select(`
        id,
        status,
        payment_method,
        amount,
        amount_with_tax,
        tax_amount,
        currency,
        created_at,
        completed_at,
        stripe_checkout_session_id,
        person_id
      `)
      .eq('art_id', art_id)
      .in('status', ['pending', 'processing', 'completed'])
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    if (statusError && statusError.code !== 'PGRST116') {
      throw statusError
    }

    // Get artwork details with event and country info for currency
    const { data: artwork, error: artError } = await supabase
      .from('art')
      .select(`
        id,
        art_code,
        status,
        current_bid,
        event_id,
        events (
          currency,
          countries (
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

    if (artError) {
      throw artError
    }

    // Get winning bidder from bids table (since there might be no payment record yet)
    const { data: winningBid } = await supabase
      .from('bids')
      .select('person_id, amount')
      .eq('art_id', art_id)
      .order('amount', { ascending: false })
      .limit(1)
      .single()

    // Check if current user is the buyer (check both payment record and winning bid)
    const isWinningBidder = personId && (
      (paymentStatus?.person_id === personId) ||
      (winningBid?.person_id === personId)
    )

    console.log('DEBUG: personId found:', personId, 'winningBid.person_id:', winningBid?.person_id, 'isWinningBidder:', isWinningBidder)

    // Check for active offers (for both the user and overall)
    let activeOffer = null;
    let activeOfferCount = 0;
    let hasActiveOffer = false;

    if (personId) {
      // Check if current user has an active offer
      const { data: userOffer } = await supabase
        .from('artwork_offers')
        .select('id, offered_amount, expires_at, bid_id')
        .eq('art_id', art_id)
        .eq('offered_to_person_id', personId)
        .eq('status', 'pending')
        .gt('expires_at', new Date().toISOString())
        .single()

      if (userOffer) {
        activeOffer = userOffer;
        hasActiveOffer = true;
      }
    }

    // Get count of all active offers (for race condition display)
    const { data: allActiveOffers } = await supabase
      .from('artwork_offers')
      .select('id')
      .eq('art_id', art_id)
      .eq('status', 'pending')
      .gt('expires_at', new Date().toISOString())

    if (allActiveOffers) {
      activeOfferCount = allActiveOffers.length;
    }

    // Get winning bidder info (only if payment exists)
    let winnerInfo = null
    if (paymentStatus) {
      const { data: winner } = await supabase
        .from('people')
        .select('first_name, last_name')
        .eq('id', paymentStatus.person_id)
        .single()

      if (winner) {
        winnerInfo = {
          display_name: `${winner.first_name} ${winner.last_name?.charAt(0) || ''}`,
          is_current_user: isWinningBidder,
        }
      }
    }

    // Determine if user can pay (winning bidder OR has active offer)
    const canPayAsWinner = artwork.status === 'sold' && isWinningBidder && (!paymentStatus || paymentStatus.status === 'pending');
    const canPayAsOfferedBidder = hasActiveOffer && ['sold', 'closed'].includes(artwork.status) && (!paymentStatus || paymentStatus.status === 'pending');

    // Prepare response
    const response = {
      has_payment: !!paymentStatus,
      payment_status: paymentStatus?.status || null,
      payment_method: paymentStatus?.payment_method || null,
      amount: paymentStatus?.amount || artwork.current_bid,  // Base amount without tax
      amount_with_tax: paymentStatus?.amount_with_tax || null,
      tax_amount: paymentStatus?.tax_amount || null,
      currency: paymentStatus?.currency || artwork.events?.countries?.currency_code || artwork.events?.currency || 'USD',
      created_at: paymentStatus?.created_at || null,
      completed_at: paymentStatus?.completed_at || null,
      art_status: artwork.status,
      artist_name: artwork.artist_profiles?.name || 'Unknown Artist',
      art_code: artwork.art_code,
      is_winning_bidder: isWinningBidder,
      winner_info: winnerInfo,
      can_pay: canPayAsWinner || canPayAsOfferedBidder,

      // Offer-related fields
      has_active_offer: hasActiveOffer,
      active_offer: activeOffer,
      active_offer_count: activeOfferCount,
    }

    return new Response(
      JSON.stringify(response),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    )

  } catch (error) {
    console.error('Error checking payment status:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      }
    )
  }
})
// Admin Get Offer History Edge Function
// Returns offer history for artwork

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Initialize Supabase client using service role key for full access
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Verify the user is authenticated by parsing JWT directly
    const authHeader = req.headers.get('Authorization') || '';
    if (!authHeader.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({ error: 'Authentication required' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let user, jwtPayload;
    try {
      const token = authHeader.replace('Bearer ', '');
      const payloadBase64 = token.split('.')[1];
      jwtPayload = JSON.parse(atob(payloadBase64));

      // Extract user info from JWT
      user = {
        id: jwtPayload.sub,
        phone: jwtPayload.phone
      };
    } catch (e) {
      return new Response(
        JSON.stringify({ error: 'Invalid authentication token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Parse request body
    let requestBody;
    try {
      requestBody = await req.json();
    } catch (jsonError) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Invalid JSON in request body'
        }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }

    const { art_id } = requestBody;

    // Validate required fields
    if (!art_id) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'art_id is required'
        }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }

    // Get artwork details (search by art_code if not UUID)
    let artworkQuery = supabase
      .from('art')
      .select(`
        id,
        art_code,
        event_id,
        events (
          id,
          eid,
          name
        )
      `);

    // Check if art_id looks like a UUID or art_code
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(art_id)) {
      artworkQuery = artworkQuery.eq('id', art_id);
    } else {
      artworkQuery = artworkQuery.eq('art_code', art_id);
    }

    const { data: artwork, error: artError } = await artworkQuery.single()

    if (artError || !artwork) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Artwork not found'
        }),
        {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }

    // Check if user is ABHQ super admin OR event admin with producer/super level
    let hasPermission = false;

    // Check ABHQ super admin
    const { data: abhqAdmin } = await supabase
      .from('abhq_admin_users')
      .select('level, active')
      .eq('user_id', user.id)
      .eq('active', true)
      .single();

    if (abhqAdmin) {
      hasPermission = true;
    } else {
      // Check event admin permissions from JWT admin_events
      const adminEvents = jwtPayload.admin_events || {};

      // Get event EID from artwork
      const eventEid = artwork.events?.eid;
      if (eventEid && adminEvents[eventEid]) {
        const adminLevel = adminEvents[eventEid];
        if (adminLevel === 'producer' || adminLevel === 'super') {
          hasPermission = true;
        }
      }
    }

    if (!hasPermission) {
      return new Response(
        JSON.stringify({ error: 'Access denied' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get offer history
    const { data: offers, error: offerError } = await supabase
      .from('artwork_offers')
      .select(`
        id,
        offered_amount,
        status,
        expires_at,
        created_at,
        updated_at,
        admin_note,
        metadata,
        people!artwork_offers_offered_to_person_id_fkey (
          id,
          first_name,
          last_name,
          name,
          nickname
        ),
        bids!artwork_offers_bid_id_fkey (
          id,
          amount
        )
      `)
      .eq('art_id', artwork.id)
      .order('created_at', { ascending: false });

    if (offerError) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Failed to fetch offer history'
        }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }

    // Calculate offer statistics
    const activeOffers = (offers || []).filter(offer => offer.status === 'pending' && new Date(offer.expires_at) > new Date());
    const expiredOffers = (offers || []).filter(offer => offer.status === 'expired' || (offer.status === 'pending' && new Date(offer.expires_at) <= new Date()));
    const paidOffers = (offers || []).filter(offer => offer.status === 'paid');

    // Return success response
    return new Response(
      JSON.stringify({
        success: true,
        artwork: {
          id: artwork.id,
          art_code: artwork.art_code,
          event_eid: artwork.events.eid,
          event_name: artwork.events.name
        },
        offers: offers || [],
        stats: {
          total_offers: (offers || []).length,
          active_offers: activeOffers.length,
          expired_offers: expiredOffers.length,
          paid_offers: paidOffers.length
        },
        last_offer_created: offers && offers.length > 0 ? offers[0].created_at : null
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )

  } catch (error) {
    // Return comprehensive debug information
    return new Response(
      JSON.stringify({
        success: false,
        error: 'Internal server error occurred in admin-get-offer-history function',
        debug: {
          timestamp: new Date().toISOString(),
          function_name: 'admin-get-offer-history',
          error_type: error.constructor.name,
          error_message: error.message,
          error_stack: error.stack,
          error_name: error.name
        }
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )
  }
})
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface EventData {
  id: string;
  eid: string;
  name: string;
  description?: string;
  venue?: string;
  event_start_datetime: string;
  event_end_datetime: string;
  timezone_id?: string;
  timezone_offset?: string;
  timezone_icann?: string;
  city_id?: string;
  country_id?: string;
  enabled: boolean;
  show_in_app: boolean;
  current_round: number;
  art_width_height?: string;
  vote_by_link: boolean;
  register_at_sms_vote: boolean;
  send_link_to_guests: boolean;
  email_registration: boolean;
  enable_auction: boolean;
  auction_start_bid: number;
  min_bid_increment: number;
  currency: string;
  created_at: string;
  updated_at: string;
}

interface EventArtist {
  contestant_id: string;
  easel_number: number;
  round_number: number;
  event_id: string;
  artist_profile_id: string;
  entry_id: number;
  artist_name: string;
  bio?: string;
  abhq_bio?: string;
  instagram?: string;
  website?: string;
  person_name?: string;
  first_name?: string;
  last_name?: string;
  email?: string;
  phone?: string;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    // Create Supabase client with service role key for full access
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    )

    const url = new URL(req.url)
    const pathParts = url.pathname.split('/')

    // Extract EID from path: /paperwork-data/{eid}
    const eid = pathParts[pathParts.length - 1]

    if (!eid || eid === 'paperwork-data') {
      return new Response(
        JSON.stringify({ error: 'Event EID is required' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }

    console.log(`Fetching paperwork data for event: ${eid}`)

    // 1. Get event by EID
    const { data: event, error: eventError } = await supabaseClient
      .from('events')
      .select('*')
      .eq('eid', eid)
      .eq('enabled', true)
      .single()

    if (eventError || !event) {
      console.error('Event not found or error:', eventError)
      return new Response(
        JSON.stringify({ error: 'Event not found' }),
        {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }

    // 2. Get event artists with detailed information using the correct table structure
    const { data: contestants, error: contestantsError } = await supabaseClient.rpc(
      'get_event_contestants_with_details',
      { event_eid: eid }
    )

    // If the RPC doesn't exist, fall back to manual query
    let artistsData = contestants
    if (contestantsError) {
      console.log('RPC not found, using manual query')

      const { data: manualQuery, error: manualError } = await supabaseClient
        .from('round_contestants')
        .select(`
          id,
          easel_number,
          rounds!inner(
            round_number,
            event_id,
            events!inner(
              eid,
              name
            )
          ),
          artist_profiles!inner(
            id,
            entry_id,
            name,
            bio,
            abhq_bio,
            instagram,
            website,
            people(
              name,
              first_name,
              last_name,
              email,
              phone
            )
          )
        `)
        .eq('rounds.events.eid', eid)

      if (manualError) {
        console.error('Error fetching contestants manually:', manualError)
        return new Response(
          JSON.stringify({ error: 'Failed to fetch event artists', details: manualError.message }),
          {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          }
        )
      }

      // Transform manual query results
      artistsData = manualQuery?.map(item => ({
        contestant_id: item.id,
        easel_number: item.easel_number,
        round_number: item.rounds.round_number,
        event_id: item.rounds.event_id,
        artist_profile_id: item.artist_profiles.id,
        entry_id: item.artist_profiles.entry_id,
        artist_name: item.artist_profiles.name,
        bio: item.artist_profiles.bio,
        abhq_bio: item.artist_profiles.abhq_bio,
        instagram: item.artist_profiles.instagram,
        website: item.artist_profiles.website,
        person_name: item.artist_profiles.people?.name,
        first_name: item.artist_profiles.people?.first_name,
        last_name: item.artist_profiles.people?.last_name,
        email: item.artist_profiles.people?.email,
        phone: item.artist_profiles.people?.phone
      })) || []

      // Sort the results by round number and easel number
      artistsData.sort((a, b) => {
        if (a.round_number !== b.round_number) {
          return a.round_number - b.round_number
        }
        return a.easel_number - b.easel_number
      })
    }

    if (!artistsData || artistsData.length === 0) {
      console.log('No artists found for event:', eid)
      return new Response(
        JSON.stringify({ error: 'No artists found for this event' }),
        {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }

    // 3. Get artist event history for individual pages (limit to recent events)
    const eventHistory = new Map<string, any[]>()

    for (const artist of artistsData) {
      try {
        // Use RPC or a simpler approach since nested queries can be tricky
        const { data: history, error: historyError } = await supabaseClient.rpc(
          'get_artist_event_history',
          {
            artist_profile_id: artist.artist_profile_id,
            current_event_id: event.id,
            max_events: 15
          }
        )

        if (historyError) {
          console.log(`Event history RPC error for artist ${artist.artist_profile_id}:`, historyError)
          // If RPC doesn't exist, we'll just set empty history for now
          eventHistory.set(artist.artist_profile_id, [])
        } else if (history) {
          eventHistory.set(artist.artist_profile_id, history)
        } else {
          eventHistory.set(artist.artist_profile_id, [])
        }
      } catch (error) {
        console.log(`Error fetching history for artist ${artist.artist_profile_id}:`, error)
        eventHistory.set(artist.artist_profile_id, [])
      }
    }

    // 4. Prepare response data
    const responseData = {
      event: event,
      artists: artistsData.map(artist => ({
        ...artist,
        // Flatten data for easier access and ensure we have display names
        first_name: artist.first_name || '',
        last_name: artist.last_name || '',
        display_name: artist.artist_name || artist.person_name || `${artist.first_name || ''} ${artist.last_name || ''}`.trim(),
        email: artist.email || '',
        phone: artist.phone || '',
        instagram: artist.instagram || '',
        bio: artist.abhq_bio || artist.bio || '',
        entry_id: artist.entry_id, // Critical for QR codes
        status: 'ready', // Default status for paperwork
        event_history: eventHistory.get(artist.artist_profile_id) || [] // Include event history
      })),
      total_artists: artistsData.length,
      generated_at: new Date().toISOString()
    }

    console.log(`Successfully fetched paperwork data for ${eid}: ${artistsData.length} artists`)

    return new Response(
      JSON.stringify(responseData),
      {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
          'Cache-Control': 'public, max-age=300' // Cache for 5 minutes
        }
      }
    )

  } catch (error) {
    console.error('Error in paperwork-data function:', error)
    return new Response(
      JSON.stringify({
        error: 'Internal server error',
        message: error.message
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )
  }
})

/* To invoke:
curl -X GET 'https://xsqdkubgyqwpyvfltnrf.supabase.co/functions/v1/paperwork-data/AB2518'
*/
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    })
  }

  const url = new URL(req.url)
  const pathParts = url.pathname.split('/').filter(p => p)
  
  // Handle different endpoints:
  // /promo-materials-data -> list all events
  // /promo-materials-data/AB3333 -> specific event data with artists
  // /promo-materials-data/templates -> published templates
  
  const eventId = pathParts[pathParts.length - 1]
  const isTemplatesRequest = eventId === 'templates'
  const isEventsList = !eventId || eventId === 'promo-materials-data'

  console.log(`[promo-materials-data] Request for: ${eventId || 'events-list'}`)

  try {
    if (isTemplatesRequest) {
      const templatesData = await getPublishedTemplates()
      return new Response(JSON.stringify(templatesData), {
        headers: { 
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      })
    } else if (isEventsList) {
      const eventsData = await getPublicEventsList()
      return new Response(JSON.stringify(eventsData), {
        headers: { 
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      })
    } else {
      const eventData = await getEventPromoData(eventId)
      return new Response(JSON.stringify(eventData), {
        headers: { 
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      })
    }
  } catch (error) {
    console.error('[promo-materials-data] Error:', error)
    return new Response(JSON.stringify({ 
      error: error.message || 'Internal server error'
    }), {
      status: error.message.includes('not found') ? 404 : 500,
      headers: { 
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    })
  }
})

const getPublicEventsList = async () => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  )
  
  console.log('[getPublicEventsList] Fetching enabled events')
  
  const { data: events, error } = await supabase
    .from('events')
    .select(`
      id,
      eid,
      name,
      description,
      venue,
      event_start_datetime,
      cities (
        name
      )
    `)
    .eq('enabled', true)
    .eq('show_in_app', true)
    .order('event_start_datetime', { ascending: false })
    .limit(50)
  
  if (error) {
    console.error('[getPublicEventsList] Query error:', error)
    throw new Error(`Events query failed: ${error.message}`)
  }
  
  // Transform data to expected format
  const transformedEvents = events?.map(event => ({
    id: event.id,
    eid: event.eid,
    title: event.name,
    description: event.description,
    venue: event.venue,
    city: event.cities?.name,
    event_date: event.event_start_datetime
  })) || []
  
  console.log(`[getPublicEventsList] Found ${transformedEvents.length} events`)
  
  return {
    events: transformedEvents,
    generated_at: new Date().toISOString()
  }
}

const getEventPromoData = async (eventId: string) => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  )
  
  console.log(`[getEventPromoData] Fetching data for event: ${eventId}`)
  
  // Get event details by EID
  const { data: eventData, error: eventError } = await supabase
    .from('events')
    .select(`
      id,
      eid,
      name,
      description,
      venue,
      event_start_datetime,
      cities (
        name
      )
    `)
    .eq('eid', eventId)
    .eq('enabled', true)
    .eq('show_in_app', true)
    .single()

  if (eventError || !eventData) {
    console.error(`[getEventPromoData] Event not found: ${eventId}`)
    throw new Error(`Event ${eventId} not found`)
  }

  console.log(`[getEventPromoData] Found event: ${eventData.name}`)

  // Get confirmed artists for this event using artist_confirmations table
  // First get the confirmations, then manually join with artist_profiles
  const { data: confirmations, error: confirmationsError } = await supabase
    .from('artist_confirmations')
    .select('*')
    .eq('event_eid', eventId)
    .eq('confirmation_status', 'confirmed')

  if (confirmationsError) {
    console.error(`[getEventPromoData] Confirmations query error:`, confirmationsError)
    throw new Error(`Confirmations query failed: ${confirmationsError.message}`)
  }

  // Get artist profile IDs for the confirmed artists
  const artistNumbers = confirmations?.map(c => c.artist_number).filter(Boolean) || []
  
  let eventArtists = []
  if (artistNumbers.length > 0) {
    const { data: profiles, error: profilesError } = await supabase
      .from('artist_profiles')
      .select(`
        id,
        name,
        email,
        city_text,
        instagram,
        website,
        abhq_bio,
        entry_id
      `)
      .in('entry_id', artistNumbers.map(num => parseInt(num)).filter(Boolean))
      .order('name')

    if (profilesError) {
      console.error(`[getEventPromoData] Profiles query error:`, profilesError)
    } else {
      // Combine confirmation data with profile data
      eventArtists = profiles?.map(profile => {
        const confirmation = confirmations.find(c => c.artist_number === profile.entry_id.toString())
        return {
          artist_profiles: profile,
          artist_number: confirmation?.artist_number,
          legal_name: confirmation?.legal_name,
          confirmation_status: confirmation?.confirmation_status
        }
      }).filter(Boolean) || []
    }
  }

  const artistsError = null // Reset error since we handled it above

  if (artistsError) {
    console.error(`[getEventPromoData] Artists query error:`, artistsError)
    throw new Error(`Artists query failed: ${artistsError.message}`)
  }

  // Transform event data
  const transformedEvent = {
    id: eventData.id,
    eid: eventData.eid,
    title: eventData.name,
    description: eventData.description,
    venue: eventData.venue,
    city: eventData.cities?.name,
    event_date: eventData.event_start_datetime
  }

  // Transform artists data and get their sample works
  const transformedArtists = []
  
  if (eventArtists) {
    for (const ac of eventArtists) {
      // Get unified sample works for each artist
      const { data: sampleWorks, error: sampleWorksError } = await supabase
        .rpc('get_unified_sample_works', { profile_id: ac.artist_profiles.id })

      if (sampleWorksError) {
        console.warn(`Failed to get sample works for artist ${ac.artist_profiles.id}:`, sampleWorksError)
      }

      // Use the first sample work's image URL if available
      const primarySampleWork = sampleWorks?.[0]
      const sample_asset_url = primarySampleWork?.image_url || primarySampleWork?.compressed_url || primarySampleWork?.original_url

      transformedArtists.push({
        id: ac.artist_profiles.id,
        entry_id: ac.artist_profiles.entry_id,
        artist_number: ac.artist_number,
        display_name: ac.artist_profiles.name,
        legal_name: ac.legal_name,
        email: ac.artist_profiles.email,
        city: ac.artist_profiles.city_text,
        instagram: ac.artist_profiles.instagram,
        website: ac.artist_profiles.website,
        bio: ac.artist_profiles.abhq_bio,
        sample_asset_url: sample_asset_url,
        confirmation_status: ac.confirmation_status
      })
    }
  }

  console.log(`[getEventPromoData] Found ${transformedArtists.length} artists`)

  return {
    event: transformedEvent,
    artists: transformedArtists,
    generated_at: new Date().toISOString()
  }
}

const getPublishedTemplates = async () => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  )
  
  console.log('[getPublishedTemplates] Fetching published templates')
  
  const { data: templates, error } = await supabase
    .from('tmpl_templates')
    .select('*')
    .eq('published', true)
    .order('created_at', { ascending: false })
  
  if (error) {
    console.error('[getPublishedTemplates] Query error:', error)
    throw new Error(`Templates query failed: ${error.message}`)
  }
  
  console.log(`[getPublishedTemplates] Found ${templates?.length || 0} templates`)
  
  return {
    templates: templates || [],
    generated_at: new Date().toISOString()
  }
}
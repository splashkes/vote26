import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      },
    })
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const debugInfo = {
      timestamp: new Date().toISOString(),
      function_name: 'app-content-curator'
    }

    // Fetch content from different sources
    const contentSources = await Promise.all([
      fetchUpcomingEvents(supabase),
      fetchHighValueEvents(supabase),
      fetchConfirmedArtists(supabase),
      fetchWinningPaintings(supabase)
    ])

    const [upcomingEvents, highValueEvents, confirmedArtists, winningPaintings] = contentSources

    // Combine all content
    const allContent = [
      ...upcomingEvents,
      ...highValueEvents,
      ...confirmedArtists,
      ...winningPaintings
    ]

    // Clear existing automated content first, then insert new content
    const { error: deleteError } = await supabase
      .from('app_curated_content')
      .delete()
      .eq('curator_type', 'automated')

    if (deleteError) {
      console.warn('Could not clear existing automated content:', deleteError.message)
    }

    // Insert new curated content
    const { data, error } = await supabase
      .from('app_curated_content')
      .insert(allContent)

    if (error) {
      return new Response(JSON.stringify({
        error: 'Failed to insert curated content',
        debug: { ...debugInfo, db_error: error.message }
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      })
    }

    return new Response(JSON.stringify({
      success: true,
      inserted: allContent.length,
      breakdown: {
        upcoming_events: upcomingEvents.length,
        high_value_events: highValueEvents.length,
        confirmed_artists: confirmedArtists.length,
        winning_paintings: winningPaintings.length
      },
      debug: debugInfo
    }), {
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    })

  } catch (error) {
    return new Response(JSON.stringify({
      error: 'Internal server error',
      debug: { message: error.message, stack: error.stack }
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    })
  }
})

// 1. Next 10 upcoming events
async function fetchUpcomingEvents(supabase) {
  const { data: events } = await supabase
    .from('events')
    .select(`
      id, eid, name, description, venue, event_start_datetime,
      countries!country_id(currency_code, currency_symbol)
    `)
    .gt('event_start_datetime', new Date().toISOString())
    .eq('show_in_app', true)
    .order('event_start_datetime', { ascending: true })
    .limit(10)

  // Get fallback images from confirmed artists' sample works
  // TODO: Replace this with proper event imagery in the future
  const { data: sampleWorks } = await supabase
    .from('artist_confirmations')
    .select('promotion_artwork_url')
    .eq('confirmation_status', 'confirmed')
    .is('withdrawn_at', null)
    .not('promotion_artwork_url', 'is', null)
    .limit(20)

  const fallbackImages = sampleWorks?.map(sw => sw.promotion_artwork_url).filter(Boolean) || []

  return events?.map((event, index) => ({
    content_id: `event-${event.id}`,
    content_type: 'event',
    title: event.name,
    description: event.description,
    // TODO: Replace with proper event images when available
    image_url: fallbackImages[index % fallbackImages.length] || null,
    video_url: null,
    thumbnail_url: fallbackImages[index % fallbackImages.length] || null,
    tags: ['upcoming', 'event', 'art-battle'],
    color_palette: [],
    mood_tags: ['competitive', 'live'],
    engagement_score: 1.0,
    trending_score: 1.0,
    quality_score: 1.0,
    data: {
      event_id: event.id,
      eid: event.eid,
      venue: event.venue,
      start_datetime: event.event_start_datetime,
      currency_code: event.countries?.currency_code || 'USD',
      currency_symbol: event.countries?.currency_symbol || '$'
    },
    status: 'active',
    curator_type: 'automated',
    curator_id: null,
    available_until: event.event_start_datetime,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  })) || []
}

// 2. Last 10 events with $500+ in top bids (sum of highest bid per artwork)
async function fetchHighValueEvents(supabase) {
  const { data: eventBids } = await supabase.rpc('get_events_with_high_auction_value', {
    min_total_value: 500,
    limit_count: 10
  })

  if (!eventBids) return []

  const eventIds = eventBids.map(eb => eb.event_id)
  
  const { data: events } = await supabase
    .from('events')
    .select(`
      id, eid, name, description, venue, event_start_datetime,
      countries!country_id(currency_code, currency_symbol)
    `)
    .in('id', eventIds)
    .order('event_start_datetime', { ascending: false })

  // Get fallback images from high-value artworks from these events
  // TODO: Replace with proper event imagery in the future
  const { data: artworkImages } = await supabase
    .from('art')
    .select(`
      id,
      art_media!inner(
        media_files!inner(
          original_url
        )
      )
    `)
    .in('event_id', eventIds)
    .limit(20)

  const fallbackImages = artworkImages?.map(a => a.art_media?.[0]?.media_files?.original_url).filter(Boolean) || []

  return events?.map((event, index) => {
    const bidData = eventBids.find(eb => eb.event_id === event.id)
    return {
      content_id: `high-value-event-${event.id}`,
      content_type: 'event',
      title: `${event.name} - High Value Auction`,
      description: `${event.description || 'Art Battle event'} - Total auction value: $${bidData?.total_value || 0}`,
      // TODO: Replace with proper event images when available
      image_url: fallbackImages[index % fallbackImages.length] || null,
      video_url: null,
      thumbnail_url: fallbackImages[index % fallbackImages.length] || null,
      tags: ['high-value', 'auction', 'completed', 'event'],
      color_palette: [],
      mood_tags: ['competitive', 'valuable', 'exciting'],
      engagement_score: 0.9,
      trending_score: 0.8,
      quality_score: 0.9,
      data: {
        event_id: event.id,
        eid: event.eid,
        venue: event.venue,
        start_datetime: event.event_start_datetime,
        total_auction_value: bidData?.total_value || 0,
        currency_code: event.countries?.currency_code || 'USD',
        currency_symbol: event.countries?.currency_symbol || '$'
      },
      status: 'active',
      curator_type: 'automated',
      curator_id: null,
      available_until: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }
  }) || []
}

// 3. Last 50 confirmed artists with cities/events/sample works
async function fetchConfirmedArtists(supabase) {
  const { data: confirmations } = await supabase
    .from('artist_confirmations')
    .select(`
      artist_number, event_eid, legal_name, promotion_artwork_url,
      confirmation_date, public_message,
      artist_profile_id
    `)
    .eq('confirmation_status', 'confirmed')
    .is('withdrawn_at', null)
    .order('confirmation_date', { ascending: false })
    .limit(50)

  if (!confirmations) return []

  // Get artist profiles and events data
  const artistIds = confirmations.map(c => c.artist_profile_id).filter(Boolean)
  const eventEids = [...new Set(confirmations.map(c => c.event_eid).filter(Boolean))]

  const [artistProfiles, events] = await Promise.all([
    supabase.from('artist_profiles').select(`
      id, name, city_text, sample_works_urls, bio, instagram, website
    `).in('id', artistIds),
    
    supabase.from('events').select(`
      id, eid, name, venue, event_start_datetime
    `).in('eid', eventEids)
  ])

  return confirmations.map((confirmation, index) => {
    const profile = artistProfiles.data?.find(p => p.id === confirmation.artist_profile_id)
    const event = events.data?.find(e => e.eid === confirmation.event_eid)
    
    return {
      content_id: `confirmed-artist-${confirmation.artist_profile_id || confirmation.artist_number}`,
      content_type: 'artist_spotlight',
      title: confirmation.legal_name || profile?.name || `Artist #${confirmation.artist_number}`,
      description: profile?.bio || confirmation.public_message || 'Featured Art Battle artist',
      // Ensure we have image URLs from promotion artwork or sample works
      image_url: confirmation.promotion_artwork_url || profile?.sample_works_urls?.[0] || null,
      video_url: null,
      thumbnail_url: confirmation.promotion_artwork_url || profile?.sample_works_urls?.[0] || null,
      tags: ['confirmed', 'artist', 'spotlight'],
      color_palette: [],
      mood_tags: ['artistic', 'talented', 'featured'],
      engagement_score: 0.8,
      trending_score: 0.7,
      quality_score: 0.8,
      data: {
        artist_id: confirmation.artist_profile_id,
        artist_number: confirmation.artist_number,
        city: profile?.city_text || 'Unknown',
        event_eid: confirmation.event_eid,
        event_name: event?.name,
        event_venue: event?.venue,
        event_date: event?.event_start_datetime,
        instagram: profile?.instagram,
        website: profile?.website,
        sample_works: profile?.sample_works_urls || [],
        confirmation_date: confirmation.confirmation_date
      },
      status: 'active',
      curator_type: 'automated',
      curator_id: null,
      available_until: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }
  })
}

// 4. Winning paintings from last 20 events
async function fetchWinningPaintings(supabase) {
  // Get recent events first
  const { data: recentEvents } = await supabase
    .from('events')
    .select('id, eid, name')
    .lt('event_start_datetime', new Date().toISOString())
    .order('event_start_datetime', { ascending: false })
    .limit(20)

  if (!recentEvents || recentEvents.length === 0) return []

  const eventIds = recentEvents.map(e => e.id)

  // Simplified query: Get winners by joining through rounds table
  const { data: winners } = await supabase
    .from('round_contestants')
    .select(`
      artist_id, easel_number, is_winner,
      rounds(event_id, round_number)
    `)
    .in('rounds.event_id', eventIds)
    .gt('is_winner', 0)
    .limit(20)

  if (!winners || winners.length === 0) return []

  // Find artworks by matching artist_id, easel, and round since art_id is not populated
  const artworkMatches = []
  for (const winner of winners) {
    const { data: artworks } = await supabase
      .from('art')
      .select(`
        id, art_code, description,
        artist_profiles(name, instagram, website)
      `)
      .eq('artist_id', winner.artist_id)
      .eq('easel', winner.easel_number)
      .eq('round', winner.rounds?.round_number)
      .eq('event_id', winner.rounds?.event_id)
      .limit(1)
    
    if (artworks && artworks.length > 0) {
      artworkMatches.push({
        winner,
        artwork: artworks[0]
      })
    }
  }

  // Get media files for the matched winning artworks (any available, not just primary)
  const artworkIds = artworkMatches.map(m => m.artwork.id)
  const { data: mediaFiles } = await supabase
    .from('art_media')
    .select(`
      art_id,
      media_files(original_url, thumbnail_url, compressed_url)
    `)
    .in('art_id', artworkIds)
    .order('display_order', { ascending: true })

  // Get fallback images from artist sample works for artworks without images
  const { data: artistSamples } = await supabase
    .from('artist_profiles')
    .select('id, sample_works_urls')
    .in('id', artworkMatches.map(m => m.winner.artist_id))
    .not('sample_works_urls', 'is', null)

  return artworkMatches.slice(0, 10).map((match, index) => {
    const { winner, artwork } = match
    const event = recentEvents.find(e => e.id === winner.rounds?.event_id)
    const media = mediaFiles?.find(m => m.art_id === artwork.id)
    const mediaFile = media?.media_files
    
    // Fallback to artist sample work if no artwork image
    const artistSample = artistSamples?.find(a => a.id === winner.artist_id)
    const fallbackImage = artistSample?.sample_works_urls?.[0] || null
    
    return {
      content_id: `winning-artwork-${artwork.id}`,
      content_type: 'artwork',
      title: `${artwork?.artist_profiles?.name || 'Artist'} - Competition Winner`,
      description: artwork?.description || `Winning artwork from ${event?.name}`,
      // Use artwork image or fallback to artist sample work
      image_url: mediaFile?.compressed_url || mediaFile?.original_url || fallbackImage,
      video_url: null,
      thumbnail_url: mediaFile?.thumbnail_url || mediaFile?.compressed_url || fallbackImage,
      tags: ['winner', 'competition', 'artwork', 'champion'],
      color_palette: [],
      mood_tags: ['victorious', 'artistic', 'competitive'],
      engagement_score: 1.0,
      trending_score: 0.9,
      quality_score: 1.0,
      data: {
        artwork_id: artwork.id,
        art_code: artwork?.art_code,
        artist_id: winner.artist_id,
        artist_name: artwork?.artist_profiles?.name,
        artist_instagram: artwork?.artist_profiles?.instagram,
        artist_website: artwork?.artist_profiles?.website,
        event_id: winner.rounds?.event_id,
        event_eid: event?.eid,
        event_name: event?.name,
        round_number: winner.rounds?.round_number,
        easel_number: winner.easel_number,
        is_winner: winner.is_winner
      },
      status: 'active',
      curator_type: 'automated',
      curator_id: null,
      available_until: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }
  })
}
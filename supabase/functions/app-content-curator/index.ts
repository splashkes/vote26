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
      fetchArtistApplications(supabase),
      fetchWinningPaintings(supabase)
    ])

    const [upcomingEvents, highValueEvents, confirmedArtists, artistApplications, winningPaintings] = contentSources

    // Combine all content
    const allContent = [
      ...upcomingEvents,
      ...highValueEvents,
      ...confirmedArtists,
      ...artistApplications,
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
        artist_applications: artistApplications.length,
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

  // Get artwork images from these specific upcoming events
  const { data: eventArtworkImages } = await supabase
    .from('art')
    .select(`
      event_id,
      art_media(
        display_order,
        media_files(
          original_url, compressed_url, thumbnail_url
        )
      )
    `)
    .in('event_id', events?.map(e => e.id) || [])
    .not('art_media', 'is', null)
    .order('event_id, art_media.display_order')
    .limit(100)

  // Get confirmed artists for these events as fallback images
  const { data: eventArtists } = await supabase
    .from('artist_confirmations')
    .select(`
      event_eid,
      promotion_artwork_url,
      artist_profiles!artist_profile_id(sample_works_urls)
    `)
    .in('event_eid', events?.map(e => e.eid) || [])
    .eq('confirmation_status', 'confirmed')
    .is('withdrawn_at', null)

  return events?.map((event, index) => {
    // Get artwork images for this specific event
    const eventArtworks = eventArtworkImages?.filter(a => a.event_id === event.id) || []
    
    // Build image arrays from artworks first
    const imageUrls = []
    const thumbnailUrls = []
    
    eventArtworks.forEach(artwork => {
      if (artwork.art_media) {
        artwork.art_media.forEach(media => {
          if (media.media_files) {
            const imageUrl = media.media_files.compressed_url || media.media_files.original_url
            const thumbnailUrl = media.media_files.thumbnail_url || imageUrl
            
            if (imageUrl && imageUrls.length < 4) {
              imageUrls.push(imageUrl)
              thumbnailUrls.push(thumbnailUrl)
            }
          }
        })
      }
    })

    // If no artwork images, use confirmed artists' images for this event
    if (imageUrls.length === 0) {
      const confirmedArtistsForEvent = eventArtists?.filter(ea => ea.event_eid === event.eid) || []
      
      confirmedArtistsForEvent.forEach(artist => {
        // Add promotion artwork first
        if (artist.promotion_artwork_url && imageUrls.length < 4) {
          imageUrls.push(artist.promotion_artwork_url)
          thumbnailUrls.push(artist.promotion_artwork_url)
        }
        
        // Add sample works
        if (artist.artist_profiles?.sample_works_urls && imageUrls.length < 4) {
          const remainingSlots = 4 - imageUrls.length
          const sampleWorks = artist.artist_profiles.sample_works_urls.slice(0, remainingSlots)
          imageUrls.push(...sampleWorks)
          thumbnailUrls.push(...sampleWorks)
        }
      })
    }
    
    // Skip events with no images
    if (imageUrls.length === 0) {
      return null
    }
    
    // Primary image for backwards compatibility
    const primaryImage = imageUrls[0]
    
    return {
      content_id: `event-${event.id}`,
      content_type: 'event',
      title: event.name,
      description: event.description,
      // Backwards compatibility (required)
      image_url: primaryImage,
      thumbnail_url: primaryImage,
      video_url: null,
      // NEW: Multiple images support
      image_urls: imageUrls,
      thumbnail_urls: thumbnailUrls,
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
    }
  }).filter(Boolean) || [] // Remove null entries (events with no images)
}

// 2. High-value event recaps with latest artwork images
async function fetchHighValueEvents(supabase) {
  const { data: eventRecaps } = await supabase.rpc('get_high_value_event_recap', {
    min_value: 500,
    limit_count: 10
  })

  if (!eventRecaps || eventRecaps.length === 0) return []

  return eventRecaps.map(recap => {
    // Extract image URLs from the latest_images JSONB
    const imageUrls = recap.latest_images?.map(img => img.image_url).slice(0, 5) || []
    const thumbnailUrls = recap.latest_images?.map(img => img.thumbnail_url).slice(0, 5) || []
    
    // Skip events with no images
    if (imageUrls.length === 0) {
      return null
    }
    
    // Primary image for backwards compatibility
    const primaryImage = imageUrls[0]
    const primaryThumbnail = thumbnailUrls[0]
    
    return {
      content_id: `event-recap-${recap.event_id}`,
      content_type: 'event',
      title: `${recap.event_name} - Event Recap`,
      description: `Art Battle event recap with $${recap.total_value} in total auction value from ${recap.artwork_count} artworks`,
      // Backwards compatibility (required)
      image_url: primaryImage,
      thumbnail_url: primaryThumbnail,
      video_url: null,
      // NEW: Multiple images support
      image_urls: imageUrls,
      thumbnail_urls: thumbnailUrls,
      tags: ['event-recap', 'completed', 'high-value', 'artwork'],
      color_palette: [],
      mood_tags: ['accomplished', 'valuable', 'artistic'],
      engagement_score: 0.9,
      trending_score: 0.8,
      quality_score: 0.9,
      data: {
        event_id: recap.event_id,
        eid: recap.event_eid,
        venue: recap.event_venue,
        start_datetime: recap.event_date,
        total_auction_value: recap.total_value,
        artwork_count: recap.artwork_count,
        currency_code: recap.currency_code,
        currency_symbol: recap.currency_symbol
      },
      status: 'active',
      curator_type: 'automated',
      curator_id: null,
      available_until: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }
  }).filter(Boolean) || [] // Remove null entries
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
    
    // Build multiple images from sample works and promotion artwork
    const imageUrls = []
    const thumbnailUrls = []
    
    // Add promotion artwork first (if available)
    if (confirmation.promotion_artwork_url) {
      imageUrls.push(confirmation.promotion_artwork_url)
      thumbnailUrls.push(confirmation.promotion_artwork_url)
    }
    
    // Add sample works (up to 4 additional to make max 5 total)
    if (profile?.sample_works_urls) {
      const remainingSlots = 5 - imageUrls.length
      const additionalSamples = profile.sample_works_urls.slice(0, remainingSlots)
      imageUrls.push(...additionalSamples)
      thumbnailUrls.push(...additionalSamples)
    }
    
    // Limit to max 10 images per app spec
    const finalImageUrls = imageUrls.slice(0, 10)
    const finalThumbnailUrls = thumbnailUrls.slice(0, 10)
    
    // Skip artists with no images
    if (finalImageUrls.length === 0) {
      return null
    }
    
    // Primary image for backwards compatibility
    const primaryImage = finalImageUrls[0]
    
    return {
      content_id: `confirmed-artist-${confirmation.artist_profile_id || confirmation.artist_number}`,
      content_type: 'artist_spotlight',
      title: confirmation.legal_name || profile?.name || `Artist #${confirmation.artist_number}`,
      description: profile?.bio || confirmation.public_message || 'Featured Art Battle artist',
      // Backwards compatibility (required)
      image_url: primaryImage,
      thumbnail_url: primaryImage,
      video_url: null,
      // NEW: Multiple images support
      image_urls: finalImageUrls,
      thumbnail_urls: finalThumbnailUrls,
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
  }).filter(Boolean) // Remove null entries (artists with no images)
}

// 4. Artist applications (using unified sample works, excluding confirmed by artist_number+event_eid)
async function fetchArtistApplications(supabase) {
  // Use RPC to get applications with unified sample works filtering and confirmation exclusion
  const { data: applications } = await supabase.rpc('get_artist_applications_for_feed', {
    days_back: 7,
    limit_count: 25
  })

  if (!applications || applications.length === 0) return []

  // Get additional profile and event data
  const profileIds = applications.map(app => app.artist_profile_id)
  const eventIds = applications.map(app => app.event_id).filter(Boolean)

  const [profilesResult, eventsResult] = await Promise.all([
    supabase
      .from('artist_profiles')
      .select('id, name, city_text, instagram, website, bio')
      .in('id', profileIds),
    
    eventIds.length > 0 ? supabase
      .from('events')
      .select('id, eid, name, venue, event_start_datetime')
      .in('id', eventIds) : Promise.resolve({ data: [] })
  ])

  const profilesMap = new Map(profilesResult.data?.map(p => [p.id, p]) || [])
  const eventsMap = new Map(eventsResult.data?.map(e => [e.id, e]) || [])

  return applications.map(app => {
    const profile = profilesMap.get(app.artist_profile_id)
    const event = eventsMap.get(app.event_id)
    
    if (!profile) return null

    // Get sample works from the RPC result
    const imageUrls = app.sample_works?.map(work => work.image_url).slice(0, 5) || []
    const thumbnailUrls = imageUrls // Same URLs for thumbnails
    
    // Skip applications with no images
    if (imageUrls.length === 0) {
      return null
    }
    
    // Primary image for backwards compatibility
    const primaryImage = imageUrls[0]
    
    return {
      content_id: `artist-application-${profile.id}`,
      content_type: 'artist_application',
      title: profile.name,
      description: `Applied Artist - ${profile.bio || 'Talented artist seeking to compete'}`,
      // Backwards compatibility (required)
      image_url: primaryImage,
      thumbnail_url: primaryImage,
      video_url: null,
      // NEW: Multiple images support
      image_urls: imageUrls,
      thumbnail_urls: thumbnailUrls,
      tags: ['artist', 'application', 'pending', 'emerging'],
      color_palette: [],
      mood_tags: ['aspiring', 'emerging', 'hopeful'],
      engagement_score: 0.6,
      trending_score: 0.5,
      quality_score: 0.6,
      data: {
        artist_id: profile.id,
        artist_number: app.artist_number,
        entry_id: profile.entry_id,
        city: profile.city_text || 'Unknown',
        event_eid: app.event_eid,
        event_name: event?.name,
        event_venue: event?.venue,
        event_date: event?.event_start_datetime,
        instagram: profile.instagram,
        website: profile.website,
        sample_works: imageUrls,
        applied_date: app.applied_at,
        application_status: 'pending'
      },
      status: 'active',
      curator_type: 'automated',
      curator_id: null,
      available_until: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }
  }).filter(Boolean) // Remove null entries
}

// 5. Winning paintings from last 20 events
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

  // Get ALL media files for the matched winning artworks (multiple images support)
  const artworkIds = artworkMatches.map(m => m.artwork.id)
  const { data: allMediaFiles } = await supabase
    .from('art_media')
    .select(`
      art_id,
      display_order,
      media_files(original_url, thumbnail_url, compressed_url)
    `)
    .in('art_id', artworkIds)
    .order('art_id, display_order', { ascending: true })

  // Get fallback images from artist sample works for artworks without images
  const { data: artistSamples } = await supabase
    .from('artist_profiles')
    .select('id, sample_works_urls')
    .in('id', artworkMatches.map(m => m.winner.artist_id))
    .not('sample_works_urls', 'is', null)

  return artworkMatches.slice(0, 10).map((match, index) => {
    const { winner, artwork } = match
    const event = recentEvents.find(e => e.id === winner.rounds?.event_id)
    
    // Get ALL images for this artwork, ordered by display_order
    const artworkMedia = allMediaFiles?.filter(m => m.art_id === artwork.id) || []
    
    // Helper function to get Cloudflare public URL
    const getCloudflarePublicUrl = (originalUrl) => {
      if (originalUrl && originalUrl.includes('imagedelivery.net')) {
        return originalUrl.replace('/public', '/public') // Already has /public
      }
      return originalUrl
    }
    
    // Build imageUrls and thumbnailUrls arrays
    const imageUrls = artworkMedia
      .map(media => getCloudflarePublicUrl(media.media_files?.compressed_url || media.media_files?.original_url))
      .filter(Boolean)
      .slice(0, 10) // Limit to 10 images per app spec
      
    const thumbnailUrls = artworkMedia
      .map(media => media.media_files?.thumbnail_url)
      .filter(Boolean)
      .slice(0, 10)
    
    // Fallback to artist sample work if no artwork images
    const artistSample = artistSamples?.find(a => a.id === winner.artist_id)
    const fallbackImage = artistSample?.sample_works_urls?.[0] || null
    
    // Primary image for backwards compatibility
    const primaryImage = imageUrls[0] || fallbackImage
    const primaryThumbnail = thumbnailUrls[0] || fallbackImage
    
    return {
      content_id: `winning-artwork-${artwork.id}`,
      content_type: 'artwork',
      title: `${artwork?.artist_profiles?.name || 'Artist'} - Competition Winner`,
      description: artwork?.description || `Winning artwork from ${event?.name}`,
      // Backwards compatibility (required)
      image_url: primaryImage,
      thumbnail_url: primaryThumbnail,
      video_url: null,
      // NEW: Multiple images support
      image_urls: imageUrls.length > 0 ? imageUrls : (fallbackImage ? [fallbackImage] : []),
      thumbnail_urls: thumbnailUrls.length > 0 ? thumbnailUrls : (fallbackImage ? [fallbackImage] : []),
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
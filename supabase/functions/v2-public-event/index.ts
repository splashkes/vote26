import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
serve(async (req)=>{
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET',
        'Access-Control-Allow-Headers': 'Content-Type'
      }
    });
  }
  const url = new URL(req.url);
  const pathParts = url.pathname.split('/').filter((p)=>p);
  // Handle different endpoint patterns:
  // /live/event/AB3028 -> event data
  // /live/event/AB3028/media -> media data  
  // /live/event/AB3028/artists -> artists data
  // /live/event/AB3028-round-easel/bids -> specific artwork bids
  const lastPart = pathParts[pathParts.length - 1];
  const secondLastPart = pathParts[pathParts.length - 2];
  const isMediaRequest = lastPart === 'media';
  const isArtistsRequest = lastPart === 'artists';
  const isBidsRequest = lastPart === 'bids';
  let eventId, round, easel;
  if (isMediaRequest || isArtistsRequest) {
    eventId = secondLastPart;
  } else if (isBidsRequest) {
    // Parse AB3028-round-easel format
    const compound = secondLastPart;
    const parts = compound.split('-');
    if (parts.length >= 3) {
      eventId = parts[0];
      round = parts[1];
      easel = parts[2];
    } else {
      throw new Error(`Invalid compound ID format: ${compound}`);
    }
  } else {
    eventId = lastPart;
  }
  console.log(`[v2-public-event] Starting request for eventId: ${eventId}`);
  try {
    if (!eventId) {
      console.error('[v2-public-event] ERROR: No event ID provided in URL path');
      return new Response(JSON.stringify({
        error: 'Event ID required'
      }), {
        status: 400,
        headers: {
          'Content-Type': 'application/json'
        }
      });
    }
    if (isMediaRequest) {
      console.log(`[v2-public-event] Calling generateEventMediaData for: ${eventId}`);
      const mediaData = await generateEventMediaData(eventId);
      console.log(`[v2-public-event] SUCCESS: Generated media data for ${eventId}`);
      return new Response(JSON.stringify(mediaData), {
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      });
    } else if (isArtistsRequest) {
      console.log(`[v2-public-event] Calling generateEventArtistsData for: ${eventId}`);
      const artistsData = await generateEventArtistsData(eventId);
      console.log(`[v2-public-event] SUCCESS: Generated artists data for ${eventId}`);
      return new Response(JSON.stringify(artistsData), {
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      });
    } else if (isBidsRequest) {
      console.log(`[v2-public-event] Calling generateArtworkBidsData for: ${eventId}-${round}-${easel}`);
      const bidsData = await generateArtworkBidsData(eventId, round, easel);
      console.log(`[v2-public-event] SUCCESS: Generated artwork bids data for ${eventId}-${round}-${easel}`);
      return new Response(JSON.stringify(bidsData), {
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      });
    } else {
      console.log(`[v2-public-event] Calling generatePublicEventData for: ${eventId}`);
      const eventData = await generatePublicEventData(eventId);
      console.log(`[v2-public-event] SUCCESS: Generated data for ${eventId}`);
      return new Response(JSON.stringify(eventData), {
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      });
    }
  } catch (error) {
    console.error('[v2-public-event] CRITICAL ERROR:', {
      message: error.message,
      stack: error.stack,
      name: error.name,
      eventId: eventId,
      url: req.url,
      timestamp: new Date().toISOString()
    });
    return new Response(JSON.stringify({
      error: 'Internal server error',
      debug: {
        message: error.message,
        eventId: eventId,
        timestamp: new Date().toISOString()
      }
    }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });
  }
});
const generatePublicEventData = async (eventId)=>{
  console.log(`[generatePublicEventData] Starting for eventId: ${eventId}`);
  const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');
  console.log(`[generatePublicEventData] Supabase client created, querying events table`);
  // Handle both UUID and EID inputs
  let eventQuery;
  if (eventId.length === 36 && eventId.includes('-')) {
    // Input looks like a UUID
    console.log(`[generatePublicEventData] Querying by UUID: ${eventId}`);
    eventQuery = supabase.from('events').select(`
        id, eid, name, description, event_start_datetime, venue, auction_start_bid,
        countries!country_id(currency_code, currency_symbol)
      `).eq('id', eventId).single();
  } else {
    // Input looks like an EID
    console.log(`[generatePublicEventData] Querying by EID: ${eventId}`);
    eventQuery = supabase.from('events').select(`
        id, eid, name, description, event_start_datetime, venue, auction_start_bid,
        countries!country_id(currency_code, currency_symbol)
      `).eq('eid', eventId).single();
  }
  const { data: eventInfo, error: eventError } = await eventQuery;
  console.log(`[generatePublicEventData] Event query result:`, {
    eventInfo: eventInfo,
    error: eventError
  });
  if (eventError) {
    console.error(`[generatePublicEventData] Event query error:`, eventError);
    throw new Error(`Event query failed: ${eventError.message}`);
  }
  if (!eventInfo) {
    console.error(`[generatePublicEventData] No event found for: ${eventId}`);
    throw new Error(`Event ${eventId} not found`);
  }
  console.log(`[generatePublicEventData] Found event UUID: ${eventInfo.id}`);
  console.log(`[generatePublicEventData] Querying artworks for event UUID: ${eventInfo.id}`);
  // Get artworks with artist profiles - ONLY include artworks that have an artist assigned
  const { data: artworks, error: artworksError } = await supabase.from('art').select(`
      id,
      art_code,
      description,
      status,
      easel,
      round,
      created_at,
      artist_id,
      artist_profiles!inner (
        id,
        name,
        bio,
        instagram,
        website
      )
    `).eq('event_id', eventInfo.id).not('artist_id', 'is', null).order('easel');
  console.log(`[generatePublicEventData] Artworks query result:`, {
    count: artworks?.length || 0,
    error: artworksError
  });
  if (artworksError) {
    console.error(`[generatePublicEventData] Artworks query error:`, artworksError);
    throw new Error(`Artworks query failed: ${artworksError.message}`);
  }
  console.log(`[generatePublicEventData] Querying bids for event UUID: ${eventInfo.id}`);
  // Get bids for this event by joining through art table
  const { data: currentBids, error: bidsError } = await supabase.from('bids').select(`
      art_id, 
      amount, 
      created_at,
      art!inner(event_id)
    `).eq('art.event_id', eventInfo.id).order('created_at', {
    ascending: false
  });
  console.log(`[generatePublicEventData] Bids query result:`, {
    count: currentBids?.length || 0,
    error: bidsError
  });
  if (bidsError) {
    console.error(`[generatePublicEventData] Bids query error:`, bidsError);
    throw new Error(`Bids query failed: ${bidsError.message}`);
  }
  console.log(`[generatePublicEventData] Processing bids data`);
  const processedBids = processBidsForPublic(currentBids || []);
  console.log(`[generatePublicEventData] Calling get_voting_summary RPC for UUID: ${eventInfo.id}`);
  // Get vote summary using the correct UUID
  const { data: voteSummary, error: voteError } = await supabase.rpc('get_voting_summary', {
    p_event_id: eventInfo.id
  });
  console.log(`[generatePublicEventData] Vote summary result:`, {
    data: voteSummary,
    error: voteError
  });
  if (voteError) {
    console.warn(`[generatePublicEventData] Vote summary failed: ${voteError.message}`);
  }
  console.log(`[generatePublicEventData] Querying round winners for UUID: ${eventInfo.id}`);
  // Get round winners data
  const { data: roundWinners, error: winnersError } = await supabase.from('round_contestants').select(`
      is_winner,
      artist_id,
      easel_number,
      rounds!inner(
        event_id,
        round_number
      )
    `).eq('rounds.event_id', eventInfo.id).gt('is_winner', 0);
  console.log(`[generatePublicEventData] Round winners result:`, {
    count: roundWinners?.length || 0,
    error: winnersError
  });
  if (winnersError) {
    console.warn(`[generatePublicEventData] Round winners query failed: ${winnersError.message}`);
  }
  // Process round winners data to match artworks
  const processedWinners = processRoundWinners(roundWinners || [], artworks || []);
  // Process event info to flatten currency and provide fallbacks
  const processedEvent = {
    ...eventInfo,
    currency_code: eventInfo.countries?.currency_code || 'USD',
    currency_symbol: eventInfo.countries?.currency_symbol || '$',
    auction_start_bid: (eventInfo.auction_start_bid || 0) + 5
  };
  // Remove nested countries object
  delete processedEvent.countries;
  return {
    event: processedEvent,
    artworks: artworks || [],
    vote_summary: voteSummary || [],
    current_bids: processedBids,
    round_winners: processedWinners,
    generated_at: new Date().toISOString()
  };
};
const processRoundWinners = (winners, artworks)=>{
  const roundWinners = {};
  winners.forEach((winner)=>{
    // Get the round number from the joined rounds data
    const roundNumber = winner.rounds?.round_number;
    // Find the matching artwork by artist_id, easel, and round
    const artwork = artworks.find((a)=>a.artist_id === winner.artist_id && a.easel === winner.easel_number && a.round === roundNumber);
    if (artwork) {
      const round = artwork.round || 1;
      if (!roundWinners[round]) roundWinners[round] = {};
      // is_winner = 1 means winner (only one value > 0 in the data)
      roundWinners[round][artwork.id] = 'winner';
    }
  });
  return roundWinners;
};
const processBidsForPublic = (bids)=>{
  const bidMap = new Map();
  for (const bid of bids){
    const artId = bid.art_id;
    const existing = bidMap.get(artId);
    if (!existing || bid.amount > existing.amount) {
      bidMap.set(artId, {
        art_id: artId,
        current_bid: bid.amount,
        bid_time: bid.created_at,
        bid_count: bids.filter((b)=>b.art_id === artId).length
      });
    }
  }
  return Array.from(bidMap.values());
};
const generateEventMediaData = async (eventId)=>{
  console.log(`[generateEventMediaData] Starting for eventId: ${eventId}`);
  const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');
  console.log(`[generateEventMediaData] Getting event info for: ${eventId}`);
  // Handle both UUID and EID inputs for media endpoint
  let eventQuery;
  if (eventId.length === 36 && eventId.includes('-')) {
    // Input looks like a UUID
    console.log(`[generateEventMediaData] Querying by UUID: ${eventId}`);
    eventQuery = supabase.from('events').select('id, eid').eq('id', eventId).single();
  } else {
    // Input looks like an EID
    console.log(`[generateEventMediaData] Querying by EID: ${eventId}`);
    eventQuery = supabase.from('events').select('id, eid').eq('eid', eventId).single();
  }
  const { data: eventInfo, error: eventError } = await eventQuery;
  if (eventError || !eventInfo) {
    console.error(`[generateEventMediaData] Event not found: ${eventId}`);
    throw new Error(`Event ${eventId} not found`);
  }
  console.log(`[generateEventMediaData] Querying media files for event UUID: ${eventInfo.id}`);
  // Get artworks with their media files - ONLY include artworks that have an artist assigned
  const { data: artworks, error: artworksError } = await supabase.from('art').select(`
      id,
      art_code,
      easel,
      round,
      art_media (
        is_primary,
        display_order,
        media_files (
          id,
          file_type,
          file_size,
          cloudflare_id,
          thumbnail_url,
          compressed_url,
          original_url,
          created_at
        )
      )
    `).eq('event_id', eventInfo.id).not('artist_id', 'is', null).order('easel');
  console.log(`[generateEventMediaData] Artworks query result:`, {
    count: artworks?.length || 0,
    error: artworksError
  });
  if (artworksError) {
    console.error(`[generateEventMediaData] Artworks query error:`, artworksError);
    throw new Error(`Artworks query failed: ${artworksError.message}`);
  }
  // Process media data
  const mediaMap = new Map();
  artworks?.forEach((artwork)=>{
    if (artwork.art_media && artwork.art_media.length > 0) {
      // Get all valid media files and sort by creation date (most recent first)
      const validMedia = artwork.art_media.filter((am)=>am.media_files);
      if (validMedia.length > 0) {
        // Sort all media by creation date (most recent first)
        const sortedMedia = validMedia.sort((a, b)=>{
          const aDate = new Date(a.media_files?.created_at || 0);
          const bDate = new Date(b.media_files?.created_at || 0);
          return bDate.getTime() - aDate.getTime() // Descending order (newest first)
          ;
        });
        // Return all media files for this artwork, maintaining expected structure
        // Frontend expects array of objects with media_files property, sorted newest first
        const allMedia = sortedMedia.map((am)=>({
            media_files: am.media_files,
            is_primary: am.is_primary,
            display_order: am.display_order
          }));
        mediaMap.set(artwork.id, {
          artwork_id: artwork.id,
          art_code: artwork.art_code,
          easel: artwork.easel,
          round: artwork.round,
          media: allMedia // Array of media objects with media_files property, newest first
        });
      }
    }
  });
  return {
    event_id: eventId,
    media: Array.from(mediaMap.values()),
    generated_at: new Date().toISOString()
  };
};

const generateEventArtistsData = async (eventId) => {
  console.log(`[generateEventArtistsData] Starting for eventId: ${eventId}`);
  const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');
  
  console.log(`[generateEventArtistsData] Getting event info for: ${eventId}`);
  // Handle both UUID and EID inputs for artists endpoint
  let eventQuery;
  if (eventId.length === 36 && eventId.includes('-')) {
    // Input looks like a UUID
    console.log(`[generateEventArtistsData] Querying by UUID: ${eventId}`);
    eventQuery = supabase.from('events').select('id, eid').eq('id', eventId).single();
  } else {
    // Input looks like an EID
    console.log(`[generateEventArtistsData] Querying by EID: ${eventId}`);
    eventQuery = supabase.from('events').select('id, eid').eq('eid', eventId).single();
  }

  const { data: eventInfo, error: eventError } = await eventQuery;
  if (eventError || !eventInfo) {
    console.error(`[generateEventArtistsData] Event not found: ${eventId}`);
    throw new Error(`Event ${eventId} not found`);
  }

  console.log(`[generateEventArtistsData] Querying artists for event UUID: ${eventInfo.id}`);
  
  // Get all artists assigned to this event with their profiles and bio information
  const { data: eventArtists, error: artistsError } = await supabase
    .from('event_artists')
    .select(`
      artist_id,
      status,
      artist_profiles!inner (
        id,
        name,
        email,
        city_text,
        instagram,
        facebook,
        website,
        abhq_bio,
        created_at,
        updated_at
      )
    `)
    .eq('event_id', eventInfo.id)
    .eq('status', 'confirmed')
    .order('artist_profiles(name)');

  console.log(`[generateEventArtistsData] Artists query result:`, {
    count: eventArtists?.length || 0,
    error: artistsError
  });

  if (artistsError) {
    console.error(`[generateEventArtistsData] Artists query error:`, artistsError);
    throw new Error(`Artists query failed: ${artistsError.message}`);
  }

  // Process and format artist data
  const artists = eventArtists?.map(ea => {
    const profile = ea.artist_profiles;
    return {
      id: profile.id,
      name: profile.name,
      email: profile.email,
      city: profile.city_text,
      instagram: profile.instagram,
      facebook: profile.facebook,
      website: profile.website,
      bio: profile.abhq_bio,
      created_at: profile.created_at,
      updated_at: profile.updated_at,
      event_status: ea.status
    };
  }).sort((a, b) => a.name.localeCompare(b.name)) || [];

  console.log(`[generateEventArtistsData] Successfully processed ${artists.length} artists for event ${eventId}`);

  return {
    event_id: eventId,
    event_eid: eventInfo.eid,
    artists: artists,
    total_artists: artists.length,
    generated_at: new Date().toISOString()
  };
};

const generateArtworkBidsData = async (eventId, round, easel)=>{
  console.log(`[generateArtworkBidsData] Starting for eventId: ${eventId}, round: ${round}, easel: ${easel}`);
  const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');
  console.log(`[generateArtworkBidsData] Getting event info for: ${eventId}`);
  // Handle both UUID and EID inputs for bid endpoint
  let eventQuery;
  if (eventId.length === 36 && eventId.includes('-')) {
    // Input looks like a UUID
    console.log(`[generateArtworkBidsData] Querying by UUID: ${eventId}`);
    eventQuery = supabase.from('events').select('id, eid').eq('id', eventId).single();
  } else {
    // Input looks like an EID
    console.log(`[generateArtworkBidsData] Querying by EID: ${eventId}`);
    eventQuery = supabase.from('events').select('id, eid').eq('eid', eventId).single();
  }
  const { data: eventInfo, error: eventError } = await eventQuery;
  if (eventError || !eventInfo) {
    console.error(`[generateArtworkBidsData] Event not found: ${eventId}`);
    throw new Error(`Event ${eventId} not found`);
  }
  console.log(`[generateArtworkBidsData] Finding artwork for round: ${round}, easel: ${easel}`);
  // Find the specific artwork by round and easel
  const { data: artwork, error: artworkError } = await supabase.from('art').select('id, art_code').eq('event_id', eventInfo.id).eq('round', round).eq('easel', easel).single();
  if (artworkError || !artwork) {
    console.error(`[generateArtworkBidsData] Artwork not found for round: ${round}, easel: ${easel}`);
    throw new Error(`Artwork not found for ${eventId} round ${round} easel ${easel}`);
  }
  console.log(`[generateArtworkBidsData] Querying bids for artwork: ${artwork.id}`);
  // Get bids for this specific artwork with bidder names from people table
  const { data: bids, error: bidsError } = await supabase.from('bids').select(`
      id,
      amount,
      created_at,
      people (
        name,
        email,
        phone
      )
    `).eq('art_id', artwork.id).order('created_at', {
    ascending: false
  });
  console.log(`[generateArtworkBidsData] Bids query result:`, {
    count: bids?.length || 0,
    error: bidsError
  });
  if (bidsError) {
    console.error(`[generateArtworkBidsData] Bids query error:`, bidsError);
    throw new Error(`Bids query failed: ${bidsError.message}`);
  }
  // Helper function to format bidder display name
  const formatBidderDisplayName = (person)=>{
    if (!person) return 'Anonymous';
    // Try name first (format: "First L.") - but ignore placeholder names like "User"
    if (person.name && person.name.trim().toLowerCase() !== 'user') {
      const nameParts = person.name.trim().split(/\s+/);
      if (nameParts.length >= 2) {
        const firstName = nameParts[0];
        const lastInitial = nameParts[nameParts.length - 1].charAt(0).toUpperCase();
        return `${firstName} ${lastInitial}.`;
      } else if (nameParts.length === 1) {
        return nameParts[0];
      }
    }
    // Fallback to last 4 digits of phone if available
    if (person.phone) {
      const digits = person.phone.replace(/\D/g, '');
      if (digits.length >= 4) {
        return `***-${digits.slice(-4)}`;
      }
    }
    return 'Anonymous';
  };
  // Process bids data for public display (format names for privacy)
  const processedBids = (bids || []).map((bid)=>({
      id: bid.id,
      amount: bid.amount,
      created_at: bid.created_at,
      display_name: formatBidderDisplayName(bid.people),
      bidder_name: formatBidderDisplayName(bid.people) // Legacy field name
    }));
  return {
    event_id: eventId,
    artwork_id: artwork.id,
    art_code: artwork.art_code,
    round: round,
    easel: easel,
    bids: processedBids,
    highest_bid: processedBids.length > 0 ? Math.max(...processedBids.map((b)=>b.amount)) : 0,
    bid_count: processedBids.length,
    generated_at: new Date().toISOString()
  };
};

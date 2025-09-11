import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization'
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const eventId = url.searchParams.get('event');
    
    if (!eventId) {
      return new Response(JSON.stringify({
        error: 'Event ID parameter is required (?event=AB3333)'
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    console.log(`[wp-artists-export] Starting request for eventId: ${eventId}`);

    const artistsData = await generateWordPressArtistsData(eventId);
    console.log(`[wp-artists-export] SUCCESS: Generated artists data for ${eventId}`);

    return new Response(JSON.stringify(artistsData), {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=10800' // 3 hours caching
      }
    });

  } catch (error) {
    console.error('[wp-artists-export] CRITICAL ERROR:', {
      message: error.message,
      stack: error.stack,
      name: error.name,
      timestamp: new Date().toISOString()
    });

    return new Response(JSON.stringify({
      error: 'Internal server error',
      debug: {
        message: error.message,
        timestamp: new Date().toISOString()
      }
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});

const generateWordPressArtistsData = async (eventId: string) => {
  console.log(`[generateWordPressArtistsData] Starting for eventId: ${eventId}`);
  
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '', 
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  );

  console.log(`[generateWordPressArtistsData] Getting event info for: ${eventId}`);

  // Handle both UUID and EID inputs
  let eventQuery;
  if (eventId.length === 36 && eventId.includes('-')) {
    // Input looks like a UUID
    console.log(`[generateWordPressArtistsData] Querying by UUID: ${eventId}`);
    eventQuery = supabase
      .from('events')
      .select('id, eid, name, event_start_datetime, venue')
      .eq('id', eventId)
      .single();
  } else {
    // Input looks like an EID
    console.log(`[generateWordPressArtistsData] Querying by EID: ${eventId}`);
    eventQuery = supabase
      .from('events')
      .select('id, eid, name, event_start_datetime, venue')
      .eq('eid', eventId)
      .single();
  }

  const { data: eventInfo, error: eventError } = await eventQuery;

  if (eventError || !eventInfo) {
    console.error(`[generateWordPressArtistsData] Event not found: ${eventId}`);
    throw new Error(`Event ${eventId} not found`);
  }

  console.log(`[generateWordPressArtistsData] Querying confirmed artists for event UUID: ${eventInfo.id}`);

  // Get all confirmed artists for this event from artist_confirmations table
  const { data: eventArtists, error: artistsError } = await supabase
    .from('artist_confirmations')
    .select(`
      artist_profile_id,
      confirmation_status,
      promotion_artwork_url,
      artist_profiles!inner (
        id,
        name,
        email,
        city_text,
        instagram,
        facebook,
        website,
        abhq_bio,
        bio,
        created_at,
        updated_at
      )
    `)
    .eq('event_eid', eventId)
    .eq('confirmation_status', 'confirmed')
    .order('artist_profiles(name)');

  // COMMENTED OUT OLD LOOKUP:
  // const { data: eventArtists, error: artistsError } = await supabase
  //   .from('event_artists')
  //   .select(`
  //     artist_id,
  //     status,
  //     artist_profiles!inner (
  //       id,
  //       name,
  //       email,
  //       city_text,
  //       instagram,
  //       facebook,
  //       website,
  //       abhq_bio,
  //       bio,
  //       created_at,
  //       updated_at
  //     )
  //   `)
  //   .eq('event_id', eventInfo.id)
  //   .eq('status', 'confirmed')
  //   .order('artist_profiles(name)');

  console.log(`[generateWordPressArtistsData] Artists query result:`, {
    count: eventArtists?.length || 0,
    error: artistsError
  });

  if (artistsError) {
    console.error(`[generateWordPressArtistsData] Artists query error:`, artistsError);
    throw new Error(`Artists query failed: ${artistsError.message}`);
  }

  // Get ABHQ promo images and sample works for each artist
  const artistIds = eventArtists?.map(ea => ea.artist_profiles.id) || [];
  let sampleWorksMap = new Map();
  let abhqPromoMap = new Map();

  if (artistIds.length > 0) {
    console.log(`[generateWordPressArtistsData] Querying ABHQ promo images and sample works for ${artistIds.length} artists`);
    
    // Get ABHQ promo images first (priority)
    const { data: abhqPromoImages, error: abhqPromoError } = await supabase
      .from('artist_profiles')
      .select(`
        id,
        abhq_promo_media_file_id,
        media_files!abhq_promo_media_file_id (
          id,
          file_type,
          cloudflare_id,
          thumbnail_url,
          compressed_url,
          original_url,
          created_at
        )
      `)
      .in('id', artistIds)
      .not('abhq_promo_media_file_id', 'is', null);

    if (!abhqPromoError && abhqPromoImages) {
      abhqPromoImages.forEach(artist => {
        if (artist.media_files) {
          abhqPromoMap.set(artist.id, artist.media_files);
        }
      });
    }
    
    // Get sample works as fallback
    const { data: sampleWorks, error: sampleWorksError } = await supabase
      .from('artist_sample_works')
      .select(`
        artist_profile_id,
        media_files!inner (
          id,
          file_type,
          cloudflare_id,
          thumbnail_url,
          compressed_url,
          original_url,
          created_at
        )
      `)
      .in('artist_profile_id', artistIds)
      .order('created_at', { ascending: false });

    if (!sampleWorksError && sampleWorks) {
      sampleWorks.forEach(work => {
        const artistId = work.artist_profile_id;
        if (!sampleWorksMap.has(artistId)) {
          sampleWorksMap.set(artistId, []);
        }
        sampleWorksMap.get(artistId).push(work.media_files);
      });
    }
  }

  // Format artist data for WordPress consumption
  const artists = eventArtists?.map(ea => {
    const profile = ea.artist_profiles;
    const sampleWorks = sampleWorksMap.get(profile.id) || [];
    const abhqPromo = abhqPromoMap.get(profile.id);
    
    // Use ABHQ bio (priority) or fallback to regular bio
    const bio = profile.abhq_bio || profile.bio || '';
    
    // Get primary promo image: Admin promo first (highest priority), then ABHQ promo, then sample work
    let promoImage = null;
    if (ea.promotion_artwork_url) {
      // Use admin-uploaded promo image (highest priority)
      promoImage = {
        thumbnail: ea.promotion_artwork_url, // Admin promo images use /public variant
        public: ea.promotion_artwork_url,
        original: ea.promotion_artwork_url,
        source: 'admin_promo'
      };
    } else if (abhqPromo) {
      // Use ABHQ promo image (second priority)
      promoImage = {
        thumbnail: abhqPromo.thumbnail_url || `https://imagedelivery.net/IGZfH_Pl-6S6csykNnXNJw/${abhqPromo.cloudflare_id}/thumbnail`,
        public: abhqPromo.compressed_url || `https://imagedelivery.net/IGZfH_Pl-6S6csykNnXNJw/${abhqPromo.cloudflare_id}/public`,
        original: abhqPromo.original_url || `https://imagedelivery.net/IGZfH_Pl-6S6csykNnXNJw/${abhqPromo.cloudflare_id}/original`,
        cloudflare_id: abhqPromo.cloudflare_id,
        source: 'abhq_promo'
      };
    } else if (sampleWorks.length > 0) {
      // Fallback to first sample work (lowest priority)
      promoImage = {
        thumbnail: sampleWorks[0].thumbnail_url || `https://imagedelivery.net/IGZfH_Pl-6S6csykNnXNJw/${sampleWorks[0].cloudflare_id}/thumbnail`,
        public: sampleWorks[0].compressed_url || `https://imagedelivery.net/IGZfH_Pl-6S6csykNnXNJw/${sampleWorks[0].cloudflare_id}/public`,
        original: sampleWorks[0].original_url || `https://imagedelivery.net/IGZfH_Pl-6S6csykNnXNJw/${sampleWorks[0].cloudflare_id}/original`,
        cloudflare_id: sampleWorks[0].cloudflare_id,
        source: 'sample_work'
      };
    }

    return {
      id: profile.id,
      name: profile.name || 'Artist',
      email: profile.email,
      city: profile.city_text,
      instagram: profile.instagram,
      facebook: profile.facebook,
      website: profile.website,
      bio: bio,
      bio_html: bio ? bio.replace(/\n/g, '<br>') : '', // Convert newlines to HTML breaks
      promo_image: promoImage,
      sample_works_count: sampleWorks.length,
      event_status: ea.confirmation_status,
      social_links: {
        instagram: profile.instagram ? `https://instagram.com/${profile.instagram.replace('@', '')}` : null,
        facebook: profile.facebook,
        website: profile.website
      }
    };
  }).sort((a, b) => a.name.localeCompare(b.name)) || [];

  console.log(`[generateWordPressArtistsData] Successfully processed ${artists.length} confirmed artists for event ${eventId}`);

  // Format event date for display
  const eventDate = eventInfo.event_start_datetime ? 
    new Date(eventInfo.event_start_datetime).toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    }) : null;

  return {
    success: true,
    event: {
      id: eventInfo.id,
      eid: eventInfo.eid,
      name: eventInfo.name,
      venue: eventInfo.venue,
      date: eventDate,
      date_iso: eventInfo.event_start_datetime
    },
    artists: artists,
    total_artists: artists.length,
    generated_at: new Date().toISOString(),
    cache_duration: '3 hours'
  };
};
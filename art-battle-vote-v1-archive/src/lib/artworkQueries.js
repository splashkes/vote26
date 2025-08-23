import { supabase } from './supabase';

/**
 * Load artworks with their associated media files
 * This function joins art, art_media, and media_files tables
 * to get complete image information
 */
export async function loadArtworksWithMedia(eventId) {
  const { data, error } = await supabase
    .from('art')
    .select(`
      *,
      artist_profiles!art_artist_id_fkey (
        id,
        name,
        instagram,
        city_text
      ),
      art_media!inner (
        id,
        media_type,
        is_primary,
        display_order,
        media_files!inner (
          id,
          original_url,
          thumbnail_url,
          compressed_url,
          cloudflare_id,
          file_type,
          width,
          height
        )
      )
    `)
    .eq('event_id', eventId)
    .order('round', { ascending: true })
    .order('easel', { ascending: true });

  if (error) {
    console.error('Error loading artworks with media:', error);
    return { data: [], error };
  }

  // Transform the data to include primary image info at the top level
  const transformedData = data.map(artwork => {
    // Find the primary image or the first image
    const primaryMedia = artwork.art_media?.find(am => am.is_primary) || artwork.art_media?.[0];
    const mediaFile = primaryMedia?.media_files;

    return {
      ...artwork,
      // Keep legacy fields for backward compatibility
      thumbnail: artwork.thumbnail,
      image: artwork.image,
      // Add new media file info
      primary_media_file: mediaFile || null,
      has_cloudflare_image: !!mediaFile?.cloudflare_id,
      all_media: artwork.art_media || []
    };
  });

  return { data: transformedData, error: null };
}

/**
 * Get a single artwork with all its media
 * TODO: Include created_at datetime information for proper sorting (latest first)
 * This would eliminate the need for separate queries in components
 */
export async function getArtworkWithMedia(artworkId) {
  const { data, error } = await supabase
    .from('art')
    .select(`
      *,
      artist_profiles!art_artist_id_fkey (
        id,
        name,
        instagram,
        city_text
      ),
      art_media (
        id,
        media_type,
        is_primary,
        display_order,
        media_files (
          id,
          original_url,
          thumbnail_url,
          compressed_url,
          cloudflare_id,
          file_type,
          width,
          height
        )
      )
    `)
    .eq('id', artworkId)
    .single();

  if (error) {
    console.error('Error loading artwork with media:', error);
    return { data: null, error };
  }

  // Find primary image
  const primaryMedia = data.art_media?.find(am => am.is_primary) || data.art_media?.[0];
  const mediaFile = primaryMedia?.media_files;

  return {
    data: {
      ...data,
      primary_media_file: mediaFile || null,
      has_cloudflare_image: !!mediaFile?.cloudflare_id,
      all_media: data.art_media || []
    },
    error: null
  };
}
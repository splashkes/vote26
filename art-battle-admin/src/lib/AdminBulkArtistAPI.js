/**
 * Admin Bulk Artist API Helper Functions
 * Handles communication with the database functions for bulk artist management
 */

import { supabase } from './supabase';

/**
 * Get bulk artist data with pagination and filtering
 * @param {Object} options - Query options
 * @param {number} options.limit - Number of records to return (default: 100)
 * @param {number} options.offset - Offset for pagination (default: 0)
 * @param {string} options.searchTerm - Search term for name/event/artist number (optional)
 * @returns {Promise<Object>} Result containing data and any error
 */
export async function getBulkArtistData(options = {}) {
  const {
    limit = 100,
    offset = 0,
    searchTerm = null
  } = options;

  try {
    const { data, error } = await supabase.rpc('admin_get_bulk_artist_data', {
      p_limit: limit,
      p_offset: offset,
      p_search_term: searchTerm
    });

    if (error) {
      console.error('Error fetching bulk artist data:', error);
      return { data: null, error: error.message };
    }

    return { data: data || [], error: null };
  } catch (err) {
    console.error('Exception in getBulkArtistData:', err);
    return { data: null, error: err.message };
  }
}

/**
 * Get bulk artist statistics for overview
 * @returns {Promise<Object>} Statistics about artist completion rates
 */
export async function getBulkArtistStats() {
  try {
    const { data, error } = await supabase.rpc('admin_get_bulk_artist_stats');

    if (error) {
      console.error('Error fetching bulk artist stats:', error);
      return { data: null, error: error.message };
    }

    return { data: data?.[0] || null, error: null };
  } catch (err) {
    console.error('Exception in getBulkArtistStats:', err);
    return { data: null, error: err.message };
  }
}

/**
 * Update artist bio
 * @param {string} artistProfileId - UUID of the artist profile
 * @param {string} bio - New bio content
 * @returns {Promise<Object>} Success status and any error
 */
export async function updateArtistBio(artistProfileId, bio) {
  if (!artistProfileId) {
    return { success: false, error: 'Artist profile ID is required' };
  }

  try {
    const { data, error } = await supabase.rpc('admin_update_artist_bio', {
      p_artist_profile_id: artistProfileId,
      p_bio: bio || ''
    });

    if (error) {
      console.error('Error updating artist bio:', error);
      return { success: false, error: error.message };
    }

    return { success: true, error: null };
  } catch (err) {
    console.error('Exception in updateArtistBio:', err);
    return { success: false, error: err.message };
  }
}

/**
 * Update artist promo image
 * @param {string} artistProfileId - UUID of the artist profile
 * @param {string} eventEid - Event EID for the confirmation
 * @param {string} imageUrl - New image URL
 * @returns {Promise<Object>} Success status and any error
 */
export async function updateArtistPromoImage(artistProfileId, eventEid, imageUrl) {
  if (!artistProfileId || !eventEid) {
    return { success: false, error: 'Artist profile ID and event EID are required' };
  }

  try {
    const { data, error } = await supabase.rpc('admin_update_artist_promo_image', {
      p_artist_profile_id: artistProfileId,
      p_event_eid: eventEid,
      p_image_url: imageUrl || ''
    });

    if (error) {
      console.error('Error updating artist promo image:', error);
      return { success: false, error: error.message };
    }

    return { success: true, error: null };
  } catch (err) {
    console.error('Exception in updateArtistPromoImage:', err);
    return { success: false, error: err.message };
  }
}

/**
 * Upload image to Cloudflare for promo image usage
 * @param {File} file - Image file to upload
 * @param {string} artistProfileId - Artist profile ID for metadata
 * @returns {Promise<Object>} Upload result with image URL or error
 */
export async function uploadPromoImage(file, artistProfileId) {
  if (!file || !file.type.startsWith('image/')) {
    return { success: false, error: 'Please select a valid image file' };
  }

  if (!artistProfileId) {
    return { success: false, error: 'Artist profile ID is required' };
  }

  try {
    // Get current session for authentication
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      return { success: false, error: 'No active session' };
    }

    // Resize image before upload (reuse from SampleWorksUpload)
    const resizedFile = await resizeImage(file, 1200, 1200, 0.85);

    // Upload to Cloudflare Worker
    const formData = new FormData();
    formData.append('file', resizedFile);

    const workerUrl = 'https://art-battle-image-upload-production.simon-867.workers.dev';
    const uploadResponse = await fetch(workerUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
        'X-Artist-Profile-ID': artistProfileId,
        'X-Upload-Source': 'admin_promo_image'
      },
      body: formData
    });

    if (!uploadResponse.ok) {
      const error = await uploadResponse.text();
      return { success: false, error: `Upload failed: ${error}` };
    }

    const uploadResult = await uploadResponse.json();
    
    // Construct Cloudflare image URL
    const imageUrl = `https://imagedelivery.net/IGZfH_Pl-6S6csykNnXNJw/${uploadResult.id}/public`;
    
    return { success: true, imageUrl, cloudflareId: uploadResult.id, error: null };
  } catch (err) {
    console.error('Exception in uploadPromoImage:', err);
    return { success: false, error: err.message };
  }
}

/**
 * Resize image client-side before upload
 * @param {File} file - Original image file
 * @param {number} maxWidth - Maximum width
 * @param {number} maxHeight - Maximum height
 * @param {number} quality - JPEG quality (0-1)
 * @returns {Promise<File>} Resized image file
 */
export function resizeImage(file, maxWidth = 1200, maxHeight = 1200, quality = 0.85) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;

        // Calculate new dimensions
        if (width > height) {
          if (width > maxWidth) {
            height = Math.round((height * maxWidth) / width);
            width = maxWidth;
          }
        } else {
          if (height > maxHeight) {
            width = Math.round((width * maxHeight) / height);
            height = maxHeight;
          }
        }

        canvas.width = width;
        canvas.height = height;

        // Draw and compress
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = 'white'; // White background for JPEG
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);

        canvas.toBlob((blob) => {
          if (blob) {
            resolve(new File([blob], file.name, { type: 'image/jpeg' }));
          } else {
            reject(new Error('Failed to resize image'));
          }
        }, 'image/jpeg', quality);
      };
      img.onerror = () => reject(new Error('Failed to load image'));
      img.src = e.target.result;
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

/**
 * Get unique event EIDs for filtering
 * @returns {Promise<Object>} Array of event EIDs with names
 */
export async function getEventEidsForFilter() {
  try {
    // Get unique event EIDs from confirmations
    const { data: confirmationData, error: confirmationError } = await supabase
      .from('artist_confirmations')
      .select('event_eid')
      .eq('confirmation_status', 'confirmed')
      .is('withdrawn_at', null);

    if (confirmationError) {
      console.error('Error fetching event EIDs from confirmations:', confirmationError);
      return { data: [], error: confirmationError.message };
    }

    // Get unique EIDs
    const uniqueEids = [...new Set(confirmationData.map(record => record.event_eid))];

    // Get event details for these EIDs
    const { data: eventsData, error: eventsError } = await supabase
      .from('events')
      .select('eid, name, event_start_datetime')
      .in('eid', uniqueEids)
      .order('eid', { ascending: false });

    if (eventsError) {
      console.error('Error fetching event details:', eventsError);
      // Return just the EIDs if event details fail
      return {
        data: uniqueEids.map(eid => ({
          eid,
          name: eid,
          date: null
        })),
        error: null
      };
    }

    // Combine the data
    const eventMap = new Map(eventsData.map(event => [event.eid, event]));
    const uniqueEvents = uniqueEids.map(eid => {
      const event = eventMap.get(eid);
      return {
        eid,
        name: event?.name || eid,
        date: event?.event_start_datetime || null
      };
    });

    return { data: uniqueEvents, error: null };
  } catch (err) {
    console.error('Exception in getEventEidsForFilter:', err);
    return { data: [], error: err.message };
  }
}
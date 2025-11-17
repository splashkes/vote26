/**
 * Offers API Helper Functions
 * Handles CRUD operations for promotional offers management
 */

import { supabase } from './supabase';

/**
 * Fetch all offers with redemption counts
 * @param {Object} options - Query options
 * @param {string} options.searchTerm - Search term for name/description
 * @param {string} options.typeFilter - Filter by offer type
 * @param {boolean} options.activeOnly - Show only active offers
 * @returns {Promise<Object>} Result containing offers array and any error
 */
export async function getAllOffers(options = {}) {
  const {
    searchTerm = null,
    typeFilter = null,
    activeOnly = false
  } = options;

  try {
    let query = supabase
      .from('offers')
      .select('*')
      .order('display_order', { ascending: true })
      .order('name', { ascending: true });

    // Apply filters
    if (searchTerm) {
      query = query.or(`name.ilike.%${searchTerm}%,description.ilike.%${searchTerm}%`);
    }

    if (typeFilter) {
      query = query.eq('type', typeFilter);
    }

    if (activeOnly) {
      query = query.eq('active', true);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching offers:', error);
      return { data: null, error: error.message };
    }

    // Fetch actual redemption counts for each offer
    const offersWithCounts = await Promise.all(
      (data || []).map(async (offer) => {
        const { count } = await supabase
          .from('offer_redemptions')
          .select('*', { count: 'exact', head: true })
          .eq('offer_id', offer.id);

        return {
          ...offer,
          actual_redemptions: count || 0
        };
      })
    );

    return { data: offersWithCounts, error: null };
  } catch (err) {
    console.error('Exception in getAllOffers:', err);
    return { data: null, error: err.message };
  }
}

/**
 * Fetch single offer by ID with redemption count
 * @param {string} offerId - UUID of the offer
 * @returns {Promise<Object>} Result containing offer data and any error
 */
export async function getOffer(offerId) {
  try {
    const { data, error } = await supabase
      .from('offers')
      .select('*')
      .eq('id', offerId)
      .single();

    if (error) {
      console.error('Error fetching offer:', error);
      return { data: null, error: error.message };
    }

    // Fetch actual redemption count
    const { count } = await supabase
      .from('offer_redemptions')
      .select('*', { count: 'exact', head: true })
      .eq('offer_id', offerId);

    return {
      data: {
        ...data,
        actual_redemptions: count || 0
      },
      error: null
    };
  } catch (err) {
    console.error('Exception in getOffer:', err);
    return { data: null, error: err.message };
  }
}

/**
 * Create new offer
 * @param {Object} offerData - Offer data object
 * @returns {Promise<Object>} Result containing created offer and any error
 */
export async function createOffer(offerData) {
  try {
    // Clean up the data before insert
    const cleanData = {
      ...offerData,
      // Ensure geography_scope is an array
      geography_scope: offerData.geography_scope || [],
      // Remove any UI-only fields
      actual_redemptions: undefined
    };

    const { data, error } = await supabase
      .from('offers')
      .insert([cleanData])
      .select()
      .single();

    if (error) {
      console.error('Error creating offer:', error);
      return { data: null, error: error.message };
    }

    return { data, error: null };
  } catch (err) {
    console.error('Exception in createOffer:', err);
    return { data: null, error: err.message };
  }
}

/**
 * Update existing offer
 * @param {string} offerId - UUID of the offer to update
 * @param {Object} updates - Fields to update
 * @returns {Promise<Object>} Result containing updated offer and any error
 */
export async function updateOffer(offerId, updates) {
  try {
    // Clean up the data before update
    const cleanData = {
      ...updates,
      // Remove any UI-only fields
      actual_redemptions: undefined,
      // Ensure updated_at is set (if not handled by trigger)
      updated_at: new Date().toISOString()
    };

    const { data, error } = await supabase
      .from('offers')
      .update(cleanData)
      .eq('id', offerId)
      .select()
      .single();

    if (error) {
      console.error('Error updating offer:', error);
      return { data: null, error: error.message };
    }

    return { data, error: null };
  } catch (err) {
    console.error('Exception in updateOffer:', err);
    return { data: null, error: err.message };
  }
}

/**
 * Delete offer
 * @param {string} offerId - UUID of the offer to delete
 * @returns {Promise<Object>} Result containing success status and any error
 */
export async function deleteOffer(offerId) {
  try {
    const { error } = await supabase
      .from('offers')
      .delete()
      .eq('id', offerId);

    if (error) {
      console.error('Error deleting offer:', error);
      return { success: false, error: error.message };
    }

    return { success: true, error: null };
  } catch (err) {
    console.error('Exception in deleteOffer:', err);
    return { success: false, error: err.message };
  }
}

/**
 * Fetch all cities for geography scope selector
 * @returns {Promise<Object>} Result containing cities array and any error
 */
export async function getAllCities() {
  try {
    const { data, error } = await supabase
      .from('cities')
      .select('id, name')
      .order('name');

    if (error) {
      console.error('Error fetching cities:', error);
      return { data: null, error: error.message };
    }

    return { data: data || [], error: null };
  } catch (err) {
    console.error('Exception in getAllCities:', err);
    return { data: null, error: err.message };
  }
}

/**
 * Update display order for multiple offers (for drag-drop reordering)
 * @param {Array} orderUpdates - Array of {id, display_order} objects
 * @returns {Promise<Object>} Result containing success status and any error
 */
export async function bulkUpdateDisplayOrder(orderUpdates) {
  try {
    // Update each offer's display_order
    const updates = orderUpdates.map(({ id, display_order }) =>
      supabase
        .from('offers')
        .update({ display_order })
        .eq('id', id)
    );

    const results = await Promise.all(updates);

    // Check if any failed
    const errors = results.filter(r => r.error);
    if (errors.length > 0) {
      console.error('Some display order updates failed:', errors);
      return { success: false, error: 'Failed to update some offers' };
    }

    return { success: true, error: null };
  } catch (err) {
    console.error('Exception in bulkUpdateDisplayOrder:', err);
    return { success: false, error: err.message };
  }
}

/**
 * Get distinct offer types from existing offers
 * @returns {Promise<Object>} Result containing types array and any error
 */
export async function getOfferTypes() {
  try {
    const { data, error } = await supabase
      .from('offers')
      .select('type')
      .not('type', 'is', null)
      .order('type');

    if (error) {
      console.error('Error fetching offer types:', error);
      return { data: null, error: error.message };
    }

    // Get unique types
    const uniqueTypes = [...new Set(data.map(row => row.type))];

    return { data: uniqueTypes, error: null };
  } catch (err) {
    console.error('Exception in getOfferTypes:', err);
    return { data: null, error: err.message };
  }
}

/**
 * Validate offer data before save
 * @param {Object} offerData - Offer data to validate
 * @returns {Object} Object with isValid boolean and errors object
 */
export function validateOffer(offerData) {
  const errors = {};

  // Required fields
  if (!offerData.name || offerData.name.trim() === '') {
    errors.name = 'Offer name is required';
  } else if (offerData.name.length > 255) {
    errors.name = 'Offer name must be 255 characters or less';
  }

  // Date validation
  if (offerData.start_date && offerData.end_date) {
    const startDate = new Date(offerData.start_date);
    const endDate = new Date(offerData.end_date);
    if (endDate <= startDate) {
      errors.end_date = 'End date must be after start date';
    }
  }

  // RFM score validations (0-5 range, if 0 ignore it)
  const validateRFMPair = (min, max, label) => {
    if (min !== null && min !== undefined && max !== null && max !== undefined) {
      if (min < 0 || min > 5) {
        errors[`${label}_min`] = `${label} min score must be between 0-5`;
      }
      if (max < 0 || max > 5) {
        errors[`${label}_max`] = `${label} max score must be between 0-5`;
      }
      if (min > max && min !== 0) {
        errors[`${label}_range`] = `${label} min score must be ≤ max score`;
      }
    }
  };

  validateRFMPair(offerData.min_recency_score, offerData.max_recency_score, 'Recency');
  validateRFMPair(offerData.min_frequency_score, offerData.max_frequency_score, 'Frequency');
  validateRFMPair(offerData.min_monetary_score, offerData.max_monetary_score, 'Monetary');

  // Inventory validation
  if (offerData.total_inventory !== null && offerData.total_inventory !== undefined) {
    if (offerData.total_inventory < 0) {
      errors.total_inventory = 'Total inventory cannot be negative';
    }
  }

  if (offerData.redeemed_count !== null && offerData.redeemed_count !== undefined) {
    if (offerData.redeemed_count < 0) {
      errors.redeemed_count = 'Redeemed count cannot be negative';
    }
    if (offerData.total_inventory !== null && offerData.redeemed_count > offerData.total_inventory) {
      errors.inventory = 'Redeemed count cannot exceed total inventory';
    }
  }

  // Color validation (hex format)
  if (offerData.tile_color && !/^#[0-9A-F]{6}$/i.test(offerData.tile_color)) {
    errors.tile_color = 'Tile color must be in hex format (#RRGGBB)';
  }

  // URL validation
  if (offerData.redemption_link && offerData.redemption_link.trim() !== '') {
    try {
      new URL(offerData.redemption_link);
    } catch {
      errors.redemption_link = 'Redemption link must be a valid URL';
    }
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors
  };
}

/**
 * Resize image client-side before upload
 * @param {File} file - Original image file
 * @param {number} maxWidth - Maximum width
 * @param {number} maxHeight - Maximum height
 * @param {number} quality - JPEG quality (0-1)
 * @returns {Promise<File>} Resized image file
 */
export function resizeImage(file, maxWidth = 800, maxHeight = 800, quality = 0.85) {
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
 * Upload image to Cloudflare for offer image
 * @param {File} file - Image file to upload
 * @param {string} offerId - Offer ID for metadata
 * @returns {Promise<Object>} Upload result with image URL or error
 */
export async function uploadOfferImage(file, offerId) {
  if (!file || !file.type.startsWith('image/')) {
    return { success: false, error: 'Please select a valid image file' };
  }

  try {
    // Get current session for authentication
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      return { success: false, error: 'No active session' };
    }

    // Resize image before upload (800x800 for offers)
    const resizedFile = await resizeImage(file, 800, 800, 0.85);

    // Upload to Cloudflare Worker
    const formData = new FormData();
    formData.append('file', resizedFile);

    const workerUrl = 'https://art-battle-image-upload-production.simon-867.workers.dev';
    const uploadResponse = await fetch(workerUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
        'X-Offer-ID': offerId || 'new',
        'X-Upload-Source': 'admin_offer_image'
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
    console.error('Exception in uploadOfferImage:', err);
    return { success: false, error: err.message };
  }
}

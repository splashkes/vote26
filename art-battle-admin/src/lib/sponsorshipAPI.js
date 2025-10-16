/**
 * Sponsorship API Helper Functions
 * Handles communication with database for sponsorship management
 */

import { supabase } from './supabase';

// =====================================================
// PACKAGE TEMPLATES
// =====================================================

/**
 * Get all package templates
 */
export async function getAllPackageTemplates() {
  try {
    const { data, error } = await supabase
      .from('sponsorship_package_templates')
      .select('*')
      .order('display_order', { ascending: true })
      .order('name', { ascending: true });

    if (error) throw error;
    return { data: data || [], error: null };
  } catch (err) {
    console.error('Error fetching package templates:', err);
    return { data: null, error: err.message };
  }
}

/**
 * Create package template
 */
export async function createPackageTemplate(templateData) {
  try {
    const { data, error } = await supabase
      .from('sponsorship_package_templates')
      .insert([templateData])
      .select()
      .single();

    if (error) throw error;
    return { data, error: null };
  } catch (err) {
    console.error('Error creating package template:', err);
    return { data: null, error: err.message };
  }
}

/**
 * Update package template
 */
export async function updatePackageTemplate(id, updates) {
  try {
    const { data, error } = await supabase
      .from('sponsorship_package_templates')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return { data, error: null };
  } catch (err) {
    console.error('Error updating package template:', err);
    return { data: null, error: err.message };
  }
}

/**
 * Delete package template
 */
export async function deletePackageTemplate(id) {
  try {
    const { error } = await supabase
      .from('sponsorship_package_templates')
      .delete()
      .eq('id', id);

    if (error) throw error;
    return { success: true, error: null };
  } catch (err) {
    console.error('Error deleting package template:', err);
    return { success: false, error: err.message };
  }
}

// =====================================================
// CITY PRICING
// =====================================================

/**
 * Get city pricing for all templates
 */
export async function getAllCityPricing() {
  try {
    const { data, error } = await supabase
      .from('sponsorship_city_pricing')
      .select(`
        *,
        sponsorship_package_templates(id, name, slug),
        cities(id, name)
      `);

    if (error) throw error;
    return { data: data || [], error: null };
  } catch (err) {
    console.error('Error fetching city pricing:', err);
    return { data: null, error: err.message };
  }
}

/**
 * Set city pricing for a package template
 */
export async function setCityPricing(templateId, cityId, price, currency = 'USD') {
  try {
    const { data, error } = await supabase
      .from('sponsorship_city_pricing')
      .upsert({
        package_template_id: templateId,
        city_id: cityId,
        price,
        currency
      }, {
        onConflict: 'package_template_id,city_id'
      })
      .select()
      .single();

    if (error) throw error;
    return { data, error: null };
  } catch (err) {
    console.error('Error setting city pricing:', err);
    return { data: null, error: err.message };
  }
}

/**
 * Delete city pricing
 */
export async function deleteCityPricing(id) {
  try {
    const { error } = await supabase
      .from('sponsorship_city_pricing')
      .delete()
      .eq('id', id);

    if (error) throw error;
    return { success: true, error: null };
  } catch (err) {
    console.error('Error deleting city pricing:', err);
    return { success: false, error: err.message };
  }
}

// =====================================================
// MEDIA LIBRARY
// =====================================================

/**
 * Get sponsorship media
 */
export async function getSponsorshipMedia(eventId = null) {
  try {
    let query = supabase
      .from('sponsorship_media')
      .select('*')
      .order('display_order', { ascending: true })
      .order('created_at', { ascending: false });

    if (eventId) {
      query = query.or(`event_id.eq.${eventId},event_id.is.null`);
    } else {
      query = query.is('event_id', null);
    }

    const { data, error } = await query;

    if (error) throw error;
    return { data: data || [], error: null };
  } catch (err) {
    console.error('Error fetching sponsorship media:', err);
    return { data: null, error: err.message };
  }
}

/**
 * Create media entry
 */
export async function createSponsorshipMedia(mediaData) {
  try {
    const { data, error } = await supabase
      .from('sponsorship_media')
      .insert([mediaData])
      .select()
      .single();

    if (error) throw error;
    return { data, error: null };
  } catch (err) {
    console.error('Error creating sponsorship media:', err);
    return { data: null, error: err.message };
  }
}

/**
 * Update media entry
 */
export async function updateSponsorshipMedia(id, updates) {
  try {
    const { data, error } = await supabase
      .from('sponsorship_media')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return { data, error: null };
  } catch (err) {
    console.error('Error updating sponsorship media:', err);
    return { data: null, error: err.message };
  }
}

/**
 * Delete media entry
 */
export async function deleteSponsorshipMedia(id) {
  try {
    const { error } = await supabase
      .from('sponsorship_media')
      .delete()
      .eq('id', id);

    if (error) throw error;
    return { success: true, error: null };
  } catch (err) {
    console.error('Error deleting sponsorship media:', err);
    return { success: false, error: err.message };
  }
}

/**
 * Upload media to CloudFlare (via CF Worker - same as used for artist images)
 */
export async function uploadSponsorshipMediaFile(file, eventId, mediaType, metadata = {}) {
  if (!file || !file.type.startsWith('image/')) {
    return { success: false, error: 'Please select a valid image file' };
  }

  try {
    // Get current session for authentication
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      return { success: false, error: 'No active session' };
    }

    // Resize image before upload
    const resizedFile = await resizeImage(file, 1920, 1920, 0.85);

    // Upload to Cloudflare Worker
    const formData = new FormData();
    formData.append('file', resizedFile);

    const workerUrl = 'https://art-battle-image-upload-production.simon-867.workers.dev';
    const uploadResponse = await fetch(workerUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
        'X-Upload-Source': 'sponsorship_media'
      },
      body: formData
    });

    if (!uploadResponse.ok) {
      const errorText = await uploadResponse.text();
      throw new Error(`Upload failed: ${errorText}`);
    }

    const uploadResult = await uploadResponse.json();

    // Construct Cloudflare image URL
    const imageUrl = `https://imagedelivery.net/IGZfH_Pl-6S6csykNnXNJw/${uploadResult.id}/public`;

    return {
      success: true,
      imageUrl,
      cloudflareId: uploadResult.id
    };
  } catch (err) {
    console.error('Error uploading sponsorship media:', err);
    return {
      success: false,
      error: err.message
    };
  }
}

/**
 * Resize image client-side before upload
 * Preserves PNG transparency for logos
 */
function resizeImage(file, maxWidth = 1920, maxHeight = 1920, quality = 0.85) {
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

        const ctx = canvas.getContext('2d');

        // Determine if PNG based on file type
        const isPNG = file.type === 'image/png';

        // Only fill white background for non-PNG images (JPEG, etc.)
        if (!isPNG) {
          ctx.fillStyle = 'white';
          ctx.fillRect(0, 0, width, height);
        }

        ctx.drawImage(img, 0, 0, width, height);

        // Use PNG format for PNG files to preserve transparency
        const outputFormat = isPNG ? 'image/png' : 'image/jpeg';
        const outputQuality = isPNG ? 1.0 : quality; // PNG doesn't use quality param

        canvas.toBlob((blob) => {
          if (blob) {
            resolve(new File([blob], file.name, { type: outputFormat }));
          } else {
            reject(new Error('Failed to resize image'));
          }
        }, outputFormat, outputQuality);
      };
      img.onerror = () => reject(new Error('Failed to load image'));
      img.src = e.target.result;
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

// =====================================================
// EVENT PACKAGES
// =====================================================

/**
 * Get event sponsorship packages
 */
export async function getEventPackages(eventId) {
  try {
    const { data, error } = await supabase
      .from('event_sponsorship_packages')
      .select(`
        *,
        sponsorship_package_templates(id, name, slug, benefits)
      `)
      .eq('event_id', eventId)
      .order('display_order', { ascending: true });

    if (error) throw error;
    return { data: data || [], error: null };
  } catch (err) {
    console.error('Error fetching event packages:', err);
    return { data: null, error: err.message };
  }
}

/**
 * Enable/update event package
 */
export async function upsertEventPackage(eventId, packageData) {
  try {
    const { data, error } = await supabase
      .from('event_sponsorship_packages')
      .upsert({
        event_id: eventId,
        ...packageData
      })
      .select()
      .single();

    if (error) throw error;
    return { data, error: null };
  } catch (err) {
    console.error('Error upserting event package:', err);
    return { data: null, error: err.message };
  }
}

/**
 * Disable event package
 */
export async function disableEventPackage(id) {
  try {
    const { data, error } = await supabase
      .from('event_sponsorship_packages')
      .update({ active: false })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return { data, error: null };
  } catch (err) {
    console.error('Error disabling event package:', err);
    return { data: null, error: err.message };
  }
}

// =====================================================
// INVITES
// =====================================================

/**
 * Generate sponsorship invite
 */
export async function generateSponsorshipInvite(inviteData) {
  try {
    const { data, error } = await supabase.rpc('admin_generate_sponsorship_invite', {
      p_event_id: inviteData.eventId,
      p_prospect_name: inviteData.prospectName,
      p_prospect_email: inviteData.prospectEmail,
      p_prospect_company: inviteData.prospectCompany,
      p_discount_percent: inviteData.discountPercent,
      p_valid_until: inviteData.validUntil,
      p_notes: inviteData.notes,
      p_skip_multi_event: inviteData.skipMultiEvent || false
    });

    if (error) throw error;
    return { data: data[0], error: null };
  } catch (err) {
    console.error('Error generating sponsorship invite:', err);
    return { data: null, error: err.message };
  }
}

/**
 * Get event sponsorship summary
 */
export async function getEventSponsorshipSummary(eventId) {
  try {
    const { data, error } = await supabase.rpc('admin_get_event_sponsorship_summary', {
      p_event_id: eventId
    });

    if (error) throw error;
    return { data: data[0], error: null };
  } catch (err) {
    console.error('Error fetching sponsorship summary:', err);
    return { data: null, error: err.message };
  }
}

/**
 * Get cities for events in last 90 days + all future events
 */
export async function getRecentAndUpcomingCities() {
  try {
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

    const { data, error } = await supabase
      .from('events')
      .select('city_id, cities(id, name, countries(name, code, currency_code))')
      .or(`event_start_datetime.gte.${ninetyDaysAgo.toISOString()},event_start_datetime.is.null`)
      .not('city_id', 'is', null);

    if (error) throw error;

    // Deduplicate cities
    const uniqueCities = new Map();
    data?.forEach(event => {
      if (event.cities) {
        uniqueCities.set(event.cities.id, event.cities);
      }
    });

    const cities = Array.from(uniqueCities.values()).sort((a, b) =>
      a.name.localeCompare(b.name)
    );

    return { data: cities, error: null };
  } catch (err) {
    console.error('Error fetching recent and upcoming cities:', err);
    return { data: null, error: err.message };
  }
}

/**
 * Get all cities for pricing matrix (fallback)
 */
export async function getAllCities() {
  try {
    const { data, error } = await supabase
      .from('cities')
      .select('id, name, countries(name, code, currency_code)')
      .order('name', { ascending: true });

    if (error) throw error;
    return { data: data || [], error: null };
  } catch (err) {
    console.error('Error fetching cities:', err);
    return { data: null, error: err.message };
  }
}

// =====================================================
// PACKAGE IMAGES
// =====================================================

/**
 * Get images for a package template
 */
export async function getPackageImages(packageTemplateId) {
  try {
    const { data, error } = await supabase
      .from('sponsorship_package_images')
      .select('*')
      .eq('package_template_id', packageTemplateId)
      .order('display_order', { ascending: true })
      .order('created_at', { ascending: true });

    if (error) throw error;
    return { data: data || [], error: null };
  } catch (err) {
    console.error('Error fetching package images:', err);
    return { data: null, error: err.message };
  }
}

/**
 * Upload package image to Cloudflare and save to database
 */
export async function uploadPackageImage(file, packageTemplateId) {
  if (!file || !file.type.startsWith('image/')) {
    return { success: false, error: 'Please select a valid image file' };
  }

  if (!packageTemplateId) {
    return { success: false, error: 'Package template ID is required' };
  }

  try {
    // Get current session for authentication
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      return { success: false, error: 'No active session' };
    }

    // Resize image before upload
    const resizedFile = await resizePackageImage(file, 1200, 1200, 0.85);

    // Upload to Cloudflare Worker
    const formData = new FormData();
    formData.append('file', resizedFile);

    const workerUrl = 'https://art-battle-image-upload-production.simon-867.workers.dev';
    const uploadResponse = await fetch(workerUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
        'X-Upload-Source': 'admin_package_image'
      },
      body: formData
    });

    if (!uploadResponse.ok) {
      const errorText = await uploadResponse.text();
      throw new Error(`Upload failed: ${errorText}`);
    }

    const uploadResult = await uploadResponse.json();

    // Construct Cloudflare image URL
    const imageUrl = `https://imagedelivery.net/IGZfH_Pl-6S6csykNnXNJw/${uploadResult.id}/public`;

    // Get current max display_order
    const { data: existingImages } = await supabase
      .from('sponsorship_package_images')
      .select('display_order')
      .eq('package_template_id', packageTemplateId)
      .order('display_order', { ascending: false })
      .limit(1);

    const nextOrder = existingImages && existingImages.length > 0
      ? existingImages[0].display_order + 1
      : 0;

    // Save to database
    const { data, error } = await supabase
      .from('sponsorship_package_images')
      .insert([{
        package_template_id: packageTemplateId,
        url: imageUrl,
        cloudflare_id: uploadResult.id,
        display_order: nextOrder
      }])
      .select()
      .single();

    if (error) throw error;

    return { success: true, data, imageUrl, cloudflareId: uploadResult.id, error: null };
  } catch (err) {
    console.error('Exception in uploadPackageImage:', err);
    return { success: false, error: err.message };
  }
}

/**
 * Delete package image
 */
export async function deletePackageImage(id) {
  try {
    const { error } = await supabase
      .from('sponsorship_package_images')
      .delete()
      .eq('id', id);

    if (error) throw error;
    return { success: true, error: null };
  } catch (err) {
    console.error('Error deleting package image:', err);
    return { success: false, error: err.message };
  }
}

/**
 * Update package image display order
 */
export async function updatePackageImageOrder(id, displayOrder) {
  try {
    const { data, error } = await supabase
      .from('sponsorship_package_images')
      .update({ display_order: displayOrder, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return { data, error: null };
  } catch (err) {
    console.error('Error updating package image order:', err);
    return { data: null, error: err.message };
  }
}

/**
 * Resize image client-side before upload
 */
function resizePackageImage(file, maxWidth = 1200, maxHeight = 1200, quality = 0.85) {
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

        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);

        canvas.toBlob((blob) => {
          resolve(new File([blob], file.name, { type: 'image/jpeg' }));
        }, 'image/jpeg', quality);
      };
      img.onerror = reject;
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/**
 * Sponsorship API Functions
 */

import { supabase } from './supabase';

/**
 * Get sponsorship invite details by hash
 */
export async function getSponsorshipInvite(hash) {
  const { data, error } = await supabase.functions.invoke('sponsorship-invite-details', {
    body: { hash }
  });

  // When edge function returns non-2xx, Supabase puts the response body in 'data'
  // and creates a generic error. Check data.error first for the friendly message.
  if (data && data.error) {
    return { data: null, error: data.error };
  }

  if (error) {
    return { data: null, error: 'Unable to load invitation. Please check your link.' };
  }

  return { data: data || null, error: null };
}

/**
 * Track interaction (view, package_click, etc)
 */
export async function trackInteraction(hash, interactionType, packageId = null, metadata = {}) {
  try {
    const { data, error } = await supabase.functions.invoke('sponsorship-track-interaction', {
      body: {
        hash,
        interactionType,
        packageId,
        metadata
      }
    });

    if (error) {
      // Parse edge function debug info if available
      if (error.context) {
        try {
          const responseText = await error.context.text();
          console.log('Track interaction raw response:', responseText);
          const parsed = JSON.parse(responseText);

          if (parsed.debug) {
            console.error('Track interaction debug info:', parsed.debug);
          }
        } catch (parseError) {
          console.error('Could not parse track interaction error:', parseError);
        }
      }
      throw error;
    }
    return { data, error: null };
  } catch (err) {
    console.error('Error tracking interaction:', err);
    return { data: null, error: err.message };
  }
}

/**
 * Get sponsorship media assets (backgrounds, photos, logos)
 */
export async function getSponsorshipMedia() {
  try {
    const { data, error } = await supabase
      .from('sponsorship_media')
      .select('*')
      .eq('active', true)
      .is('event_id', null) // Only global media, not event-specific
      .order('display_order', { ascending: true });

    if (error) throw error;

    // Create a map of media_type to URL for easy lookup
    const mediaMap = {};
    data?.forEach(item => {
      mediaMap[item.media_type] = item.url;
    });

    return { data: mediaMap, error: null };
  } catch (err) {
    console.error('Error fetching sponsorship media:', err);
    return { data: {}, error: err.message };
  }
}

// Note: Removed direct database queries - all data fetching now done through edge functions
// - getCityPackagePricing: Data now comes from sponsorship-invite-details edge function
// - getUpcomingEventsInCity: Multi-event offers use placeholder events instead of real database queries

/**
 * Create Stripe checkout session for sponsorship purchase
 */
export async function createSponsorshipCheckout({
  inviteHash,
  mainPackageId,
  addonPackageIds = [],
  eventIds = [],
  buyerName,
  buyerEmail,
  buyerCompany,
  buyerPhone,
  successUrl,
  cancelUrl
}) {
  try {
    const { data, error } = await supabase.functions.invoke('sponsorship-stripe-checkout', {
      body: {
        invite_hash: inviteHash,
        main_package_id: mainPackageId,
        addon_package_ids: addonPackageIds,
        event_ids: eventIds,
        buyer_name: buyerName,
        buyer_email: buyerEmail,
        buyer_company: buyerCompany,
        buyer_phone: buyerPhone,
        success_url: successUrl,
        cancel_url: cancelUrl
      }
    });

    if (error) {
      // Parse edge function debug info if available
      if (error.context) {
        try {
          const responseText = await error.context.text();
          console.log('Edge function raw response:', responseText);
          const parsed = JSON.parse(responseText);

          if (parsed.debug) {
            console.error('Edge function debug info:', parsed.debug);
          }

          // Return the detailed error message
          throw new Error(parsed.error || error.message);
        } catch (parseError) {
          console.error('Could not parse error response:', parseError);
          throw error;
        }
      }
      throw error;
    }
    return { data, error: null };
  } catch (err) {
    console.error('Error creating checkout session:', err);
    return { data: null, error: err.message };
  }
}

/**
 * Get purchase details by fulfillment hash for post-payment customization
 */
export async function getPurchaseByFulfillmentHash(hash) {
  try {
    const { data, error } = await supabase.functions.invoke('sponsorship-fulfillment-details', {
      body: { hash }
    });

    if (error) throw error;
    return { data: data || null, error: null };
  } catch (err) {
    console.error('Error fetching purchase details:', err);
    return { data: null, error: err.message };
  }
}

/**
 * Validate phone number using Twilio
 */
export async function validatePhoneNumber(phoneNumber, countryCode = 'US') {
  try {
    const { data, error } = await supabase.functions.invoke('phone-validation', {
      body: { phoneNumber, countryCode }
    });

    if (error) throw error;
    return { data: data || null, error: null };
  } catch (err) {
    console.error('Error validating phone number:', err);
    return { data: null, error: err.message };
  }
}

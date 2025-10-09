/**
 * Sponsorship API Functions
 */

import { supabase } from './supabase';

/**
 * Get sponsorship invite details by hash
 */
export async function getSponsorshipInvite(hash) {
  try {
    const { data, error } = await supabase.functions.invoke('sponsorship-invite-details', {
      body: { hash }
    });

    if (error) throw error;
    return { data: data || null, error: null };
  } catch (err) {
    console.error('Error fetching sponsorship invite:', err);
    return { data: null, error: err.message };
  }
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

    if (error) throw error;
    return { data, error: null };
  } catch (err) {
    console.error('Error tracking interaction:', err);
    return { data: null, error: err.message };
  }
}

/**
 * Get city pricing for packages (for multi-event discount view)
 */
export async function getCityPackagePricing(cityId) {
  try {
    const { data, error } = await supabase
      .from('sponsorship_city_pricing')
      .select(`
        *,
        sponsorship_package_templates(id, name, slug, description, benefits, category)
      `)
      .eq('city_id', cityId);

    if (error) throw error;
    return { data: data || [], error: null };
  } catch (err) {
    console.error('Error fetching city pricing:', err);
    return { data: null, error: err.message };
  }
}

/**
 * Get upcoming events in a city (for multi-event discount)
 */
export async function getUpcomingEventsInCity(cityId, currentEventId) {
  try {
    const { data, error } = await supabase
      .from('events')
      .select('id, name, event_start_datetime, venue_id, venues(name)')
      .eq('city_id', cityId)
      .neq('id', currentEventId)
      .gte('event_start_datetime', new Date().toISOString())
      .order('event_start_datetime', { ascending: true })
      .limit(10);

    if (error) throw error;
    return { data: data || [], error: null };
  } catch (err) {
    console.error('Error fetching upcoming events:', err);
    return { data: null, error: err.message };
  }
}

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

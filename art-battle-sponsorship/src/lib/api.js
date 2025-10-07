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

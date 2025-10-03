import { supabase } from './supabase'

const SUPABASE_URL = 'https://db.artb.art'

/**
 * Fetch promo offers for a specific user hash
 * @param {string} userHash - The user's unique hash
 * @returns {Promise<Object>} - Offer data including eligible and ineligible offers
 */
export async function fetchOffersForHash(userHash) {
  try {
    const response = await fetch(`${SUPABASE_URL}/functions/v1/promo-offers-public?hash=${userHash}`)

    if (!response.ok) {
      throw new Error(`Failed to fetch offers: ${response.status}`)
    }

    return await response.json()
  } catch (error) {
    console.error('Error fetching offers:', error)
    throw error
  }
}

/**
 * Redeem a promo offer
 * @param {string} offerId - The offer ID
 * @param {string} userHash - The user's hash
 * @returns {Promise<Object>} - Redemption result
 */
export async function redeemOffer(offerId, userHash) {
  try {
    const response = await fetch(`${SUPABASE_URL}/functions/v1/promo-offers-redeem`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ offerId, userHash })
    })

    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.error || 'Redemption failed')
    }

    return await response.json()
  } catch (error) {
    console.error('Error redeeming offer:', error)
    throw error
  }
}

/**
 * Track offer view
 * @param {string} offerId - The offer ID
 * @param {string} userHash - The user's hash
 * @param {string} viewType - Type of view (list, detail)
 */
export async function trackOfferView(offerId, userHash, viewType = 'list') {
  try {
    await fetch(`${SUPABASE_URL}/functions/v1/promo-offers-track-view`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ offerId, userHash, viewType })
    })
  } catch (error) {
    console.error('Error tracking view:', error)
    // Don't throw - tracking failures shouldn't break the app
  }
}

/**
 * Admin: Fetch all promo offers
 * @returns {Promise<Array>} - List of all offers
 */
export async function fetchAllOffers() {
  const { data, error } = await supabase
    .from('offers')
    .select('*')
    .order('display_order', { ascending: true })
    .order('created_at', { ascending: false })

  if (error) throw error
  return data || []
}

/**
 * Admin: Create a new promo offer
 * @param {Object} offerData - The offer data
 * @returns {Promise<Object>} - Created offer
 */
export async function createOffer(offerData) {
  const { data, error } = await supabase
    .from('offers')
    .insert([offerData])
    .select()
    .single()

  if (error) throw error
  return data
}

/**
 * Admin: Update a promo offer
 * @param {string} offerId - The offer ID
 * @param {Object} updates - The updates
 * @returns {Promise<Object>} - Updated offer
 */
export async function updateOffer(offerId, updates) {
  const { data, error } = await supabase
    .from('offers')
    .update(updates)
    .eq('id', offerId)
    .select()
    .single()

  if (error) throw error
  return data
}

/**
 * Admin: Delete a promo offer
 * @param {string} offerId - The offer ID
 */
export async function deleteOffer(offerId) {
  const { error } = await supabase
    .from('offers')
    .delete()
    .eq('id', offerId)

  if (error) throw error
}

/**
 * Admin: Get offer analytics
 * @param {string} offerId - The offer ID
 * @returns {Promise<Object>} - Offer analytics
 */
export async function getOfferAnalytics(offerId) {
  const [views, redemptions] = await Promise.all([
    supabase
      .from('offer_views')
      .select('*', { count: 'exact', head: true })
      .eq('offer_id', offerId),
    supabase
      .from('offer_redemptions')
      .select('*', { count: 'exact', head: true })
      .eq('offer_id', offerId)
  ])

  return {
    totalViews: views.count || 0,
    totalRedemptions: redemptions.count || 0
  }
}

/**
 * Get available cities from events
 * @returns {Promise<Array>} - List of cities
 */
export async function fetchCities() {
  const { data, error } = await supabase
    .from('events')
    .select('city, region')
    .not('city', 'is', null)
    .order('city')

  if (error) throw error

  // Deduplicate cities
  const citySet = new Set()
  const cities = []

  data?.forEach(event => {
    const cityKey = `${event.city}|${event.region || ''}`
    if (!citySet.has(cityKey)) {
      citySet.add(cityKey)
      cities.push({
        name: event.city,
        region: event.region
      })
    }
  })

  return cities
}

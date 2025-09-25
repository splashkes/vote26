// SECURITY: NO DIRECT DATABASE QUERIES IN BROADCAST VERSION
// Admin functions use JWT-based permissions for security in the broadcast-only version

import { supabase } from './supabase.js';

// PERFORMANCE: Cache JWT claims and admin permissions per session
// Admin permissions only change when user logs out/in, so cache for entire session
let claimsCache = null;
let claimsCacheSessionId = null;

const adminPermissionCache = new Map();
let permissionCacheSessionId = null;

/**
 * Get current user's JWT claims with session-based caching
 * @returns {Promise<object|null>} - JWT claims object or null if not authenticated
 */
async function getCurrentUserClaims() {
  try {
    const { data: { session } } = await supabase.auth.getSession();

    // PERFORMANCE: Return cached claims if same session
    if (session?.access_token && claimsCacheSessionId === session.access_token) {
      return claimsCache;
    }

    if (session?.access_token) {
      // Parse JWT claims from access token
      const token = session.access_token;
      const payload = JSON.parse(atob(token.split('.')[1]));

      // PERFORMANCE: Cache claims for this entire session
      claimsCache = payload;
      claimsCacheSessionId = session.access_token;

      return payload;
    }
  } catch (error) {
    console.error('Error parsing JWT claims:', error);
  }

  // PERFORMANCE: Clear cache on no session
  claimsCache = null;
  claimsCacheSessionId = null;
  return null;
}

/**
 * Convert EID to UUID for admin users (who have RLS permissions to read events table)
 * @param {string} eid - Event EID (like "AB3039")
 * @returns {Promise<string|null>} - Event UUID or null if not found
 */
export async function getEventUuidFromEid(eid) {
  try {
    console.log(`🔍 [ADMIN] Converting EID ${eid} to UUID`);

    const { data, error } = await supabase
      .from('events')
      .select('id')
      .eq('eid', eid)
      .single();

    if (error) {
      console.error('Error converting EID to UUID:', error);
      return null;
    }

    console.log(`✅ [ADMIN] EID ${eid} -> UUID ${data.id}`);
    return data.id;
  } catch (error) {
    console.error('Error converting EID to UUID:', error);
    return null;
  }
}

/**
 * Check if a user is an admin for a specific event
 * JWT-BASED: Broadcast version reads admin permissions from JWT claims
 * @param {string} eventId - The event EID (like "AB3039")
 * @param {string} requiredLevel - Required admin level ('super', 'producer', 'photo', 'voting')
 * @param {string} phone - User's phone number (ignored, uses current session)
 * @returns {Promise<boolean>} - True if user has required admin level
 */
export async function checkEventAdminPermission(eventId, requiredLevel = 'voting', phone = null) {
  const { data: { session } } = await supabase.auth.getSession();
  const currentSessionToken = session?.access_token;

  // PERFORMANCE: Clear cache if session changed (user logged out/in)
  if (permissionCacheSessionId !== currentSessionToken) {
    adminPermissionCache.clear();
    permissionCacheSessionId = currentSessionToken;
  }

  // PERFORMANCE: Check cache first - permissions only change per session
  const cacheKey = `${eventId}:${requiredLevel}`;
  const cached = adminPermissionCache.get(cacheKey);

  if (cached !== undefined) {
    // PERFORMANCE: Use cached result, admin permissions don't change within session
    return cached;
  }

  console.log('🔑 [V2-BROADCAST] Checking admin permission from JWT claims (first time this session)');

  const claims = await getCurrentUserClaims();
  if (!claims || !claims.admin_events) {
    console.log('🚫 [V2-BROADCAST] No admin permissions in JWT');
    // PERFORMANCE: Cache negative result for this session
    adminPermissionCache.set(cacheKey, false);
    return false;
  }

  const userAdminLevel = claims.admin_events[eventId];
  if (!userAdminLevel) {
    console.log(`🚫 [V2-BROADCAST] No admin access for event ${eventId}`);
    // PERFORMANCE: Cache negative result for this session
    adminPermissionCache.set(cacheKey, false);
    return false;
  }

  const hasPermission = hasAdminPermission(userAdminLevel, requiredLevel);
  console.log(`✅ [V2-BROADCAST] Admin check: ${userAdminLevel} ${hasPermission ? 'meets' : 'does not meet'} ${requiredLevel} requirement`);

  // PERFORMANCE: Cache the result for this entire session
  adminPermissionCache.set(cacheKey, hasPermission);

  return hasPermission;
}

/**
 * Get user's admin level for a specific event
 * JWT-BASED: Broadcast version reads admin level from JWT claims
 * @param {string} eventId - The event EID (like "AB3039")
 * @param {string} phone - User's phone number (ignored, uses current session)
 * @returns {Promise<string|null>} - User's admin level or null
 */
export async function getUserAdminLevel(eventId, phone = null) {
  console.log('🔑 [V2-BROADCAST] Getting admin level from JWT claims');

  const claims = await getCurrentUserClaims();
  if (!claims || !claims.admin_events) {
    console.log('🚫 [V2-BROADCAST] No admin permissions in JWT');
    return null;
  }

  const userAdminLevel = claims.admin_events[eventId];
  console.log(`✅ [V2-BROADCAST] User admin level for event ${eventId}: ${userAdminLevel || 'none'}`);

  return userAdminLevel || null;
}

/**
 * Get all admins for an event (only works if user is admin)
 * DISABLED: Broadcast version returns empty array to prevent database queries
 * Note: This function requires database access and is disabled for security
 * @param {string} eventId - The event EID
 * @returns {Promise<Array>} - Always empty array in broadcast version
 */
export async function getEventAdmins(eventId) {
  console.log('🚫 [V2-BROADCAST] Event admins fetch disabled in broadcast version');
  return []; // Always return empty - no admin access in broadcast version
}

/**
 * Check if user has any admin access (simplified check)
 * JWT-BASED: Broadcast version reads admin access from JWT claims
 * @param {string} eventId - The event EID (like "AB3039")
 * @param {object} user - User object with phone/email (ignored, uses current session)
 * @returns {Promise<boolean>} - True if user has any admin access to event
 */
export async function isEventAdmin(eventId, user) {
  const { data: { session } } = await supabase.auth.getSession();
  const currentSessionToken = session?.access_token;

  // PERFORMANCE: Clear cache if session changed (user logged out/in)
  if (permissionCacheSessionId !== currentSessionToken) {
    adminPermissionCache.clear();
    permissionCacheSessionId = currentSessionToken;
  }

  // PERFORMANCE: Use session-based cache for admin access checks
  const cacheKey = `admin:${eventId}`;
  const cached = adminPermissionCache.get(cacheKey);

  if (cached !== undefined) {
    // PERFORMANCE: Return cached result - admin access doesn't change within session
    return cached;
  }

  console.log('🔑 [V2-BROADCAST] Checking admin access from JWT claims (first time this session)');

  const claims = await getCurrentUserClaims();
  if (!claims || !claims.admin_events) {
    console.log('🚫 [V2-BROADCAST] No admin permissions in JWT');
    // PERFORMANCE: Cache negative result for this session
    adminPermissionCache.set(cacheKey, false);
    return false;
  }

  const hasAccess = !!claims.admin_events[eventId];
  console.log(`✅ [V2-BROADCAST] User ${hasAccess ? 'has' : 'does not have'} admin access to event ${eventId}`);

  // PERFORMANCE: Cache result for this entire session
  adminPermissionCache.set(cacheKey, hasAccess);

  return hasAccess;
}

/**
 * Permission level hierarchy helper
 */
export const AdminLevels = {
  SUPER: 'super',
  PRODUCER: 'producer',
  PHOTO: 'photo',
  VOTING: 'voting'
};

/**
 * Check if one admin level includes permissions of another
 * @param {string} userLevel - User's admin level
 * @param {string} requiredLevel - Required admin level
 * @returns {boolean} - True if user level includes required permissions
 */
export function hasAdminPermission(userLevel, requiredLevel) {
  const hierarchy = {
    'super': ['super', 'producer', 'photo', 'voting'],
    'producer': ['producer', 'photo', 'voting'],
    'photo': ['photo', 'voting'],
    'voting': ['voting']
  };
  
  return hierarchy[userLevel]?.includes(requiredLevel) || false;
}
import { supabase } from './supabase';

/**
 * Check if a user is an admin for a specific event
 * @param {string} eventId - The event UUID
 * @param {string} requiredLevel - Required admin level ('super', 'producer', 'photo', 'voting')
 * @param {string} phone - User's phone number (optional if authenticated)
 * @returns {Promise<boolean>} - True if user has required permission
 */
export async function checkEventAdminPermission(eventId, requiredLevel = 'voting', phone = null) {
  try {
    const { data, error } = await supabase
      .rpc('check_event_admin_permission', {
        p_event_id: eventId,
        p_required_level: requiredLevel,
        p_user_phone: phone
      });

    if (error) {
      console.error('Error checking admin permission:', error);
      return false;
    }

    return data || false;
  } catch (error) {
    console.error('Error checking admin permission:', error);
    return false;
  }
}

/**
 * Get user's admin level for a specific event
 * @param {string} eventId - The event UUID
 * @param {string} phone - User's phone number (optional if authenticated)
 * @returns {Promise<string|null>} - Admin level or null if not admin
 */
export async function getUserAdminLevel(eventId, phone = null) {
  try {
    const { data, error } = await supabase
      .rpc('get_user_admin_level', {
        p_event_id: eventId,
        p_user_phone: phone
      });

    if (error) {
      console.error('Error getting admin level:', error);
      return null;
    }

    return data;
  } catch (error) {
    console.error('Error getting admin level:', error);
    return null;
  }
}

/**
 * Get all admins for an event (only works if user is admin)
 * @param {string} eventId - The event UUID
 * @returns {Promise<Array>} - Array of admin records
 */
export async function getEventAdmins(eventId) {
  try {
    const { data, error } = await supabase
      .from('event_admins')
      .select('*')
      .eq('event_id', eventId)
      .order('admin_level', { ascending: true });

    if (error) {
      console.error('Error fetching event admins:', error);
      return [];
    }

    return data || [];
  } catch (error) {
    console.error('Error fetching event admins:', error);
    return [];
  }
}

/**
 * Check if user has any admin access (simplified check)
 * @param {string} eventId - The event UUID
 * @param {object} user - User object with phone/email
 * @returns {Promise<boolean>} - True if user is any kind of admin
 */
export async function isEventAdmin(eventId, user) {
  if (!user || !eventId) return false;
  
  // Check by phone first (most common)
  if (user.phone) {
    const hasPermission = await checkEventAdminPermission(eventId, 'voting', user.phone);
    if (hasPermission) return true;
  }
  
  // If authenticated, database will use auth.uid() automatically
  const hasPermission = await checkEventAdminPermission(eventId, 'voting', null);
  return hasPermission;
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
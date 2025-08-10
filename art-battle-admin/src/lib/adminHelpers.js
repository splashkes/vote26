import { supabase } from './supabase';

/**
 * Check if a user has admin access to a specific event
 * Uses the separate ABHQ admin system
 * @param {string} eventId - The event UUID
 * @param {string} requiredLevel - Required admin level ('super', 'producer', 'photo', 'voting')
 * @param {string} email - User's email address (optional if authenticated)
 * @returns {Promise<boolean>} - True if user has required permission
 */
export async function checkEventAdminPermission(eventId, requiredLevel = 'voting', email = null) {
  try {
    // Get current user's email if not provided
    if (!email) {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user?.email) return false;
      email = user.email;
    }

    // Query abhq_admin_users table
    const { data, error } = await supabase
      .from('abhq_admin_users')
      .select('level, events_access')
      .eq('email', email)
      .eq('active', true)
      .single();

    if (error || !data) {
      console.error('Error checking admin permission:', error);
      return false;
    }

    // Super admins have access to all events
    if (data.level === 'super') {
      return true;
    }

    // Check if user has access to this specific event
    if (!data.events_access || !data.events_access.includes(eventId)) {
      return false;
    }

    // Check permission hierarchy: super > producer > photo > voting
    const levels = ['voting', 'photo', 'producer', 'super'];
    const userLevelIndex = levels.indexOf(data.level);
    const requiredLevelIndex = levels.indexOf(requiredLevel);
    
    return userLevelIndex >= requiredLevelIndex;
  } catch (error) {
    console.error('Error checking admin permission:', error);
    return false;
  }
}

/**
 * Get user's admin level for a specific event
 * @param {string} eventId - The event UUID
 * @param {string} email - User's email address (optional if authenticated)
 * @returns {Promise<string|null>} - Admin level or null if not admin
 */
export async function getUserAdminLevel(eventId, email = null) {
  try {
    // Get current user's email if not provided
    if (!email) {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user?.email) return null;
      email = user.email;
    }

    // Query abhq_admin_users table
    const { data, error } = await supabase
      .from('abhq_admin_users')
      .select('level, events_access')
      .eq('email', email)
      .eq('active', true)
      .single();

    if (error || !data) {
      console.error('Error getting admin level:', error);
      return null;
    }

    // Super admins have access to all events
    if (data.level === 'super') {
      return data.level;
    }

    // Check if user has access to this specific event
    if (!data.events_access || !data.events_access.includes(eventId)) {
      return null;
    }

    return data.level;
  } catch (error) {
    console.error('Error getting admin level:', error);
    return null;
  }
}

/**
 * Get all events where user is an admin
 * Uses the separate ABHQ admin system
 * @param {string} email - User's email address (optional if authenticated)
 * @returns {Promise<Array>} - Array of events with admin permissions
 */
export async function getUserAdminEvents(email = null) {
  try {
    // This function is now handled directly in AuthContext
    // to avoid duplication, but keeping it for compatibility
    console.warn('getUserAdminEvents is deprecated, use AuthContext.adminEvents instead');
    return [];
  } catch (error) {
    console.error('Error getting admin events:', error);
    return [];
  }
}

/**
 * Add an admin to an event
 * @param {string} eventId - The event UUID
 * @param {string} email - Admin's email address
 * @param {string} level - Admin level ('super', 'producer', 'photo', 'voting')
 * @returns {Promise<boolean>} - True if successful
 */
export async function addEventAdmin(eventId, email, level = 'voting') {
  try {
    // Get existing admin record
    const { data: existing, error: fetchError } = await supabase
      .from('abhq_admin_users')
      .select('events_access')
      .eq('email', email)
      .single();

    if (fetchError && fetchError.code !== 'PGRST116') {
      console.error('Error fetching existing admin:', fetchError);
      return false;
    }

    if (existing) {
      // Update existing admin to add event access
      const currentAccess = existing.events_access || [];
      if (!currentAccess.includes(eventId)) {
        currentAccess.push(eventId);
      }

      const { error: updateError } = await supabase
        .from('abhq_admin_users')
        .update({
          events_access: currentAccess,
          level: level
        })
        .eq('email', email);

      if (updateError) {
        console.error('Error updating admin access:', updateError);
        return false;
      }
    } else {
      // Create new admin record
      const { error: insertError } = await supabase
        .from('abhq_admin_users')
        .insert({
          email: email,
          level: level,
          events_access: [eventId],
          active: true,
          created_at: new Date().toISOString()
        });

      if (insertError) {
        console.error('Error creating admin:', insertError);
        return false;
      }
    }

    return true;
  } catch (error) {
    console.error('Error adding event admin:', error);
    return false;
  }
}

/**
 * Remove an admin from an event
 * @param {string} eventId - The event UUID
 * @param {string} email - Admin's email address
 * @returns {Promise<boolean>} - True if successful
 */
export async function removeEventAdmin(eventId, email) {
  try {
    // Get existing admin record
    const { data: existing, error: fetchError } = await supabase
      .from('abhq_admin_users')
      .select('events_access')
      .eq('email', email)
      .single();

    if (fetchError || !existing) {
      console.error('Admin not found:', email);
      return false;
    }

    // Remove event from access list
    const updatedAccess = (existing.events_access || []).filter(id => id !== eventId);

    const { error: updateError } = await supabase
      .from('abhq_admin_users')
      .update({
        events_access: updatedAccess
      })
      .eq('email', email);

    if (updateError) {
      console.error('Error removing admin access:', updateError);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Error removing event admin:', error);
    return false;
  }
}
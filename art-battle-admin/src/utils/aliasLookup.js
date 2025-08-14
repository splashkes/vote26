import { supabase } from '../lib/supabase';

/**
 * Comprehensive alias lookup utility for admin functions
 * Finds artist profiles by direct entry_id, aliases, email, phone, or name
 * 
 * @param {Array} identifiers - Array of artist numbers, entry_ids, emails, phones, or names to lookup
 * @param {String} lookupType - 'comprehensive' for full lookup, 'basic' for entry_id and aliases only
 * @returns {Object} Results with profiles, aliases, foundByAlias flags, and not found list
 */
export const performAliasLookup = async (identifiers, lookupType = 'basic') => {
  try {
    // Get current session for authentication
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      throw new Error('Not authenticated');
    }

    console.log(`Performing alias lookup for ${identifiers.length} identifiers (${lookupType})`);

    const response = await fetch(`https://xsqdkubgyqwpyvfltnrf.supabase.co/functions/v1/admin-alias-lookup`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
        'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhzcWRrdWJneXF3cHl2Zmx0bnJmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTM0MjE2OTYsImV4cCI6MjA2ODk5NzY5Nn0.hY8v8IDZQTcdAFa_OvQNFd1CyvabGcOZZMn_J6c4c2U'
      },
      body: JSON.stringify({ 
        identifiers,
        lookupType 
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
    }

    const result = await response.json();
    console.log(`Alias lookup complete:`, result.stats);
    
    return result.data;
  } catch (error) {
    console.error('Error in alias lookup:', error);
    throw error;
  }
};

/**
 * Enhanced batch artist profile lookup with alias support
 * Replaces the basic admin-artist-profiles call with alias lookup capabilities
 * 
 * @param {Array} artistNumbers - Array of artist numbers to lookup
 * @returns {Object} Profiles object with artist_number as keys, includes foundByAlias flags
 */
export const getArtistProfilesWithAliases = async (artistNumbers) => {
  try {
    const aliasResults = await performAliasLookup(artistNumbers, 'basic');
    
    // Convert the results to the expected format for the existing code
    const profiles = {};
    
    artistNumbers.forEach(artistNumber => {
      const profile = aliasResults.profiles[artistNumber];
      if (profile) {
        profiles[artistNumber] = profile;
      }
    });
    
    console.log(`Artist profiles with aliases: ${Object.keys(profiles).length}/${artistNumbers.length} found`);
    console.log(`Found by alias: ${aliasResults.foundByAlias.length} profiles`);
    
    return { profiles };
  } catch (error) {
    console.error('Error getting artist profiles with aliases:', error);
    return { profiles: {} };
  }
};

/**
 * Get a badge component for profiles found by alias
 * @param {Object} profile - Artist profile object
 * @returns {String} Badge text or null
 */
export const getAliasBadgeText = (profile) => {
  // Only show badge if found by alias AND has actual profile data (name)
  return (profile?.foundByAlias && profile?.name) ? 'FOUND BY ALIAS' : null;
};
/**
 * Helper functions for managing buyer information during bidding process
 */

/**
 * Check if buyer information is missing or incomplete
 * @param {Object} person - The person object from the database
 * @returns {boolean} - True if buyer info is missing, false if complete
 */
export const isBuyerInfoMissing = (person) => {
  if (!person) return true;
  
  // Required fields for payment processing
  const hasFirstName = person.first_name && person.first_name.trim().length > 0;
  const hasLastName = person.last_name && person.last_name.trim().length > 0;
  
  // Check if first/last name are generic defaults
  const isGenericName = (
    person.first_name === 'User' ||
    person.last_name === 'User' ||
    person.name === 'User' ||
    !hasFirstName ||
    !hasLastName
  );

  return isGenericName;
};

/**
 * Get buyer info missing flag and details
 * @param {Object} person - The person object from the database
 * @returns {Object} - Object with missing flag and specific missing fields
 */
export const getBuyerInfoStatus = (person) => {
  const isMissing = isBuyerInfoMissing(person);
  
  const missingFields = [];
  if (!person?.first_name || person.first_name.trim() === '' || person.first_name === 'User') {
    missingFields.push('first_name');
  }
  if (!person?.last_name || person.last_name.trim() === '' || person.last_name === 'User') {
    missingFields.push('last_name');
  }

  return {
    isMissing,
    missingFields,
    existingInfo: {
      first_name: person?.first_name || '',
      last_name: person?.last_name || '',
      nickname: person?.nickname || '',
      email: person?.email || ''
    }
  };
};

/**
 * Extract phone number from user object (supports multiple auth providers)
 * @param {Object} user - The auth user object
 * @param {Object} person - The person record (may have phone in different fields)
 * @returns {string|null} - The normalized phone number or null
 */
export const extractUserPhone = (user, person = null) => {
  // Try to get phone from auth user first
  if (user?.phone) return user.phone;
  if (user?.user_metadata?.phone) return user.user_metadata.phone;
  
  // Fallback to person record
  if (person?.auth_phone) return person.auth_phone;
  if (person?.phone_number) return person.phone_number;
  if (person?.phone) return person.phone;
  
  return null;
};

/**
 * Normalize phone number format
 * @param {string} phone - Raw phone number
 * @returns {string} - Normalized phone number with + prefix
 */
export const normalizePhone = (phone) => {
  if (!phone) return '';
  
  // Remove all non-digits
  const digits = phone.replace(/\D/g, '');
  
  // Add + prefix if not present and has enough digits
  if (digits.length >= 10 && !phone.startsWith('+')) {
    return '+' + digits;
  }
  
  return phone.startsWith('+') ? phone : '+' + digits;
};

/**
 * Format display name from person object
 * @param {Object} person - The person object
 * @returns {string} - Formatted display name
 */
export const formatDisplayName = (person) => {
  if (!person) return 'Unknown User';
  
  // Use nickname if available
  if (person.nickname && person.nickname !== 'User') {
    return person.nickname;
  }
  
  // Use first + last name
  if (person.first_name && person.last_name && 
      person.first_name !== 'User' && person.last_name !== 'User') {
    return `${person.first_name} ${person.last_name}`;
  }
  
  // Use name field
  if (person.name && person.name !== 'User') {
    return person.name;
  }
  
  // Fallback to phone number
  const phone = extractUserPhone(null, person);
  if (phone) {
    return `User (${phone})`;
  }
  
  return 'Unknown User';
};
// Privacy protection utilities for displaying user information

/**
 * Mask a phone number, showing only last 4 digits
 * @param {string} phone - Phone number to mask
 * @returns {string} Masked phone number
 */
export const maskPhoneNumber = (phone) => {
  if (!phone || phone.length < 4) return '****';
  
  // Remove all non-numeric characters
  const cleaned = phone.replace(/\D/g, '');
  
  // Return last 4 digits with asterisks
  if (cleaned.length >= 4) {
    return `***-${cleaned.slice(-4)}`;
  }
  
  return '****';
};

/**
 * Mask a person's name, showing first name and last initial
 * @param {string} name - Full name to mask
 * @returns {string} Masked name
 */
export const maskName = (name) => {
  if (!name) return 'Anonymous';
  
  const parts = name.trim().split(/\s+/);
  
  if (parts.length === 1) {
    // Only first name
    return parts[0];
  }
  
  // First name + last initial
  const firstName = parts[0];
  const lastInitial = parts[parts.length - 1][0]?.toUpperCase() || '';
  
  return `${firstName} ${lastInitial}.`;
};

/**
 * Mask email address
 * @param {string} email - Email to mask
 * @returns {string} Masked email
 */
export const maskEmail = (email) => {
  if (!email || !email.includes('@')) return '****@****.***';
  
  const [username, domain] = email.split('@');
  
  // Show first 2 characters of username
  const maskedUsername = username.length > 2 
    ? username.slice(0, 2) + '*'.repeat(Math.min(username.length - 2, 5))
    : '****';
    
  // Show first character of domain
  const [domainName, extension] = domain.split('.');
  const maskedDomain = domainName[0] + '*'.repeat(Math.min(domainName.length - 1, 5));
  
  return `${maskedUsername}@${maskedDomain}.${extension || 'com'}`;
};

/**
 * Get privacy-safe display of bidder info
 * @param {object} bidder - Bidder object with name, phone, email
 * @param {boolean} showFull - Whether to show full info (for admins)
 * @returns {object} Privacy-safe bidder info
 */
export const getPrivacyBidderInfo = (bidder, showFull = false) => {
  if (!bidder) return { name: 'Anonymous', phone: '****', email: '****' };
  
  if (showFull) {
    return {
      name: bidder.name || bidder.nickname || 'Anonymous',
      phone: bidder.phone || bidder.phone_number || '****',
      email: bidder.email || '****'
    };
  }
  
  return {
    name: maskName(bidder.name || bidder.nickname),
    phone: maskPhoneNumber(bidder.phone || bidder.phone_number),
    email: maskEmail(bidder.email)
  };
};
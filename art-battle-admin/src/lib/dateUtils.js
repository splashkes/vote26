/**
 * Date utility functions for artist workflow interface
 * Provides time ago formatting and recent activity indicators
 */

/**
 * Get time ago string from a date
 * @param {string|Date} date - The date to format
 * @returns {string} Time ago string (e.g., "2h ago", "3d ago", "1w ago")
 */
export const getTimeAgo = (date) => {
  if (!date) return 'Unknown';

  const now = new Date();
  const targetDate = new Date(date);
  const diffInMs = now - targetDate;

  // Handle future dates
  if (diffInMs < 0) return 'Just now';

  const diffInMinutes = Math.floor(diffInMs / (1000 * 60));
  const diffInHours = Math.floor(diffInMs / (1000 * 60 * 60));
  const diffInDays = Math.floor(diffInMs / (1000 * 60 * 60 * 24));
  const diffInWeeks = Math.floor(diffInDays / 7);
  const diffInMonths = Math.floor(diffInDays / 30);
  const diffInYears = Math.floor(diffInDays / 365);

  // Less than 1 minute
  if (diffInMinutes < 1) return 'Just now';

  // Less than 1 hour
  if (diffInMinutes < 60) return `${diffInMinutes}m ago`;

  // Less than 24 hours
  if (diffInHours < 24) return `${diffInHours}h ago`;

  // Less than 7 days
  if (diffInDays < 7) return `${diffInDays}d ago`;

  // Less than 4 weeks
  if (diffInWeeks < 4) return `${diffInWeeks}w ago`;

  // Less than 12 months
  if (diffInMonths < 12) return `${diffInMonths}mo ago`;

  // More than a year
  return `${diffInYears}y ago`;
};

/**
 * Check if a date is within the last 36 hours (recent activity)
 * @param {string|Date} date - The date to check
 * @returns {boolean} True if within last 36 hours
 */
export const isRecentActivity = (date) => {
  if (!date) return false;

  const now = new Date();
  const targetDate = new Date(date);
  const diffInMs = now - targetDate;
  const thirtysixtHoursInMs = 36 * 60 * 60 * 1000; // 36 hours in milliseconds

  return diffInMs >= 0 && diffInMs <= thirtysixtHoursInMs;
};

/**
 * Format a date for display with time ago and optional full date tooltip
 * @param {string|Date} date - The date to format
 * @returns {object} Object with timeAgo, isRecent, and fullDate properties
 */
export const formatDateForDisplay = (date) => {
  if (!date) {
    return {
      timeAgo: 'Unknown',
      isRecent: false,
      fullDate: 'Unknown date'
    };
  }

  const targetDate = new Date(date);

  return {
    timeAgo: getTimeAgo(date),
    isRecent: isRecentActivity(date),
    fullDate: targetDate.toLocaleString('en-US', {
      weekday: 'short',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    })
  };
};

/**
 * Sort array of items by date field in descending order (newest first)
 * @param {Array} items - Array of items to sort
 * @param {string} dateField - The date field to sort by (e.g., 'created_at')
 * @returns {Array} Sorted array with newest items first
 */
export const sortByNewestFirst = (items, dateField = 'created_at') => {
  if (!Array.isArray(items)) return [];

  return [...items].sort((a, b) => {
    const dateA = new Date(a[dateField] || 0);
    const dateB = new Date(b[dateField] || 0);
    return dateB - dateA; // Descending order (newest first)
  });
};

/**
 * Get CSS color for recent activity indicator
 * @param {boolean} isRecent - Whether the activity is recent
 * @returns {string} CSS color value
 */
export const getRecentActivityColor = (isRecent) => {
  return isRecent ? 'var(--green-9)' : 'transparent';
};
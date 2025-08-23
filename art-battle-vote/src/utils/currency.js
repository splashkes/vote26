/**
 * Currency utility functions for Art Battle multi-currency support
 */

/**
 * Get currency information from event object with fallback to USD
 * @param {Object} event - Event object from API
 * @returns {Object} - {code: "USD", symbol: "$"}
 */
export const getCurrencyFromEvent = (event) => {
  return {
    code: event?.currency_code || 'USD',
    symbol: event?.currency_symbol || '$'
  };
};

/**
 * Format currency for bid buttons: "BID CAD$330"
 * @param {number} amount - Bid amount
 * @param {string} currencyCode - Currency code (CAD, USD, etc.)
 * @param {string} currencySymbol - Currency symbol ($, £, etc.)
 * @returns {string} - Formatted bid button text
 */
export const formatBidButton = (amount, currencyCode, currencySymbol) => {
  return `BID ${currencyCode}${currencySymbol}${Math.round(amount)}`;
};

/**
 * Format currency for current amount displays: "CAD$290"
 * @param {number} amount - Amount to display
 * @param {string} currencyCode - Currency code (CAD, USD, etc.)
 * @param {string} currencySymbol - Currency symbol ($, £, etc.)
 * @returns {string} - Formatted display amount
 */
export const formatDisplayAmount = (amount, currencyCode, currencySymbol) => {
  return `${currencyCode}${currencySymbol}${Math.round(amount)}`;
};

/**
 * Format currency for confirmation dialogs: "CAD$330.00"
 * @param {number} amount - Amount to display
 * @param {string} currencyCode - Currency code (CAD, USD, etc.)
 * @param {string} currencySymbol - Currency symbol ($, £, etc.)
 * @returns {string} - Formatted confirmation amount with decimals
 */
export const formatConfirmationAmount = (amount, currencyCode, currencySymbol) => {
  return `${currencyCode}${currencySymbol}${amount.toFixed(2)}`;
};

/**
 * Format currency for bid history: "$990" (symbol only for cleaner display)
 * @param {number} amount - Amount to display
 * @param {string} currencySymbol - Currency symbol ($, £, etc.)
 * @returns {string} - Formatted history amount with symbol only
 */
export const formatHistoryAmount = (amount, currencySymbol) => {
  return `${currencySymbol}${Math.round(amount)}`;
};

/**
 * Format enhanced minimum bid text
 * @param {number} currentBid - Current top bid amount (0 if no bids)
 * @param {number} minimumBid - Minimum next bid amount
 * @param {string} currencyCode - Currency code (CAD, USD, etc.)
 * @param {string} currencySymbol - Currency symbol ($, £, etc.)
 * @returns {string} - Enhanced minimum bid text
 */
export const formatMinimumBidText = (currentBid, minimumBid, currencyCode, currencySymbol) => {
  if (currentBid === 0) {
    // No bids case
    return `Opening bid minimum: ${currencyCode}${currencySymbol}${Math.round(minimumBid)}`;
  } else {
    // With bids case
    const increment = minimumBid - currentBid;
    const percentIncrease = Math.round((increment / currentBid) * 100);
    return `Current top bid: ${currencyCode}${currencySymbol}${Math.round(currentBid)}; Next bid (${percentIncrease}% or ${currencySymbol}${increment} min): ${currencyCode}${currencySymbol}${Math.round(minimumBid)}`;
  }
};

/**
 * Format currency for event utility (use event object directly)
 * @param {number} amount - Amount to format
 * @param {Object} event - Event object with currency info
 * @param {string} type - Format type: 'button', 'display', 'confirmation', 'history'
 * @returns {string} - Formatted currency string
 */
export const formatCurrencyFromEvent = (amount, event, type = 'display') => {
  const { code, symbol } = getCurrencyFromEvent(event);
  
  switch (type) {
    case 'button':
      return formatBidButton(amount, code, symbol);
    case 'display':
      return formatDisplayAmount(amount, code, symbol);
    case 'confirmation':
      return formatConfirmationAmount(amount, code, symbol);
    case 'history':
      return formatHistoryAmount(amount, symbol);
    default:
      return formatDisplayAmount(amount, code, symbol);
  }
};
/**
 * Convert a country code (ISO 3166-1 alpha-2) to a flag emoji
 * @param {string} countryCode - Two letter country code (e.g., 'US', 'CA', 'GB')
 * @returns {string} Flag emoji or empty string if invalid
 */
export const getCountryFlag = (countryCode) => {
  if (!countryCode || typeof countryCode !== 'string' || countryCode.length !== 2) {
    return '';
  }

  const codePoints = countryCode
    .toUpperCase()
    .split('')
    .map(char => 127397 + char.charCodeAt(0));

  return String.fromCodePoint(...codePoints);
};

/**
 * Format city name with country flag
 * @param {string} cityName - City name
 * @param {string} countryCode - Two letter country code
 * @returns {string} Formatted string with flag emoji
 */
export const formatCityWithFlag = (cityName, countryCode) => {
  const flag = getCountryFlag(countryCode);
  return flag ? `${flag} ${cityName}` : cityName;
};

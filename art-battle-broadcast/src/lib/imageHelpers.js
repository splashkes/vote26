/**
 * Image URL helper functions
 * Handles both legacy images and new Cloudflare Images
 */

// Cloudflare delivery base URL
const CLOUDFLARE_DELIVERY_URL = 'https://imagedelivery.net/IGZfH_Pl-6S6csykNnXNJw';

/**
 * Get image URLs for an artwork
 * Intelligently handles both legacy and Cloudflare images
 * 
 * @param {Object} artwork - The artwork object
 * @param {Object} mediaFile - Optional media file object if available
 * @returns {Object} Object with thumbnail, compressed, and original URLs
 */
export function getArtworkImageUrls(artwork, mediaFile = null) {
  // If we have a media file with cloudflare_id, use Cloudflare variants
  if (mediaFile?.cloudflare_id) {
    return {
      thumbnail: `${CLOUDFLARE_DELIVERY_URL}/${mediaFile.cloudflare_id}/thumbnail`,
      compressed: `${CLOUDFLARE_DELIVERY_URL}/${mediaFile.cloudflare_id}/public`, 
      original: `${CLOUDFLARE_DELIVERY_URL}/${mediaFile.cloudflare_id}/original`,
      isCloudflare: true
    };
  }
  
  // If media file has URLs but no cloudflare_id, use those (new non-CF uploads)
  if (mediaFile) {
    return {
      thumbnail: mediaFile.thumbnail_url || mediaFile.compressed_url || mediaFile.original_url,
      compressed: mediaFile.compressed_url || mediaFile.original_url,
      original: mediaFile.original_url,
      isCloudflare: false
    };
  }
  
  // Legacy artwork object with image properties
  if (artwork) {
    return {
      thumbnail: artwork.thumbnail || artwork.image || artwork.image_url,
      compressed: artwork.compressed || artwork.image || artwork.image_url,
      original: artwork.image || artwork.image_url || artwork.original_url,
      isCloudflare: false
    };
  }
  
  // Fallback
  return {
    thumbnail: null,
    compressed: null,
    original: null,
    isCloudflare: false
  };
}

/**
 * Get the best image URL for a specific use case
 * @param {Object} artwork - The artwork object
 * @param {Object} mediaFile - Optional media file object
 * @param {string} variant - 'thumbnail', 'compressed', or 'original'
 * @returns {string|null} The image URL or null
 */
export function getImageUrl(artwork, mediaFile, variant = 'compressed') {
  const urls = getArtworkImageUrls(artwork, mediaFile);
  return urls[variant] || urls.compressed || urls.original;
}

/**
 * Check if an image URL is from Cloudflare
 * @param {string} url - The image URL
 * @returns {boolean}
 */
export function isCloudflareImage(url) {
  return url && url.includes('imagedelivery.net');
}

/**
 * Get Cloudflare variant from URL
 * @param {string} url - Cloudflare image URL
 * @param {string} variant - Desired variant ('thumbnail', 'public', 'original')
 * @returns {string} Modified URL with new variant
 */
export function getCloudflareVariant(url, variant) {
  if (!isCloudflareImage(url)) return url;
  
  // Extract the ID and construct new URL
  const match = url.match(/\/([^\/]+)\/(thumbnail|public|original)$/);
  if (match) {
    const imageId = match[1];
    return `${CLOUDFLARE_DELIVERY_URL}/${imageId}/${variant}`;
  }
  
  return url;
}

/**
 * Get responsive image srcset for better performance
 * Only works with Cloudflare images
 * @param {string} cloudflareId - Cloudflare image ID
 * @returns {string} srcset string for responsive images
 */
export function getResponsiveSrcSet(cloudflareId) {
  if (!cloudflareId) return '';
  
  // Define responsive variants (these need to be configured in Cloudflare)
  const variants = [
    { variant: 'thumbnail', width: 200 },
    { variant: 'small', width: 400 },
    { variant: 'medium', width: 800 },
    { variant: 'public', width: 1200 }
  ];
  
  return variants
    .map(({ variant, width }) => `${CLOUDFLARE_DELIVERY_URL}/${cloudflareId}/${variant} ${width}w`)
    .join(', ');
}
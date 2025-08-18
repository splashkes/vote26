import { supabase } from './supabase';

// Cache the config for the session
let cloudflareConfig = null;

export async function getCloudflareConfig() {
  // Return cached config if available
  if (cloudflareConfig) {
    return cloudflareConfig;
  }

  try {
    // Call the database function to get Cloudflare config
    const { data, error } = await supabase.rpc('get_cloudflare_config', {});
    
    if (error) {
      console.error('Error fetching Cloudflare config:', error);
      return null;
    }
    
    if (!data) {
      console.log('User is not authorized to access Cloudflare config');
      return null;
    }
    
    // Cache the config
    cloudflareConfig = data;
    return data;
  } catch (error) {
    console.error('Error in getCloudflareConfig:', error);
    return null;
  }
}

export async function uploadToCloudflare(file, metadata = {}) {
  const config = await getCloudflareConfig();
  
  if (!config) {
    throw new Error('Cloudflare configuration not available');
  }
  
  const formData = new FormData();
  formData.append('file', file);
  
  // Add any metadata
  if (metadata.requireSignedURLs !== undefined) {
    formData.append('requireSignedURLs', metadata.requireSignedURLs.toString());
  }
  if (metadata.metadata) {
    formData.append('metadata', JSON.stringify(metadata.metadata));
  }
  
  try {
    // Note: Cloudflare Images API requires an API token, not just account ID
    // This won't work directly from the client without a token
    // You'll need to either:
    // 1. Create a Supabase Edge Function to proxy the upload
    // 2. Use Cloudflare's direct creator upload feature
    
    throw new Error('Direct upload requires API token. Please use Edge Function proxy or direct creator upload.');
    
  } catch (error) {
    console.error('Error uploading to Cloudflare:', error);
    throw error;
  }
}

// Function to construct image URL with variant
export function getCloudflareImageUrl(imageId, variant = 'public') {
  if (!cloudflareConfig || !cloudflareConfig.deliveryUrl) {
    console.error('Cloudflare config not loaded');
    return null;
  }
  
  return `${cloudflareConfig.deliveryUrl}/${imageId}/${variant}`;
}

// Helper to check if user has Cloudflare access
export async function hasCloudflareAccess() {
  const config = await getCloudflareConfig();
  return config !== null;
}
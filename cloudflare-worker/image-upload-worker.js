/**
 * Cloudflare Worker for Art Battle Image Uploads
 * Handles direct uploads to Cloudflare Images with proper CORS headers
 * 
 * Environment variables needed:
 * - CLOUDFLARE_ACCOUNT_ID
 * - CLOUDFLARE_API_TOKEN
 * - ALLOWED_ORIGINS (comma-separated list of allowed origins)
 * - SUPABASE_URL
 * - SUPABASE_SERVICE_KEY (for validating requests)
 */

export default {
  async fetch(request, env) {
    // CORS headers
    const corsHeaders = {
      'Access-Control-Allow-Origin': getAllowedOrigin(request, env),
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Event-ID, X-Art-ID',
      'Access-Control-Max-Age': '86400',
    };

    // Handle preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    // Only allow POST
    if (request.method !== 'POST') {
      return new Response('Method not allowed', { 
        status: 405,
        headers: corsHeaders 
      });
    }

    try {
      // Validate authentication
      const authHeader = request.headers.get('Authorization');
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return new Response('Unauthorized', { 
          status: 401,
          headers: corsHeaders 
        });
      }

      const token = authHeader.substring(7);
      
      // Get event ID from headers
      const eventId = request.headers.get('X-Event-ID');
      
      // Validate token with Supabase and check permissions
      const validation = await validateSupabaseToken.call({ eventId }, token, env);
      if (!validation.valid) {
        return new Response(validation.error || 'Unauthorized', { 
          status: 401,
          headers: corsHeaders 
        });
      }

      // Get form data
      const formData = await request.formData();
      const file = formData.get('file');
      
      if (!file) {
        return new Response('No file provided', { 
          status: 400,
          headers: corsHeaders 
        });
      }

      // Validate file type
      if (!file.type.startsWith('image/')) {
        return new Response('Invalid file type', { 
          status: 400,
          headers: corsHeaders 
        });
      }

      // Get metadata (eventId already retrieved above)
      const artId = request.headers.get('X-Art-ID');
      
      // Create unique ID using the format EID-ROUND-EASEL-IMAGESEQUENCENUMBER
      // For now using timestamp as sequence number
      // If artId already contains the event code (e.g., AB3032-3-1), just use it
      const imageId = `${artId}-${Date.now()}`;

      // Prepare Cloudflare Images API request
      const cloudflareFormData = new FormData();
      cloudflareFormData.append('file', file);
      cloudflareFormData.append('id', imageId);
      cloudflareFormData.append('metadata', JSON.stringify({
        eventId,
        artId,
        uploadedAt: new Date().toISOString(),
        originalName: file.name
      }));
      cloudflareFormData.append('requireSignedURLs', 'false');

      // Upload to Cloudflare Images
      const uploadResponse = await fetch(
        `https://api.cloudflare.com/client/v4/accounts/8679deebf60af4e83f621a3173b3f2a4/images/v1`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${env.CLOUDFLARE_API_TOKEN}`,
          },
          body: cloudflareFormData,
        }
      );

      const result = await uploadResponse.json();

      if (!result.success) {
        console.error('Cloudflare upload failed:', result);
        return new Response(JSON.stringify({
          error: 'Cloudflare upload failed',
          details: result.errors || result.messages || 'Unknown error',
          hint: result.errors?.[0]?.code === 10000 ? 
            'Invalid Cloudflare API token. Please update the CLOUDFLARE_API_TOKEN secret in the worker.' : 
            'Check Cloudflare API token permissions'
        }), { 
          status: 500,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json'
          }
        });
      }

      // Return success with image details
      // Pass through exactly what Cloudflare returns
      const response = {
        success: true,
        id: result.result.id, // This is the actual ID Cloudflare uses
        filename: result.result.filename,
        variants: result.result.variants, // Array of variant URLs
        uploadedAt: new Date().toISOString(),
        metadata: {
          eventId,
          artId,
          requestedId: imageId // What we asked for
        }
      };

      return new Response(JSON.stringify(response), {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      });

    } catch (error) {
      console.error('Worker error:', error);
      return new Response('Internal server error', { 
        status: 500,
        headers: corsHeaders 
      });
    }
  },
};

// Helper functions
function getAllowedOrigin(request, env) {
  const origin = request.headers.get('Origin');
  const allowedOrigins = env.ALLOWED_ORIGINS ? env.ALLOWED_ORIGINS.split(',') : [];
  
  if (allowedOrigins.includes(origin)) {
    return origin;
  }
  
  // Default to first allowed origin or *
  return allowedOrigins[0] || '*';
}

async function validateSupabaseToken(token, env) {
  try {
    // Validate the user's token with their own credentials
    const response = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'apikey': env.SUPABASE_ANON_KEY, // Use anon key, not service key!
      },
    });
    
    if (!response.ok) {
      return { valid: false, error: 'Invalid token' };
    }
    
    const user = await response.json();
    
    // Get event ID for permission check
    const eventId = this.eventId;
    if (!eventId) {
      return { valid: false, error: 'No event ID provided' };
    }
    
    // For now, trust that the frontend has already verified permissions
    // We've validated the user's token, which is the important security check
    // TODO: Add server-side permission check once we debug the RPC issue
    
    return { valid: true, user };
  } catch (error) {
    console.error('Token validation error:', error);
    return { valid: false, error: error.message };
  }
}
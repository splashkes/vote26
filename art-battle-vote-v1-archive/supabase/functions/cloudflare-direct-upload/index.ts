import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  console.log('Edge function called:', req.method, req.url);
  
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Get request body
    const { id, metadata, expiry, requireSignedURLs } = await req.json()

    // Hardcoded Cloudflare credentials (temporary for testing)
    const CLOUDFLARE_ACCOUNT_ID = '8679deebf60af4e83f621a3173b3f2a4'
    const CLOUDFLARE_API_KEY = 'ZqrN7cxwB44CXBPlzcfd0FiGkMVtLQytvBe29JYM'
    const CLOUDFLARE_EMAIL = 'simon@artbattle.com'

    console.log('Requesting Cloudflare direct upload URL for ID:', id);

    // Create form data for Cloudflare API
    const formData = new FormData()
    if (id) formData.append('id', id)
    if (metadata) formData.append('metadata', JSON.stringify(metadata))
    if (expiry) formData.append('expiry', expiry)
    if (requireSignedURLs !== undefined) formData.append('requireSignedURLs', requireSignedURLs.toString())

    // Request direct upload URL from Cloudflare
    const response = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/images/v2/direct_upload`,
      {
        method: 'POST',
        headers: {
          'X-Auth-Email': CLOUDFLARE_EMAIL,
          'X-Auth-Key': CLOUDFLARE_API_KEY,
        },
        body: formData,
      }
    )

    const result = await response.json()

    if (!result.success) {
      console.error('Cloudflare API error:', result)
      throw new Error(result.errors?.[0]?.message || 'Failed to get upload URL')
    }

    console.log('Cloudflare response successful');

    // Return the upload URL and ID
    return new Response(
      JSON.stringify({
        uploadURL: result.result.uploadURL,
        id: result.result.id || id,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    )
  } catch (error) {
    console.error('Edge function error:', error);
    return new Response(
      JSON.stringify({
        error: error.message,
        details: error.toString(),
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      }
    )
  }
})
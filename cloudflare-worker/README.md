# Cloudflare Worker for Image Uploads

This Cloudflare Worker handles image uploads to Cloudflare Images, bypassing CORS restrictions that prevent direct browser uploads.

## Setup

1. Install Wrangler CLI:
```bash
npm install -g wrangler
```

2. Login to Cloudflare:
```bash
wrangler login
```

3. Set secrets:
```bash
wrangler secret put CLOUDFLARE_API_TOKEN
wrangler secret put SUPABASE_URL
wrangler secret put SUPABASE_SERVICE_KEY
```

4. Deploy to development:
```bash
wrangler deploy --env development
```

5. Deploy to production:
```bash
wrangler deploy --env production
```

## Worker URL

After deployment, the worker will be available at:
- Development: `https://art-battle-image-upload.{your-subdomain}.workers.dev`
- Production: Custom domain can be configured in Cloudflare dashboard

## How it Works

1. **Authentication**: Validates the Supabase JWT token from the Authorization header
2. **CORS**: Handles preflight requests and adds proper CORS headers
3. **Upload**: Forwards the image to Cloudflare Images API with server-side credentials
4. **Response**: Returns the image ID and variants to the client

## Security

- API tokens are stored as Worker secrets, never exposed to clients
- Validates Supabase authentication tokens
- Restricts uploads to authenticated users only
- CORS headers limit access to allowed origins

## Usage from Frontend

```javascript
const uploadImage = async (file, eventId, artId) => {
  const formData = new FormData();
  formData.append('file', file);
  
  const response = await fetch('https://your-worker-url.workers.dev', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${supabaseToken}`,
      'X-Event-ID': eventId,
      'X-Art-ID': artId
    },
    body: formData
  });
  
  const result = await response.json();
  return result;
};
```
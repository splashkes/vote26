# Cloudflare Images Integration

This document explains how the Cloudflare Images integration works with Supabase Vault for secure credential storage.

## Overview

Cloudflare credentials are stored in Supabase Vault and accessed via RLS (Row Level Security) policies that restrict access to admin users only.

## Stored Credentials

The following credentials are stored in Supabase Vault:
- `CLOUDFLARE_ACCOUNT_ID`: 8679deebf60af4e83f621a3173b3f2a4
- `CLOUDFLARE_ACCOUNT_HASH`: IGZfH_Pl-6S6csykNnXNJw
- `CLOUDFLARE_IMAGE_DELIVERY_URL`: https://imagedelivery.net/IGZfH_Pl-6S6csykNnXNJw

## Database Setup

Run the migration file: `migrations/006_cloudflare_vault_setup.sql`

This creates:
1. Vault secrets for Cloudflare credentials
2. A `get_cloudflare_config()` function that returns credentials only to admin users
3. An `admin_users` table to manage who has access

## Adding Admin Users

To add a new admin user who can access Cloudflare:

```sql
INSERT INTO admin_users (phone, name) 
VALUES ('+1234567890', 'New Admin Name');
```

## Frontend Usage

```javascript
import { getCloudflareConfig, getCloudflareImageUrl } from '../lib/cloudflare';

// Check if user has access
const config = await getCloudflareConfig();
if (config) {
  console.log('User has Cloudflare access');
  // config contains: accountId, accountHash, deliveryUrl, uploadUrl
}

// Construct image URLs
const imageUrl = getCloudflareImageUrl('image-id-here', 'public');
```

## Important Notes

1. **Direct Upload Limitation**: The Cloudflare Images API requires an API token for uploads, which should NOT be exposed to the client. The current setup provides the account ID and hash, but not the API token.

2. **Recommended Approach**: For actual uploads, you should either:
   - Create a Supabase Edge Function that has the API token and proxies uploads
   - Use Cloudflare's Direct Creator Upload feature which provides one-time upload URLs
   - Continue using Supabase Storage (current implementation)

3. **Security**: Only users whose phone numbers are in the `admin_users` table can retrieve the Cloudflare configuration.

## Next Steps

To enable actual uploads to Cloudflare, you'll need to:
1. Store the Cloudflare API token in Vault
2. Create a Supabase Edge Function to handle uploads
3. Update the frontend to use the Edge Function

For now, the credentials are stored and accessible to admin users, but actual upload functionality requires additional implementation.
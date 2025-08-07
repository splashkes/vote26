#!/bin/bash

# Test as API key with email (this requires an email though)
# Since we don't have the email, let's try the Global API Key format
echo "Testing as different auth methods..."

# Try as Bearer token for account info
curl -X GET "https://api.cloudflare.com/client/v4/accounts/8679deebf60af4e83f621a3173b3f2a4" \
  -H "Authorization: Bearer lp9MO4nNsAUrzWIdCv2cLtTkM-gFt96l6CaPDn19" | jq

echo -e "\n\nTrying as X-Auth-Key..."
# Without email, this won't work but let's see the error
curl -X GET "https://api.cloudflare.com/client/v4/accounts/8679deebf60af4e83f621a3173b3f2a4" \
  -H "X-Auth-Key: lp9MO4nNsAUrzWIdCv2cLtTkM-gFt96l6CaPDn19" | jq
#!/bin/bash

# Test the new token directly with Cloudflare Images API
echo "Testing token with Cloudflare Images API..."
curl -X POST \
  "https://api.cloudflare.com/client/v4/accounts/8679deebf60af4e83f621a3173b3f2a4/images/v1" \
  -H "Authorization: Bearer 8BJZN3sEK9lo7Wp74UC5ugitfiUPZxNjdMtRG8wj" \
  -F "url=https://via.placeholder.com/150" \
  -F "id=test-$(date +%s)" \
  -F "metadata={\"test\":true}" \
  -F "requireSignedURLs=false" | jq
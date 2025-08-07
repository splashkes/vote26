#!/bin/bash

# Create test image
echo "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==" | base64 -d > test-new.png

# Upload with our custom ID and see what Cloudflare returns
echo "Uploading with custom ID: test-event-123-art-456-$(date +%s)"
curl -X POST "https://api.cloudflare.com/client/v4/accounts/8679deebf60af4e83f621a3173b3f2a4/images/v1" \
  -H "Authorization: Bearer 8BJZN3sEK9lo7Wp74UC5ugitfiUPZxNjdMtRG8wj" \
  -F "file=@test-new.png;type=image/png" \
  -F "id=test-event-123-art-456-$(date +%s)" \
  -F "requireSignedURLs=false" | jq '.result'

rm test-new.png
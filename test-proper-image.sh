#!/bin/bash

# Create a proper PNG using base64
echo "Creating proper PNG image..."
echo "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==" | base64 -d > test.png

# Upload the image
echo "Uploading to Cloudflare..."
curl -X POST \
  "https://api.cloudflare.com/client/v4/accounts/8679deebf60af4e83f621a3173b3f2a4/images/v1" \
  -H "Authorization: Bearer 8BJZN3sEK9lo7Wp74UC5ugitfiUPZxNjdMtRG8wj" \
  -F "file=@test.png;type=image/png" \
  -F "id=test-$(date +%s)" \
  -F "metadata={\"test\":true}" \
  -F "requireSignedURLs=false" | jq '.result | {id, filename, variants}'

# Clean up
rm -f test.png
#!/bin/bash

# Create a simple test image
echo "Creating test image..."
convert -size 100x100 xc:blue test-image.png 2>/dev/null || {
    # Fallback if ImageMagick not installed
    echo "P6 100 100 255" > test-image.ppm
    dd if=/dev/urandom bs=30000 count=1 2>/dev/null | head -c 30000 >> test-image.ppm
    convert test-image.ppm test-image.png 2>/dev/null || cp test-image.ppm test-image.png
}

# Upload the image
echo "Uploading test image to Cloudflare..."
curl -X POST \
  "https://api.cloudflare.com/client/v4/accounts/8679deebf60af4e83f621a3173b3f2a4/images/v1" \
  -H "Authorization: Bearer 8BJZN3sEK9lo7Wp74UC5ugitfiUPZxNjdMtRG8wj" \
  -F "file=@test-image.png" \
  -F "id=test-manual-$(date +%s)" \
  -F "metadata={\"test\":true}" \
  -F "requireSignedURLs=false" | jq

# Clean up
rm -f test-image.png test-image.ppm
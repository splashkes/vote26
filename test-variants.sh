#!/bin/bash

# First, create variants
echo "Creating Cloudflare variants..."
curl -X POST \
  "https://api.cloudflare.com/client/v4/accounts/8679deebf60af4e83f621a3173b3f2a4/images/v1/variants" \
  -H "Authorization: Bearer 8BJZN3sEK9lo7Wp74UC5ugitfiUPZxNjdMtRG8wj" \
  -H "Content-Type: application/json" \
  -d '{
    "id": "thumbnail",
    "options": {
      "fit": "cover",
      "width": 150,
      "height": 150
    }
  }' | jq

echo -e "\n\nCreating public variant..."
curl -X POST \
  "https://api.cloudflare.com/client/v4/accounts/8679deebf60af4e83f621a3173b3f2a4/images/v1/variants" \
  -H "Authorization: Bearer 8BJZN3sEK9lo7Wp74UC5ugitfiUPZxNjdMtRG8wj" \
  -H "Content-Type: application/json" \
  -d '{
    "id": "public",
    "options": {
      "fit": "scale-down",
      "width": 800,
      "height": 800
    }
  }' | jq

echo -e "\n\nCreating original variant..."
curl -X POST \
  "https://api.cloudflare.com/client/v4/accounts/8679deebf60af4e83f621a3173b3f2a4/images/v1/variants" \
  -H "Authorization: Bearer 8BJZN3sEK9lo7Wp74UC5ugitfiUPZxNjdMtRG8wj" \
  -H "Content-Type: application/json" \
  -d '{
    "id": "original",
    "options": {
      "fit": "scale-down",
      "width": 9999,
      "height": 9999
    }
  }' | jq
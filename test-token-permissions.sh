#!/bin/bash

# First, let's verify what permissions this token has
echo "Testing token permissions..."
curl -X GET "https://api.cloudflare.com/client/v4/user/tokens/verify" \
  -H "Authorization: Bearer lp9MO4nNsAUrzWIdCv2cLtTkM-gFt96l6CaPDn19" \
  -H "Content-Type: application/json" | jq
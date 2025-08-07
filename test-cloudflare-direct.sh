#!/bin/bash

# Test Cloudflare Images API directly
curl -X POST \
  "https://api.cloudflare.com/client/v4/accounts/8679deebf60af4e83f621a3173b3f2a4/images/v1" \
  -H "Authorization: Bearer Q1N1-WHgRJZ6gB-XEiA59DS-2RqjeXhI_qNRPebd" \
  -F "url=https://via.placeholder.com/150" \
  -F "id=test-$(date +%s)" \
  -F "metadata={\"test\":true}" \
  -F "requireSignedURLs=false"
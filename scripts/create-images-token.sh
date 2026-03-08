#!/bin/bash

# Create a new API token with Cloudflare Images permissions
curl -X POST "https://api.cloudflare.com/client/v4/user/tokens" \
  -H "Authorization: Bearer lp9MO4nNsAUrzWIdCv2cLtTkM-gFt96l6CaPDn19" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Art Battle Image Upload Token",
    "policies": [
      {
        "effect": "allow",
        "resources": {
          "com.cloudflare.api.account.8679deebf60af4e83f621a3173b3f2a4": "*"
        },
        "permission_groups": [
          {
            "id": "f4eb75b69a49466f82e057c756b6bbaa",
            "name": "Cloudflare Images:Edit"
          }
        ]
      }
    ]
  }' | jq
#!/bin/bash

# Fix permissions for vote26 assets on CDN

set -e

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m'

CDN_BUCKET="artb"
CDN_PATH="vote26"

echo -e "${BLUE}Fixing permissions for vote26 assets...${NC}"

# Fix permissions recursively
echo "Setting public read permissions on all files..."
s3cmd setacl s3://$CDN_BUCKET/$CDN_PATH/ --acl-public --recursive

# List files to verify
echo -e "\n${BLUE}Verifying files:${NC}"
s3cmd ls s3://$CDN_BUCKET/$CDN_PATH/ --recursive

echo -e "\n${GREEN}✓ Permissions fixed!${NC}"
echo "The app should now be accessible at: https://artb.tor1.cdn.digitaloceanspaces.com/vote26/"
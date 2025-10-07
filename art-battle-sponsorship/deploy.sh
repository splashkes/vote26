#!/bin/bash

set -e

echo "🚀 Starting Art Battle Sponsorship deployment..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Build the application
echo -e "${BLUE}[INFO]${NC} Building the application..."
npm run build

if [ $? -eq 0 ]; then
    echo -e "${GREEN}[SUCCESS]${NC} Build completed successfully!"
else
    echo -e "${RED}[ERROR]${NC} Build failed!"
    exit 1
fi

# Deploy to DigitalOcean Spaces
echo -e "${BLUE}[INFO]${NC} Deploying to DigitalOcean Spaces..."

# Generate cache-busting version
CACHE_VERSION=$(date +%s)
echo -e "${BLUE}[INFO]${NC} Cache version: $CACHE_VERSION"

# Add cache-busting parameters to index.html
echo -e "${BLUE}[INFO]${NC} Adding cache-busting parameters..."
sed -i "s|/sponsor/assets/|/sponsor/assets/|g" dist/index.html
sed -i "s|\\.js\"|.js?v=$CACHE_VERSION\"|g" dist/index.html
sed -i "s|\\.css\"|.css?v=$CACHE_VERSION\"|g" dist/index.html

# Upload to S3 (DigitalOcean Spaces)
echo -e "${BLUE}[INFO]${NC} Uploading files to s3://artb/sponsor/..."
s3cmd sync --acl-public --delete-removed --no-mime-magic --guess-mime-type \
    dist/ s3://artb/sponsor/

if [ $? -eq 0 ]; then
    echo -e "${GREEN}[SUCCESS]${NC} Deployment completed successfully!"
    echo -e "${GREEN}[SUCCESS]${NC} Sponsorship SPA is now available at: https://artb.tor1.cdn.digitaloceanspaces.com/sponsor/"
    echo -e "${BLUE}[INFO]${NC} Deployment summary:"
    echo -e "  📦 Built application successfully"
    echo -e "  🌐 Deployed to DigitalOcean Spaces"
    echo -e "  🔄 Cache-busting version: $CACHE_VERSION"
    echo -e "  🔗 URL: https://artb.tor1.cdn.digitaloceanspaces.com/sponsor/"
    echo -e "${GREEN}[SUCCESS]${NC} All done! 🎉"
else
    echo -e "${RED}[ERROR]${NC} Deployment failed!"
    exit 1
fi

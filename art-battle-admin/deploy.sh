#!/bin/bash

# Art Battle Admin Deployment Script
# Based on the deployment pattern used in other vote26 apps

set -e

echo "🚀 Starting Art Battle Admin deployment..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
    print_error "package.json not found. Please run this script from the art-battle-admin directory."
    exit 1
fi

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    print_status "Installing dependencies..."
    npm install
fi

# Build the application
print_status "Building the application..."
npm run build

if [ $? -ne 0 ]; then
    print_error "Build failed!"
    exit 1
fi

print_success "Build completed successfully!"

# Check if dist directory was created
if [ ! -d "dist" ]; then
    print_error "dist directory not found after build!"
    exit 1
fi

# Deploy to DigitalOcean Spaces
print_status "Deploying to DigitalOcean Spaces..."

# Check if s3cmd is available
if ! command -v s3cmd &> /dev/null; then
    print_error "s3cmd could not be found. Please install it first:"
    print_error "  Ubuntu/Debian: sudo apt-get install s3cmd"
    print_error "  macOS: brew install s3cmd"
    exit 1
fi

# Generate cache-busting version based on current timestamp
CACHE_VERSION=$(date +%s)
print_status "Cache version: $CACHE_VERSION"

# Create a temporary index.html with cache-busting
print_status "Adding cache-busting parameters..."
sed "s/\.js/.js?v=$CACHE_VERSION/g; s/\.css/.css?v=$CACHE_VERSION/g" dist/index.html > dist/index_temp.html
mv dist/index_temp.html dist/index.html

# Deploy all files to admin subdirectory
print_status "Uploading files to s3://artb/admin/..."

# Upload with proper MIME types and cache invalidation headers
# Upload CSS files with correct MIME type
find dist -name "*.css" -exec basename {} \; | while read file; do
    s3cmd put "dist/assets/$file" \
        --acl-public \
        --add-header="Cache-Control:no-cache, must-revalidate" \
        --mime-type="text/css" \
        "s3://artb/admin/assets/$file"
done

# Upload JS files with correct MIME type  
find dist -name "*.js" -exec basename {} \; | while read file; do
    s3cmd put "dist/assets/$file" \
        --acl-public \
        --add-header="Cache-Control:no-cache, must-revalidate" \
        --mime-type="application/javascript" \
        "s3://artb/admin/assets/$file"
done

# Upload remaining files (HTML, SVG, etc.) with auto-detection
s3cmd sync \
    --acl-public \
    --add-header="Cache-Control:no-cache, must-revalidate" \
    --exclude="*.css" \
    --exclude="*.js" \
    --guess-mime-type \
    dist/ \
    s3://artb/admin/

if [ $? -ne 0 ]; then
    print_error "Deployment failed!"
    exit 1
fi

print_success "Deployment completed successfully!"
print_success "Admin interface is now available at: https://artb.tor1.cdn.digitaloceanspaces.com/admin/"

# Optional: Open in browser (uncomment if desired)
# if command -v xdg-open &> /dev/null; then
#     xdg-open "https://artb.tor1.cdn.digitaloceanspaces.com/admin/"
# elif command -v open &> /dev/null; then
#     open "https://artb.tor1.cdn.digitaloceanspaces.com/admin/"
# fi

print_status "Deployment summary:"
echo "  📦 Built application successfully"
echo "  🌐 Deployed to DigitalOcean Spaces"
echo "  🔄 Cache-busting version: $CACHE_VERSION"
echo "  🔗 URL: https://artb.tor1.cdn.digitaloceanspaces.com/admin/"

print_success "All done! 🎉"
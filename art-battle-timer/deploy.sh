#!/bin/bash

# Art Battle Timer Deployment Script
# Deploys the Art Battle Timer app to DigitalOcean CDN

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
CDN_BUCKET="artb"
CDN_REGION="tor1"
CDN_PATH="timer"  # Deploy to timer subdirectory

# Function to print colored output
print_status() {
    echo -e "${BLUE}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $1"
}

print_success() {
    echo -e "${GREEN}✓${NC} $1"
}

print_error() {
    echo -e "${RED}✗${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}!${NC} $1"
}

# Function to check if command exists
check_command() {
    if ! command -v $1 &> /dev/null; then
        print_error "$1 is not installed. Please install it first."
        exit 1
    fi
}

# Pre-deployment checks
print_status "Starting Art Battle Timer deployment process..."
print_status "Checking required tools..."

check_command "s3cmd"
check_command "npm"

# Install dependencies if node_modules doesn't exist
if [ ! -d "node_modules" ]; then
    print_status "Installing dependencies..."
    if npm install; then
        print_success "Dependencies installed successfully"
    else
        print_error "Failed to install dependencies"
        exit 1
    fi
fi

# Build the app
print_status "Building the Timer application for production..."
if npm run build; then
    print_success "Build completed successfully"
else
    print_error "Build failed"
    exit 1
fi

# Check if dist folder exists
if [ ! -d "dist" ]; then
    print_error "dist folder not found. Build may have failed."
    exit 1
fi

# Count files to be deployed
FILE_COUNT=$(find dist -type f | wc -l)
print_status "Found $FILE_COUNT files to deploy"

# Generate cache-busting version using git commit hash
GIT_HASH=$(git rev-parse --short HEAD 2>/dev/null || date +%s)
print_status "Using version: $GIT_HASH"

# Update index.html to add cache-busting to assets
print_status "Adding cache-busting parameters to index.html..."
sed -i "s/\(\.js\)\"/\1?v=$GIT_HASH\"/g" dist/index.html
sed -i "s/\(\.css\)\"/\1?v=$GIT_HASH\"/g" dist/index.html

# Deploy to CDN
print_status "Deploying to CDN..."

# Upload index.html with no-cache headers
print_status "Uploading index.html with no-cache headers..."
if s3cmd put dist/index.html s3://$CDN_BUCKET/$CDN_PATH/index.html \
    --acl-public \
    --add-header="Cache-Control:no-cache, no-store, must-revalidate" \
    --add-header="Content-Type:text/html" \
    --add-header="Access-Control-Allow-Origin:*" \
    --add-header="Access-Control-Allow-Methods:GET, HEAD" \
    --add-header="Access-Control-Allow-Headers:*"; then
    print_success "index.html uploaded successfully"
else
    print_error "Failed to upload index.html"
    exit 1
fi

# Upload JS files with correct MIME type
print_status "Uploading JavaScript assets..."
for js_file in dist/assets/*.js; do
    if [ -f "$js_file" ]; then
        filename=$(basename "$js_file")
        s3cmd put "$js_file" s3://$CDN_BUCKET/$CDN_PATH/assets/$filename \
            --acl-public \
            --force \
            --mime-type="application/javascript" \
            --add-header="Cache-Control:public, max-age=31536000, immutable" \
            --add-header="Access-Control-Allow-Origin:*" \
            --add-header="Access-Control-Allow-Methods:GET, HEAD" \
            --add-header="Access-Control-Allow-Headers:*"
    fi
done
print_success "JavaScript assets uploaded successfully"

# Upload CSS files with correct MIME type
print_status "Uploading CSS assets..."
for css_file in dist/assets/*.css; do
    if [ -f "$css_file" ]; then
        filename=$(basename "$css_file")
        s3cmd put "$css_file" s3://$CDN_BUCKET/$CDN_PATH/assets/$filename \
            --acl-public \
            --force \
            --mime-type="text/css" \
            --add-header="Cache-Control:public, max-age=31536000, immutable" \
            --add-header="Access-Control-Allow-Origin:*" \
            --add-header="Access-Control-Allow-Methods:GET, HEAD" \
            --add-header="Access-Control-Allow-Headers:*"
    fi
done
print_success "CSS assets uploaded successfully"

# Fix permissions on all uploaded files
print_status "Ensuring public read permissions on all assets..."
s3cmd setacl s3://$CDN_BUCKET/$CDN_PATH/assets/ --acl-public --recursive

# Upload other assets (images, fonts, etc.)
print_status "Uploading other assets..."
if s3cmd sync dist/ s3://$CDN_BUCKET/$CDN_PATH/ \
    --acl-public \
    --exclude="index.html" \
    --exclude="assets/*.js" \
    --exclude="assets/*.css" \
    --exclude="*.map" \
    --add-header="Cache-Control:public, max-age=3600" \
    --add-header="Access-Control-Allow-Origin:*" \
    --add-header="Access-Control-Allow-Methods:GET, HEAD" \
    --add-header="Access-Control-Allow-Headers:*"; then
    print_success "Other assets uploaded successfully"
else
    print_warning "No other assets found or upload failed"
fi

# Verify deployment
print_status "Verifying deployment..."
CDN_URL="https://$CDN_BUCKET.$CDN_REGION.cdn.digitaloceanspaces.com/$CDN_PATH/index.html"

if curl -s -o /dev/null -w "%{http_code}" $CDN_URL | grep -q "200"; then
    print_success "Deployment verified - Timer app is accessible"
else
    print_error "Deployment verification failed"
fi

# Print summary
print_success "Timer App deployment completed!"
echo ""
print_status "📊 Deployment Summary"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
print_status "🌐 URLs:"
echo "  • Timer App CDN: https://$CDN_BUCKET.$CDN_REGION.cdn.digitaloceanspaces.com/$CDN_PATH/"
echo "  • Timer App URL: https://artb.art/timer/"
echo ""
print_status "📦 Deployed:"
echo "  • Files: $FILE_COUNT"
echo "  • Version: $GIT_HASH"
echo "  • Cache strategy:"
echo "    - index.html: no-cache (always fresh)"
echo "    - JS/CSS assets: 1 year cache (immutable with hash)"
echo "    - Other assets: 1 hour cache"
echo ""
print_status "ℹ️  Notes:"
echo "  • The Timer app is now live at the URLs above"
echo "  • Access via URL: https://artb.art/timer/EVENT_ID (e.g., /AB3344)"
echo "  • Timer displays full-screen countdown for auction events"
echo "  • No authentication required - public display system"
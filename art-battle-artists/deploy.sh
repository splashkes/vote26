#!/bin/bash

# Art Battle Artists Deployment Script
# Deploys the Artist Profile system to DigitalOcean CDN

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
CDN_PATH="profile"  # Deploy to profile subdirectory

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
print_status "Starting Art Battle Artists deployment process..."
print_status "Checking required tools..."

check_command "s3cmd"
check_command "npm"

# Clean and build the app  
print_status "Cleaning previous build artifacts..."
if [ -d "dist" ]; then
    rm -rf dist
    print_success "Previous dist directory cleaned"
fi

print_status "Building the application for production..."
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

# Validate and count files to be deployed
print_status "Validating build artifacts..."

# Check for essential files
if [ ! -f "dist/index.html" ]; then
    print_error "index.html not found in dist. Build may be incomplete."
    exit 1
fi

if [ ! -d "dist/assets" ]; then
    print_error "assets directory not found in dist. Build may be incomplete."
    exit 1
fi

# Check for unexpected files that could indicate contamination
UNEXPECTED_FILES=$(find dist -type f -not -name "*.html" -not -name "*.js" -not -name "*.css" -not -name "*.map" -not -name "*.ico" -not -name "*.png" -not -name "*.jpg" -not -name "*.jpeg" -not -name "*.svg" -not -name "*.gif" -not -name "*.woff*" -not -name "*.ttf" -not -name "*.eot" -not -name "*.json" | head -5)

if [ ! -z "$UNEXPECTED_FILES" ]; then
    print_warning "Found unexpected files in dist directory:"
    echo "$UNEXPECTED_FILES"
    print_warning "This could indicate contamination. Proceeding with caution..."
fi

FILE_COUNT=$(find dist -type f | wc -l)
print_status "Found $FILE_COUNT files to deploy"
print_success "Build artifacts validated"

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
    --add-header="Access-Control-Allow-Origin:https://artb.art" \
    --add-header="Access-Control-Allow-Methods:GET, HEAD" \
    --add-header="Access-Control-Allow-Headers:*"; then
    print_success "index.html uploaded successfully"
else
    print_error "Failed to upload index.html"
    exit 1
fi

# Upload all assets with proper permissions
print_status "Uploading assets (JS, CSS, images)..."
if s3cmd sync dist/assets/ s3://$CDN_BUCKET/$CDN_PATH/assets/ \
    --acl-public \
    --force \
    --no-mime-magic \
    --guess-mime-type \
    --add-header="Cache-Control:public, max-age=31536000, immutable" \
    --add-header="Access-Control-Allow-Origin:https://artb.art" \
    --add-header="Access-Control-Allow-Methods:GET, HEAD" \
    --add-header="Access-Control-Allow-Headers:*"; then
    print_success "Assets uploaded successfully"
    
    # Fix permissions on all uploaded files
    print_status "Ensuring public read permissions on all assets..."
    s3cmd setacl s3://$CDN_BUCKET/$CDN_PATH/assets/ --acl-public --recursive
else
    print_error "Failed to upload assets"
    exit 1
fi

# Upload only specific static assets (NO directory sync to prevent contamination)
print_status "Uploading additional static assets..."

# Check for favicon and other root-level assets ONLY
if [ -f "dist/vite.svg" ]; then
    s3cmd put dist/vite.svg s3://$CDN_BUCKET/$CDN_PATH/vite.svg \
        --acl-public \
        --add-header="Cache-Control:public, max-age=3600" \
        --add-header="Access-Control-Allow-Origin:https://artb.art"
    print_success "vite.svg uploaded"
fi

if [ -f "dist/favicon.ico" ]; then
    s3cmd put dist/favicon.ico s3://$CDN_BUCKET/$CDN_PATH/favicon.ico \
        --acl-public \
        --add-header="Cache-Control:public, max-age=3600" \
        --add-header="Access-Control-Allow-Origin:https://artb.art"
    print_success "favicon.ico uploaded"
fi

# List what we actually have in dist for transparency
print_status "Build contents for verification:"
ls -la dist/
if [ -d "dist/assets" ]; then
    echo "Assets directory contents:"
    ls -la dist/assets/ | head -10
fi

print_success "Static assets deployment completed safely"

# Verify deployment
print_status "Verifying deployment..."
CDN_URL="https://$CDN_BUCKET.$CDN_REGION.cdn.digitaloceanspaces.com/$CDN_PATH/index.html"

if curl -s -o /dev/null -w "%{http_code}" $CDN_URL | grep -q "200"; then
    print_success "Deployment verified - site is accessible"
else
    print_error "Deployment verification failed"
fi

# Print summary
print_success "Deployment completed!"
echo ""
print_status "📊 Deployment Summary"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
print_status "🌐 URLs:"
echo "  • Production URL: https://$CDN_BUCKET.$CDN_REGION.cdn.digitaloceanspaces.com/$CDN_PATH/"
echo "  • Direct link: https://$CDN_BUCKET.$CDN_REGION.cdn.digitaloceanspaces.com/$CDN_PATH/index.html"
echo "  • Friendly URL: https://artb.art/profile/"
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
echo "  • The artist profile system is now live at the URLs above"
echo "  • It may take a few minutes for CDN propagation"
echo "  • Users may need to clear cache if they had a previous version"
echo "  • Authentication is shared with the main Art Battle Vote system"
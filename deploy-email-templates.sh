#!/bin/bash

# Email Template Generator and CDN Deployment Script
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
CDN_PATH="email-templates"  # Deploy to email-templates subdirectory

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_status "Starting email template generation and CDN deployment..."

# Create temporary directory
mkdir -p /tmp/email-templates

# Generate the HTML files by calling the function and saving output
print_status "Fetching email templates from Supabase function..."
curl -s "https://xsqdkubgyqwpyvfltnrf.supabase.co/functions/v1/email-template-showcase" > /tmp/email-templates/index.html

print_status "Fetching individual templates..."
curl -s "https://xsqdkubgyqwpyvfltnrf.supabase.co/functions/v1/email-template-showcase?template=payment-with-sales" > /tmp/email-templates/payment-with-sales.html
curl -s "https://xsqdkubgyqwpyvfltnrf.supabase.co/functions/v1/email-template-showcase?template=payment-no-sales" > /tmp/email-templates/payment-no-sales.html
curl -s "https://xsqdkubgyqwpyvfltnrf.supabase.co/functions/v1/email-template-showcase?template=payment-canadian" > /tmp/email-templates/payment-canadian.html

# Copy to local dist directory
print_status "Copying to local dist directory..."
mkdir -p /root/vote_app/vote26/art-battle-artists/dist/
cp -r /tmp/email-templates/* /root/vote_app/vote26/art-battle-artists/dist/

# Update the main showcase to use local files instead of iframe URLs
print_status "Updating iframe URLs to use local files..."
sed -i 's/src="?template=payment-with-sales"/src="payment-with-sales.html"/g' /root/vote_app/vote26/art-battle-artists/dist/index.html
sed -i 's/src="?template=payment-no-sales"/src="payment-no-sales.html"/g' /root/vote_app/vote26/art-battle-artists/dist/index.html  
sed -i 's/src="?template=payment-canadian"/src="payment-canadian.html"/g' /root/vote_app/vote26/art-battle-artists/dist/index.html

# Deploy to DigitalOcean CDN
print_status "Deploying email templates to DigitalOcean CDN..."

# Check if s3cmd is available
if ! command -v s3cmd &> /dev/null; then
    print_error "s3cmd command not found. Please install s3cmd."
    exit 1
fi

# Upload files to CDN
print_status "Uploading files to s3://$CDN_BUCKET/$CDN_PATH/..."

# Upload main showcase
print_status "Uploading index.html..."
if s3cmd put /tmp/email-templates/index.html s3://$CDN_BUCKET/$CDN_PATH/index.html \
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

# Upload individual templates
print_status "Uploading individual email templates..."
for template in payment-with-sales payment-no-sales payment-canadian; do
    if s3cmd put /tmp/email-templates/$template.html s3://$CDN_BUCKET/$CDN_PATH/$template.html \
        --acl-public \
        --add-header="Cache-Control:max-age=3600" \
        --add-header="Content-Type:text/html" \
        --add-header="Access-Control-Allow-Origin:https://artb.art" \
        --add-header="Access-Control-Allow-Methods:GET, HEAD" \
        --add-header="Access-Control-Allow-Headers:*"; then
        print_success "$template.html uploaded successfully"
    else
        print_error "Failed to upload $template.html"
        exit 1
    fi
done

# Clean up
rm -rf /tmp/email-templates

print_success "Email templates deployed successfully!"
print_status "CDN URLs:"
echo "  - Main showcase: https://artb.art/$CDN_PATH/"
echo "  - With sales: https://artb.art/$CDN_PATH/payment-with-sales.html"
echo "  - No sales: https://artb.art/$CDN_PATH/payment-no-sales.html"
echo "  - Canadian: https://artb.art/$CDN_PATH/payment-canadian.html"
echo ""
print_status "Local files also available at:"
echo "  - /root/vote_app/vote26/art-battle-artists/dist/"

print_success "Deployment complete!"
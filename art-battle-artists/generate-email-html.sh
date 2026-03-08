#!/bin/bash

# Email Template HTML Generator
# Quick script for design iteration - generates HTML files from Supabase functions

set -e  # Exit on error

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_status "Generating email template HTML files for design iteration..."

# Create output directory
OUTPUT_DIR="/root/vote_app/vote26/art-battle-artists/dist"
mkdir -p "$OUTPUT_DIR"

# Generate the HTML files by calling the function and saving output
print_status "Fetching main showcase..."
curl -s "https://xsqdkubgyqwpyvfltnrf.supabase.co/functions/v1/email-template-showcase" > "$OUTPUT_DIR/index.html"

print_status "Fetching individual email templates..."
curl -s "https://xsqdkubgyqwpyvfltnrf.supabase.co/functions/v1/email-template-showcase?template=payment-with-sales" > "$OUTPUT_DIR/payment-with-sales.html"
curl -s "https://xsqdkubgyqwpyvfltnrf.supabase.co/functions/v1/email-template-showcase?template=payment-no-sales" > "$OUTPUT_DIR/payment-no-sales.html"
curl -s "https://xsqdkubgyqwpyvfltnrf.supabase.co/functions/v1/email-template-showcase?template=payment-canadian" > "$OUTPUT_DIR/payment-canadian.html"

# Update the main showcase to use local files instead of iframe URLs
print_status "Updating iframe URLs to use local files..."
sed -i 's/src="?template=payment-with-sales"/src="payment-with-sales.html"/g' "$OUTPUT_DIR/index.html"
sed -i 's/src="?template=payment-no-sales"/src="payment-no-sales.html"/g' "$OUTPUT_DIR/index.html"  
sed -i 's/src="?template=payment-canadian"/src="payment-canadian.html"/g' "$OUTPUT_DIR/index.html"

print_success "HTML files generated successfully!"
echo ""
echo "📁 Files created:"
echo "  - $OUTPUT_DIR/index.html (main showcase)"
echo "  - $OUTPUT_DIR/payment-with-sales.html"
echo "  - $OUTPUT_DIR/payment-no-sales.html"
echo "  - $OUTPUT_DIR/payment-canadian.html"
echo ""
echo "🌐 Test locally with:"
echo "  - file://$OUTPUT_DIR/index.html"
echo ""
echo "✏️  To iterate design:"
echo "  1. Edit templates in: /root/vote_app/vote26/supabase/functions/_shared/emailTemplates.ts"
echo "  2. Deploy function: cd /root/vote_app/vote26 && supabase functions deploy email-template-showcase --no-verify-jwt"
echo "  3. Regenerate HTML: ./generate-email-html.sh"
echo ""
echo "🚀 Deploy to CDN: ./deploy-email-templates.sh"
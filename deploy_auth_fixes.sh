#!/bin/bash
# Deploy Auth System Overhaul - Critical Updates

echo "🚀 Deploying Auth System Overhaul..."

# Navigate to project directory
cd /root/vote_app/vote26

echo "📤 Deploying auth-webhook (Version 26 - Fixed metadata handling)..."
supabase functions deploy auth-webhook

echo "📤 Deploying validate-qr-scan (Version 28 - Simplified QR validation)..."  
supabase functions deploy validate-qr-scan

echo "✅ Deployment complete!"
echo ""
echo "🧪 Ready for testing:"
echo "1. Non-QR Auth Flow: Users should vote immediately after phone verification"
echo "2. QR Flow: Should provide vote boost without auth fixes"
echo "3. Loading Loops: Should be eliminated with proper auth timing"
echo ""
echo "📋 Next steps:"
echo "- Test with real phone number on event page"
echo "- Monitor function logs for any errors"
echo "- Verify no 'please sign in' errors for authenticated users"
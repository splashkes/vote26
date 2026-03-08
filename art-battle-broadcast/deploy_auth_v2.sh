#!/bin/bash

# Auth V2 Deployment Script
# Deploys art-battle-broadcast with new JWT-based auth system
# Date: 2025-01-07

echo "🚀 [AUTH-V2] Starting Auth V2 deployment..."

# Build and deploy art-battle-broadcast
cd /root/vote_app/vote26/art-battle-broadcast

echo "📦 [AUTH-V2] Building art-battle-broadcast with JWT claims support..."
npm run build

echo "🚀 [AUTH-V2] Deploying to CDN..."
./deploy.sh

echo "✅ [AUTH-V2] Deployment complete!"
echo ""
echo "📋 [AUTH-V2] Next steps:"
echo "1. Configure Custom Access Token Hook in Supabase Dashboard:"
echo "   - Go to Authentication > Hooks"  
echo "   - Select 'Custom Access Token'"
echo "   - Choose 'Postgres Function'"
echo "   - Function: public.custom_access_token_hook"
echo ""
echo "2. Test with fresh user registration:"
echo "   - Phone verification should trigger person creation"
echo "   - JWT should contain person claims"
echo "   - Console should show [AUTH-V2] logs"
echo ""
echo "3. Verify other SPAs unaffected:"
echo "   - art-battle-artists should work normally" 
echo "   - art-battle-admin should work normally"
echo ""
echo "🔍 [AUTH-V2] Look for these console logs to confirm V2 is active:"
echo "   - '🔄 [AUTH-V2] Extracting person data from JWT claims...'"
echo "   - '✅ [AUTH-V2] Auth V2 system confirmed in JWT'"
echo "   - '✅ [AUTH-V2] Person data found in JWT'"

chmod +x /root/vote_app/vote26/deploy_auth_v2.sh
#!/usr/bin/env node
/**
 * Test script to validate Meta/Facebook API token
 * This will test access to the Art Battle ad accounts
 */

// Note: Token is stored in Supabase secrets, you'll need to pass it as an argument
const accessToken = process.argv[2];

if (!accessToken) {
  console.error('❌ Usage: node test-meta-token.js <META_ACCESS_TOKEN>');
  console.error('   Get token from: supabase secrets or Meta Business Suite');
  process.exit(1);
}

// Art Battle account IDs from the meta-ads-report function
const accounts = [
  { id: 'act_374917895886929', name: 'Art Battle Main (CAD)', currency: 'CAD' },
  { id: 'act_10154340035865743', name: 'Art Battle International (USD)', currency: 'USD' }
];

async function testMetaAPI() {
  console.log('🔍 Testing Meta/Facebook API Access...\n');

  for (const account of accounts) {
    console.log(`Testing: ${account.name} (${account.id})`);

    try {
      // Test 1: Get account info
      const accountUrl = `https://graph.facebook.com/v23.0/${account.id}`;
      const accountParams = new URLSearchParams({
        access_token: accessToken,
        fields: 'id,name,account_id,currency,account_status,timezone_name'
      });

      const accountResponse = await fetch(`${accountUrl}?${accountParams}`);
      const accountData = await accountResponse.json();

      if (accountData.error) {
        console.error(`  ❌ Error: ${accountData.error.message}`);
        console.error(`     Code: ${accountData.error.code}`);
        console.error(`     Type: ${accountData.error.type}\n`);
        continue;
      }

      console.log(`  ✅ Account Access: OK`);
      console.log(`     Name: ${accountData.name}`);
      console.log(`     Currency: ${accountData.currency}`);
      console.log(`     Status: ${accountData.account_status}`);
      console.log(`     Timezone: ${accountData.timezone_name}`);

      // Test 2: Get campaign count
      const campaignsUrl = `https://graph.facebook.com/v23.0/${account.id}/campaigns`;
      const campaignsParams = new URLSearchParams({
        access_token: accessToken,
        fields: 'id,name',
        limit: '5'
      });

      const campaignsResponse = await fetch(`${campaignsUrl}?${campaignsParams}`);
      const campaignsData = await campaignsResponse.json();

      if (campaignsData.error) {
        console.error(`  ⚠️  Campaign access error: ${campaignsData.error.message}\n`);
      } else {
        console.log(`  ✅ Campaigns: Found ${campaignsData.data?.length || 0} campaigns (showing first 5)`);
        if (campaignsData.data && campaignsData.data.length > 0) {
          campaignsData.data.forEach(camp => {
            console.log(`     - ${camp.name} (${camp.id})`);
          });
        }
      }

      console.log('');

    } catch (error) {
      console.error(`  ❌ Network Error: ${error.message}\n`);
    }
  }

  // Test token info
  console.log('📊 Token Information Test...');
  try {
    const debugUrl = 'https://graph.facebook.com/v23.0/debug_token';
    const debugParams = new URLSearchParams({
      input_token: accessToken,
      access_token: accessToken
    });

    const debugResponse = await fetch(`${debugUrl}?${debugParams}`);
    const debugData = await debugResponse.json();

    if (debugData.data) {
      console.log(`  App ID: ${debugData.data.app_id}`);
      console.log(`  Type: ${debugData.data.type}`);
      console.log(`  Valid: ${debugData.data.is_valid}`);
      console.log(`  Expires: ${debugData.data.expires_at ? new Date(debugData.data.expires_at * 1000).toISOString() : 'Never'}`);
      console.log(`  Scopes: ${debugData.data.scopes?.join(', ') || 'N/A'}`);
    }
  } catch (error) {
    console.error(`  ❌ Could not get token info: ${error.message}`);
  }

  console.log('\n✨ Test complete!');
}

testMetaAPI().catch(console.error);

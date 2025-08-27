// Test Telnyx API Connectivity with Real Credentials
// Date: August 26, 2025

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Test with the provided API key
    const TELNYX_API_KEY = 'REDACTED_TELNYX_API_KEY';

    const tests = [];

    // Test 1: Get phone numbers (to see what numbers are available)
    try {
      const phoneResponse = await fetch('https://api.telnyx.com/v2/phone_numbers?page[size]=5', {
        headers: {
          'Authorization': `Bearer ${TELNYX_API_KEY}`,
          'Content-Type': 'application/json'
        }
      });

      const phoneData = await phoneResponse.json();
      
      tests.push({
        test: 'Phone Numbers List',
        status: phoneResponse.ok ? 'passed' : 'failed',
        status_code: phoneResponse.status,
        data: phoneResponse.ok ? {
          available_numbers: phoneData.data?.length || 0,
          numbers: phoneData.data?.map((num: any) => ({
            phone_number: num.phone_number,
            status: num.status
          })) || []
        } : phoneData.errors
      });
    } catch (error) {
      tests.push({
        test: 'Phone Numbers List',
        status: 'failed',
        error: error.message
      });
    }

    // Test 2: Get messaging profiles
    try {
      const profileResponse = await fetch('https://api.telnyx.com/v2/messaging_profiles?page[size]=5', {
        headers: {
          'Authorization': `Bearer ${TELNYX_API_KEY}`,
          'Content-Type': 'application/json'
        }
      });

      const profileData = await profileResponse.json();
      
      tests.push({
        test: 'Messaging Profiles',
        status: profileResponse.ok ? 'passed' : 'failed',
        status_code: profileResponse.status,
        data: profileResponse.ok ? {
          profiles_count: profileData.data?.length || 0,
          profiles: profileData.data?.map((profile: any) => ({
            id: profile.id,
            name: profile.name,
            webhook_url: profile.webhook_url
          })) || []
        } : profileData.errors
      });
    } catch (error) {
      tests.push({
        test: 'Messaging Profiles',
        status: 'failed',
        error: error.message
      });
    }

    // Test 3: Account information
    try {
      const accountResponse = await fetch('https://api.telnyx.com/v2/balance', {
        headers: {
          'Authorization': `Bearer ${TELNYX_API_KEY}`,
          'Content-Type': 'application/json'
        }
      });

      const accountData = await accountResponse.json();
      
      tests.push({
        test: 'Account Balance',
        status: accountResponse.ok ? 'passed' : 'failed',
        status_code: accountResponse.status,
        data: accountResponse.ok ? {
          balance: accountData.data?.balance,
          currency: accountData.data?.currency,
          credit_limit: accountData.data?.credit_limit
        } : accountData.errors
      });
    } catch (error) {
      tests.push({
        test: 'Account Balance',
        status: 'failed',
        error: error.message
      });
    }

    const summary = {
      total_tests: tests.length,
      passed: tests.filter(t => t.status === 'passed').length,
      failed: tests.filter(t => t.status === 'failed').length
    };

    return new Response(JSON.stringify({
      success: true,
      message: 'Telnyx API connectivity test completed',
      timestamp: new Date().toISOString(),
      summary,
      tests,
      next_steps: summary.passed > 0 ? [
        "✅ API connectivity confirmed",
        "📱 Check available phone numbers above",
        "🔗 Configure webhook URLs in messaging profiles",  
        "📝 Add credentials to Supabase secrets",
        "🚀 Start sending marketing SMS!"
      ] : [
        "❌ API connectivity issues detected",
        "🔑 Verify API key is correct",
        "📞 Contact Telnyx support if needed"
      ]
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Error testing Telnyx API:', error);
    
    return new Response(JSON.stringify({
      success: false,
      error: error.message,
      message: 'Failed to test Telnyx API connectivity'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
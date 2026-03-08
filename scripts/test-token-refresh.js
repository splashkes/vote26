// Test token refresh performance
const { createClient } = require('@supabase/supabase-js');

async function testTokenRefresh() {
  try {
    const supabaseUrl = 'https://xsqdkubgyqwpyvfltnrf.supabase.co';
    const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhzcWRrdWJneXF3cHl2Zmx0bnJmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTM0MjE2OTYsImV4cCI6MjA2ODk5NzY5Nn0.hY8v8IDZQTcdAFa_OvQNFd1CyvabGcOZZMn_J6c4c2U';
    
    console.log('🔍 Testing token refresh performance...');
    
    const supabase = createClient(supabaseUrl, supabaseAnonKey);
    
    // First login to get tokens
    console.log('1️⃣ Initial login...');
    const startLogin = performance.now();
    
    const { data: loginData, error: loginError } = await supabase.auth.signInWithPassword({
      email: 'peter@artbattle.com',
      password: '1JphAHFDV0o594g'
    });
    
    const loginDuration = performance.now() - startLogin;
    console.log(`✅ Login took: ${loginDuration.toFixed(2)}ms`);
    
    if (loginError) {
      console.log('❌ Login failed:', loginError.message);
      return;
    }
    
    console.log('🎟️ Got tokens:', {
      access_token: loginData.session.access_token.substring(0, 20) + '...',
      refresh_token: loginData.session.refresh_token.substring(0, 20) + '...'
    });
    
    // Wait a moment
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Test manual token refresh
    console.log('\n2️⃣ Manual token refresh...');
    const startRefresh = performance.now();
    
    const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession({
      refresh_token: loginData.session.refresh_token
    });
    
    const refreshDuration = performance.now() - startRefresh;
    console.log(`🔄 Token refresh took: ${refreshDuration.toFixed(2)}ms`);
    
    if (refreshError) {
      console.log('❌ Refresh failed:', refreshError.message);
    } else {
      console.log('✅ Refresh succeeded');
    }
    
    // Test direct API call to token endpoint
    console.log('\n3️⃣ Direct token refresh API call...');
    const startDirect = performance.now();
    
    const response = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=refresh_token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': supabaseAnonKey
      },
      body: JSON.stringify({
        refresh_token: loginData.session.refresh_token
      })
    });
    
    const directDuration = performance.now() - startDirect;
    console.log(`🌐 Direct API call took: ${directDuration.toFixed(2)}ms`);
    console.log(`📊 Response status: ${response.status}`);
    
    if (response.ok) {
      const result = await response.json();
      console.log('✅ Direct refresh succeeded');
    } else {
      const error = await response.text();
      console.log('❌ Direct refresh failed:', error);
    }
    
    // Test with a phone user token if we can get one
    console.log('\n4️⃣ Logout and cleanup...');
    await supabase.auth.signOut();
    
    console.log('\n📈 PERFORMANCE SUMMARY:');
    console.log(`Login: ${loginDuration.toFixed(2)}ms`);
    console.log(`Token Refresh (SDK): ${refreshDuration.toFixed(2)}ms`);
    console.log(`Token Refresh (Direct): ${directDuration.toFixed(2)}ms`);
    
    if (refreshDuration > 5000 || directDuration > 5000) {
      console.log('🚨 SLOW TOKEN REFRESH DETECTED!');
    } else {
      console.log('✅ Token refresh performance looks normal');
    }
    
  } catch (error) {
    console.error('💥 Test failed:', error.message);
  }
}

testTokenRefresh().catch(console.error);
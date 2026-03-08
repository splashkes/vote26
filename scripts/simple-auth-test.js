// Simple direct Supabase auth test
const { createClient } = require('@supabase/supabase-js');

async function testDirectSupabaseAuth() {
  console.log('🧪 Testing direct Supabase auth...');
  
  try {
    const supabaseUrl = 'https://xsqdkubgyqwpyvfltnrf.supabase.co';
    const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhzcWRrdWJneXF3cHl2Zmx0bnJmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTM0MjE2OTYsImV4cCI6MjA2ODk5NzY5Nn0.hY8v8IDZQTcdAFa_OvQNFd1CyvabGcOZZMn_J6c4c2U';
    
    console.log('🔧 Creating Supabase client...');
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false
      }
    });
    
    // Test 1: Try with login@artbattle.com
    console.log('🔐 Testing password auth with login@artbattle.com...');
    
    const { data, error } = await supabase.auth.signInWithPassword({
      email: 'login@artbattle.com',
      password: 'sokkij-xyvQy4-rakgex'
    });
    
    if (error) {
      console.log('❌ Auth failed with error:', error.message);
    } else {
      console.log('✅ Auth succeeded for login@artbattle.com');
    }
    
    // Test 2: Try with jenn.illencreative@gmail.com
    console.log('\n🔐 Testing password auth with jenn.illencreative@gmail.com...');
    
    const { data: jennData, error: jennError } = await supabase.auth.signInWithPassword({
      email: 'jenn.illencreative@gmail.com',
      password: '1JphAHFDV0o594g'
    });
    
    if (jennError) {
      console.log('❌ Jenn auth failed with error:', jennError.message);
      console.log('❌ Error code:', jennError.status);
    } else {
      console.log('✅ Jenn auth succeeded!');
      console.log('👤 User:', jennData.user?.email);
      console.log('🎟️ Session exists:', !!jennData.session);
    }
    
    // Test 2: Check if we can fetch user info at all
    console.log('\n🔍 Testing basic Supabase connection...');
    const { data: testData, error: testError } = await supabase
      .from('events')
      .select('id')
      .limit(1);
    
    if (testError) {
      console.log('❌ Basic query failed:', testError.message);
    } else {
      console.log('✅ Basic Supabase connection works');
    }
    
  } catch (error) {
    console.error('💥 Test crashed:', error.message);
    console.error('Stack:', error.stack);
  }
}

// Test auth endpoint directly
async function testAuthEndpoint() {
  console.log('\n🌐 Testing auth endpoint directly...');
  
  try {
    const response = await fetch('https://xsqdkubgyqwpyvfltnrf.supabase.co/auth/v1/token?grant_type=password', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhzcWRrdWJneXF3cHl2Zmx0bnJmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTM0MjE2OTYsImV4cCI6MjA2ODk5NzY5Nn0.hY8v8IDZQTcdAFa_OvQNFd1CyvabGcOZZMn_J6c4c2U'
      },
      body: JSON.stringify({
        email: 'login@artbattle.com',
        password: 'sokkij-xyvQy4-rakgex'
      })
    });
    
    console.log('📊 Response status:', response.status);
    console.log('📊 Response headers:', Object.fromEntries(response.headers));
    
    const responseText = await response.text();
    console.log('📊 Response body:', responseText);
    
    if (response.status === 400) {
      console.log('❌ Confirmed: 400 Bad Request error');
      try {
        const errorData = JSON.parse(responseText);
        console.log('❌ Parsed error:', errorData);
      } catch (e) {
        console.log('❌ Could not parse error response');
      }
    }
    
  } catch (error) {
    console.error('💥 Direct endpoint test failed:', error.message);
  }
}

async function runTests() {
  console.log('🎯 Running admin auth diagnostic tests...\n');
  
  await testDirectSupabaseAuth();
  await testAuthEndpoint();
}

runTests().catch(console.error);
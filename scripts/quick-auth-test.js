// Quick auth tester - usage: node quick-auth-test.js email@domain.com password
const { createClient } = require('@supabase/supabase-js');

async function testAuth(email, password) {
  try {
    const supabaseUrl = 'https://xsqdkubgyqwpyvfltnrf.supabase.co';
    const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhzcWRrdWJneXF3cHl2Zmx0bnJmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTM0MjE2OTYsImV4cCI6MjA2ODk5NzY5Nn0.hY8v8IDZQTcdAFa_OvQNFd1CyvabGcOZZMn_J6c4c2U';
    
    const supabase = createClient(supabaseUrl, supabaseAnonKey);
    
    console.log(`🔐 Testing: ${email}`);
    
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password
    });
    
    if (error) {
      console.log('❌ FAILED:', error.message);
      return false;
    } else {
      console.log('✅ SUCCESS:', data.user?.email);
      return true;
    }
    
  } catch (error) {
    console.error('💥 ERROR:', error.message);
    return false;
  }
}

// Get email and password from command line args
const email = process.argv[2];
const password = process.argv[3];

if (!email || !password) {
  console.log('Usage: node quick-auth-test.js email@domain.com password');
  process.exit(1);
}

testAuth(email, password).catch(console.error);
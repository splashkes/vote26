// Deep user account analysis - usage: node deep-user-test.js email@domain.com password
const { createClient } = require('@supabase/supabase-js');

async function deepUserTest(email, password) {
  try {
    const supabaseUrl = 'https://xsqdkubgyqwpyvfltnrf.supabase.co';
    const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhzcWRrdWJneXF3cHl2Zmx0bnJmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTM0MjE2OTYsImV4cCI6MjA2ODk5NzY5Nn0.hY8v8IDZQTcdAFa_OvQNFd1CyvabGcOZZMn_J6c4c2U';
    
    const supabase = createClient(supabaseUrl, supabaseAnonKey);
    
    console.log(`🔍 DEEP ANALYSIS FOR: ${email}\n`);
    
    // Step 1: Authenticate
    console.log('1️⃣ AUTHENTICATION TEST');
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email,
      password
    });
    
    if (authError) {
      console.log('❌ Auth failed:', authError.message);
      return;
    }
    
    const user = authData.user;
    console.log('✅ Auth successful');
    console.log('   User ID:', user.id);
    console.log('   Email:', user.email);
    console.log('   Created:', user.created_at);
    console.log('   Last login:', user.last_sign_in_at);
    console.log('   Email confirmed:', user.email_confirmed_at ? 'Yes' : 'No');
    
    // Step 2: Check admin user linkage
    console.log('\n2️⃣ ADMIN USER LINKAGE CHECK');
    const { data: adminData, error: adminError } = await supabase
      .from('abhq_admin_users')
      .select('id, email, user_id, active, level, created_at')
      .eq('email', email)
      .single();
    
    if (adminError) {
      console.log('❌ Not found in abhq_admin_users:', adminError.message);
    } else {
      console.log('✅ Found in admin users table');
      console.log('   Admin ID:', adminData.id);
      console.log('   Auth User ID:', adminData.user_id);
      console.log('   Active:', adminData.active ? 'Yes' : 'No');
      console.log('   Level:', adminData.level);
      console.log('   Linked correctly:', adminData.user_id === user.id ? 'Yes' : 'No');
    }
    
    // Step 3: Test admin function access
    console.log('\n3️⃣ ADMIN FUNCTION ACCESS TEST');
    try {
      // Test calling an admin-only function
      const { data: functionData, error: functionError } = await supabase.rpc('get_user_admin_level');
      
      if (functionError) {
        console.log('❌ Admin function failed:', functionError.message);
      } else {
        console.log('✅ Admin function access works');
        console.log('   Admin level returned:', functionData);
      }
    } catch (e) {
      console.log('❌ Admin function error:', e.message);
    }
    
    // Step 4: Test admin table access
    console.log('\n4️⃣ ADMIN TABLE ACCESS TEST');
    try {
      const { data: eventsData, error: eventsError } = await supabase
        .from('events')
        .select('id, name')
        .limit(3);
      
      if (eventsError) {
        console.log('❌ Events table access failed:', eventsError.message);
      } else {
        console.log('✅ Events table access works');
        console.log(`   Found ${eventsData.length} events`);
      }
    } catch (e) {
      console.log('❌ Events table error:', e.message);
    }
    
    // Step 5: Test protected admin table
    console.log('\n5️⃣ PROTECTED ADMIN DATA ACCESS TEST');
    try {
      const { data: adminUsersData, error: adminUsersError } = await supabase
        .from('abhq_admin_users')
        .select('id, email, level')
        .limit(3);
      
      if (adminUsersError) {
        console.log('❌ Admin users table access failed:', adminUsersError.message);
      } else {
        console.log('✅ Admin users table access works');
        console.log(`   Can see ${adminUsersData.length} admin users`);
        adminUsersData.forEach(admin => {
          console.log(`   - ${admin.email} (${admin.level})`);
        });
      }
    } catch (e) {
      console.log('❌ Admin users table error:', e.message);
    }
    
    // Step 6: Test edge function call
    console.log('\n6️⃣ EDGE FUNCTION CALL TEST');
    try {
      const { data: edgeData, error: edgeError } = await supabase.functions.invoke('admin-get-users', {
        body: { limit: 3 }
      });
      
      if (edgeError) {
        console.log('❌ Edge function failed:', edgeError.message);
      } else {
        console.log('✅ Edge function call works');
        console.log('   Response:', edgeData);
      }
    } catch (e) {
      console.log('❌ Edge function error:', e.message);
    }
    
    console.log('\n📋 SUMMARY');
    console.log('='*50);
    
  } catch (error) {
    console.error('💥 Test crashed:', error.message);
  }
}

// Get email and password from command line args
const email = process.argv[2];
const password = process.argv[3];

if (!email || !password) {
  console.log('Usage: node deep-user-test.js email@domain.com password');
  process.exit(1);
}

deepUserTest(email, password).catch(console.error);
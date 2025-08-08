// Test Supabase connection
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://xsqdkubgyqwpyvfltnrf.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhzcWRrdWJneXF3cHl2Zmx0bnJmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTM0MjE2OTYsImV4cCI6MjA2ODk5NzY5Nn0.hY8v8IDZQTcdAFa_OvQNFd1CyvabGcOZZMn_J6c4c2U';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function testQueries() {
  console.log('Testing Supabase queries...\n');

  // Test 1: Basic events query
  console.log('Test 1: Basic events query');
  const { data: events1, error: error1 } = await supabase
    .from('events')
    .select('id')
    .limit(1);
  
  console.log('Result:', { data: events1, error: error1 });
  console.log('');

  // Test 2: Events with filters
  console.log('Test 2: Events with filters');
  const { data: events2, error: error2 } = await supabase
    .from('events')
    .select('id, eid, name')
    .eq('enabled', true)
    .eq('show_in_app', true)
    .limit(5);
  
  console.log('Result:', { data: events2, error: error2 });
  console.log('');

  // Test 3: Count events
  console.log('Test 3: Count events');
  const { count, error: error3 } = await supabase
    .from('events')
    .select('*', { count: 'exact', head: true });
  
  console.log('Total events count:', count);
  console.log('Error:', error3);
  console.log('');

  // Test 4: Other tables
  console.log('Test 4: Check other tables');
  const { data: cities, error: error4 } = await supabase
    .from('cities')
    .select('id, name')
    .limit(3);
  
  console.log('Cities:', { data: cities, error: error4 });
}

testQueries();
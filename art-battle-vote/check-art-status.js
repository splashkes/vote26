import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://xsqdkubgyqwpyvfltnrf.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhzcWRrdWJneXF3cHl2Zmx0bnJmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTM0MjE2OTYsImV4cCI6MjA2ODk5NzY5Nn0.hY8v8IDZQTcdAFa_OvQNFd1CyvabGcOZZMn_J6c4c2U';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function checkArtStatus() {
  try {
    // Get event AB3018
    const { data: events } = await supabase
      .from('events')
      .select('*')
      .eq('eid', 'AB3018')
      .single();

    console.log('Event:', events?.name, events?.id);

    // Get art pieces
    const { data: artPieces, error } = await supabase
      .from('art')
      .select('*')
      .eq('event_id', events.id)
      .limit(5);

    if (error) {
      console.error('Error:', error);
      return;
    }

    console.log('\nFirst 5 art pieces:');
    artPieces.forEach(art => {
      console.log('\nArt:', art.art_code);
      console.log('  ID:', art.id);
      console.log('  Round:', art.round);
      console.log('  Status:', art.status);
      console.log('  All fields:', Object.keys(art).join(', '));
    });

    // Check for people with the phone number
    console.log('\n\nChecking for people with phone 4163025959...');
    const phoneVariants = ['14163025959', '+14163025959', '4163025959'];
    
    for (const phone of phoneVariants) {
      const { data: people } = await supabase
        .from('people')
        .select('id, phone, phone_number, name, hash')
        .or(`phone.eq."${phone}",phone_number.eq."${phone}"`);
        
      if (people && people.length > 0) {
        console.log(`\nFound people with phone ${phone}:`, people);
      }
    }

  } catch (error) {
    console.error('Error:', error);
  }
}

checkArtStatus();
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://xsqdkubgyqwpyvfltnrf.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhzcWRrdWJneXF3cHl2Zmx0bnJmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTM0MjE2OTYsImV4cCI6MjA2ODk5NzY5Nn0.hY8v8IDZQTcdAFa_OvQNFd1CyvabGcOZZMn_J6c4c2U';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function testEvent() {
  const eventId = '649c51b3-2f57-4df1-aa91-c163cb82beff';
  
  console.log(`Testing event: ${eventId}\n`);
  
  // 1. Check if event exists
  console.log('1. Checking if event exists...');
  const { data: eventData, error: eventError } = await supabase
    .from('events')
    .select('id, eid, name, venue, event_start_datetime')
    .eq('id', eventId)
    .single();
    
  if (eventError) {
    console.log('Error fetching event:', eventError);
    return;
  }
  
  console.log('Event found:', eventData);
  console.log('');
  
  // 2. Check for rounds
  console.log('2. Checking rounds...');
  const { data: roundsData, error: roundsError } = await supabase
    .from('rounds')
    .select('id, round_number, round_name')
    .eq('event_id', eventId)
    .order('round_number');
    
  console.log('Rounds found:', roundsData?.length || 0);
  if (roundsData) {
    roundsData.forEach(r => console.log(`  - Round ${r.round_number}: ${r.round_name || 'Unnamed'}`));
  }
  console.log('');
  
  // 3. Check for art
  console.log('3. Checking art pieces...');
  const { data: artData, error: artError } = await supabase
    .from('art')
    .select('id, art_code, round, easel, artist_id')
    .eq('event_id', eventId)
    .order('round')
    .order('easel')
    .limit(10);
    
  console.log('Art pieces found:', artData?.length || 0);
  if (artData && artData.length > 0) {
    console.log('Sample art pieces:');
    artData.slice(0, 3).forEach(a => {
      console.log(`  - ${a.art_code} (Round ${a.round}, Easel ${a.easel})`);
    });
  }
  console.log('');
  
  // 4. Check for artist profiles
  if (artData && artData.length > 0) {
    console.log('4. Checking artist profiles...');
    const artistIds = [...new Set(artData.map(a => a.artist_id).filter(id => id))];
    
    const { data: artistData, error: artistError } = await supabase
      .from('artist_profiles')
      .select('id, name, entry_id')
      .in('id', artistIds.slice(0, 5));
      
    console.log('Artists found:', artistData?.length || 0);
    if (artistData) {
      artistData.forEach(a => console.log(`  - ${a.name} (Entry: ${a.entry_id || 'N/A'})`));
    }
    console.log('');
  }
  
  // 5. Check for media
  if (artData && artData.length > 0) {
    console.log('5. Checking art media...');
    const artIds = artData.slice(0, 5).map(a => a.id);
    
    const { data: mediaData, error: mediaError } = await supabase
      .from('art_media')
      .select('art_id, media_file_id')
      .in('art_id', artIds);
      
    console.log('Media entries found:', mediaData?.length || 0);
    
    if (mediaData && mediaData.length > 0) {
      // Get actual media files
      const mediaFileIds = mediaData.map(m => m.media_file_id);
      const { data: fileData, error: fileError } = await supabase
        .from('media_files')
        .select('id, url, type')
        .in('id', mediaFileIds)
        .limit(3);
        
      console.log('Media files found:', fileData?.length || 0);
      if (fileData) {
        fileData.forEach(f => {
          console.log(`  - Type: ${f.type}, URL: ${f.url.substring(0, 50)}...`);
        });
      }
    }
  }
  
  // 6. Test the exact query from EventDetails component
  console.log('\n6. Testing EventDetails component query...');
  const { data: componentData, error: componentError } = await supabase
    .from('art')
    .select(`
      *,
      artist_profiles!art_artist_id_fkey (
        id,
        name,
        entry_id,
        bio,
        instagram,
        city_text
      )
    `)
    .eq('event_id', eventId)
    .order('round')
    .order('easel')
    .limit(5);
    
  if (componentError) {
    console.log('Component query error:', componentError);
  } else {
    console.log('Component query successful, rows:', componentData?.length || 0);
    if (componentData && componentData.length > 0) {
      console.log('First result:', {
        art_code: componentData[0].art_code,
        artist_name: componentData[0].artist_profiles?.name
      });
    }
  }
}

testEvent();
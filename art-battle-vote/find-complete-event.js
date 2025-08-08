import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://xsqdkubgyqwpyvfltnrf.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhzcWRrdWJneXF3cHl2Zmx0bnJmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTM0MjE2OTYsImV4cCI6MjA2ODk5NzY5Nn0.hY8v8IDZQTcdAFa_OvQNFd1CyvabGcOZZMn_J6c4c2U';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function findCompleteEvent() {
  console.log('Searching for recent events with complete data...\n');
  
  // Get recent events
  const tenDaysAgo = new Date();
  tenDaysAgo.setDate(tenDaysAgo.getDate() - 10);
  
  const { data: events, error } = await supabase
    .from('events')
    .select('id, eid, name, event_start_datetime')
    .eq('enabled', true)
    .eq('show_in_app', true)
    .gte('event_start_datetime', tenDaysAgo.toISOString())
    .lte('event_start_datetime', new Date().toISOString())
    .order('event_start_datetime', { ascending: false })
    .limit(10);
    
  if (error) {
    console.log('Error fetching events:', error);
    return;
  }
  
  console.log(`Found ${events.length} recent events\n`);
  
  // Check each event for completeness
  for (const event of events) {
    console.log(`Checking ${event.name}...`);
    
    // Check for rounds
    const { data: rounds } = await supabase
      .from('rounds')
      .select('id')
      .eq('event_id', event.id);
      
    const roundCount = rounds?.length || 0;
    
    // Check for art
    const { data: art } = await supabase
      .from('art')
      .select('id')
      .eq('event_id', event.id)
      .limit(1);
      
    const hasArt = art && art.length > 0;
    
    // Check for media
    let hasMedia = false;
    if (hasArt) {
      const { data: artWithMedia } = await supabase
        .from('art')
        .select('id')
        .eq('event_id', event.id)
        .limit(10);
        
      if (artWithMedia && artWithMedia.length > 0) {
        const artIds = artWithMedia.map(a => a.id);
        const { data: media } = await supabase
          .from('art_media')
          .select('art_id')
          .in('art_id', artIds)
          .limit(1);
          
        hasMedia = media && media.length > 0;
      }
    }
    
    console.log(`  - Rounds: ${roundCount}`);
    console.log(`  - Has art: ${hasArt ? 'Yes' : 'No'}`);
    console.log(`  - Has media: ${hasMedia ? 'Yes' : 'No'}`);
    console.log(`  - Event ID: ${event.id}`);
    
    if (roundCount > 0 && hasArt && hasMedia) {
      console.log(`  ✓ COMPLETE EVENT FOUND!\n`);
      
      // Get more details about this event
      const { data: artDetails } = await supabase
        .from('art')
        .select(`
          id,
          art_code,
          round,
          easel,
          artist_profiles!art_artist_id_fkey (
            name
          )
        `)
        .eq('event_id', event.id)
        .limit(5);
        
      console.log('Sample artworks:');
      artDetails?.forEach(a => {
        console.log(`  - ${a.art_code}: ${a.artist_profiles?.name || 'Unknown'}`);
      });
      
      // Get media details
      const artIds = artDetails?.map(a => a.id) || [];
      const { data: mediaDetails } = await supabase
        .from('art_media')
        .select(`
          art_id,
          media_files!inner (
            url,
            type
          )
        `)
        .in('art_id', artIds);
        
      console.log(`\nMedia files found: ${mediaDetails?.length || 0}`);
      if (mediaDetails && mediaDetails.length > 0) {
        console.log('Sample media:');
        mediaDetails.slice(0, 3).forEach(m => {
          console.log(`  - ${m.media_files.type}: ${m.media_files.url.substring(0, 50)}...`);
        });
      }
      
      return event;
    }
    console.log('');
  }
  
  console.log('No complete events found in recent events. Checking all events...\n');
  
  // Try to find any event with media
  const { data: eventsWithMedia } = await supabase
    .from('art_media')
    .select(`
      art!inner (
        event_id,
        events!inner (
          id,
          eid,
          name,
          enabled,
          show_in_app
        )
      )
    `)
    .limit(10);
    
  if (eventsWithMedia && eventsWithMedia.length > 0) {
    const uniqueEvents = new Map();
    eventsWithMedia.forEach(m => {
      const event = m.art.events;
      if (event.enabled && event.show_in_app) {
        uniqueEvents.set(event.id, event);
      }
    });
    
    console.log(`Found ${uniqueEvents.size} events with media:`);
    Array.from(uniqueEvents.values()).slice(0, 5).forEach(e => {
      console.log(`  - ${e.name} (${e.id})`);
    });
  }
}

findCompleteEvent();
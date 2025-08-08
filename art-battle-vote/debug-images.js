import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://xsqdkubgyqwpyvfltnrf.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhzcWRrdWJneXF3cHl2Zmx0bnJmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTM0MjE2OTYsImV4cCI6MjA2ODk5NzY5Nn0.hY8v8IDZQTcdAFa_OvQNFd1CyvabGcOZZMn_J6c4c2U';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function debugImages() {
  try {
    // Get a recent event
    const { data: events, error: eventError } = await supabase
      .from('events')
      .select('*')
      .eq('enabled', true)
      .eq('show_in_app', true)
      .order('created_at', { ascending: false })
      .limit(1);

    if (eventError) throw eventError;
    
    if (!events || events.length === 0) {
      console.log('No events found');
      return;
    }

    const event = events[0];
    console.log('Testing event:', event.name, event.id);

    // Get artworks
    const { data: artworks, error: artError } = await supabase
      .from('art')
      .select('*')
      .eq('event_id', event.id)
      .limit(5);

    if (artError) throw artError;
    console.log('\nFound', artworks.length, 'artworks');

    // Get media for these artworks
    const artIds = artworks.map(a => a.id);
    
    const { data: mediaData, error: mediaError } = await supabase
      .from('art_media')
      .select(`
        art_id,
        media_id,
        display_order,
        media_files!art_media_media_id_fkey (
          id,
          original_url,
          thumbnail_url,
          compressed_url,
          file_type,
          created_at
        )
      `)
      .in('art_id', artIds)
      .eq('media_files.file_type', 'image');

    if (mediaError) {
      console.error('Media error:', mediaError);
      throw mediaError;
    }

    console.log('\nMedia data found:', mediaData?.length || 0, 'items');
    
    if (mediaData && mediaData.length > 0) {
      console.log('\nFirst few media items:');
      mediaData.slice(0, 3).forEach((media, index) => {
        console.log(`\nMedia ${index + 1}:`);
        console.log('  Art ID:', media.art_id);
        console.log('  Media ID:', media.media_id);
        console.log('  Display order:', media.display_order);
        console.log('  Media files:', media.media_files ? 'Present' : 'NULL');
        if (media.media_files) {
          console.log('    - Thumbnail:', media.media_files.thumbnail_url || 'none');
          console.log('    - Compressed:', media.media_files.compressed_url || 'none');
          console.log('    - Original:', media.media_files.original_url || 'none');
          console.log('    - Created:', media.media_files.created_at);
        }
      });
    }

    // Try a simpler query
    console.log('\n\nTrying simpler query for media_files directly:');
    const { data: mediaFiles, error: mfError } = await supabase
      .from('media_files')
      .select('*')
      .eq('file_type', 'image')
      .limit(3);

    if (mfError) {
      console.error('Media files error:', mfError);
    } else {
      console.log('Found', mediaFiles?.length || 0, 'media files');
      mediaFiles?.forEach((mf, index) => {
        console.log(`\nMedia file ${index + 1}:`);
        console.log('  ID:', mf.id);
        console.log('  Thumbnail:', mf.thumbnail_url || 'none');
        console.log('  Compressed:', mf.compressed_url || 'none');
        console.log('  Original:', mf.original_url || 'none');
      });
    }

  } catch (error) {
    console.error('Error:', error);
  }
}

debugImages();
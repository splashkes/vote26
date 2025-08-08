import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://xsqdkubgyqwpyvfltnrf.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhzcWRrdWJneXF3cHl2Zmx0bnJmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTM0MjE2OTYsImV4cCI6MjA2ODk5NzY5Nn0.hY8v8IDZQTcdAFa_OvQNFd1CyvabGcOZZMn_J6c4c2U';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function checkBid() {
  console.log('Checking for bid on AB3020-3-3...\n');
  
  // First, find the art piece
  const { data: artData, error: artError } = await supabase
    .from('art')
    .select('id, art_code, event_id')
    .eq('art_code', 'AB3020-3-3')
    .single();
    
  if (artError) {
    console.log('Error finding art piece:', artError);
    return;
  }
  
  console.log('Art piece found:', artData);
  console.log('');
  
  // Check for recent bids on this art piece
  const { data: bids, error: bidsError } = await supabase
    .from('bids')
    .select('*')
    .eq('art_id', artData.id)
    .order('created_at', { ascending: false })
    .limit(5);
    
  if (bidsError) {
    console.log('Error fetching bids:', bidsError);
    return;
  }
  
  console.log(`Found ${bids?.length || 0} bids on this artwork:\n`);
  
  if (bids && bids.length > 0) {
    bids.forEach((bid, index) => {
      console.log(`Bid ${index + 1}:`);
      console.log(`  Amount: $${bid.amount}`);
      console.log(`  Created: ${new Date(bid.created_at).toLocaleString()}`);
      console.log(`  Bid ID: ${bid.id}`);
      console.log(`  Bidder ID: ${bid.bidder_id || 'Anonymous'}`);
      console.log('');
    });
    
    // Check specifically for a $100 bid
    const hundredDollarBid = bids.find(b => b.amount === 100);
    if (hundredDollarBid) {
      console.log('✓ Found your $100 bid!');
      console.log(`  Created at: ${new Date(hundredDollarBid.created_at).toLocaleString()}`);
    } else {
      console.log('✗ No $100 bid found in recent bids');
    }
  } else {
    console.log('No bids found for this artwork');
  }
  
  // Also check the event to make sure it's the right one
  const { data: eventData } = await supabase
    .from('events')
    .select('name, eid')
    .eq('id', artData.event_id)
    .single();
    
  console.log('\nEvent info:', eventData);
}

checkBid();
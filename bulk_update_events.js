// Bulk update events with proper timezone handling
const ACCESS_TOKEN = "eyJhbGciOiJIUzI1NiIsImtpZCI6IktOUTlNUm5mRGxERWZwUlYiLCJ0eXAiOiJKV1QifQ.eyJpc3MiOiJodHRwczovL3hzcWRrdWJneXF3cHl2Zmx0bnJmLnN1cGFiYXNlLmNvL2F1dGgvdjEiLCJzdWIiOiJhMzdhYjg0OC00Yzc2LTRiOTQtOTUyMS1hMGQ2MDU3MzMwN2YiLCJhdWQiOiJhdXRoZW50aWNhdGVkIiwiZXhwIjoxNzU2ODUzNDIzLCJpYXQiOjE3NTY4MzU0MjMsImVtYWlsIjoibG9naW5AYXJ0YmF0dGxlLmNvbSIsInBob25lIjoiIiwiYXBwX21ldGFkYXRhIjp7InByb3ZpZGVyIjoiZW1haWwiLCJwcm92aWRlcnMiOlsiZW1haWwiXX0sInVzZXJfbWV0YWRhdGEiOnsiZW1haWxfdmVyaWZpZWQiOnRydWV9LCJyb2xlIjoiYXV0aGVudGljYXRlZCIsImFhbCI6ImFhbDEiLCJhbXIiOlt7Im1ldGhvZCI6InBhc3N3b3JkIiwidGltZXN0YW1wIjoxNzU2NDk1NTA1fV0sInNlc3Npb25faWQiOiJlZjVkMjMxZC0zZjY4LTRlODEtOGYyOC0xYTAxZWU5OGUzNmYiLCJpc19hbm9ueW1vdXMiOmZhbHNlfQ.5PFLPoZInVf8UPHt2Fd4ynBPiT0NYue2MQ58t_pRG-8";

const SUPABASE_URL = "https://xsqdkubgyqwpyvfltnrf.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhzcWRrdWJneXF3cHl2Zmx0bnJmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MTgyMzU5MzcsImV4cCI6MjAzMzgxMTkzN30.Y8IixRa0FHw5BDJvZ7eiQkV_MU8OKpHNk5wT0KqT0vI";

const events = [
  { eid: 'AB3029', id: 'b3102fcb-97df-46c0-914b-02963fe47913', start: '2025-09-06T18:00', end: '2025-09-06T21:00', timezone: 'America/Los_Angeles' },
  { eid: 'AB3053', id: '98194860-7241-4f70-9179-30bfed23ec9d', start: '2025-09-06T18:00', end: '2025-09-06T21:00', timezone: 'America/New_York' },
  { eid: 'AB3039', id: 'f2fc286c-7f6e-4dae-a72c-757e93e0ebb9', start: '2025-09-11T18:30', end: '2025-09-11T21:30', timezone: 'America/New_York' },
  { eid: 'AB3026', id: '2f49e384-cee9-4851-9f85-83ee79089400', start: '2025-09-17T19:00', end: '2025-09-17T22:00', timezone: 'America/Los_Angeles' },
  { eid: 'AB3040', id: 'dc55b5a8-ad9c-4698-a2a7-81f76a4b3a2d', start: '2025-09-18T19:00', end: '2025-09-18T22:00', timezone: 'America/New_York' },
  { eid: 'AB3035', id: '5bd3d688-aa58-49e3-8991-83508febe869', start: '2025-09-19T18:00', end: '2025-09-19T21:00', timezone: 'America/Los_Angeles' },
  { eid: 'AB3001', id: '4beef9d2-7409-40ad-bb50-8599de244139', start: '2025-09-19T19:00', end: '2025-09-19T22:00', timezone: 'Australia/Sydney' },
  { eid: 'AB3048', id: '4c0d6e66-1e69-4c62-b86e-07b994505e15', start: '2025-09-19T19:00', end: '2025-09-19T22:00', timezone: 'America/Toronto' },
  { eid: 'AB3036', id: '09fc6a24-a926-4678-b09d-12c17837cd15', start: '2025-09-20T18:00', end: '2025-09-20T21:00', timezone: 'America/Vancouver' },
  { eid: 'AB3052', id: '6226531d-9bff-4c08-9219-61756b89b321', start: '2025-09-20T18:00', end: '2025-09-20T21:00', timezone: 'Pacific/Auckland' },
  { eid: 'AB2938', id: '6ab17fa2-218c-4201-a937-20ade48a36b1', start: '2025-09-23T19:30', end: '2025-09-23T22:30', timezone: 'America/Toronto' },
  { eid: 'AB3041', id: '841610b9-2279-48ac-98a0-227774d6139d', start: '2025-09-23T19:00', end: '2025-09-23T22:00', timezone: 'America/New_York' },
  { eid: 'AB3037', id: '2616b96f-ddfa-4408-915c-c49e5dc710fa', start: '2025-09-25T19:00', end: '2025-09-25T22:00', timezone: 'America/New_York' },
  { eid: 'AB3050', id: '29604d07-22aa-4add-a787-7a51952725e8', start: '2025-09-26T18:00', end: '2025-09-26T21:00', timezone: 'America/New_York' },
  { eid: 'AB3023', id: '09e62fd8-206f-4a5b-862d-e3e568e5c3d8', start: '2025-09-27T19:00', end: '2025-09-27T22:00', timezone: 'Asia/Bangkok' },
  { eid: 'AB3056', id: '086993b1-f297-4743-ab84-57cc4ae06ab6', start: '2025-09-28T17:00', end: '2025-09-28T20:00', timezone: 'America/New_York' },
  { eid: 'AB3030', id: '354064a0-9cf9-473c-931a-37c212a343e4', start: '2025-10-05T19:00', end: '2025-10-05T22:00', timezone: 'Europe/Amsterdam' },
  { eid: 'AB3038', id: '0a7c65a6-d0c4-4652-b8ca-e3e969f9d301', start: '2025-10-18T14:00', end: '2025-10-18T17:00', timezone: 'Pacific/Auckland' },
  { eid: 'AB3006', id: '453dfd89-1507-49e2-bb0a-8d7d6d2c2126', start: '2025-10-19T10:00', end: '2025-10-19T13:00', timezone: 'Australia/Sydney' },
  { eid: 'AB2941', id: 'bf6fc9ee-845a-449e-b0c2-c203fbee3ef9', start: '2025-10-21T19:30', end: '2025-10-21T22:30', timezone: 'America/Toronto' },
  { eid: 'AB3032', id: '62ed65fb-8a13-4f8b-8601-fb163cee7a33', start: '2025-10-22T19:00', end: '2025-10-22T22:00', timezone: 'America/Los_Angeles' },
  { eid: 'AB2947', id: '8530b6b9-c24c-4c8e-86d5-4b2e73c5ec8f', start: '2025-10-30T16:30', end: '2025-10-30T19:30', timezone: 'America/Los_Angeles' },
  { eid: 'AB3010', id: '1accf1a4-1afd-476e-8a91-19a41378bf9d', start: '2025-11-14T19:00', end: '2025-11-14T22:00', timezone: 'Australia/Sydney' },
  { eid: 'AB3058', id: '52080eff-6cb0-49d7-be8d-7dfa9a026895', start: '2025-11-27T18:00', end: '2025-11-27T21:00', timezone: 'Pacific/Auckland' }
];

// First, fetch existing event data
const fetchEventData = async (eventId) => {
  try {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/events?id=eq.${eventId}&select=*`, {
      headers: {
        'Authorization': `Bearer ${ACCESS_TOKEN}`,
        'apikey': SUPABASE_ANON_KEY,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch event ${eventId}: ${response.status}`);
    }

    const data = await response.json();
    return data[0];
  } catch (error) {
    console.error(`Error fetching event ${eventId}:`, error);
    return null;
  }
};

const updateEvent = async (event) => {
  console.log(`\n📅 Updating ${event.eid}...`);
  
  // First fetch existing data
  const existingEvent = await fetchEventData(event.id);
  if (!existingEvent) {
    console.error(`❌ Could not fetch existing data for ${event.eid}`);
    return false;
  }

  const payload = {
    id: event.id,
    eid: event.eid,
    name: existingEvent.name,
    description: existingEvent.description || '',
    venue: existingEvent.venue || '',
    city_id: existingEvent.city_id,
    country_id: existingEvent.country_id,
    event_start_datetime: event.start,
    event_end_datetime: event.end,
    timezone_icann: event.timezone,
    enabled: existingEvent.enabled ?? true,
    show_in_app: existingEvent.show_in_app ?? true,
    current_round: existingEvent.current_round ?? 0,
    capacity: existingEvent.capacity || 200,
    eventbrite_id: existingEvent.eventbrite_id
  };

  console.log(`   Start: ${event.start} → End: ${event.end} (${event.timezone})`);
  
  try {
    const response = await fetch(`${SUPABASE_URL}/functions/v1/admin-update-event`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${ACCESS_TOKEN}`
      },
      body: JSON.stringify(payload)
    });

    const responseText = await response.text();
    
    if (!response.ok) {
      console.error(`❌ HTTP ${response.status} - ${responseText}`);
      
      // Try to parse debug info
      try {
        const errorData = JSON.parse(responseText);
        if (errorData.debug) {
          console.error('Debug info:', errorData.debug);
        }
      } catch (parseError) {
        // Response wasn't JSON
      }
      return false;
    }

    const result = JSON.parse(responseText);
    if (result.success) {
      console.log(`✅ ${event.eid} updated successfully`);
      return true;
    } else {
      console.error(`❌ Update failed for ${event.eid}:`, result);
      return false;
    }
  } catch (error) {
    console.error(`❌ Network error updating ${event.eid}:`, error.message);
    return false;
  }
};

const updateAllEvents = async () => {
  console.log(`🚀 Starting bulk update of ${events.length} events...\n`);
  
  let successCount = 0;
  let failCount = 0;

  for (const event of events) {
    const success = await updateEvent(event);
    if (success) {
      successCount++;
    } else {
      failCount++;
    }
    
    // Small delay to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  console.log(`\n📊 Update Summary:`);
  console.log(`✅ Successful: ${successCount}`);
  console.log(`❌ Failed: ${failCount}`);
  console.log(`📋 Total: ${events.length}`);
};

// Run the bulk update
updateAllEvents().catch(console.error);
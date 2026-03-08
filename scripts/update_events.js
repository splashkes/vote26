// Update events via admin API
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

const updateEvent = async (event) => {
  const payload = {
    id: event.id,
    eid: event.eid,
    event_start_datetime: event.start,
    event_end_datetime: event.end,
    timezone_icann: event.timezone,
    // Keep existing fields - we'll need to fetch them first
    name: `Updating ${event.eid}`,
    enabled: true,
    show_in_app: true,
    current_round: 0,
    capacity: 200
  };

  console.log(`Updating ${event.eid} (${event.id}): ${event.start} → ${event.end} (${event.timezone})`);
  
  try {
    const response = await fetch('https://xsqdkubgyqwpyvfltnrf.supabase.co/functions/v1/admin-update-event', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer YOUR_TOKEN_HERE' // Replace with actual token
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ Failed to update ${event.eid}: ${response.status} - ${errorText}`);
      return false;
    }

    const result = await response.json();
    if (result.success) {
      console.log(`✅ Updated ${event.eid} successfully`);
      return true;
    } else {
      console.error(`❌ Update failed for ${event.eid}:`, result);
      return false;
    }
  } catch (error) {
    console.error(`❌ Network error updating ${event.eid}:`, error);
    return false;
  }
};

// Note: This script needs to be run with proper authentication token
console.log('Event update script ready. Events to update:');
events.forEach(event => {
  console.log(`${event.eid}: ${event.start} → ${event.end} (${event.timezone})`);
});

console.log('\nTo run updates, you need to:');
console.log('1. Replace YOUR_TOKEN_HERE with actual admin token');
console.log('2. Fetch existing event data to preserve other fields');
console.log('3. Execute updateEvent() for each event');

module.exports = { events, updateEvent };
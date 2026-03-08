// Event updates with timezone conversion
const eventUpdates = [
  { eid: 'AB3029', location: 'Berkeley CA', datetime: '2025-09-06 18:00:00-07:00' },
  { eid: 'AB3053', location: 'Wilmington DE', datetime: '2025-09-06 18:00:00-04:00' },
  { eid: 'AB3039', location: 'Lancaster PA', datetime: '2025-09-11 18:30:00-04:00' },
  { eid: 'AB3026', location: 'San Francisco CA', datetime: '2025-09-17 19:00:00-07:00' },
  { eid: 'AB3040', location: 'Boston MA', datetime: '2025-09-18 19:00:00-04:00' },
  { eid: 'AB3035', location: 'San Francisco CA', datetime: '2025-09-19 18:00:00-07:00' },
  { eid: 'AB3001', location: 'Sydney AU', datetime: '2025-09-19 19:00:00+10:00' },
  { eid: 'AB3048', location: 'Ottawa ON', datetime: '2025-09-19 19:00:00-04:00' },
  { eid: 'AB3036', location: 'Victoria BC', datetime: '2025-09-20 18:00:00-07:00' },
  { eid: 'AB3052', location: 'Auckland NZ', datetime: '2025-09-20 18:00:00+12:00' },
  { eid: 'AB2938', location: 'Toronto ON', datetime: '2025-09-23 19:30:00-04:00' },
  { eid: 'AB3041', location: 'Grand Rapids MI', datetime: '2025-09-23 19:00:00-04:00' },
  { eid: 'AB3037', location: 'Pittsburgh PA', datetime: '2025-09-25 19:00:00-04:00' },
  { eid: 'AB3050', location: 'Philadelphia PA', datetime: '2025-09-26 18:00:00-04:00' },
  { eid: 'AB3023', location: 'Bangkok TH', datetime: '2025-09-27 19:00:00+07:00' },
  { eid: 'AB3056', location: 'Pawtucket RI', datetime: '2025-09-28 17:00:00-04:00' },
  { eid: 'AB3030', location: 'Amsterdam NL', datetime: '2025-10-05 19:00:00+02:00' },
  { eid: 'AB3038', location: 'Auckland NZ', datetime: '2025-10-18 14:00:00+13:00' },
  { eid: 'AB3006', location: 'Sydney AU', datetime: '2025-10-19 10:00:00+11:00' },
  { eid: 'AB2941', location: 'Toronto ON', datetime: '2025-10-21 19:30:00-04:00' },
  { eid: 'AB3032', location: 'San Francisco CA', datetime: '2025-10-22 19:00:00-07:00' },
  { eid: 'AB2947', location: 'San Francisco CA', datetime: '2025-10-30 16:30:00-07:00' },
  { eid: 'AB3054', location: 'Lancaster PA', datetime: '2025-10-30 18:30:00-04:00' },
  { eid: 'AB3051', location: 'Berkeley CA', datetime: '2025-11-01 18:00:00-07:00' },
  { eid: 'AB3010', location: 'Sydney AU', datetime: '2025-11-14 19:00:00+11:00' },
  { eid: 'AB2944', location: 'Toronto ON', datetime: '2025-11-18 19:30:00-05:00' },
  { eid: 'AB3058', location: 'Auckland NZ', datetime: '2025-11-27 18:00:00+13:00' },
  { eid: 'AB3045', location: 'Pittsburgh PA', datetime: '2025-12-05 19:00:00-05:00' },
  { eid: 'AB3057', location: 'Berkeley CA', datetime: '2025-12-06 18:00:00-08:00' },
  { eid: 'AB3034', location: 'San Francisco CA', datetime: '2025-12-10 19:00:00-08:00' },
  { eid: 'AB2952', location: 'Toronto ON', datetime: '2025-12-16 19:30:00-05:00' }
];

// Timezone mapping from offset to IANA timezone
const offsetToTimezone = {
  '-08:00': 'America/Los_Angeles', // PST
  '-07:00': 'America/Los_Angeles', // PDT  
  '-05:00': 'America/New_York',    // EST
  '-04:00': 'America/New_York',    // EDT
  '+02:00': 'Europe/Amsterdam',    // CEST
  '+07:00': 'Asia/Bangkok',        // ICT
  '+10:00': 'Australia/Sydney',    // AEST
  '+11:00': 'Australia/Sydney',    // AEDT
  '+12:00': 'Pacific/Auckland',    // NZST
  '+13:00': 'Pacific/Auckland'     // NZDT
};

// Location-specific timezone overrides
const locationTimezones = {
  'Toronto ON': 'America/Toronto',
  'Ottawa ON': 'America/Toronto', 
  'Victoria BC': 'America/Vancouver',
  'Amsterdam NL': 'Europe/Amsterdam'
};

// Parse and convert events
const processedEvents = eventUpdates.map(event => {
  const [datePart, timePart] = event.datetime.split(' ');
  const timeWithOffset = timePart;
  const offset = timeWithOffset.slice(-6); // Get last 6 chars like +10:00
  const timeOnly = timeWithOffset.slice(0, -6); // Remove offset
  
  // Determine timezone
  const timezone = locationTimezones[event.location] || offsetToTimezone[offset];
  
  // Create start datetime in datetime-local format
  const startDateTime = `${datePart}T${timeOnly}`;
  
  // Calculate end time (3 hours later)
  const [hours, minutes] = timeOnly.split(':');
  const endHour = (parseInt(hours) + 3) % 24;
  const endTime = `${endHour.toString().padStart(2, '0')}:${minutes}`;
  const endDateTime = `${datePart}T${endTime}:00`;
  
  return {
    ...event,
    timezone,
    startDateTime,
    endDateTime,
    offset
  };
});

console.log('Processed events:');
processedEvents.forEach(event => {
  console.log(`${event.eid}: ${event.startDateTime} → ${event.endDateTime} (${event.timezone})`);
});
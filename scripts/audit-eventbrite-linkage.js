#!/usr/bin/env node

/**
 * Audit Eventbrite Event Linkage
 * Outputs CSV showing which events may have incorrect Eventbrite IDs
 */

import { createClient } from '@supabase/supabase-js';
import { writeFileSync } from 'fs';

const supabaseUrl = process.env.SUPABASE_URL || 'https://xsqdkubgyqwpyvfltnrf.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseKey) {
  console.error('ERROR: SUPABASE_SERVICE_ROLE_KEY environment variable not set');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function auditEventbriteLinkage() {
  console.log('🔍 Auditing Eventbrite event linkage...\n');

  // Get all events with eventbrite_id
  const { data: events, error: eventsError } = await supabase
    .from('events')
    .select(`
      id,
      eid,
      name,
      event_start_datetime,
      eventbrite_id,
      city_id,
      cities (
        name,
        countries (
          currency_code
        )
      )
    `)
    .not('eventbrite_id', 'is', null)
    .order('event_start_datetime', { ascending: false });

  if (eventsError) {
    console.error('Error fetching events:', eventsError);
    process.exit(1);
  }

  console.log(`Found ${events.length} events with Eventbrite IDs\n`);

  // Get latest cache entry for each event
  const csvRows = [];
  csvRows.push([
    'EID',
    'Event Name (Database)',
    'Event Date',
    'City',
    'Currency',
    'Eventbrite ID',
    'Eventbrite Event Name (API)',
    'Eventbrite Start Date (API)',
    'Net Deposit',
    'Tickets Sold',
    'Match Status'
  ].join(','));

  for (const event of events) {
    const { data: cache, error: cacheError } = await supabase
      .from('eventbrite_api_cache')
      .select('eventbrite_event_name, eventbrite_start_date, net_deposit, total_tickets_sold, currency_code')
      .eq('eid', event.eid)
      .order('fetched_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const cityName = event.cities?.name || 'Unknown';
    const currencyCode = event.cities?.countries?.currency_code || 'Unknown';
    const eventDate = new Date(event.event_start_datetime).toISOString().split('T')[0];

    // Determine match status
    let matchStatus = 'NO_DATA';
    if (cache) {
      const dbEventName = event.name.toLowerCase();
      const ebEventName = (cache.eventbrite_event_name || '').toLowerCase();

      // Check if city matches
      const cityMatch = ebEventName.includes(cityName.toLowerCase());

      // Check if dates are close (within 7 days)
      const dbDate = new Date(event.event_start_datetime);
      const ebDate = cache.eventbrite_start_date ? new Date(cache.eventbrite_start_date) : null;
      const daysDiff = ebDate ? Math.abs((dbDate - ebDate) / (1000 * 60 * 60 * 24)) : 999;
      const dateMatch = daysDiff <= 7;

      if (cityMatch && dateMatch) {
        matchStatus = 'OK';
      } else if (!cityMatch && !dateMatch) {
        matchStatus = 'MISMATCH_SEVERE';
      } else {
        matchStatus = 'MISMATCH_PARTIAL';
      }
    }

    csvRows.push([
      event.eid,
      `"${event.name}"`,
      eventDate,
      cityName,
      currencyCode,
      event.eventbrite_id || '',
      cache ? `"${cache.eventbrite_event_name || 'Unknown'}"` : '',
      cache?.eventbrite_start_date ? new Date(cache.eventbrite_start_date).toISOString().split('T')[0] : '',
      cache?.net_deposit || '0.00',
      cache?.total_tickets_sold || '0',
      matchStatus
    ].join(','));
  }

  // Write CSV file
  const outputFile = '/root/vote_app/vote26/eventbrite-linkage-audit.csv';
  writeFileSync(outputFile, csvRows.join('\n'));

  console.log(`✅ Audit complete! CSV written to: ${outputFile}`);
  console.log(`\nMatch Status Summary:`);

  const statusCounts = {
    OK: 0,
    MISMATCH_SEVERE: 0,
    MISMATCH_PARTIAL: 0,
    NO_DATA: 0
  };

  csvRows.slice(1).forEach(row => {
    const status = row.split(',').pop();
    statusCounts[status] = (statusCounts[status] || 0) + 1;
  });

  console.log(`  ✅ OK: ${statusCounts.OK}`);
  console.log(`  ⚠️  PARTIAL MISMATCH: ${statusCounts.MISMATCH_PARTIAL}`);
  console.log(`  ❌ SEVERE MISMATCH: ${statusCounts.MISMATCH_SEVERE}`);
  console.log(`  📭 NO DATA: ${statusCounts.NO_DATA}`);
}

auditEventbriteLinkage().catch(console.error);

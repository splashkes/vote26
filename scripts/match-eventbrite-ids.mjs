#!/usr/bin/env node

/**
 * Match Historical Events to Eventbrite IDs
 *
 * Strategy:
 * 1. Fetch ALL completed events from Eventbrite API (paginated)
 * 2. Match to database events by city name + date proximity (±7 days)
 * 3. Output high-confidence matches for review
 * 4. Generate SQL UPDATE statements
 */

import pg from 'pg';
const { Pool } = pg;

const EVENTBRITE_TOKEN = '7LME6RSW6TFLEFBDS6DU';
const EB_ORG_ID = '263333410230';

const pool = new Pool({
  host: 'db.xsqdkubgyqwpyvfltnrf.supabase.co',
  port: 5432,
  database: 'postgres',
  user: 'postgres',
  password: '6kEtvU9n0KhTVr5'
});

async function fetchAllEventbriteEvents() {
  const allEvents = [];
  let page = 1;
  let hasMore = true;

  console.log('📥 Fetching all Eventbrite events...');

  while (hasMore) {
    const url = `https://www.eventbriteapi.com/v3/organizations/${EB_ORG_ID}/events/?order_by=start_desc&status=ended&page_size=100&page=${page}`;

    const response = await fetch(url, {
      headers: { 'Authorization': `Bearer ${EVENTBRITE_TOKEN}` }
    });

    const data = await response.json();

    if (data.events && data.events.length > 0) {
      allEvents.push(...data.events);
      console.log(`  Page ${page}: ${data.events.length} events (total: ${allEvents.length})`);

      hasMore = data.pagination.has_more_items;
      page++;
    } else {
      hasMore = false;
    }

    // Rate limiting
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  console.log(`✅ Fetched ${allEvents.length} total Eventbrite events\n`);
  return allEvents;
}

async function fetchDatabaseEvents() {
  console.log('📥 Fetching database events without Eventbrite IDs...');

  const result = await pool.query(`
    SELECT
      e.id,
      e.eid,
      e.name,
      e.event_start_datetime,
      e.eventbrite_id,
      c.name as city_name
    FROM events e
    LEFT JOIN cities c ON e.city_id = c.id
    WHERE e.event_start_datetime >= '2018-01-01'
      AND e.event_start_datetime < '2024-06-01'
      AND (e.eventbrite_id IS NULL OR e.eventbrite_id = '')
    ORDER BY e.event_start_datetime DESC
  `);

  console.log(`✅ Found ${result.rows.length} database events without Eventbrite IDs\n`);
  return result.rows;
}

function extractCityFromEbName(ebName) {
  // "Art Battle Toronto - September 23, 2024" -> "Toronto"
  // "Art Battle Montréal -  1 Octobre, 2025" -> "Montréal"
  const match = ebName.match(/Art Battle\s+([A-Za-zÀ-ÿ\s]+?)\s*[-–]/i);
  return match ? match[1].trim() : null;
}

function matchEvents(dbEvents, ebEvents) {
  const matches = [];
  const unmatched = [];

  for (const dbEvent of dbEvents) {
    const dbDate = new Date(dbEvent.event_start_datetime);
    const dbCity = (dbEvent.city_name || '').toLowerCase();

    let bestMatch = null;
    let bestScore = 0;

    for (const ebEvent of ebEvents) {
      const ebDate = new Date(ebEvent.start.local);
      const ebCity = extractCityFromEbName(ebEvent.name.text);

      if (!ebCity) continue;

      // Calculate match score
      let score = 0;

      // Date proximity (within 7 days = 100 points, further = less points)
      const daysDiff = Math.abs((dbDate - ebDate) / (1000 * 60 * 60 * 24));
      if (daysDiff <= 7) {
        score += 100 - (daysDiff * 10);
      }

      // City match (exact = 100 points, partial = 50 points)
      const ebCityLower = ebCity.toLowerCase();
      if (dbCity === ebCityLower) {
        score += 100;
      } else if (dbCity.includes(ebCityLower) || ebCityLower.includes(dbCity)) {
        score += 50;
      }

      // Check if Eventbrite ID is already used
      const alreadyUsed = dbEvents.some(e => e.eventbrite_id === ebEvent.id);
      if (alreadyUsed) {
        score = 0; // Don't match to already-used IDs
      }

      if (score > bestScore) {
        bestScore = score;
        bestMatch = {
          ebEvent,
          ebCity,
          daysDiff,
          score
        };
      }
    }

    if (bestMatch && bestMatch.score >= 150) {
      matches.push({
        dbEvent,
        ...bestMatch,
        confidence: bestMatch.score >= 190 ? 'HIGH' : 'MEDIUM'
      });
    } else {
      unmatched.push(dbEvent);
    }
  }

  return { matches, unmatched };
}

async function main() {
  console.log('🔄 Starting Eventbrite ID matching process...\n');

  const ebEvents = await fetchAllEventbriteEvents();
  const dbEvents = await fetchDatabaseEvents();

  const { matches, unmatched } = matchEvents(dbEvents, ebEvents);

  console.log('📊 Matching Results:');
  console.log(`  ✅ Matches found: ${matches.length}`);
  console.log(`  ❌ Unmatched: ${unmatched.length}\n`);

  // Output matches grouped by confidence
  const highConfidence = matches.filter(m => m.confidence === 'HIGH');
  const mediumConfidence = matches.filter(m => m.confidence === 'MEDIUM');

  console.log(`\n🟢 HIGH CONFIDENCE (${highConfidence.length}):`);
  console.log('EID\t\tDB Event\t\t\tEB Event\t\t\tDate Diff\tScore');
  console.log('─'.repeat(120));

  for (const match of highConfidence.slice(0, 20)) {
    console.log(
      `${match.dbEvent.eid}\t` +
      `${match.dbEvent.name.substring(0, 25).padEnd(25)}\t` +
      `${match.ebEvent.name.text.substring(0, 35).padEnd(35)}\t` +
      `${match.daysDiff.toFixed(1)}d\t\t${match.score.toFixed(0)}`
    );
  }

  console.log(`\n🟡 MEDIUM CONFIDENCE (${mediumConfidence.length}):`);
  for (const match of mediumConfidence.slice(0, 10)) {
    console.log(
      `${match.dbEvent.eid}\t` +
      `${match.dbEvent.name.substring(0, 25).padEnd(25)}\t` +
      `${match.ebEvent.name.text.substring(0, 35).padEnd(35)}\t` +
      `${match.daysDiff.toFixed(1)}d\t\t${match.score.toFixed(0)}`
    );
  }

  // Generate SQL UPDATE statements
  console.log('\n\n📝 SQL UPDATE Statements (HIGH CONFIDENCE):');
  console.log('-- Copy and paste these into psql to update database\n');

  for (const match of highConfidence) {
    console.log(
      `UPDATE events SET eventbrite_id = '${match.ebEvent.id}' WHERE eid = '${match.dbEvent.eid}';` +
      ` -- ${match.ebEvent.name.text.substring(0, 50)}`
    );
  }

  // Save SQL file
  const fs = await import('fs');
  const sqlFile = '/root/vote_app/vote26/eventbrite-id-updates.sql';
  const sqlContent = highConfidence.map(match =>
    `UPDATE events SET eventbrite_id = '${match.ebEvent.id}' WHERE eid = '${match.dbEvent.eid}'; -- ${match.ebEvent.name.text}`
  ).join('\n');

  fs.writeFileSync(sqlFile, sqlContent);
  console.log(`\n✅ SQL file written to: ${sqlFile}`);

  // Generate CSV for manual review
  const csvFile = '/root/vote_app/vote26/eventbrite-matches-review.csv';

  // Helper function to escape CSV values
  const escapeCsv = (value) => {
    if (value === null || value === undefined) return '';
    const str = String(value);
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  // CSV header
  const csvHeader = 'EID,DB_Event_Name,DB_Date,DB_City,DB_Eventbrite_ID,Matched_EB_ID,Matched_EB_Name,Matched_EB_Date,Matched_EB_City,Match_Score,Confidence,Days_Diff,Verified_Correct\n';

  // Include both high and medium confidence matches for review
  const allMatches = [...highConfidence, ...mediumConfidence];

  const csvRows = allMatches.map(match => {
    const dbDate = new Date(match.dbEvent.event_start_datetime).toISOString().split('T')[0];
    const ebDate = new Date(match.ebEvent.start.local).toISOString().split('T')[0];

    return [
      escapeCsv(match.dbEvent.eid),
      escapeCsv(match.dbEvent.name),
      escapeCsv(dbDate),
      escapeCsv(match.dbEvent.city_name),
      escapeCsv(match.dbEvent.eventbrite_id || ''),
      escapeCsv(match.ebEvent.id),
      escapeCsv(match.ebEvent.name.text),
      escapeCsv(ebDate),
      escapeCsv(match.ebCity),
      escapeCsv(match.score.toFixed(0)),
      escapeCsv(match.confidence),
      escapeCsv(match.daysDiff.toFixed(1)),
      '' // Empty Verified_Correct column
    ].join(',');
  }).join('\n');

  fs.writeFileSync(csvFile, csvHeader + csvRows);
  console.log(`\n✅ CSV file written to: ${csvFile}`);
  console.log(`   Total matches: ${allMatches.length} (${highConfidence.length} HIGH, ${mediumConfidence.length} MEDIUM)`);
  console.log(`\n💡 Review the CSV, mark "YES" in Verified_Correct column for correct matches`);
  console.log(`   Then use the SQL file to apply verified matches`);

  await pool.end();
}

main().catch(console.error);

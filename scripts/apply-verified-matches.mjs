#!/usr/bin/env node

/**
 * Apply Verified Eventbrite ID Matches
 *
 * Reads the confirmed CSV file and applies only the verified matches
 */

import pg from 'pg';
import fs from 'fs';

const { Pool } = pg;

const pool = new Pool({
  host: 'db.xsqdkubgyqwpyvfltnrf.supabase.co',
  port: 5432,
  database: 'postgres',
  user: 'postgres',
  password: '6kEtvU9n0KhTVr5'
});

// Parse CSV file
const csvPath = '/root/vote_app/vote26/ai-context/eventbrite/EBconfirmation-eventbrite-matches-review.csv';
const csvContent = fs.readFileSync(csvPath, 'utf-8');
const lines = csvContent.split(/\r?\n/); // Handle Windows line endings

// Skip header
const dataLines = lines.slice(1);

const verifiedMatches = [];
const skipped = [];

function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }

  // Push last field
  result.push(current.trim());

  return result;
}

for (const line of dataLines) {
  if (!line.trim()) continue;

  const fields = parseCSVLine(line);
  if (fields.length < 13) continue;

  const eid = fields[0];
  const matchedEbId = fields[5];
  const matchedEbName = fields[6];
  const verifiedCorrect = fields[12];

  if (verifiedCorrect === 'JM') {
    verifiedMatches.push({ eid, matchedEbId, matchedEbName });
  } else if (verifiedCorrect && verifiedCorrect !== 'JM' && verifiedCorrect !== '') {
    skipped.push({ eid, reason: verifiedCorrect });
  }
}

console.log(`\n📊 Verification Summary:`);
console.log(`  ✅ Verified matches: ${verifiedMatches.length}`);
console.log(`  ⏭️  Skipped: ${skipped.length}`);

if (skipped.length > 0) {
  console.log(`\n⏭️  Skipped entries:`);
  skipped.forEach(({ eid, reason }) => {
    console.log(`    ${eid}: ${reason}`);
  });
}

// Generate SQL
const sqlStatements = verifiedMatches.map(({ eid, matchedEbId, matchedEbName }) => {
  const comment = matchedEbName.length > 50 ? matchedEbName.substring(0, 50) + '...' : matchedEbName;
  return `UPDATE events SET eventbrite_id = '${matchedEbId}' WHERE eid = '${eid}'; -- ${comment}`;
});

// Save SQL file
const sqlFile = '/root/vote_app/vote26/verified-eventbrite-id-updates.sql';
fs.writeFileSync(sqlFile, sqlStatements.join('\n'));
console.log(`\n✅ SQL file written to: ${sqlFile}`);

// Apply updates
console.log(`\n🔄 Applying ${verifiedMatches.length} updates to database...\n`);

let successCount = 0;
let errorCount = 0;

for (const { eid, matchedEbId, matchedEbName } of verifiedMatches) {
  try {
    const result = await pool.query(
      `UPDATE events SET eventbrite_id = $1 WHERE eid = $2`,
      [matchedEbId, eid]
    );

    if (result.rowCount > 0) {
      successCount++;
      console.log(`✅ ${eid} → ${matchedEbId} (${matchedEbName.substring(0, 40)}...)`);
    } else {
      errorCount++;
      console.log(`❌ ${eid} - No matching event found`);
    }
  } catch (error) {
    errorCount++;
    console.log(`❌ ${eid} - Error: ${error.message}`);
  }
}

console.log(`\n📊 Final Results:`);
console.log(`  ✅ Successfully updated: ${successCount}`);
console.log(`  ❌ Errors: ${errorCount}`);

// Clear existing cache for updated events
if (verifiedMatches.length > 0) {
  console.log(`\n🧹 Clearing Eventbrite cache for updated events...`);

  const cacheResult = await pool.query(`
    DELETE FROM eventbrite_api_cache
    WHERE eid IN (${verifiedMatches.map(m => `'${m.eid}'`).join(',')})
  `);

  console.log(`  Deleted ${cacheResult.rowCount} cached entries`);
}

await pool.end();
console.log(`\n✅ Done!`);

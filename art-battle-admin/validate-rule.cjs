#!/usr/bin/env node

/**
 * Event Linter Rule Validation Tool (Node.js version)
 *
 * Usage: node validate-rule.js 14
 */

const https = require('https');

const SUPABASE_URL = 'https://xsqdkubgyqwpyvfltnrf.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || '';

// Rule validation queries
const RULES = {
  14: {
    id: 'artist_payment_overdue',
    name: 'Artist Payment Overdue',
    queries: [
      {
        name: 'Check art table has sale tracking',
        sql: `
          SELECT
            COUNT(*) as total_art,
            COUNT(CASE WHEN sold = true THEN 1 END) as sold_count,
            COUNT(sold_datetime) as has_sold_datetime,
            COUNT(CASE WHEN sold_datetime < NOW() - INTERVAL '14 days' THEN 1 END) as old_sales
          FROM art
        `
      },
      {
        name: 'Check payment tracking exists',
        sql: `
          SELECT
            COUNT(DISTINCT a.id) as sold_art,
            COUNT(DISTINCT pa.id) as payment_attempts
          FROM art a
          LEFT JOIN payment_attempts pa ON pa.artist_id = a.artist_id
          WHERE a.sold = true
        `
      },
      {
        name: 'Sample overdue payments',
        sql: `
          SELECT
            a.id,
            a.code,
            a.sold_datetime,
            EXTRACT(DAY FROM (NOW() - a.sold_datetime))::integer as days_overdue,
            ap.name as artist_name
          FROM art a
          LEFT JOIN artist_profiles ap ON a.artist_id = ap.id
          WHERE a.sold = true
            AND a.sold_datetime < NOW() - INTERVAL '14 days'
          ORDER BY a.sold_datetime ASC
          LIMIT 5
        `
      }
    ]
  },
  2: {
    id: 'live_event_ended_no_results',
    name: 'Event Ended - Results Not Finalized',
    queries: [
      {
        name: 'Check events table structure',
        sql: `
          SELECT
            COUNT(*) as total_events,
            COUNT(event_end_datetime) as has_end_datetime,
            COUNT(CASE WHEN event_end_datetime < NOW() THEN 1 END) as completed_events
          FROM events
        `
      },
      {
        name: 'Sample events without results',
        sql: `
          SELECT
            eid,
            name,
            event_end_datetime,
            EXTRACT(HOUR FROM (NOW() - event_end_datetime))::integer as hours_since_end
          FROM events
          WHERE event_end_datetime < NOW() - INTERVAL '30 minutes'
            AND event_end_datetime > NOW() - INTERVAL '7 days'
          LIMIT 5
        `
      }
    ]
  }
};

function makeRequest(sql) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({ sql });

    const options = {
      hostname: 'xsqdkubgyqwpyvfltnrf.supabase.co',
      port: 443,
      path: '/rest/v1/rpc/exec_sql',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_SERVICE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
        'Content-Length': data.length
      }
    };

    const req = https.request(options, (res) => {
      let body = '';

      res.on('data', (chunk) => {
        body += chunk;
      });

      res.on('end', () => {
        if (res.statusCode >= 400) {
          reject(new Error(`HTTP ${res.statusCode}: ${body}`));
        } else {
          try {
            resolve(JSON.parse(body));
          } catch (e) {
            reject(new Error(`Parse error: ${body}`));
          }
        }
      });
    });

    req.on('error', (e) => {
      reject(e);
    });

    req.write(data);
    req.end();
  });
}

async function validateRule(ruleNum) {
  const rule = RULES[ruleNum];

  if (!rule) {
    console.log(`\x1b[31m❌ Rule ${ruleNum} not found\x1b[0m`);
    return;
  }

  console.log(`\n\x1b[34m${'='.repeat(60)}\x1b[0m`);
  console.log(`\x1b[34mValidating Rule #${ruleNum}: ${rule.id}\x1b[0m`);
  console.log(`\x1b[90m${rule.name}\x1b[0m`);
  console.log(`\x1b[34m${'='.repeat(60)}\x1b[0m\n`);

  for (const query of rule.queries) {
    console.log(`\x1b[33m📋 ${query.name}\x1b[0m`);

    try {
      const start = Date.now();
      const result = await makeRequest(query.sql);
      const duration = Date.now() - start;

      console.log(`\x1b[32m   ✅ Query completed in ${duration}ms\x1b[0m`);
      console.log(`\x1b[90m   📊 Results:\x1b[0m`);
      console.log(JSON.stringify(result, null, 2));
      console.log('');

    } catch (err) {
      console.log(`\x1b[31m   ❌ Error: ${err.message}\x1b[0m\n`);
    }
  }

  console.log(`\x1b[34m${'='.repeat(60)}\x1b[0m`);
  console.log(`\x1b[32m✅ Validation complete for Rule #${ruleNum}\x1b[0m`);
  console.log(`\x1b[34m${'='.repeat(60)}\x1b[0m\n`);
}

const ruleNum = process.argv[2];

if (!ruleNum) {
  console.log('Usage: node validate-rule.js <rule_number>');
  console.log('Available rules: 2, 14');
  process.exit(1);
}

if (!SUPABASE_SERVICE_KEY) {
  console.log('\x1b[31m❌ SUPABASE_SERVICE_KEY not set\x1b[0m');
  console.log('Set it with: export SUPABASE_SERVICE_KEY=your_key');
  process.exit(1);
}

validateRule(ruleNum).catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});

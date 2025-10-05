#!/usr/bin/env node

/**
 * Event Linter Rule Validation Tool
 *
 * Usage:
 *   node validate-linter-rule.js --rule 14
 *   node validate-linter-rule.js --rule artist_payment_overdue
 *   node validate-linter-rule.js --all
 *
 * Tests data availability, query performance, and edge cases
 * before implementing a lint rule in production.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = 'https://xsqdkubgyqwpyvfltnrf.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || '';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// Rule definitions with validation queries
const RULE_VALIDATIONS = {
  2: {
    id: 'live_event_ended_no_results',
    name: 'Event Ended - Results Not Finalized',
    dataChecks: [
      {
        name: 'Events table has required fields',
        query: `
          SELECT
            COUNT(*) as total_events,
            COUNT(event_end_datetime) as has_end_datetime,
            COUNT(winner_announced) as has_winner_announced,
            COUNT(auction_close_time) as has_auction_close
          FROM events
          WHERE event_end_datetime < NOW()
          LIMIT 1
        `,
        validate: (result) => {
          return result[0].has_end_datetime > 0;
        }
      },
      {
        name: 'Sample events that would trigger rule',
        query: `
          SELECT
            eid,
            name,
            event_end_datetime,
            winner_announced,
            EXTRACT(HOUR FROM (NOW() - event_end_datetime)) as hours_since_end
          FROM events
          WHERE event_end_datetime < NOW() - INTERVAL '30 minutes'
            AND event_end_datetime > NOW() - INTERVAL '7 days'
            AND (winner_announced = false OR winner_announced IS NULL)
          LIMIT 5
        `
      }
    ],
    performanceTest: `
      SELECT COUNT(*)
      FROM events
      WHERE event_end_datetime < NOW() - INTERVAL '30 minutes'
        AND (winner_announced = false OR winner_announced IS NULL)
    `
  },

  14: {
    id: 'artist_payment_overdue',
    name: 'Artist Payment Overdue',
    dataChecks: [
      {
        name: 'Art table has sale tracking',
        query: `
          SELECT
            COUNT(*) as total_art,
            COUNT(CASE WHEN sold = true THEN 1 END) as sold_count,
            COUNT(sold_datetime) as has_sold_datetime,
            COUNT(CASE WHEN sold_datetime < NOW() - INTERVAL '14 days' THEN 1 END) as old_sales
          FROM art
          LIMIT 1
        `,
        validate: (result) => {
          const r = result[0];
          if (r.sold_count === 0) return { ok: false, reason: 'No sold art in database' };
          if (r.has_sold_datetime === 0) return { ok: false, reason: 'sold_datetime not populated' };
          if (r.old_sales === 0) return { ok: false, reason: 'No sales >14 days old to test with' };
          return { ok: true };
        }
      },
      {
        name: 'Payment tracking exists',
        query: `
          SELECT
            COUNT(DISTINCT a.id) as sold_art,
            COUNT(DISTINCT pa.art_id) as art_with_payments
          FROM art a
          LEFT JOIN payment_attempts pa ON pa.art_id = a.id
          WHERE a.sold = true
        `,
        validate: (result) => {
          const r = result[0];
          if (r.sold_art === 0) return { ok: false, reason: 'No sold art' };
          return { ok: true, warning: r.art_with_payments === 0 ? 'No payment attempts tracked yet' : null };
        }
      },
      {
        name: 'Sample overdue payments',
        query: `
          SELECT
            a.id,
            a.code,
            a.sold_datetime,
            EXTRACT(DAY FROM (NOW() - a.sold_datetime)) as days_overdue,
            ap.name as artist_name,
            COALESCE(
              (SELECT status FROM payment_attempts WHERE art_id = a.id ORDER BY created_at DESC LIMIT 1),
              'no_payment'
            ) as payment_status
          FROM art a
          LEFT JOIN artist_profiles ap ON a.artist_id = ap.id
          WHERE a.sold = true
            AND a.sold_datetime < NOW() - INTERVAL '14 days'
          ORDER BY a.sold_datetime ASC
          LIMIT 5
        `
      }
    ],
    performanceTest: `
      EXPLAIN ANALYZE
      SELECT COUNT(*)
      FROM art a
      WHERE a.sold = true
        AND a.sold_datetime < NOW() - INTERVAL '14 days'
        AND NOT EXISTS (
          SELECT 1 FROM payment_attempts pa
          WHERE pa.art_id = a.id AND pa.status = 'completed'
        )
    `
  },

  37: {
    id: 'ticket_revenue_success',
    name: 'Ticket Revenue Exceeded Last Event',
    dataChecks: [
      {
        name: 'Events have ticket revenue data',
        query: `
          SELECT
            COUNT(*) as total_completed_events,
            COUNT(ticket_revenue) as events_with_revenue,
            COUNT(DISTINCT cities_id) as cities_count,
            ROUND(AVG(ticket_revenue)::numeric, 2) as avg_revenue
          FROM events
          WHERE event_end_datetime < NOW()
        `,
        validate: (result) => {
          const r = result[0];
          if (r.total_completed_events === 0) return { ok: false, reason: 'No completed events' };
          const coverage = (r.events_with_revenue / r.total_completed_events) * 100;
          if (coverage < 50) return { ok: false, reason: `Only ${coverage.toFixed(0)}% of events have revenue data` };
          return { ok: true };
        }
      },
      {
        name: 'Can find "last event" per city',
        query: `
          WITH ranked_events AS (
            SELECT
              cities_id,
              eid,
              ticket_revenue,
              event_end_datetime,
              ROW_NUMBER() OVER (PARTITION BY cities_id ORDER BY event_end_datetime DESC) as rank
            FROM events
            WHERE event_end_datetime < NOW()
              AND ticket_revenue IS NOT NULL
          )
          SELECT
            cities_id,
            COUNT(*) as events_in_city,
            MAX(CASE WHEN rank = 1 THEN ticket_revenue END) as last_revenue,
            MAX(CASE WHEN rank = 2 THEN ticket_revenue END) as previous_revenue
          FROM ranked_events
          GROUP BY cities_id
          HAVING COUNT(*) >= 2
          ORDER BY events_in_city DESC
          LIMIT 10
        `,
        validate: (result) => {
          if (result.length === 0) return { ok: false, reason: 'No cities with 2+ events for comparison' };
          return { ok: true };
        }
      },
      {
        name: 'Sample revenue comparisons',
        query: `
          WITH last_city_event AS (
            SELECT DISTINCT ON (cities_id)
              cities_id,
              ticket_revenue as last_revenue
            FROM events
            WHERE event_end_datetime < NOW()
              AND ticket_revenue IS NOT NULL
            ORDER BY cities_id, event_end_datetime DESC
          )
          SELECT
            e.eid,
            e.name,
            e.ticket_revenue as current_revenue,
            lce.last_revenue,
            ROUND(((e.ticket_revenue - lce.last_revenue) / lce.last_revenue * 100)::numeric, 1) as percent_change
          FROM events e
          JOIN last_city_event lce ON e.cities_id = lce.cities_id
          WHERE e.event_end_datetime < NOW()
            AND e.ticket_revenue IS NOT NULL
          ORDER BY e.event_end_datetime DESC
          LIMIT 5
        `
      }
    ],
    performanceTest: `
      EXPLAIN ANALYZE
      WITH last_city_event AS (
        SELECT DISTINCT ON (cities_id)
          cities_id,
          ticket_revenue as last_revenue
        FROM events
        WHERE event_end_datetime < NOW()
          AND ticket_revenue IS NOT NULL
        ORDER BY cities_id, event_end_datetime DESC
      )
      SELECT COUNT(*)
      FROM events e
      JOIN last_city_event lce ON e.cities_id = lce.cities_id
      WHERE e.ticket_revenue > lce.last_revenue
    `
  },

  19: {
    id: 'no_ad_campaign_for_event',
    name: 'No Marketing Campaign Found',
    dataChecks: [
      {
        name: 'Meta ads cache exists',
        query: `
          SELECT
            COUNT(*) as total_cached,
            COUNT(DISTINCT event_id) as unique_events,
            MAX(created_at) as last_updated
          FROM ai_analysis_cache
          WHERE analysis_type = 'meta_ads'
        `,
        validate: (result) => {
          const r = result[0];
          if (r.total_cached === 0) return { ok: false, reason: 'No Meta ads data cached - integration may not be running' };
          return { ok: true };
        }
      },
      {
        name: 'Can extract campaign data from cache',
        query: `
          SELECT
            event_id,
            result->>'total_spend' as spend,
            jsonb_array_length(result->'campaigns') as campaign_count
          FROM ai_analysis_cache
          WHERE analysis_type = 'meta_ads'
          LIMIT 5
        `
      },
      {
        name: 'Sample upcoming events without ads',
        query: `
          SELECT
            e.eid,
            e.name,
            e.event_start_datetime,
            EXTRACT(DAY FROM (e.event_start_datetime - NOW())) as days_until,
            COALESCE(
              (SELECT jsonb_array_length(result->'campaigns')
               FROM ai_analysis_cache
               WHERE event_id = e.eid AND analysis_type = 'meta_ads'),
              0
            ) as campaign_count
          FROM events e
          WHERE e.event_start_datetime > NOW()
            AND e.event_start_datetime < NOW() + INTERVAL '14 days'
          ORDER BY e.event_start_datetime
          LIMIT 10
        `
      }
    ],
    performanceTest: `
      SELECT COUNT(*)
      FROM events e
      WHERE e.event_start_datetime > NOW()
        AND e.event_start_datetime < NOW() + INTERVAL '14 days'
        AND NOT EXISTS (
          SELECT 1 FROM ai_analysis_cache
          WHERE event_id = e.eid
            AND analysis_type = 'meta_ads'
            AND jsonb_array_length(result->'campaigns') > 0
        )
    `
  }
};

// Colors for terminal output
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  gray: '\x1b[90m'
};

function log(msg, color = 'reset') {
  console.log(`${colors[color]}${msg}${colors.reset}`);
}

async function validateRule(ruleKey) {
  const rule = RULE_VALIDATIONS[ruleKey];
  if (!rule) {
    log(`❌ Rule ${ruleKey} not found in validation definitions`, 'red');
    return;
  }

  log(`\n${'='.repeat(60)}`, 'blue');
  log(`Validating Rule #${ruleKey}: ${rule.id}`, 'blue');
  log(`${rule.name}`, 'gray');
  log('='.repeat(60), 'blue');

  let allPassed = true;
  const warnings = [];

  // Run data checks
  for (const check of rule.dataChecks) {
    log(`\n📋 ${check.name}`, 'yellow');

    try {
      const startTime = Date.now();
      const { data, error } = await supabase.rpc('exec_sql', { sql: check.query });
      const duration = Date.now() - startTime;

      if (error) {
        log(`   ❌ Query failed: ${error.message}`, 'red');
        allPassed = false;
        continue;
      }

      // Run validation function if exists
      if (check.validate) {
        const validation = check.validate(data);
        if (validation.ok === false) {
          log(`   ❌ ${validation.reason}`, 'red');
          allPassed = false;
        } else if (validation.ok) {
          log(`   ✅ Validation passed`, 'green');
          if (validation.warning) {
            log(`   ⚠️  ${validation.warning}`, 'yellow');
            warnings.push(validation.warning);
          }
        }
      }

      // Display results
      if (data && data.length > 0) {
        log(`   📊 Results (${duration}ms):`, 'gray');
        console.log(JSON.stringify(data, null, 2));
      } else {
        log(`   ℹ️  No data returned`, 'gray');
      }

    } catch (err) {
      log(`   ❌ Error: ${err.message}`, 'red');
      allPassed = false;
    }
  }

  // Performance test
  if (rule.performanceTest) {
    log(`\n⚡ Performance Test`, 'yellow');

    try {
      const startTime = Date.now();
      const { data, error } = await supabase.rpc('exec_sql', { sql: rule.performanceTest });
      const duration = Date.now() - startTime;

      if (error) {
        log(`   ❌ Query failed: ${error.message}`, 'red');
        allPassed = false;
      } else {
        if (duration < 1000) {
          log(`   ✅ Query completed in ${duration}ms (excellent)`, 'green');
        } else if (duration < 3000) {
          log(`   ⚠️  Query completed in ${duration}ms (acceptable)`, 'yellow');
          warnings.push(`Performance could be improved (${duration}ms)`);
        } else {
          log(`   ❌ Query took ${duration}ms (too slow - needs optimization)`, 'red');
          allPassed = false;
        }
      }
    } catch (err) {
      log(`   ❌ Performance test error: ${err.message}`, 'red');
      allPassed = false;
    }
  }

  // Final verdict
  log(`\n${'='.repeat(60)}`, 'blue');
  if (allPassed) {
    if (warnings.length > 0) {
      log(`⚠️  Rule #${ruleKey} PASSED with warnings:`, 'yellow');
      warnings.forEach(w => log(`   - ${w}`, 'yellow'));
    } else {
      log(`✅ Rule #${ruleKey} is READY for implementation`, 'green');
    }
  } else {
    log(`❌ Rule #${ruleKey} has BLOCKERS - fix before implementing`, 'red');
  }
  log('='.repeat(60), 'blue');
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes('--help')) {
    console.log(`
Event Linter Rule Validation Tool

Usage:
  node validate-linter-rule.js --rule 14
  node validate-linter-rule.js --rule artist_payment_overdue
  node validate-linter-rule.js --all

Available rules:
  2  - live_event_ended_no_results
  14 - artist_payment_overdue
  19 - no_ad_campaign_for_event
  37 - ticket_revenue_success

Environment:
  SUPABASE_SERVICE_KEY must be set
    `);
    process.exit(0);
  }

  if (!SUPABASE_SERVICE_KEY) {
    log('❌ SUPABASE_SERVICE_KEY environment variable not set', 'red');
    log('   Set it with: export SUPABASE_SERVICE_KEY=your_key', 'gray');
    process.exit(1);
  }

  // Find which rule to test
  let ruleKey = null;
  if (args.includes('--rule')) {
    const idx = args.indexOf('--rule');
    const ruleArg = args[idx + 1];

    // Try as number
    if (!isNaN(ruleArg)) {
      ruleKey = ruleArg;
    } else {
      // Try as ID
      for (const [key, rule] of Object.entries(RULE_VALIDATIONS)) {
        if (rule.id === ruleArg) {
          ruleKey = key;
          break;
        }
      }
    }
  }

  if (args.includes('--all')) {
    for (const key of Object.keys(RULE_VALIDATIONS)) {
      await validateRule(key);
    }
  } else if (ruleKey) {
    await validateRule(ruleKey);
  } else {
    log('❌ Unknown rule. Use --help to see available rules', 'red');
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});

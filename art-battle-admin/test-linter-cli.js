#!/usr/bin/env node

/**
 * Event Linter CLI - Calls Supabase Edge Function
 *
 * Tests the event linter rules via edge function
 * Outputs results in a console-friendly format
 *
 * Usage:
 *   node test-linter-cli.js                    # Run all events
 *   node test-linter-cli.js --eid AB3003       # Test specific event
 *   node test-linter-cli.js --severity error   # Filter by severity
 *   node test-linter-cli.js --summary          # Show summary only
 *   node test-linter-cli.js --future           # Future events only
 *   node test-linter-cli.js --active           # Active events (±24h)
 */

// Parse CLI args
const args = process.argv.slice(2);
const filterEid = args.includes('--eid') ? args[args.indexOf('--eid') + 1] : null;
const filterSeverity = args.includes('--severity') ? args[args.indexOf('--severity') + 1] : null;
const summaryOnly = args.includes('--summary');
const futureOnly = args.includes('--future');
const activeOnly = args.includes('--active');
const verbose = args.includes('--verbose') || args.includes('-v');

// Supabase edge function URL
const EDGE_FUNCTION_URL = 'https://xsqdkubgyqwpyvfltnrf.supabase.co/functions/v1/event-linter';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhzcWRrdWJneXF3cHl2Zmx0bnJmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTM0MjE2OTYsImV4cCI6MjA2ODk5NzY5Nn0.hY8v8IDZQTcdAFa_OvQNFd1CyvabGcOZZMn_J6c4c2U';

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m'
};

const severityColor = {
  error: colors.red,
  warning: colors.yellow,
  info: colors.blue,
  success: colors.green
};

// Format finding for console output
function formatFinding(finding, index) {
  const color = severityColor[finding.severity];
  const emoji = finding.emoji;

  console.log(`\n${colors.gray}─────────────────────────────────────────────────────────────${colors.reset}`);
  console.log(`${color}${emoji} [${finding.severity.toUpperCase()}]${colors.reset} ${colors.bright}${finding.ruleName}${colors.reset}`);
  console.log(`${colors.cyan}EID:${colors.reset} ${finding.eventEid || 'N/A'} ${colors.gray}|${colors.reset} ${colors.cyan}Event:${colors.reset} ${finding.eventName}`);
  console.log(`${colors.cyan}Category:${colors.reset} ${finding.category} ${colors.gray}|${colors.reset} ${colors.cyan}Context:${colors.reset} ${finding.context}`);
  console.log(`${colors.yellow}→${colors.reset} ${finding.message}`);
}

// Print summary
function printSummary(data) {
  const { summary, rules_count, events_count, findings_count } = data;

  console.log(`\n${colors.bright}${colors.cyan}════════════════════════════════════════════════════════════${colors.reset}`);
  console.log(`${colors.bright}${colors.cyan}                    LINTER SUMMARY${colors.reset}`);
  console.log(`${colors.bright}${colors.cyan}════════════════════════════════════════════════════════════${colors.reset}\n`);

  console.log(`${colors.bright}Rules Loaded:${colors.reset} ${rules_count}`);
  console.log(`${colors.bright}Events Scanned:${colors.reset} ${events_count}`);
  console.log(`${colors.bright}Total Findings:${colors.reset} ${findings_count}\n`);

  console.log(`${colors.red}❌ Errors:${colors.reset}   ${summary.error || 0}`);
  console.log(`${colors.yellow}⚠️  Warnings:${colors.reset} ${summary.warning || 0}`);
  console.log(`${colors.blue}📊 Info:${colors.reset}     ${summary.info || 0}`);
  console.log(`${colors.green}✅ Success:${colors.reset}  ${summary.success || 0}`);

  console.log(`\n${colors.bright}${colors.cyan}════════════════════════════════════════════════════════════${colors.reset}\n`);
}

// Print debug info
function printDebug(debug) {
  if (!verbose) return;

  console.log(`${colors.gray}────── DEBUG INFO ──────${colors.reset}`);
  console.log(`${colors.gray}Timestamp:${colors.reset} ${debug.timestamp}`);
  console.log(`${colors.gray}Rules Loaded:${colors.reset} ${debug.rules_loaded}`);
  console.log(`${colors.gray}Events Fetched:${colors.reset} ${debug.events_fetched}`);
  console.log(`${colors.gray}Events Linted:${colors.reset} ${debug.events_to_lint}`);
  console.log(`${colors.gray}Findings:${colors.reset} ${debug.findings_count}`);
  console.log(`${colors.gray}───────────────────────${colors.reset}\n`);
}

// Main
async function main() {
  console.log(`${colors.bright}${colors.magenta}🔍 Event Linter CLI${colors.reset}`);
  console.log(`${colors.gray}Calling edge function...${colors.reset}\n`);

  try {
    // Build URL with query parameters
    const url = new URL(EDGE_FUNCTION_URL);
    if (filterEid) url.searchParams.append('eid', filterEid);
    if (filterSeverity) url.searchParams.append('severity', filterSeverity);
    if (summaryOnly) url.searchParams.append('summary', 'true');
    if (futureOnly) url.searchParams.append('future', 'true');
    if (activeOnly) url.searchParams.append('active', 'true');

    // Call edge function
    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json'
      }
    });

    const data = await response.json();

    if (!response.ok || !data.success) {
      console.error(`${colors.red}✗ Error:${colors.reset}`, data.error || 'Unknown error');
      if (data.debug) {
        console.log(`\n${colors.yellow}Debug Info:${colors.reset}`);
        console.log(JSON.stringify(data.debug, null, 2));
      }
      process.exit(1);
    }

    console.log(`${colors.green}✓${colors.reset} Analysis complete\n`);

    // Print debug info if verbose
    if (verbose && data.debug) {
      printDebug(data.debug);
    }

    // Output results
    if (summaryOnly || !data.findings) {
      printSummary(data);
    } else {
      // Print all findings
      data.findings.forEach((finding, index) => {
        formatFinding(finding, index);
      });

      // Print summary at the end
      printSummary(data);
    }

  } catch (error) {
    console.error(`${colors.red}Error:${colors.reset}`, error.message);
    process.exit(1);
  }
}

main();

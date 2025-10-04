#!/usr/bin/env node

/**
 * Event Linter CLI Test Script
 *
 * Tests the event linter rules against live database
 * Outputs results in a console-friendly format
 *
 * Usage:
 *   node test-linter.js                    # Run all events
 *   node test-linter.js --eid AB3003       # Test specific event
 *   node test-linter.js --severity error   # Filter by severity
 *   node test-linter.js --summary          # Show summary only
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { parse as parseYAML } from 'yaml';

// Supabase config
const SUPABASE_URL = 'https://xsqdkubgyqwpyvfltnrf.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhzcWRrdWJneXF3cHl2Zmx0bnJmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTM0MjE2OTYsImV4cCI6MjA2ODk5NzY5Nn0.hY8v8IDZQTcdAFa_OvQNFd1CyvabGcOZZMn_J6c4c2U';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Parse CLI args
const args = process.argv.slice(2);
const filterEid = args.includes('--eid') ? args[args.indexOf('--eid') + 1] : null;
const filterSeverity = args.includes('--severity') ? args[args.indexOf('--severity') + 1] : null;
const summaryOnly = args.includes('--summary');
const verbose = args.includes('--verbose') || args.includes('-v');

// Emoji mapping
const SEVERITY_EMOJI = {
  error: '❌',
  warning: '⚠️',
  info: '📊',
  success: '✅'
};

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

// Load rules from YAML
function loadRules() {
  try {
    const yamlContent = readFileSync('./public/eventLinterRules.yaml', 'utf8');
    const config = parseYAML(yamlContent);
    return config.rules || [];
  } catch (error) {
    console.error('Failed to load rules:', error.message);
    process.exit(1);
  }
}

// Get nested field value
function getNestedField(obj, path) {
  if (!obj || !path) return undefined;
  const keys = path.split('.');
  let value = obj;
  for (const key of keys) {
    if (value === null || value === undefined) return undefined;
    if (!isNaN(key)) {
      value = Array.isArray(value) ? value[parseInt(key)] : undefined;
    } else {
      value = value[key];
    }
  }
  return value;
}

// Time comparison helpers
function isPastMinutes(datetime, minutes) {
  if (!datetime) return false;
  const then = new Date(datetime);
  const now = new Date();
  const diffMinutes = (now - then) / 1000 / 60;
  return diffMinutes >= minutes;
}

function isPastHours(datetime, hours) {
  if (!datetime) return false;
  const then = new Date(datetime);
  const now = new Date();
  const diffHours = (now - then) / 1000 / 60 / 60;
  return diffHours >= hours;
}

function isPastDays(datetime, days) {
  if (!datetime) return false;
  const then = new Date(datetime);
  const now = new Date();
  const diffDays = (now - then) / 1000 / 60 / 60 / 24;
  return diffDays >= days;
}

function isUpcomingMinutes(datetime, minutes) {
  if (!datetime) return false;
  const then = new Date(datetime);
  const now = new Date();
  const diffMinutes = (then - now) / 1000 / 60;
  return diffMinutes > 0 && diffMinutes <= minutes;
}

function isUpcomingHours(datetime, hours) {
  if (!datetime) return false;
  const then = new Date(datetime);
  const now = new Date();
  const diffHours = (then - now) / 1000 / 60 / 60;
  return diffHours > 0 && diffHours <= hours;
}

function isUpcomingDays(datetime, days) {
  if (!datetime) return false;
  const then = new Date(datetime);
  const now = new Date();
  const diffDays = (then - now) / 1000 / 60 / 60 / 24;
  return diffDays > 0 && diffDays <= days;
}

// Evaluate condition
function evaluateCondition(condition, event, comparativeData = {}) {
  const { field, operator, value, compare_to } = condition;
  const fieldValue = getNestedField(event, field);

  switch (operator) {
    case 'equals':
      return fieldValue === value;
    case 'not_equals':
      return fieldValue !== value;
    case 'is_null':
      return fieldValue === null || fieldValue === undefined;
    case 'is_not_null':
      return fieldValue !== null && fieldValue !== undefined;
    case 'is_empty':
      return !fieldValue || fieldValue === '' || (Array.isArray(fieldValue) && fieldValue.length === 0);
    case 'is_not_empty':
      return fieldValue && fieldValue !== '' && (!Array.isArray(fieldValue) || fieldValue.length > 0);
    case 'greater_than':
      return Number(fieldValue) > Number(value);
    case 'less_than':
      return Number(fieldValue) < Number(value);
    case 'greater_than_percent':
      const compareValue = comparativeData[compare_to] || 0;
      if (compareValue === 0) return false;
      const percent = (Number(fieldValue) / compareValue) * 100;
      return percent > Number(value);
    case 'less_than_percent':
      const compareVal = comparativeData[compare_to] || 0;
      if (compareVal === 0) return false;
      const pct = (Number(fieldValue) / compareVal) * 100;
      return pct < Number(value);
    case 'past_minutes':
      return isPastMinutes(fieldValue, value);
    case 'past_hours':
      return isPastHours(fieldValue, value);
    case 'past_days':
      return isPastDays(fieldValue, value);
    case 'upcoming_minutes':
      return isUpcomingMinutes(fieldValue, value);
    case 'upcoming_hours':
      return isUpcomingHours(fieldValue, value);
    case 'upcoming_days':
      return isUpcomingDays(fieldValue, value);
    default:
      return false;
  }
}

// Get time context for message interpolation
function getTimeContext(event) {
  const now = new Date();
  const context = {};

  if (event.event_start_datetime) {
    const start = new Date(event.event_start_datetime);
    const diffMs = now - start;
    const diffMinutes = Math.floor(diffMs / 1000 / 60);
    const diffHours = Math.floor(diffMs / 1000 / 60 / 60);
    const diffDays = Math.floor(diffMs / 1000 / 60 / 60 / 24);

    if (diffMs > 0) {
      context.minutes_ago = diffMinutes;
      context.hours_ago = diffHours;
      context.days_ago = diffDays;
    } else {
      context.minutes_until = Math.abs(diffMinutes);
      context.hours_until = Math.abs(diffHours);
      context.days_until = Math.abs(diffDays);
    }
  }

  if (event.event_end_datetime) {
    const end = new Date(event.event_end_datetime);
    const diffMs = now - end;
    const diffDays = Math.floor(diffMs / 1000 / 60 / 60 / 24);
    if (diffMs > 0) {
      context.days_ago = diffDays;
    }
  }

  return context;
}

// Interpolate message
function interpolateMessage(template, event, comparativeData = {}) {
  let message = template;
  const timeContext = getTimeContext(event);
  const context = { ...event, ...timeContext, ...comparativeData };

  message = message.replace(/\{\{([^}]+)\}\}/g, (match, field) => {
    const value = getNestedField(context, field.trim());
    return value !== undefined && value !== null ? value : match;
  });

  return message;
}

// Evaluate rule
function evaluateRule(rule, event, comparativeData = {}) {
  const allConditionsMet = rule.conditions.every(condition =>
    evaluateCondition(condition, event, comparativeData)
  );

  if (!allConditionsMet) return null;

  return {
    ruleId: rule.id,
    ruleName: rule.name,
    severity: rule.severity,
    category: rule.category,
    context: rule.context,
    emoji: SEVERITY_EMOJI[rule.severity],
    message: interpolateMessage(rule.message, event, comparativeData),
    eventId: event.id,
    eventEid: event.eid,
    eventName: event.name,
    timestamp: new Date().toISOString()
  };
}

// Fetch events from database
async function fetchEvents() {
  const { data, error } = await supabase
    .from('events')
    .select(`
      *,
      cities(id, name, country_id, countries(id, name, code))
    `)
    .order('event_start_datetime', { ascending: false });

  if (error) throw error;
  return data;
}

// Main linter function
async function lintEvents(events, rules) {
  const findings = [];

  for (const event of events) {
    for (const rule of rules) {
      const finding = evaluateRule(rule, event, {});
      if (finding) {
        findings.push(finding);
      }
    }
  }

  const severityOrder = { error: 0, warning: 1, info: 2, success: 3 };
  findings.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

  return findings;
}

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
function printSummary(findings, rules) {
  const counts = findings.reduce((acc, f) => {
    acc[f.severity] = (acc[f.severity] || 0) + 1;
    return acc;
  }, { error: 0, warning: 0, info: 0, success: 0 });

  console.log(`\n${colors.bright}${colors.cyan}════════════════════════════════════════════════════════════${colors.reset}`);
  console.log(`${colors.bright}${colors.cyan}                    LINTER SUMMARY${colors.reset}`);
  console.log(`${colors.bright}${colors.cyan}════════════════════════════════════════════════════════════${colors.reset}\n`);

  console.log(`${colors.bright}Rules Loaded:${colors.reset} ${rules.length}`);
  console.log(`${colors.bright}Total Findings:${colors.reset} ${findings.length}\n`);

  console.log(`${colors.red}❌ Errors:${colors.reset}   ${counts.error}`);
  console.log(`${colors.yellow}⚠️  Warnings:${colors.reset} ${counts.warning}`);
  console.log(`${colors.blue}📊 Info:${colors.reset}     ${counts.info}`);
  console.log(`${colors.green}✅ Success:${colors.reset}  ${counts.success}`);

  console.log(`\n${colors.bright}${colors.cyan}════════════════════════════════════════════════════════════${colors.reset}\n`);
}

// Main
async function main() {
  console.log(`${colors.bright}${colors.magenta}🔍 Event Linter CLI${colors.reset}\n`);

  // Load rules
  console.log(`${colors.gray}Loading rules...${colors.reset}`);
  const rules = loadRules();
  console.log(`${colors.green}✓${colors.reset} Loaded ${rules.length} rules\n`);

  // Fetch events
  console.log(`${colors.gray}Fetching events from database...${colors.reset}`);
  const events = await fetchEvents();
  console.log(`${colors.green}✓${colors.reset} Fetched ${events.length} events\n`);

  // Filter by EID if specified
  const eventsToLint = filterEid
    ? events.filter(e => e.eid === filterEid)
    : events;

  if (filterEid && eventsToLint.length === 0) {
    console.log(`${colors.red}✗${colors.reset} No event found with EID: ${filterEid}`);
    process.exit(1);
  }

  // Run linter
  console.log(`${colors.gray}Running linter...${colors.reset}`);
  let findings = await lintEvents(eventsToLint, rules);

  // Filter by severity if specified
  if (filterSeverity) {
    findings = findings.filter(f => f.severity === filterSeverity);
  }

  console.log(`${colors.green}✓${colors.reset} Analysis complete\n`);

  // Output results
  if (summaryOnly) {
    printSummary(findings, rules);
  } else {
    // Print all findings
    findings.forEach((finding, index) => {
      formatFinding(finding, index);
    });

    // Print summary at the end
    printSummary(findings, rules);
  }

  // Verbose mode - show events with no findings
  if (verbose && !filterEid) {
    const eventsWithFindings = new Set(findings.map(f => f.eventId));
    const cleanEvents = events.filter(e => !eventsWithFindings.has(e.id));

    console.log(`${colors.green}${colors.bright}Clean Events (no findings):${colors.reset}`);
    cleanEvents.slice(0, 10).forEach(e => {
      console.log(`  ${colors.gray}•${colors.reset} ${e.eid || 'N/A'} - ${e.name}`);
    });
    if (cleanEvents.length > 10) {
      console.log(`  ${colors.gray}... and ${cleanEvents.length - 10} more${colors.reset}`);
    }
    console.log();
  }
}

main().catch(error => {
  console.error(`${colors.red}Error:${colors.reset}`, error.message);
  process.exit(1);
});

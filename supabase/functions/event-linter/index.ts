// Event Linter Edge Function
// Runs event health checks and returns findings
// Called by both web UI and CLI

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.53.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Load rules from database
async function loadRules(supabaseClient: any) {
  try {
    const { data: rules, error } = await supabaseClient
      .from('event_linter_rules')
      .select('*')
      .eq('status', 'active')
      .order('category', { ascending: true });

    if (error) {
      throw new Error(`Database error: ${error.message}`);
    }

    // Transform DB format to internal format
    return (rules || []).map((rule: any) => ({
      id: rule.rule_id,
      name: rule.name,
      description: rule.description,
      severity: rule.severity,
      category: rule.category,
      context: rule.context,
      conditions: rule.conditions || [],
      message: rule.message
    }));
  } catch (error) {
    throw new Error(`Failed to load rules from database: ${error.message}`);
  }
}

// Enrich events with computed metrics from database functions (BATCH VERSION)
async function enrichEventsWithMetrics(supabaseClient: any, events: any[]) {
  if (events.length === 0) return events;

  // Get all EIDs
  const eids = events.filter(e => e.eid).map(e => e.eid);
  if (eids.length === 0) return events;

  try {
    // Fetch all metrics in ONE batch call
    const { data: metricsData, error } = await supabaseClient
      .rpc('get_batch_event_metrics', { p_eids: eids });

    if (error) {
      console.error('Error fetching batch metrics:', error);
      return events;
    }

    // Create a map of eid -> metrics for fast lookup
    const metricsMap = new Map();
    if (metricsData) {
      metricsData.forEach((m: any) => {
        metricsMap.set(m.eid, m);
      });
    }

    // Attach metrics to each event
    for (const event of events) {
      if (!event.eid) continue;

      const metrics = metricsMap.get(event.eid);
      if (metrics) {
        event.confirmed_artists_count = metrics.confirmed_artists_count || 0;
        event.event_artists_confirmed_count = metrics.confirmed_artists_count || 0; // Alias
        event.applied_artists_count = metrics.applied_artists_count || 0;
        event.ticket_revenue = metrics.ticket_revenue || 0;
        event.auction_revenue = metrics.auction_revenue || 0;
        event.total_votes = metrics.total_votes || 0;
        event.ticket_sales = metrics.ticket_sales || 0;
      }
    }
  } catch (error) {
    console.error('Failed to enrich events with metrics:', error);
    // Continue without enrichment - rules that need metrics will just not match
  }

  return events;
}

// Increment hit count for a rule (fire and forget - don't wait)
function incrementRuleHit(supabaseClient: any, ruleId: string) {
  supabaseClient.rpc('increment_rule_hit_count', { p_rule_id: ruleId }).then(() => {
    // Success - no action needed
  }).catch(() => {
    // Ignore errors - this is just telemetry
  });
}

// Get nested field value
function getNestedField(obj: any, path: string): any {
  if (!obj || !path) return undefined;
  const keys = path.split('.');
  let value = obj;
  for (const key of keys) {
    if (value === null || value === undefined) return undefined;
    if (!isNaN(Number(key))) {
      value = Array.isArray(value) ? value[parseInt(key)] : undefined;
    } else {
      value = value[key];
    }
  }
  return value;
}

// Time comparison helpers
function isPastMinutes(datetime: string | null, minutes: number): boolean {
  if (!datetime) return false;
  const then = new Date(datetime);
  const now = new Date();
  const diffMinutes = (now.getTime() - then.getTime()) / 1000 / 60;
  return diffMinutes >= minutes;
}

function isPastHours(datetime: string | null, hours: number): boolean {
  if (!datetime) return false;
  const then = new Date(datetime);
  const now = new Date();
  const diffHours = (now.getTime() - then.getTime()) / 1000 / 60 / 60;
  return diffHours >= hours;
}

function isPastDays(datetime: string | null, days: number): boolean {
  if (!datetime) return false;
  const then = new Date(datetime);
  const now = new Date();
  const diffDays = (now.getTime() - then.getTime()) / 1000 / 60 / 60 / 24;
  return diffDays >= days;
}

function isWithinDays(datetime: string | null, days: number): boolean {
  if (!datetime) return false;
  const then = new Date(datetime);
  const now = new Date();
  const diffDays = (now.getTime() - then.getTime()) / 1000 / 60 / 60 / 24;
  return diffDays >= 0 && diffDays <= days;
}

function isUpcomingMinutes(datetime: string | null, minutes: number): boolean {
  if (!datetime) return false;
  const then = new Date(datetime);
  const now = new Date();
  const diffMinutes = (then.getTime() - now.getTime()) / 1000 / 60;
  return diffMinutes > 0 && diffMinutes <= minutes;
}

function isUpcomingHours(datetime: string | null, hours: number): boolean {
  if (!datetime) return false;
  const then = new Date(datetime);
  const now = new Date();
  const diffHours = (then.getTime() - now.getTime()) / 1000 / 60 / 60;
  return diffHours > 0 && diffHours <= hours;
}

function isUpcomingDays(datetime: string | null, days: number): boolean {
  if (!datetime) return false;
  const then = new Date(datetime);
  const now = new Date();
  const diffDays = (then.getTime() - now.getTime()) / 1000 / 60 / 60 / 24;
  return diffDays > 0 && diffDays <= days;
}

function isUpcomingDaysMoreThan(datetime: string | null, days: number): boolean {
  if (!datetime) return false;
  const then = new Date(datetime);
  const now = new Date();
  const diffDays = (then.getTime() - now.getTime()) / 1000 / 60 / 60 / 24;
  return diffDays > days;
}

function isEmpty(value: any): boolean {
  return value === null || value === undefined || value === '';
}

function isNotEmpty(value: any): boolean {
  return value !== null && value !== undefined && value !== '';
}

// Evaluate condition
function evaluateCondition(condition: any, event: any, comparativeData: any = {}): boolean {
  const { field, operator, value, compare_to } = condition;
  const fieldValue = getNestedField(event, field);

  // Handle special values
  let evaluatedValue = value;
  if (typeof value === 'string' && value.includes('_ago')) {
    const now = new Date();
    if (value === '1_day_ago') {
      evaluatedValue = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    } else if (value === '3_days_ago') {
      evaluatedValue = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);
    } else if (value === '7_days_ago') {
      evaluatedValue = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    } else if (value === '30_days_ago') {
      evaluatedValue = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    }
  }

  switch (operator) {
    case 'equals':
      return fieldValue === evaluatedValue;
    case 'not_equals':
      return fieldValue !== evaluatedValue;
    case 'is_null':
      return fieldValue === null || fieldValue === undefined;
    case 'is_not_null':
      return fieldValue !== null && fieldValue !== undefined;
    case 'greater_than':
      return Number(fieldValue) > Number(evaluatedValue);
    case 'less_than':
      return Number(fieldValue) < Number(evaluatedValue);
    case 'gte':
      return Number(fieldValue) >= Number(evaluatedValue);
    case 'lte':
      return Number(fieldValue) <= Number(evaluatedValue);
    case 'before':
      if (!fieldValue) return false;
      const fieldDate = new Date(fieldValue);
      const compareDate = evaluatedValue instanceof Date ? evaluatedValue : new Date(evaluatedValue);
      return fieldDate < compareDate;
    case 'greater_than_percent':
      // Try comparativeData first, then event object field
      const compareValue = comparativeData[compare_to] || getNestedField(event, compare_to) || 0;
      if (compareValue === 0) return false;
      const percent = (Number(fieldValue) / compareValue) * 100;
      return percent > Number(value);
    case 'less_than_percent':
      // Try comparativeData first, then event object field
      const compareVal = comparativeData[compare_to] || getNestedField(event, compare_to) || 0;
      if (compareVal === 0) return false;
      const pct = (Number(fieldValue) / compareVal) * 100;
      return pct < Number(value);
    case 'past_minutes':
      return isPastMinutes(fieldValue, value);
    case 'past_hours':
      return isPastHours(fieldValue, value);
    case 'past_days':
      return isPastDays(fieldValue, value);
    case 'within_days':
      return isWithinDays(fieldValue, value);
    case 'upcoming_minutes':
      return isUpcomingMinutes(fieldValue, value);
    case 'upcoming_hours':
      return isUpcomingHours(fieldValue, value);
    case 'upcoming_days':
      return isUpcomingDays(fieldValue, value);
    case 'upcoming_days_more_than':
      return isUpcomingDaysMoreThan(fieldValue, value);
    case 'is_empty':
      return isEmpty(fieldValue);
    case 'is_not_empty':
      return isNotEmpty(fieldValue);
    default:
      return false;
  }
}

// Get time context for message interpolation
function getTimeContext(event: any): any {
  const now = new Date();
  const context: any = {};

  if (event.event_start_datetime) {
    const start = new Date(event.event_start_datetime);
    const diffMs = now.getTime() - start.getTime();
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
    const diffMs = now.getTime() - end.getTime();
    const diffDays = Math.floor(diffMs / 1000 / 60 / 60 / 24);
    if (diffMs > 0) {
      context.days_ago = diffDays;
    }
  }

  return context;
}

// Interpolate message
function interpolateMessage(template: string, event: any, comparativeData: any = {}): string {
  let message = template;
  const timeContext = getTimeContext(event);

  // Add percentage calculations for comparative messages
  const percentContext: any = {};
  if (event.prev_ticket_revenue !== undefined && event.prev_ticket_revenue > 0) {
    percentContext.percent_of_previous = Math.round(((event.ticket_revenue || 0) / event.prev_ticket_revenue) * 100);
  }
  if (event.prev_total_votes !== undefined && event.prev_total_votes > 0) {
    percentContext.percent_of_previous = Math.round(((event.total_votes || 0) / event.prev_total_votes) * 100);
  }
  if (event.prev_auction_revenue !== undefined && event.prev_auction_revenue > 0) {
    percentContext.percent_of_previous = Math.round(((event.auction_revenue || 0) / event.prev_auction_revenue) * 100);
  }

  const context = { ...event, ...timeContext, ...comparativeData, ...percentContext };

  message = message.replace(/\{\{([^}]+)\}\}/g, (match, field) => {
    const value = getNestedField(context, field.trim());
    return value !== undefined && value !== null ? String(value) : match;
  });

  return message;
}

// Evaluate rule
function evaluateRule(rule: any, event: any, comparativeData: any = {}, supabaseClient: any = null): any | null {
  const allConditionsMet = rule.conditions.every((condition: any) =>
    evaluateCondition(condition, event, comparativeData)
  );

  if (!allConditionsMet) return null;

  // Increment hit count for this rule (fire and forget)
  if (supabaseClient) {
    incrementRuleHit(supabaseClient, rule.id);
  }

  const severityEmoji: any = {
    error: '❌',
    warning: '⚠️',
    reminder: '🔔',
    info: '📊',
    success: '✅'
  };

  return {
    ruleId: rule.id,
    ruleName: rule.name,
    severity: rule.severity,
    category: rule.category,
    context: rule.context,
    emoji: severityEmoji[rule.severity],
    message: interpolateMessage(rule.message, event, comparativeData),
    eventId: event.id,
    eventEid: event.eid,
    eventName: event.name,
    timestamp: new Date().toISOString()
  };
}

// SSE Stream Writer class for sending findings progressively
class StreamWriter {
  private encoder = new TextEncoder();
  private controller: ReadableStreamDefaultController | null = null;

  setController(controller: ReadableStreamDefaultController) {
    this.controller = controller;
  }

  sendFindings(findings: any[], phase: string) {
    if (!this.controller || findings.length === 0) return;

    const message = `data: ${JSON.stringify({ phase, findings })}\n\n`;
    this.controller.enqueue(this.encoder.encode(message));
  }

  sendProgress(phase: string, message: string) {
    if (!this.controller) return;

    const msg = `data: ${JSON.stringify({ phase, progress: message })}\n\n`;
    this.controller.enqueue(this.encoder.encode(msg));
  }

  sendComplete(summary: any, debug: any) {
    if (!this.controller) return;

    const message = `data: ${JSON.stringify({ complete: true, summary, debug })}\n\n`;
    this.controller.enqueue(this.encoder.encode(message));
    this.controller.close();
  }

  sendError(error: string, debug: any) {
    if (!this.controller) return;

    const message = `data: ${JSON.stringify({ error, debug })}\n\n`;
    this.controller.enqueue(this.encoder.encode(message));
    this.controller.close();
  }
}

// Run linter with streaming (sends findings progressively)
async function runLinterWithStreaming(
  supabaseClient: any,
  streamWriter: StreamWriter,
  debugInfo: any,
  filterEid: string | null,
  filterSeverity: string | null,
  futureOnly: boolean,
  activeOnly: boolean
) {
  streamWriter.sendProgress('init', 'Loading rules and fetching events...');

  // Load rules
  const rules = await loadRules(supabaseClient);
  debugInfo.rules_loaded = rules.length;

  // Fetch events (same logic as non-streaming)
  const { data: events, error: eventsError } = await supabaseClient
    .from('events')
    .select(`
      *,
      cities(id, name, country_id, countries(id, name, code))
    `)
    .order('event_start_datetime', { ascending: false });

  if (eventsError) {
    throw new Error(`Failed to fetch events: ${eventsError.message}`);
  }

  debugInfo.events_fetched = events?.length || 0;

  // Filter events (same as non-streaming)
  let eventsToLint = events || [];

  // Filter out test/internal events
  eventsToLint = eventsToLint.filter(e => {
    if (!e.eid) return true;
    const match = e.eid.match(/^AB(\d+)$/);
    if (!match) return true;
    const eidNum = parseInt(match[1]);
    return eidNum < 4000 || eidNum >= 7000;
  });

  // Filter to events from the last 4 years (to match historical rules)
  if (!filterEid) {
    const now = new Date();
    const fourYearsAgo = new Date(now.getTime() - 1460 * 24 * 60 * 60 * 1000); // 4 years = 1460 days
    eventsToLint = eventsToLint.filter(e => {
      if (!e.event_start_datetime) return true;
      const eventStart = new Date(e.event_start_datetime);
      return eventStart >= fourYearsAgo;
    });
    debugInfo.historical_filtered = eventsToLint.length;
  }

  // Filter by EID if specified
  if (filterEid) {
    eventsToLint = eventsToLint.filter(e => e.eid === filterEid);
  }

  // Filter by future only
  if (futureOnly) {
    const now = new Date();
    eventsToLint = eventsToLint.filter(e => {
      if (!e.event_start_datetime) return true;
      const eventDate = new Date(e.event_start_datetime);
      return eventDate > now;
    });
    debugInfo.future_only_filtered = eventsToLint.length;
  }

  // Filter by active only
  if (activeOnly) {
    const now = new Date();
    const twentyFourHoursMs = 24 * 60 * 60 * 1000;
    eventsToLint = eventsToLint.filter(e => {
      if (!e.event_start_datetime) return false;
      const eventDate = new Date(e.event_start_datetime);
      const diffMs = Math.abs(eventDate.getTime() - now.getTime());
      return diffMs <= twentyFourHoursMs;
    });
    debugInfo.active_only_filtered = eventsToLint.length;
  }

  debugInfo.events_to_lint = eventsToLint.length;

  streamWriter.sendProgress('enrichment', `Enriching ${eventsToLint.length} events with computed metrics...`);

  // Enrich events with computed metrics from database functions
  try {
    eventsToLint = await enrichEventsWithMetrics(supabaseClient, eventsToLint);
    debugInfo.events_enriched = eventsToLint.length;
  } catch (error) {
    console.error('Error enriching events:', error);
    // Continue without enrichment - rules that need metrics will just not match
  }

  // Generate overview/dashboard findings from aggregate metrics
  // Only generate when not filtering by specific event
  const overviewFindings: any[] = [];

  if (!filterEid) {
    streamWriter.sendProgress('overview_metrics', 'Generating operational overview...');

    try {
      const { data: overviewMetrics, error: overviewError } = await supabaseClient
        .rpc('get_all_overview_metrics');

      if (!overviewError && overviewMetrics) {
        for (const metric of overviewMetrics) {
          const rule = rules.find((r: any) => r.id === metric.rule_id);
          if (rule && rule.context === 'dashboard') {
            // Interpolate metrics into message with format support
            let message = rule.message;
            const metrics = metric.metrics;

            // Replace variables with format specifiers (e.g., {change:+;-})
            message = message.replace(/\{([^}:]+)(?::([^}]+))?\}/g, (match, key, format) => {
              if (!(key in metrics)) return match;
              const value = metrics[key];

              // Handle format specifiers
              if (format === '+;-' && typeof value === 'number') {
                // Show sign for positive numbers
                return value > 0 ? `+${value}` : String(value);
              }

              return String(value);
            });

            overviewFindings.push({
              ruleId: rule.id,
              ruleName: rule.name,
              severity: 'overview',
              category: rule.category,
              context: rule.context,
              emoji: '📊',
              message: message,
              eventId: null,  // Overview findings don't belong to specific events
              eventEid: '',
              eventName: 'DASH',
              timestamp: new Date().toISOString(),
              metrics: metrics  // Include full metrics with weekly_data for graphing
            });
          }
        }
      }
    } catch (error) {
      console.error('Error generating overview metrics:', error);
      // Continue without overview - not critical
    }

    // Send overview findings
    if (overviewFindings.length > 0) {
      streamWriter.sendFindings(overviewFindings, 'overview_metrics');
    }
  }

  streamWriter.sendProgress('event_rules', 'Checking event-level rules...');

  let allFindings: any[] = [...overviewFindings];

  // Run event-level rules
  const eventFindings: any[] = [];
  for (const event of eventsToLint) {
    // Check EID format
    if (event.eid && !/^AB\d{3,4}$/.test(event.eid)) {
      const eidRule = rules.find((r: any) => r.id === 'invalid_eid_format');
      if (eidRule) {
        incrementRuleHit(supabaseClient, 'invalid_eid_format');
        eventFindings.push({
          ruleId: 'invalid_eid_format',
          ruleName: eidRule.name,
          severity: 'error',
          category: 'data_completeness',
          context: 'always',
          emoji: '❌',
          message: `Event ${event.eid} has invalid format - must be AB### or AB#### (e.g., AB123 or AB3049)`,
          eventId: event.id,
          eventEid: event.eid,
          eventName: event.name,
          timestamp: new Date().toISOString()
        });
      }
    }

    for (const rule of rules) {
      if (!rule.conditions || rule.conditions.length === 0) {
        continue;
      }

      // Skip live-event-stats rules - these are handled separately with special data fetching
      if (rule.category === 'live-event-stats') {
        continue;
      }

      const finding = evaluateRule(rule, event, {}, supabaseClient);
      if (finding) {
        // Special handling for ad budget escalation
        if (finding.ruleId === 'advertising_budget_not_set_info' && event.days_until_event !== undefined) {
          if (event.days_until_event <= 7) {
            finding.severity = 'error';
            finding.emoji = '❌';
          } else if (event.days_until_event <= 20) {
            finding.severity = 'warning';
            finding.emoji = '⚠️';
          }
        }
        eventFindings.push(finding);
      }
    }
  }

  allFindings.push(...eventFindings);
  streamWriter.sendFindings(eventFindings, 'event_rules');

  streamWriter.sendProgress('artist_payments', 'Checking artist payments...');

  // Run artist payment checks
  const artistFindings: any[] = [];
  const artistRules = rules.filter((r: any) => r.id === 'artist_payment_overdue');
  if (artistRules.length > 0 && !filterEid && !futureOnly && !activeOnly) {
    try {
      const { data: overdueArtists, error: artistError } = await supabaseClient
        .rpc('get_overdue_artist_payments', { days_threshold: 14 });

      if (!artistError && overdueArtists) {
        for (const artist of overdueArtists) {
          artistFindings.push({
            ruleId: 'artist_payment_overdue',
            ruleName: 'Artist Payment Overdue',
            severity: 'error',
            category: 'data_completeness',
            context: 'post_event',
            emoji: '❌',
            message: `💸 ${artist.artist_name} owed ${artist.currency} $${artist.balance_owed.toFixed(2)} for ${artist.days_overdue} days - process payment urgently`,
            eventId: null,
            eventEid: null,
            eventName: null,
            artistId: artist.artist_id,
            artistNumber: artist.artist_entry_id,
            artistName: artist.artist_name,
            artistEmail: artist.artist_email,
            balanceOwed: artist.balance_owed,
            currency: artist.currency,
            daysOverdue: artist.days_overdue,
            paymentAccountStatus: artist.payment_account_status,
            timestamp: new Date().toISOString()
          });
        }
        debugInfo.artist_payments_checked = overdueArtists.length;
      }
    } catch (artistCheckError: any) {
      debugInfo.artist_check_error = artistCheckError.message;
    }
  }

  allFindings.push(...artistFindings);
  streamWriter.sendFindings(artistFindings, 'artist_payments');

  streamWriter.sendProgress('city_checks', 'Checking city-level booking opportunities...');

  // Run city-level checks
  const cityFindings: any[] = [];
  const cityRules = rules.filter((r: any) => r.category === 'booking_opportunity');
  if (cityRules.length > 0 && !filterEid && !futureOnly && !activeOnly) {
    try {
      const now = new Date();

      // Get ALL unique cities that have events
      const { data: citiesData } = await supabaseClient
        .from('cities')
        .select(`
          id,
          name,
          countries(code)
        `)
        .in('id',
          await supabaseClient
            .from('events')
            .select('city_id')
            .not('city_id', 'is', null)
            .then((res: any) => {
              const cityIds = [...new Set(res.data?.map((e: any) => e.city_id) || [])];
              return cityIds.length > 0 ? cityIds : ['00000000-0000-0000-0000-000000000000'];
            })
        );

      const uniqueCities = (citiesData || []).map((c: any) => ({
        city_id: c.id,
        city_name: c.name,
        country_code: c.countries?.code
      }));

      streamWriter.sendProgress('city_checks', `Checking ${uniqueCities.length} cities...`);

      if (uniqueCities.length > 0) {
        for (const city of uniqueCities) {
          // Get ALL past events for this city
          const { data: allPastEvents } = await supabaseClient
            .from('events')
            .select('id, eid, name, event_end_datetime')
            .eq('city_id', city.city_id)
            .not('event_end_datetime', 'is', null)
            .lt('event_end_datetime', now.toISOString())
            .order('event_end_datetime', { ascending: false });

          if (allPastEvents && allPastEvents.length > 0) {
            const allEventIds = allPastEvents.map((e: any) => e.id);

            // Get vote counts for all past events
            const { data: allVoteData } = await supabaseClient
              .from('votes')
              .select('event_id, id')
              .in('event_id', allEventIds);

            const allVoteCountMap = new Map();
            allVoteData?.forEach((vote: any) => {
              allVoteCountMap.set(vote.event_id, (allVoteCountMap.get(vote.event_id) || 0) + 1);
            });

            // Check for very strong historical performance (400+ votes)
            const hasVeryStrongEvent = allPastEvents.some((e: any) => (allVoteCountMap.get(e.id) || 0) >= 400);

            if (hasVeryStrongEvent) {
              // Check if city has any future events
              const { data: futureEvents } = await supabaseClient
                .from('events')
                .select('id')
                .eq('city_id', city.city_id)
                .gt('event_start_datetime', now.toISOString())
                .limit(1);

              const hasFutureEvent = futureEvents && futureEvents.length > 0;

              if (!hasFutureEvent) {
                const rule = cityRules.find((r: any) => r.id === 'city_very_strong_event_no_booking');
                if (rule) {
                  incrementRuleHit(supabaseClient, 'city_very_strong_event_no_booking');

                  const veryStrongEvents = allPastEvents
                    .filter((e: any) => (allVoteCountMap.get(e.id) || 0) >= 400)
                    .map((e: any) => `${e.eid} (${allVoteCountMap.get(e.id)} votes)`)
                    .join(', ');

                  cityFindings.push({
                    ruleId: 'city_very_strong_event_no_booking',
                    ruleName: rule.name,
                    severity: 'warning',
                    category: rule.category,
                    context: 'always',
                    emoji: '⚠️',
                    message: `${city.city_name} had very strong events historically (${veryStrongEvents}) but no future event is booked`,
                    eventId: null,
                    eventEid: null,
                    eventName: null,
                    cityId: city.city_id,
                    cityName: city.city_name,
                    countryCode: city.country_code,
                    veryStrongEvents: veryStrongEvents,
                    timestamp: new Date().toISOString()
                  });
                }
              }
            }

            // Check for good recent performance (200+ in last 2)
            const recentEvents = allPastEvents.slice(0, 2);
            const hasGoodEvent = recentEvents.some((e: any) => (allVoteCountMap.get(e.id) || 0) >= 200);

            if (hasGoodEvent) {
              const { data: futureEvents } = await supabaseClient
                .from('events')
                .select('id')
                .eq('city_id', city.city_id)
                .gt('event_start_datetime', now.toISOString())
                .limit(1);

              const hasFutureEvent = futureEvents && futureEvents.length > 0;

              if (!hasFutureEvent) {
                const rule = cityRules.find((r: any) => r.id === 'city_good_event_no_booking');
                if (rule) {
                  incrementRuleHit(supabaseClient, 'city_good_event_no_booking');

                  const goodEvents = recentEvents
                    .filter((e: any) => (allVoteCountMap.get(e.id) || 0) >= 200)
                    .map((e: any) => `${e.eid} (${allVoteCountMap.get(e.id)} votes)`)
                    .join(', ');

                  cityFindings.push({
                    ruleId: 'city_good_event_no_booking',
                    ruleName: rule.name,
                    severity: 'warning',
                    category: rule.category,
                    context: 'always',
                    emoji: '⚠️',
                    message: `${city.city_name} had strong events recently (${goodEvents}) but no future event is booked`,
                    eventId: null,
                    eventEid: null,
                    eventName: null,
                    cityId: city.city_id,
                    cityName: city.city_name,
                    countryCode: city.country_code,
                    goodEvents: goodEvents,
                    timestamp: new Date().toISOString()
                  });
                }
              }
            }
          }
        }

        debugInfo.cities_checked = uniqueCities.length;
      }
    } catch (cityCheckError: any) {
      debugInfo.city_check_error = cityCheckError.message;
    }
  }

  allFindings.push(...cityFindings);
  streamWriter.sendFindings(cityFindings, 'city_checks');

  streamWriter.sendProgress('live_event_stats', 'Checking live event statistics...');

  // Run live event statistics check (QR scans, votes, photos) - STREAMING MODE
  const liveEventStatsFindings: any[] = [];
  const liveEventStatsRules = rules.filter((r: any) => r.category === 'live-event-stats');
  if (liveEventStatsRules.length > 0 && eventsToLint.length > 0) {
    try {
      const now = new Date();
      const activeEvents = eventsToLint.filter(e => {
        if (!e.event_start_datetime || !e.event_end_datetime) return false;
        const eventStart = new Date(e.event_start_datetime);
        const eventEnd = new Date(e.event_end_datetime);
        const minutesSinceStart = (now.getTime() - eventStart.getTime()) / 1000 / 60;
        const hoursUntilEnd = (eventEnd.getTime() - now.getTime()) / 1000 / 60 / 60;
        return minutesSinceStart >= 30 && hoursUntilEnd > 0 && hoursUntilEnd <= 12;
      });

      if (activeEvents.length > 0) {
        const eventIds = activeEvents.map(e => e.id);

        // Fetch QR scan counts
        const { data: qrData } = await supabaseClient
          .from('people_qr_scans')
          .select('event_id, id')
          .in('event_id', eventIds);

        const qrCountMap = new Map();
        qrData?.forEach((scan: any) => {
          qrCountMap.set(scan.event_id, (qrCountMap.get(scan.event_id) || 0) + 1);
        });

        // Fetch vote counts
        const { data: voteData } = await supabaseClient
          .from('votes')
          .select('event_id, id')
          .in('event_id', eventIds);

        const voteCountMap = new Map();
        voteData?.forEach((vote: any) => {
          voteCountMap.set(vote.event_id, (voteCountMap.get(vote.event_id) || 0) + 1);
        });

        // Fetch photo counts by round
        const { data: photoData } = await supabaseClient
          .from('art')
          .select('event_id, round, art_media!inner(id)')
          .in('event_id', eventIds);

        const photosByEventMap = new Map();
        photoData?.forEach((art: any) => {
          if (!photosByEventMap.has(art.event_id)) {
            photosByEventMap.set(art.event_id, { 1: 0, 2: 0, 3: 0 });
          }
          const rounds = photosByEventMap.get(art.event_id);
          rounds[art.round] = (rounds[art.round] || 0) + 1;
        });

        // Generate findings for each active event
        for (const event of activeEvents) {
          const qrScanRule = liveEventStatsRules.find((r: any) => r.id === 'live_event_qr_scans_info');
          if (qrScanRule) {
            const qrCount = qrCountMap.get(event.id) || 0;
            incrementRuleHit(supabaseClient, 'live_event_qr_scans_info');

            liveEventStatsFindings.push({
              ruleId: 'live_event_qr_scans_info',
              ruleName: qrScanRule.name,
              severity: 'info',
              category: qrScanRule.category,
              context: qrScanRule.context,
              emoji: '📊',
              message: qrScanRule.message.replace('{qr_scan_count}', qrCount.toString()),
              eventId: event.id,
              eventEid: event.eid,
              eventName: event.name,
              qrScanCount: qrCount,
              timestamp: new Date().toISOString()
            });
          }

          const voteRule = liveEventStatsRules.find((r: any) => r.id === 'live_event_votes_info');
          if (voteRule) {
            const voteCount = voteCountMap.get(event.id) || 0;
            incrementRuleHit(supabaseClient, 'live_event_votes_info');

            liveEventStatsFindings.push({
              ruleId: 'live_event_votes_info',
              ruleName: voteRule.name,
              severity: 'info',
              category: voteRule.category,
              context: voteRule.context,
              emoji: '📊',
              message: voteRule.message.replace('{vote_count}', voteCount.toString()),
              eventId: event.id,
              eventEid: event.eid,
              eventName: event.name,
              voteCount: voteCount,
              timestamp: new Date().toISOString()
            });
          }

          const photoRule = liveEventStatsRules.find((r: any) => r.id === 'live_event_photos_info');
          if (photoRule) {
            const photosByRound = photosByEventMap.get(event.id) || { 1: 0, 2: 0, 3: 0 };
            const photosText = `R1: ${photosByRound[1]}, R2: ${photosByRound[2]}, R3: ${photosByRound[3]}`;
            incrementRuleHit(supabaseClient, 'live_event_photos_info');

            liveEventStatsFindings.push({
              ruleId: 'live_event_photos_info',
              ruleName: photoRule.name,
              severity: 'info',
              category: photoRule.category,
              context: photoRule.context,
              emoji: '📊',
              message: photoRule.message.replace('{photos_by_round}', photosText),
              eventId: event.id,
              eventEid: event.eid,
              eventName: event.name,
              photosByRound: photosByRound,
              timestamp: new Date().toISOString()
            });
          }
        }

        debugInfo.live_event_stats_checked = activeEvents.length;
      }
    } catch (statsError: any) {
      debugInfo.live_event_stats_error = statsError.message;
    }
  }

  allFindings.push(...liveEventStatsFindings);
  streamWriter.sendFindings(liveEventStatsFindings, 'live_event_stats');

  streamWriter.sendProgress('suppressions', 'Filtering suppressed findings...');

  // Filter suppressions
  try {
    const { data: suppressions, error: suppressError } = await supabaseClient
      .from('linter_suppressions')
      .select('rule_id, event_id, artist_id, city_id, suppressed_until');

    if (!suppressError && suppressions && suppressions.length > 0) {
      const now = new Date();
      const activeSuppressions = suppressions.filter((s: any) =>
        !s.suppressed_until || new Date(s.suppressed_until) > now
      );

      debugInfo.active_suppressions = activeSuppressions.length;

      const suppressedFindings: any[] = [];
      allFindings = allFindings.filter((finding: any) => {
        const isSuppressed = activeSuppressions.some((s: any) => {
          if (s.rule_id !== finding.ruleId) return false;
          if (s.event_id && String(s.event_id).toLowerCase() !== String(finding.eventId).toLowerCase()) return false;
          if (s.artist_id && String(s.artist_id).toLowerCase() !== String(finding.artistId || '').toLowerCase()) return false;
          if (s.city_id && String(s.city_id).toLowerCase() !== String(finding.cityId || '').toLowerCase()) return false;
          if (!s.event_id && !s.artist_id && !s.city_id) return false;
          return true;
        });

        if (isSuppressed) {
          suppressedFindings.push({
            ruleId: finding.ruleId,
            eventId: finding.eventId,
            artistId: finding.artistId
          });
        }

        return !isSuppressed;
      });

      debugInfo.findings_suppressed = suppressedFindings.length;
    }
  } catch (suppressError: any) {
    debugInfo.suppression_error = suppressError.message;
  }

  // Sort by severity
  const severityOrder: any = { error: 0, warning: 1, reminder: 2, info: 3, success: 4 };
  allFindings.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

  // Filter by severity if specified
  let filteredFindings = filterSeverity
    ? allFindings.filter(f => f.severity === filterSeverity)
    : allFindings;

  // Calculate summary
  const summary = filteredFindings.reduce((acc: any, f) => {
    acc[f.severity] = (acc[f.severity] || 0) + 1;
    return acc;
  }, { error: 0, warning: 0, reminder: 0, info: 0, success: 0 });

  debugInfo.findings_count = filteredFindings.length;
  debugInfo.summary = summary;

  streamWriter.sendComplete(summary, debugInfo);
}

// Main handler
serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const debugInfo: any = {
    timestamp: new Date().toISOString(),
    function_name: 'event-linter',
    request_method: req.method
  };

  try {
    // Parse request
    const url = new URL(req.url);
    const filterEid = url.searchParams.get('eid');
    const filterSeverity = url.searchParams.get('severity');
    const summaryOnly = url.searchParams.get('summary') === 'true';
    const futureOnly = url.searchParams.get('future') === 'true';
    const activeOnly = url.searchParams.get('active') === 'true';
    const streamMode = url.searchParams.get('stream') === 'true';

    debugInfo.filters = {
      eid: filterEid,
      severity: filterSeverity,
      summary_only: summaryOnly,
      future_only: futureOnly,
      active_only: activeOnly,
      stream_mode: streamMode
    };

    // Create Supabase client
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // If streaming mode, return SSE response
    if (streamMode) {
      const streamWriter = new StreamWriter();

      const stream = new ReadableStream({
        async start(controller) {
          streamWriter.setController(controller);

          try {
            // Run all linter checks with streaming
            await runLinterWithStreaming(
              supabaseClient,
              streamWriter,
              debugInfo,
              filterEid,
              filterSeverity,
              futureOnly,
              activeOnly
            );
          } catch (error: any) {
            streamWriter.sendError(error.message, {
              ...debugInfo,
              error_type: error.constructor.name,
              error_stack: error.stack
            });
          }
        }
      });

      return new Response(stream, {
        headers: {
          ...corsHeaders,
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive'
        }
      });
    }

    // Non-streaming mode - original logic below
    // Load rules
    const rules = await loadRules(supabaseClient);
    debugInfo.rules_loaded = rules.length;

    // Fetch events
    const { data: events, error: eventsError } = await supabaseClient
      .from('events')
      .select(`
        *,
        cities(id, name, country_id, countries(id, name, code))
      `)
      .order('event_start_datetime', { ascending: false });

    if (eventsError) {
      return new Response(
        JSON.stringify({
          error: 'Failed to fetch events',
          success: false,
          debug: {
            ...debugInfo,
            events_error: eventsError.message,
            events_error_details: eventsError.details,
            events_error_hint: eventsError.hint
          }
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 500
        }
      );
    }

    debugInfo.events_fetched = events?.length || 0;

    // Filter events
    let eventsToLint = events || [];

    // Filter out test/internal events (AB4000-AB7000 range)
    eventsToLint = eventsToLint.filter(e => {
      if (!e.eid) return true;
      const match = e.eid.match(/^AB(\d+)$/);
      if (!match) return true;
      const eidNum = parseInt(match[1]);
      return eidNum < 4000 || eidNum >= 7000;
    });

    // Filter to events from the last 4 years (to match historical rules)
    if (!filterEid) {
      const now = new Date();
      const fourYearsAgo = new Date(now.getTime() - 1460 * 24 * 60 * 60 * 1000); // 4 years = 1460 days
      eventsToLint = eventsToLint.filter(e => {
        if (!e.event_start_datetime) return true;
        const eventStart = new Date(e.event_start_datetime);
        return eventStart >= fourYearsAgo;
      });
      debugInfo.historical_filtered = eventsToLint.length;
    }

    // Filter by EID if specified
    if (filterEid) {
      eventsToLint = eventsToLint.filter(e => e.eid === filterEid);
    }

    // Filter by future only if specified
    if (futureOnly) {
      const now = new Date();
      eventsToLint = eventsToLint.filter(e => {
        // Include if no start datetime OR if start datetime is in the future
        if (!e.event_start_datetime) return true;
        const eventDate = new Date(e.event_start_datetime);
        return eventDate > now;
      });
      debugInfo.future_only_filtered = eventsToLint.length;
    }

    // Filter by active only if specified (within 24 hours either direction)
    if (activeOnly) {
      const now = new Date();
      const twentyFourHoursMs = 24 * 60 * 60 * 1000;
      eventsToLint = eventsToLint.filter(e => {
        if (!e.event_start_datetime) return false;
        const eventDate = new Date(e.event_start_datetime);
        const diffMs = Math.abs(eventDate.getTime() - now.getTime());
        return diffMs <= twentyFourHoursMs;
      });
      debugInfo.active_only_filtered = eventsToLint.length;
    }

    debugInfo.events_to_lint = eventsToLint.length;

    // Enrich ALL events with computed metrics from database functions
    try {
      eventsToLint = await enrichEventsWithMetrics(supabaseClient, eventsToLint);
      debugInfo.events_enriched_with_metrics = eventsToLint.length;
    } catch (error) {
      console.error('Error enriching events with metrics:', error);
      debugInfo.enrichment_error = error.message;
      // Continue without enrichment - rules that need metrics will just not match
    }

    // Only enrich recently ended events (last 30 days) to improve performance
    const recentlyEndedEvents = eventsToLint.filter(e => {
      if (!e.event_end_datetime) return false;
      const endDate = new Date(e.event_end_datetime);
      const now = new Date();
      const daysSinceEnd = (now.getTime() - endDate.getTime()) / 1000 / 60 / 60 / 24;
      return daysSinceEnd >= 1 && daysSinceEnd <= 30;
    });

    debugInfo.events_to_enrich = recentlyEndedEvents.length;

    // Batch fetch Eventbrite data for all events needing enrichment
    if (recentlyEndedEvents.length > 0) {
      const eventIds = recentlyEndedEvents.map(e => e.id);

      // Get Eventbrite ticket revenue in batch
      const { data: ebCacheData } = await supabaseClient
        .from('eventbrite_api_cache')
        .select('event_id, ticket_revenue, total_tickets_sold')
        .in('event_id', eventIds);

      const ebCacheMap = new Map();
      ebCacheData?.forEach((eb: any) => {
        ebCacheMap.set(eb.event_id, eb);
      });

      // Get auction revenue in batch (sum of final_price for sold/paid art)
      const { data: artData } = await supabaseClient
        .from('art')
        .select('event_id, final_price, status')
        .in('event_id', eventIds)
        .in('status', ['sold', 'paid'])
        .limit(5000);

      const auctionRevenueMap = new Map();
      artData?.forEach((art: any) => {
        const current = auctionRevenueMap.get(art.event_id) || 0;
        auctionRevenueMap.set(art.event_id, current + (Number(art.final_price) || 0));
      });

      // Get vote counts with pagination (Supabase has 1000 row limit per query)
      const voteCountsMap = new Map();
      let voteOffset = 0;
      let hasMoreVotes = true;
      let totalVotesRetrieved = 0;

      while (hasMoreVotes) {
        const { data: voteData, error: voteError } = await supabaseClient
          .from('votes')
          .select('event_id, id, round')
          .in('event_id', eventIds)
          .range(voteOffset, voteOffset + 999);

        if (voteError) {
          debugInfo.vote_query_error = voteError.message;
          break;
        }

        if (!voteData || voteData.length === 0) {
          hasMoreVotes = false;
          break;
        }

        totalVotesRetrieved += voteData.length;

        voteData.forEach((vote: any) => {
          if (!voteCountsMap.has(vote.event_id)) {
            voteCountsMap.set(vote.event_id, { total: 0, r1: 0, r2: 0, r3: 0 });
          }
          const counts = voteCountsMap.get(vote.event_id);
          counts.total++;
          if (vote.round === 1) counts.r1++;
          if (vote.round === 2) counts.r2++;
          if (vote.round === 3) counts.r3++;
        });

        // If we got less than 1000, we're done
        if (voteData.length < 1000) {
          hasMoreVotes = false;
        } else {
          voteOffset += 1000;
        }
      }

      debugInfo.vote_rows_retrieved = totalVotesRetrieved;

      // Enrich events with current metrics
      for (const event of recentlyEndedEvents) {
        const eb = ebCacheMap.get(event.id);
        event.ticket_revenue = eb?.ticket_revenue || 0;
        event.total_tickets_sold = eb?.total_tickets_sold || 0;
        event.auction_revenue = auctionRevenueMap.get(event.id) || 0;

        const votes = voteCountsMap.get(event.id) || { total: 0, r1: 0, r2: 0, r3: 0 };
        event.total_votes = votes.total;
        event.round1_votes = votes.r1;
        event.round2_votes = votes.r2;
        event.round3_votes = votes.r3;

        // Get previous event metrics
        try {
          const { data: prevMetrics } = await supabaseClient
            .rpc('get_previous_event_metrics', { p_event_id: event.id });

          if (prevMetrics && prevMetrics.length > 0) {
            const prev = prevMetrics[0];
            event.prev_ticket_revenue = prev.ticket_revenue;
            event.prev_auction_revenue = prev.auction_revenue;
            event.prev_total_votes = prev.total_votes;
            event.prev_round1_votes = prev.round1_votes;
            event.prev_round2_votes = prev.round2_votes;
            event.prev_round3_votes = prev.round3_votes;
            event.prev_qr_registrations = prev.qr_registrations;
            event.prev_online_registrations = prev.online_registrations;
            event.prev_event_eid = prev.previous_event_eid;
          }
        } catch (prevError: any) {
          // Skip prev metrics errors
        }
      }
    }

    // Enrich future events with artist confirmation counts (from artist_confirmations table)
    const futureEvents = eventsToLint.filter(e => {
      if (!e.event_start_datetime) return false;
      const startDate = new Date(e.event_start_datetime);
      const now = new Date();
      return startDate > now;
    });

    if (futureEvents.length > 0) {
      const futureEventEids = futureEvents.map(e => e.eid).filter(eid => eid);

      try {
        // Get confirmed artists from artist_confirmations table
        const { data: confirmationData, error: confirmationError } = await supabaseClient
          .from('artist_confirmations')
          .select('event_eid, confirmation_status, withdrawn_at, confirmation_date')
          .in('event_eid', futureEventEids);

        if (!confirmationError && confirmationData) {
          // Group confirmation counts and track last confirmation by event_eid
          const confirmationCountMap = new Map();
          confirmationData.forEach((ac: any) => {
            if (!confirmationCountMap.has(ac.event_eid)) {
              confirmationCountMap.set(ac.event_eid, { confirmed: 0, withdrawn: 0, last_confirmed_at: null });
            }
            const counts = confirmationCountMap.get(ac.event_eid);
            if (ac.confirmation_status === 'confirmed' && !ac.withdrawn_at) {
              counts.confirmed++;
              // Track most recent confirmation date
              if (ac.confirmation_date) {
                const confirmedDate = new Date(ac.confirmation_date);
                if (!counts.last_confirmed_at || confirmedDate > counts.last_confirmed_at) {
                  counts.last_confirmed_at = confirmedDate;
                }
              }
            }
            if (ac.withdrawn_at) {
              counts.withdrawn++;
            }
          });

          // Enrich future events with confirmation counts and days until event
          const now = new Date();
          for (const event of futureEvents) {
            const counts = confirmationCountMap.get(event.eid) || { confirmed: 0, withdrawn: 0, last_confirmed_at: null };
            event.confirmed_artists_count = counts.confirmed;
            event.withdrawn_artists_count = counts.withdrawn;

            // Calculate days until event (from now for general use)
            if (event.event_start_datetime) {
              const startDate = new Date(event.event_start_datetime);
              const daysUntil = Math.ceil((startDate.getTime() - now.getTime()) / 1000 / 60 / 60 / 24);
              event.days_until_event = daysUntil;

              // For success message: calculate days between last confirmation and event
              // Fallback to days_until_event if no confirmation timestamp available
              if (counts.last_confirmed_at) {
                const daysFromConfirmation = Math.ceil((startDate.getTime() - counts.last_confirmed_at.getTime()) / 1000 / 60 / 60 / 24);
                event.days_from_last_confirmation_to_event = daysFromConfirmation;
              } else {
                event.days_from_last_confirmation_to_event = daysUntil;
              }
            }
          }

          debugInfo.future_events_enriched = futureEvents.length;
          debugInfo.confirmation_rows = confirmationData.length;
        } else if (confirmationError) {
          debugInfo.confirmation_query_error = confirmationError.message;
        }

        // Get event_artists counts for events within 7 days (separate check)
        const eventsWithin7Days = futureEvents.filter(e => {
          if (!e.event_start_datetime) return false;
          const startDate = new Date(e.event_start_datetime);
          const now = new Date();
          const daysUntil = (startDate.getTime() - now.getTime()) / 1000 / 60 / 60 / 24;
          return daysUntil <= 7;
        });

        if (eventsWithin7Days.length > 0) {
          const eventIdsWithin7Days = eventsWithin7Days.map(e => e.id);
          const { data: eventArtistData, error: eventArtistError } = await supabaseClient
            .from('event_artists')
            .select('event_id, status')
            .in('event_id', eventIdsWithin7Days);

          if (!eventArtistError && eventArtistData) {
            const eventArtistMap = new Map();
            eventArtistData.forEach((ea: any) => {
              if (!eventArtistMap.has(ea.event_id)) {
                eventArtistMap.set(ea.event_id, { confirmed: 0, invited: 0 });
              }
              const counts = eventArtistMap.get(ea.event_id);
              if (ea.status === 'confirmed') counts.confirmed++;
              if (ea.status === 'invited') counts.invited++;
            });

            for (const event of eventsWithin7Days) {
              const counts = eventArtistMap.get(event.id) || { confirmed: 0, invited: 0 };
              event.event_artists_confirmed_count = counts.confirmed;
              event.event_artists_invited_count = counts.invited;
            }

            debugInfo.event_artists_enriched = eventsWithin7Days.length;
            debugInfo.event_artists_rows = eventArtistData.length;
          } else if (eventArtistError) {
            debugInfo.event_artist_query_error = eventArtistError.message;
          }
        }
      } catch (artistFetchError: any) {
        debugInfo.artist_fetch_error = artistFetchError.message;
      }
    }

    // Run linter on events
    let findings: any[] = [];

    // Generate overview/dashboard findings from aggregate metrics (NON-STREAMING MODE)
    // Only generate when not filtering by specific event
    if (!filterEid) {
      try {
        const { data: overviewMetrics, error: overviewError } = await supabaseClient
          .rpc('get_all_overview_metrics');

        if (!overviewError && overviewMetrics) {
          for (const metric of overviewMetrics) {
            const rule = rules.find((r: any) => r.id === metric.rule_id);
            if (rule && rule.context === 'dashboard') {
              // Interpolate metrics into message with format support
              let message = rule.message;
              const metrics = metric.metrics;

              // Replace variables with format specifiers (e.g., {change:+;-})
              message = message.replace(/\{([^}:]+)(?::([^}]+))?\}/g, (match, key, format) => {
                if (!(key in metrics)) return match;
                const value = metrics[key];

                // Handle format specifiers
                if (format === '+;-' && typeof value === 'number') {
                  // Show sign for positive numbers
                  return value > 0 ? `+${value}` : String(value);
                }

                return String(value);
              });

              findings.push({
                ruleId: rule.id,
                ruleName: rule.name,
                severity: 'overview',
                category: rule.category,
                context: rule.context,
                emoji: '📊',
                message: message,
                eventId: null,
                eventEid: '',
                eventName: 'DASH',
                timestamp: new Date().toISOString(),
                metrics: metrics  // Include full metrics with weekly_data for graphing
              });
            }
          }
        }
      } catch (error) {
        console.error('Error generating overview metrics (non-streaming):', error);
      }
    }

    for (const event of eventsToLint) {
      // Check EID format (special validation)
      if (event.eid && !/^AB\d{3,4}$/.test(event.eid)) {
        const eidRule = rules.find((r: any) => r.id === 'invalid_eid_format');
        if (eidRule) {
          incrementRuleHit(supabaseClient, 'invalid_eid_format');
          findings.push({
            ruleId: 'invalid_eid_format',
            ruleName: eidRule.name,
            severity: 'error',
            category: 'data_completeness',
            context: 'always',
            emoji: '❌',
            message: `Event ${event.eid} has invalid format - must be AB### or AB#### (e.g., AB123 or AB3049)`,
            eventId: event.id,
            eventEid: event.eid,
            eventName: event.name,
            timestamp: new Date().toISOString()
          });
        }
      }

      for (const rule of rules) {
        // Skip rules with no conditions - these are handled separately (e.g., artist_payment_overdue, invalid_eid_format)
        if (!rule.conditions || rule.conditions.length === 0) {
          continue;
        }

        // Skip live-event-stats rules - these are handled separately with special data fetching
        if (rule.category === 'live-event-stats') {
          continue;
        }

        const finding = evaluateRule(rule, event, {}, supabaseClient);
        if (finding) {
          // Special handling: advertising_budget_not_set_info - escalate severity based on days until event
          if (finding.ruleId === 'advertising_budget_not_set_info' && event.days_until_event !== undefined) {
            if (event.days_until_event <= 7) {
              finding.severity = 'error';
              finding.emoji = '❌';
            } else if (event.days_until_event <= 20) {
              finding.severity = 'warning';
              finding.emoji = '⚠️';
            }
            // Otherwise stays as 'info'
          }
          findings.push(finding);
        }
      }
    }

    // Run timing-based checks for live/recent events
    const timingRules = rules.filter((r: any) => r.category === 'live_event_timing');
    if (timingRules.length > 0) {
      // Get events within 48 hours (active or recently ended)
      const now = new Date();
      const activeEvents = eventsToLint.filter(e => {
        if (!e.event_start_datetime) return false;
        const eventStart = new Date(e.event_start_datetime);
        const hoursSinceStart = (now.getTime() - eventStart.getTime()) / 1000 / 60 / 60;
        return hoursSinceStart >= -2 && hoursSinceStart <= 48;
      });

      if (activeEvents.length > 0) {
        const eventIds = activeEvents.map(e => e.id);

        // Fetch round data
        const { data: roundsData } = await supabaseClient
          .from('rounds')
          .select('event_id, round_number, closing_time')
          .in('event_id', eventIds)
          .order('event_id', { ascending: true })
          .order('round_number', { ascending: true });

        // Fetch photo counts by round
        const { data: photoData } = await supabaseClient
          .from('art_media')
          .select('art_id, created_at')
          .in('art_id',
            await supabaseClient
              .from('art')
              .select('id')
              .in('event_id', eventIds)
              .then(res => res.data?.map((a: any) => a.id) || [])
          );

        // Build round map
        const roundMap = new Map();
        roundsData?.forEach((r: any) => {
          if (!roundMap.has(r.event_id)) {
            roundMap.set(r.event_id, {});
          }
          roundMap.get(r.event_id)[`round${r.round_number}`] = r.closing_time;
        });

        // Evaluate timing rules
        for (const event of activeEvents) {
          const rounds = roundMap.get(event.id) || {};
          const eventStart = new Date(event.event_start_datetime);

          // Round 1 start time check
          if (rounds.round1) {
            const r1Close = new Date(rounds.round1);
            const gapMinutes = (r1Close.getTime() - eventStart.getTime()) / 1000 / 60;

            if (gapMinutes > 90) {
              const rule = timingRules.find(r => r.id === 'round1_start_time_high');
              if (rule) {
                incrementRuleHit(supabaseClient, 'round1_start_time_high');
                findings.push({
                  ruleId: 'round1_start_time_high',
                  ruleName: rule.name,
                  severity: 'warning',
                  category: 'live_event_timing',
                  context: 'during_event',
                  emoji: '⚠️',
                  message: `Event start to Round 1 close time is high (${Math.round(gapMinutes)} min) - typical is ~77 min`,
                  eventId: event.id,
                  eventEid: event.eid,
                  eventName: event.name,
                  timestamp: new Date().toISOString()
                });
              }
            }
          }

          // Round 1 to Round 2 gap check
          if (rounds.round1 && rounds.round2) {
            const r1Close = new Date(rounds.round1);
            const r2Close = new Date(rounds.round2);
            const gapMinutes = (r2Close.getTime() - r1Close.getTime()) / 1000 / 60;

            if (gapMinutes > 50) {
              const rule = timingRules.find(r => r.id === 'round1_to_round2_gap_high');
              if (rule) {
                incrementRuleHit(supabaseClient, 'round1_to_round2_gap_high');
                findings.push({
                  ruleId: 'round1_to_round2_gap_high',
                  ruleName: rule.name,
                  severity: 'warning',
                  category: 'live_event_timing',
                  context: 'during_event',
                  emoji: '⚠️',
                  message: `Round 1 to Round 2 gap is high (${Math.round(gapMinutes)} min) - typical is ~40 min`,
                  eventId: event.id,
                  eventEid: event.eid,
                  eventName: event.name,
                  timestamp: new Date().toISOString()
                });
              }
            }
          }

          // Round 2 to Round 3 gap check
          if (rounds.round2 && rounds.round3) {
            const r2Close = new Date(rounds.round2);
            const r3Close = new Date(rounds.round3);
            const gapMinutes = (r3Close.getTime() - r2Close.getTime()) / 1000 / 60;

            if (gapMinutes > 60) {
              const rule = timingRules.find(r => r.id === 'round2_to_round3_gap_high');
              if (rule) {
                incrementRuleHit(supabaseClient, 'round2_to_round3_gap_high');
                findings.push({
                  ruleId: 'round2_to_round3_gap_high',
                  ruleName: rule.name,
                  severity: 'warning',
                  category: 'live_event_timing',
                  context: 'during_event',
                  emoji: '⚠️',
                  message: `Round 2 to Round 3 gap is high (${Math.round(gapMinutes)} min) - typical is ~48 min`,
                  eventId: event.id,
                  eventEid: event.eid,
                  eventName: event.name,
                  timestamp: new Date().toISOString()
                });
              }
            }
          }

          // No photos for Round 1 check (if round 1 has closed)
          if (rounds.round1) {
            const r1Close = new Date(rounds.round1);
            if (r1Close < now) {
              // Check if there are photos for this event's round 1 art
              const { data: round1Art } = await supabaseClient
                .from('art')
                .select('id')
                .eq('event_id', event.id)
                .eq('round', 1);

              if (round1Art && round1Art.length > 0) {
                const round1ArtIds = round1Art.map(a => a.id);
                const { data: round1Photos } = await supabaseClient
                  .from('art_media')
                  .select('id')
                  .in('art_id', round1ArtIds)
                  .limit(1);

                if (!round1Photos || round1Photos.length === 0) {
                  const rule = timingRules.find(r => r.id === 'no_photos_round1');
                  if (rule) {
                    incrementRuleHit(supabaseClient, 'no_photos_round1');
                    findings.push({
                      ruleId: 'no_photos_round1',
                      ruleName: rule.name,
                      severity: 'warning',
                      category: 'live_event_timing',
                      context: 'during_event',
                      emoji: '⚠️',
                      message: 'No photos uploaded for Round 1!',
                      eventId: event.id,
                      eventEid: event.eid,
                      eventName: event.name,
                      timestamp: new Date().toISOString()
                    });
                  }
                }
              }
            }
          }
        }
      }
    }

    // Run global/artist-level checks (Rule #14 and similar)
    // These are not event-specific
    const artistRules = rules.filter((r: any) => r.id === 'artist_payment_overdue');
    if (artistRules.length > 0 && !filterEid && !futureOnly && !activeOnly) {
      // Only run artist-level checks when not filtering by event/time
      try {
        const { data: overdueArtists, error: artistError } = await supabaseClient
          .rpc('get_overdue_artist_payments', { days_threshold: 14 });

        if (!artistError && overdueArtists) {
          for (const artist of overdueArtists) {
            findings.push({
              ruleId: 'artist_payment_overdue',
              ruleName: 'Artist Payment Overdue',
              severity: 'error',
              category: 'data_completeness',
              context: 'post_event',
              emoji: '❌',
              message: `💸 ${artist.artist_name} owed ${artist.currency} $${artist.balance_owed.toFixed(2)} for ${artist.days_overdue} days - process payment urgently`,
              eventId: null,
              eventEid: null,
              eventName: null,
              artistId: artist.artist_id,
              artistNumber: artist.artist_entry_id,
              artistName: artist.artist_name,
              artistEmail: artist.artist_email,
              balanceOwed: artist.balance_owed,
              currency: artist.currency,
              daysOverdue: artist.days_overdue,
              paymentAccountStatus: artist.payment_account_status,
              timestamp: new Date().toISOString()
            });
          }
          debugInfo.artist_payments_checked = overdueArtists.length;
        }
      } catch (artistCheckError: any) {
        debugInfo.artist_check_error = artistCheckError.message;
      }
    }

    // Run city-level checks
    const cityRules = rules.filter((r: any) => r.category === 'booking_opportunity');
    if (cityRules.length > 0 && !filterEid && !futureOnly && !activeOnly) {
      // Only run city-level checks when not filtering by event/time
      try {
        const now = new Date();

        // Get ALL unique cities that have events (not limited by 45-day filter)
        // City-level booking opportunity checks should look at all historical data
        const { data: citiesData } = await supabaseClient
          .from('cities')
          .select(`
            id,
            name,
            countries(code)
          `)
          .in('id',
            await supabaseClient
              .from('events')
              .select('city_id')
              .not('city_id', 'is', null)
              .then(res => {
                const cityIds = [...new Set(res.data?.map((e: any) => e.city_id) || [])];
                return cityIds.length > 0 ? cityIds : ['00000000-0000-0000-0000-000000000000']; // Fallback to prevent empty query
              })
          );

        const uniqueCities = (citiesData || []).map((c: any) => ({
          city_id: c.id,
          city_name: c.name,
          country_code: c.countries?.code
        }));

        if (uniqueCities.length > 0) {

          // Get last 2 events for each city with vote counts
          for (const city of uniqueCities) {
            // Get last 2 completed events for this city
            const { data: recentEvents } = await supabaseClient
              .from('events')
              .select('id, eid, name, event_end_datetime')
              .eq('city_id', city.city_id)
              .not('event_end_datetime', 'is', null)
              .lt('event_end_datetime', now.toISOString())
              .order('event_end_datetime', { ascending: false })
              .limit(2);

            if (recentEvents && recentEvents.length > 0) {
              const eventIds = recentEvents.map(e => e.id);

              // Get vote counts for these events
              const { data: voteData } = await supabaseClient
                .from('votes')
                .select('event_id, id')
                .in('event_id', eventIds);

              const voteCountMap = new Map();
              voteData?.forEach((vote: any) => {
                voteCountMap.set(vote.event_id, (voteCountMap.get(vote.event_id) || 0) + 1);
              });

              // Check if any of the last 2 events had 200+ votes
              const hasGoodEvent = recentEvents.some(e => (voteCountMap.get(e.id) || 0) >= 200);

              if (hasGoodEvent) {
                // Check if city has any future events
                const { data: futureEvents } = await supabaseClient
                  .from('events')
                  .select('id')
                  .eq('city_id', city.city_id)
                  .gt('event_start_datetime', now.toISOString())
                  .limit(1);

                const hasFutureEvent = futureEvents && futureEvents.length > 0;

                if (!hasFutureEvent) {
                  // Fire the rule!
                  const rule = cityRules.find(r => r.id === 'city_good_event_no_booking');
                  if (rule) {
                    incrementRuleHit(supabaseClient, 'city_good_event_no_booking');

                    const goodEvents = recentEvents
                      .filter(e => (voteCountMap.get(e.id) || 0) >= 200)
                      .map(e => `${e.eid} (${voteCountMap.get(e.id)} votes)`)
                      .join(', ');

                    findings.push({
                      ruleId: 'city_good_event_no_booking',
                      ruleName: rule.name,
                      severity: 'warning',
                      category: rule.category,
                      context: 'always',
                      emoji: '⚠️',
                      message: `${city.city_name} had strong events recently (${goodEvents}) but no future event is booked`,
                      eventId: null,
                      eventEid: null,
                      eventName: null,
                      cityId: city.city_id,
                      cityName: city.city_name,
                      countryCode: city.country_code,
                      goodEvents: goodEvents,
                      timestamp: new Date().toISOString()
                    });
                  }
                }
              }
            }

            // Check for very strong historical performance (400+ votes in ANY past event)
            // Get ALL past events for this city
            const { data: allPastEvents } = await supabaseClient
              .from('events')
              .select('id, eid, name, event_end_datetime')
              .eq('city_id', city.city_id)
              .not('event_end_datetime', 'is', null)
              .lt('event_end_datetime', now.toISOString())
              .order('event_end_datetime', { ascending: false });

            if (allPastEvents && allPastEvents.length > 0) {
              const allEventIds = allPastEvents.map(e => e.id);

              // Get vote counts for all past events
              const { data: allVoteData } = await supabaseClient
                .from('votes')
                .select('event_id, id')
                .in('event_id', allEventIds);

              const allVoteCountMap = new Map();
              allVoteData?.forEach((vote: any) => {
                allVoteCountMap.set(vote.event_id, (allVoteCountMap.get(vote.event_id) || 0) + 1);
              });

              // Check if any event had 400+ votes
              const hasVeryStrongEvent = allPastEvents.some(e => (allVoteCountMap.get(e.id) || 0) >= 400);

              if (hasVeryStrongEvent) {
                // Check if city has any future events
                const { data: futureEvents } = await supabaseClient
                  .from('events')
                  .select('id')
                  .eq('city_id', city.city_id)
                  .gt('event_start_datetime', now.toISOString())
                  .limit(1);

                const hasFutureEvent = futureEvents && futureEvents.length > 0;

                if (!hasFutureEvent) {
                  // Fire the very strong rule!
                  const rule = cityRules.find(r => r.id === 'city_very_strong_event_no_booking');
                  if (rule) {
                    incrementRuleHit(supabaseClient, 'city_very_strong_event_no_booking');

                    const veryStrongEvents = allPastEvents
                      .filter(e => (allVoteCountMap.get(e.id) || 0) >= 400)
                      .map(e => `${e.eid} (${allVoteCountMap.get(e.id)} votes)`)
                      .join(', ');

                    findings.push({
                      ruleId: 'city_very_strong_event_no_booking',
                      ruleName: rule.name,
                      severity: 'warning',
                      category: rule.category,
                      context: 'always',
                      emoji: '⚠️',
                      message: `${city.city_name} had very strong events historically (${veryStrongEvents}) but no future event is booked`,
                      eventId: null,
                      eventEid: null,
                      eventName: null,
                      cityId: city.city_id,
                      cityName: city.city_name,
                      countryCode: city.country_code,
                      veryStrongEvents: veryStrongEvents,
                      timestamp: new Date().toISOString()
                    });
                  }
                }
              }
            }
          }

          debugInfo.cities_checked = uniqueCities.length;
        }
      } catch (cityCheckError: any) {
        debugInfo.city_check_error = cityCheckError.message;
      }
    }

    // Run event admin checks
    const adminRules = rules.filter((r: any) => r.id.startsWith('event_admins_'));
    if (adminRules.length > 0 && eventsToLint.length > 0) {
      try {
        const eventIds = eventsToLint.map(e => e.id);

        // Fetch admin counts for all events
        const { data: adminData, error: adminError } = await supabaseClient
          .from('event_admins')
          .select('event_id, admin_level')
          .in('event_id', eventIds);

        if (!adminError && adminData) {
          // Build admin count map
          const adminCounts = new Map();
          adminData.forEach((admin: any) => {
            if (!adminCounts.has(admin.event_id)) {
              adminCounts.set(admin.event_id, {
                total: 0,
                super: 0,
                producer: 0,
                photo: 0,
                voting: 0
              });
            }
            const counts = adminCounts.get(admin.event_id);
            counts.total++;
            if (admin.admin_level === 'super') counts.super++;
            else if (admin.admin_level === 'producer') counts.producer++;
            else if (admin.admin_level === 'photo') counts.photo++;
            else if (admin.admin_level === 'voting') counts.voting++;
          });

          // Generate findings for each event
          for (const event of eventsToLint) {
            const counts = adminCounts.get(event.id) || { total: 0, super: 0, producer: 0, photo: 0, voting: 0 };

            let rule = null;
            let severity = '';

            if (counts.total <= 1) {
              // Critical admin rule only fires within 7 days of event
              const now = new Date();
              if (event.event_start_datetime) {
                const eventStart = new Date(event.event_start_datetime);
                const daysDiff = Math.abs((eventStart.getTime() - now.getTime()) / 1000 / 60 / 60 / 24);
                if (daysDiff <= 7) {
                  rule = adminRules.find(r => r.id === 'event_admins_critical');
                  severity = 'error';
                }
              }
            } else if (counts.total === 2) {
              rule = adminRules.find(r => r.id === 'event_admins_warning');
              severity = 'warning';
            } else {
              // Info admin rule only fires until 1 day after event
              const now = new Date();
              if (event.event_end_datetime) {
                const eventEnd = new Date(event.event_end_datetime);
                const daysSinceEnd = (now.getTime() - eventEnd.getTime()) / 1000 / 60 / 60 / 24;
                if (daysSinceEnd <= 1) {
                  rule = adminRules.find(r => r.id === 'event_admins_info');
                  severity = 'info';
                }
              } else {
                // No end date, fire the rule
                rule = adminRules.find(r => r.id === 'event_admins_info');
                severity = 'info';
              }
            }

            if (rule) {
              incrementRuleHit(supabaseClient, rule.id);

              const message = rule.message
                .replace('{total_admins}', counts.total.toString())
                .replace('{super_count}', counts.super.toString())
                .replace('{producer_count}', counts.producer.toString())
                .replace('{photo_count}', counts.photo.toString())
                .replace('{voting_count}', counts.voting.toString());

              const severityEmoji: any = {
                error: '❌',
                warning: '⚠️',
                reminder: '🔔',
                info: '📊',
                success: '✅'
              };

              findings.push({
                ruleId: rule.id,
                ruleName: rule.name,
                severity: severity,
                category: rule.category,
                context: rule.context,
                emoji: severityEmoji[severity],
                message: message,
                eventId: event.id,
                eventEid: event.eid,
                eventName: event.name,
                adminCounts: counts,
                timestamp: new Date().toISOString()
              });
            }
          }

          debugInfo.event_admins_checked = eventsToLint.length;
        }
      } catch (adminCheckError: any) {
        debugInfo.admin_check_error = adminCheckError.message;
      }
    }

    // Run smart photo reminder check (only fire if photos are actually missing)
    const photoReminderRule = rules.find((r: any) => r.id === 'reminder_upload_photos_smart');
    if (photoReminderRule) {
      try {
        const now = new Date();
        const activeEvents = eventsToLint.filter(e => {
          if (!e.event_start_datetime || !e.event_end_datetime) return false;
          const eventStart = new Date(e.event_start_datetime);
          const eventEnd = new Date(e.event_end_datetime);
          const minutesSinceStart = (now.getTime() - eventStart.getTime()) / 1000 / 60;
          const hoursUntilEnd = (eventEnd.getTime() - now.getTime()) / 1000 / 60 / 60;
          return minutesSinceStart >= 30 && hoursUntilEnd > 0 && hoursUntilEnd <= 12;
        });

        if (activeEvents.length > 0) {
          const eventIds = activeEvents.map(e => e.id);

          // Fetch art and photo counts by round
          const { data: photoData } = await supabaseClient
            .from('art')
            .select('event_id, round, art_media!inner(id)')
            .in('event_id', eventIds);

          // Build photo count map
          const photoCountMap = new Map();
          photoData?.forEach((art: any) => {
            const key = `${art.event_id}_${art.round}`;
            photoCountMap.set(key, (photoCountMap.get(key) || 0) + 1);
          });

          // Check each active event
          for (const event of activeEvents) {
            // Determine which round to check (prioritize current round, or round 1 if early)
            const minutesSinceStart = (now.getTime() - new Date(event.event_start_datetime).getTime()) / 1000 / 60;
            let roundToCheck = 1;
            if (minutesSinceStart > 90) roundToCheck = 2; // Likely in round 2 if 90+ min
            if (minutesSinceStart > 150) roundToCheck = 3; // Likely in round 3 if 150+ min

            const key = `${event.id}_${roundToCheck}`;
            const photoCount = photoCountMap.get(key) || 0;

            // Only fire reminder if fewer than 5 photos
            if (photoCount < 5) {
              incrementRuleHit(supabaseClient, 'reminder_upload_photos_smart');

              const message = photoReminderRule.message
                .replace('{round_number}', roundToCheck.toString());

              findings.push({
                ruleId: 'reminder_upload_photos_smart',
                ruleName: photoReminderRule.name,
                severity: 'reminder',
                category: photoReminderRule.category,
                context: photoReminderRule.context,
                emoji: '🔔',
                message: message,
                eventId: event.id,
                eventEid: event.eid,
                eventName: event.name,
                roundChecked: roundToCheck,
                photoCount: photoCount,
                timestamp: new Date().toISOString()
              });
            }
          }

          debugInfo.photo_reminder_checked = activeEvents.length;
        }
      } catch (photoCheckError: any) {
        debugInfo.photo_check_error = photoCheckError.message;
      }
    }

    // Run live event statistics check (QR scans, votes, photos)
    const liveEventStatsRules = rules.filter((r: any) => r.category === 'live-event-stats');
    if (liveEventStatsRules.length > 0 && eventsToLint.length > 0) {
      try {
        const now = new Date();
        const activeEvents = eventsToLint.filter(e => {
          if (!e.event_start_datetime || !e.event_end_datetime) return false;
          const eventStart = new Date(e.event_start_datetime);
          const eventEnd = new Date(e.event_end_datetime);
          const minutesSinceStart = (now.getTime() - eventStart.getTime()) / 1000 / 60;
          const hoursUntilEnd = (eventEnd.getTime() - now.getTime()) / 1000 / 60 / 60;
          return minutesSinceStart >= 30 && hoursUntilEnd > 0 && hoursUntilEnd <= 12;
        });

        if (activeEvents.length > 0) {
          const eventIds = activeEvents.map(e => e.id);

          // Fetch QR scan counts
          const { data: qrData } = await supabaseClient
            .from('people_qr_scans')
            .select('event_id, id')
            .in('event_id', eventIds);

          const qrCountMap = new Map();
          qrData?.forEach((scan: any) => {
            qrCountMap.set(scan.event_id, (qrCountMap.get(scan.event_id) || 0) + 1);
          });

          // Fetch vote counts
          const { data: voteData } = await supabaseClient
            .from('votes')
            .select('event_id, id')
            .in('event_id', eventIds);

          const voteCountMap = new Map();
          voteData?.forEach((vote: any) => {
            voteCountMap.set(vote.event_id, (voteCountMap.get(vote.event_id) || 0) + 1);
          });

          // Fetch photo counts by round
          const { data: photoData } = await supabaseClient
            .from('art')
            .select('event_id, round, art_media!inner(id)')
            .in('event_id', eventIds);

          const photosByEventMap = new Map();
          photoData?.forEach((art: any) => {
            if (!photosByEventMap.has(art.event_id)) {
              photosByEventMap.set(art.event_id, { 1: 0, 2: 0, 3: 0 });
            }
            const rounds = photosByEventMap.get(art.event_id);
            rounds[art.round] = (rounds[art.round] || 0) + 1;
          });

          // Generate findings for each active event
          for (const event of activeEvents) {
            const qrScanRule = liveEventStatsRules.find((r: any) => r.id === 'live_event_qr_scans_info');
            if (qrScanRule) {
              const qrCount = qrCountMap.get(event.id) || 0;
              incrementRuleHit(supabaseClient, 'live_event_qr_scans_info');

              findings.push({
                ruleId: 'live_event_qr_scans_info',
                ruleName: qrScanRule.name,
                severity: 'info',
                category: qrScanRule.category,
                context: qrScanRule.context,
                emoji: '📊',
                message: qrScanRule.message.replace('{qr_scan_count}', qrCount.toString()),
                eventId: event.id,
                eventEid: event.eid,
                eventName: event.name,
                qrScanCount: qrCount,
                timestamp: new Date().toISOString()
              });
            }

            const voteRule = liveEventStatsRules.find((r: any) => r.id === 'live_event_votes_info');
            if (voteRule) {
              const voteCount = voteCountMap.get(event.id) || 0;
              incrementRuleHit(supabaseClient, 'live_event_votes_info');

              findings.push({
                ruleId: 'live_event_votes_info',
                ruleName: voteRule.name,
                severity: 'info',
                category: voteRule.category,
                context: voteRule.context,
                emoji: '📊',
                message: voteRule.message.replace('{vote_count}', voteCount.toString()),
                eventId: event.id,
                eventEid: event.eid,
                eventName: event.name,
                voteCount: voteCount,
                timestamp: new Date().toISOString()
              });
            }

            const photoRule = liveEventStatsRules.find((r: any) => r.id === 'live_event_photos_info');
            if (photoRule) {
              const photosByRound = photosByEventMap.get(event.id) || { 1: 0, 2: 0, 3: 0 };
              const photosText = `R1: ${photosByRound[1]}, R2: ${photosByRound[2]}, R3: ${photosByRound[3]}`;
              incrementRuleHit(supabaseClient, 'live_event_photos_info');

              findings.push({
                ruleId: 'live_event_photos_info',
                ruleName: photoRule.name,
                severity: 'info',
                category: photoRule.category,
                context: photoRule.context,
                emoji: '📊',
                message: photoRule.message.replace('{photos_by_round}', photosText),
                eventId: event.id,
                eventEid: event.eid,
                eventName: event.name,
                photosByRound: photosByRound,
                timestamp: new Date().toISOString()
              });
            }
          }

          debugInfo.live_event_stats_checked = activeEvents.length;
        }
      } catch (statsError: any) {
        debugInfo.live_event_stats_error = statsError.message;
      }
    }

    // Run unpaid paintings check (check for artworks with winning bids but no payment and no reminder sent)
    const unpaidPaintingsRule = rules.find((r: any) => r.id === 'unpaid_paintings_no_reminder');
    if (unpaidPaintingsRule && eventsToLint.length > 0) {
      try {
        const now = new Date();
        // Check events that have ended (even 1 minute after)
        const postEvents = eventsToLint.filter(e => {
          if (!e.event_end_datetime) return false;
          const eventEnd = new Date(e.event_end_datetime);
          const daysSinceEnd = (now.getTime() - eventEnd.getTime()) / 1000 / 60 / 60 / 24;
          return daysSinceEnd > 0 && daysSinceEnd <= 30;
        });

        if (postEvents.length > 0) {
          const eventIds = postEvents.map(e => e.id);

          // Get all artworks with bids for these events
          const { data: artData } = await supabaseClient
            .from('art')
            .select('id, event_id, art_code')
            .in('event_id', eventIds);

          if (artData && artData.length > 0) {
            const artIds = artData.map(a => a.id);

            // Get all bids to determine winning bids
            const { data: bidsData } = await supabaseClient
              .from('bids')
              .select('art_id, amount')
              .in('art_id', artIds);

            // Build winning bid map
            const winningBidMap = new Map();
            bidsData?.forEach((bid: any) => {
              const current = winningBidMap.get(bid.art_id) || 0;
              winningBidMap.set(bid.art_id, Math.max(current, bid.amount));
            });

            // Get payment records (Stripe)
            const { data: paymentsData } = await supabaseClient
              .from('payment_processing')
              .select('art_id')
              .in('art_id', artIds)
              .eq('status', 'completed');

            const paidArtIds = new Set(paymentsData?.map((p: any) => p.art_id) || []);

            // Get manual payment records
            const { data: manualPaymentsData } = await supabaseClient
              .from('payment_logs')
              .select('art_id')
              .in('art_id', artIds)
              .eq('payment_type', 'admin_marked');

            manualPaymentsData?.forEach((p: any) => {
              paidArtIds.add(p.art_id);
            });

            // Get payment reminder records
            const { data: remindersData } = await supabaseClient
              .from('payment_reminders')
              .select('art_id')
              .in('art_id', artIds);

            const artIdsWithReminders = new Set(remindersData?.map((r: any) => r.art_id) || []);

            // Check each event
            for (const event of postEvents) {
              const eventArtworks = artData.filter(a => a.event_id === event.id);

              // Find unpaid artworks with winning bids and no reminders
              const unpaidNoReminderArtworks = eventArtworks.filter(art => {
                const hasWinningBid = winningBidMap.has(art.id) && winningBidMap.get(art.id) > 0;
                const isPaid = paidArtIds.has(art.id);
                const hasReminder = artIdsWithReminders.has(art.id);

                return hasWinningBid && !isPaid && !hasReminder;
              });

              if (unpaidNoReminderArtworks.length > 0) {
                incrementRuleHit(supabaseClient, 'unpaid_paintings_no_reminder');

                const artCodes = unpaidNoReminderArtworks.map(a => a.art_code).join(', ');
                const message = unpaidPaintingsRule.message
                  .replace('{unpaid_count}', unpaidNoReminderArtworks.length.toString())
                  + ` (${artCodes})`;

                findings.push({
                  ruleId: 'unpaid_paintings_no_reminder',
                  ruleName: unpaidPaintingsRule.name,
                  severity: 'warning',
                  category: unpaidPaintingsRule.category,
                  context: unpaidPaintingsRule.context,
                  emoji: '⚠️',
                  message: message,
                  eventId: event.id,
                  eventEid: event.eid,
                  eventName: event.name,
                  unpaidCount: unpaidNoReminderArtworks.length,
                  unpaidArtworks: unpaidNoReminderArtworks.map(a => a.art_code),
                  timestamp: new Date().toISOString()
                });
              }
            }

            debugInfo.unpaid_paintings_checked = postEvents.length;
          }
        }
      } catch (unpaidError: any) {
        debugInfo.unpaid_paintings_error = unpaidError.message;
      }
    }

    // Run Meta Ads budget checks
    try {
      const now = new Date();

      // Find events with meta_ads_budget set
      const eventsWithMetaBudget = eventsToLint.filter(e => {
        if (!e.event_start_datetime || !e.meta_ads_budget || e.meta_ads_budget <= 0) return false;
        const eventStart = new Date(e.event_start_datetime);
        const daysUntilEvent = (eventStart.getTime() - now.getTime()) / 1000 / 60 / 60 / 24;
        const daysSinceEvent = (now.getTime() - eventStart.getTime()) / 1000 / 60 / 60 / 24;

        // Include events within 45 days before or 7 days after start
        return (daysUntilEvent > 0 && daysUntilEvent <= 45) || (daysSinceEvent >= 0 && daysSinceEvent <= 7);
      });

      if (eventsWithMetaBudget.length > 0) {
        // Fetch Meta ads cache data (6-hour cache)
        const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString();
        const eventEids = eventsWithMetaBudget.map(e => e.eid);

        const { data: cachedData } = await supabaseClient
          .from('ai_analysis_cache')
          .select('event_id, result, created_at')
          .eq('analysis_type', 'meta_ads')
          .in('event_id', eventEids)
          .gte('created_at', sixHoursAgo);

        const metaDataMap = new Map();
        cachedData?.forEach((cache: any) => {
          metaDataMap.set(cache.event_id, cache.result);
        });

        debugInfo.meta_ads_events_checked = eventsWithMetaBudget.length;
        debugInfo.meta_ads_cache_hits = cachedData?.length || 0;

        // Check each event against Meta Ads rules
        for (const event of eventsWithMetaBudget) {
          const metaData = metaDataMap.get(event.eid);
          const systemBudget = Number(event.meta_ads_budget);
          const currency = event.currency || 'USD';
          const eventStart = new Date(event.event_start_datetime);
          const daysUntilEvent = (eventStart.getTime() - now.getTime()) / 1000 / 60 / 60 / 24;

          // RULE 1: meta_ads_budget_no_campaigns
          // Warn if budget is set but Meta API shows no active campaigns
          const noCampaignsRule = rules.find((r: any) => r.id === 'meta_ads_budget_no_campaigns');
          if (noCampaignsRule && metaData) {
            const hasCampaigns = metaData.campaigns && metaData.campaigns.length > 0;

            if (!hasCampaigns) {
              incrementRuleHit(supabaseClient, 'meta_ads_budget_no_campaigns');

              findings.push({
                ruleId: 'meta_ads_budget_no_campaigns',
                ruleName: noCampaignsRule.name,
                severity: 'warning',
                category: noCampaignsRule.category,
                context: noCampaignsRule.context,
                emoji: '⚠️',
                message: `Meta ads budget of $${systemBudget} ${currency} set but no active campaigns found in Meta API`,
                eventId: event.id,
                eventEid: event.eid,
                eventName: event.name,
                metaAdsBudget: systemBudget,
                currency: currency,
                timestamp: new Date().toISOString()
              });
            }
          }

          // RULE 2: meta_ads_budget_mismatch
          // Compare Meta's allocated budget vs our system budget
          const budgetMismatchRule = rules.find((r: any) => r.id === 'meta_ads_budget_mismatch');
          if (budgetMismatchRule && metaData && metaData.total_budget) {
            const metaBudget = Number(metaData.total_budget);
            const difference = Math.abs(metaBudget - systemBudget);
            const percentDiff = (difference / systemBudget) * 100;

            // Warn if budgets differ by more than 10%
            if (percentDiff > 10) {
              incrementRuleHit(supabaseClient, 'meta_ads_budget_mismatch');

              const severity = percentDiff > 25 ? 'error' : 'warning';
              const emoji = percentDiff > 25 ? '🚨' : '⚠️';

              findings.push({
                ruleId: 'meta_ads_budget_mismatch',
                ruleName: budgetMismatchRule.name,
                severity: severity,
                category: budgetMismatchRule.category,
                context: budgetMismatchRule.context,
                emoji: emoji,
                message: `Meta ads budget mismatch: System shows $${systemBudget} ${currency} but Meta API shows $${metaBudget.toFixed(2)} ${currency} (${percentDiff.toFixed(1)}% difference)`,
                eventId: event.id,
                eventEid: event.eid,
                eventName: event.name,
                systemBudget: systemBudget,
                metaBudget: metaBudget,
                difference: difference,
                percentDifference: percentDiff,
                currency: currency,
                timestamp: new Date().toISOString()
              });
            }
          }

          // RULE 3: meta_ads_budget_pacing
          // Check if spend is on track for 21-day even distribution
          const budgetPacingRule = rules.find((r: any) => r.id === 'meta_ads_budget_pacing');
          if (budgetPacingRule && metaData && metaData.total_spend !== undefined && daysUntilEvent > 0 && daysUntilEvent <= 21) {
            const totalSpend = Number(metaData.total_spend);
            const targetBudget = metaData.total_budget || systemBudget;

            // Calculate expected spend based on 21-day schedule
            const totalCampaignDays = 21;
            const daysElapsed = totalCampaignDays - daysUntilEvent;
            const expectedSpend = (targetBudget / totalCampaignDays) * daysElapsed;
            const spendDifference = totalSpend - expectedSpend;
            const pacingPercentage = expectedSpend > 0 ? (totalSpend / expectedSpend) * 100 : 0;

            // Warn if pacing is off by more than 20%
            if (daysElapsed > 0 && (pacingPercentage < 80 || pacingPercentage > 120)) {
              incrementRuleHit(supabaseClient, 'meta_ads_budget_pacing');

              const isUnderspending = pacingPercentage < 100;
              const severity = (pacingPercentage < 60 || pacingPercentage > 140) ? 'error' : 'warning';
              const emoji = severity === 'error' ? '🚨' : '⚠️';

              const statusText = isUnderspending
                ? `underspending (${pacingPercentage.toFixed(0)}% of target)`
                : `overspending (${pacingPercentage.toFixed(0)}% of target)`;

              findings.push({
                ruleId: 'meta_ads_budget_pacing',
                ruleName: budgetPacingRule.name,
                severity: severity,
                category: budgetPacingRule.category,
                context: budgetPacingRule.context,
                emoji: emoji,
                message: `Meta ads budget pacing issue: ${statusText}. Spent $${totalSpend.toFixed(2)} of expected $${expectedSpend.toFixed(2)} with ${daysUntilEvent.toFixed(0)} days until event (${daysElapsed.toFixed(0)}/${totalCampaignDays} days elapsed)`,
                eventId: event.id,
                eventEid: event.eid,
                eventName: event.name,
                totalSpend: totalSpend,
                expectedSpend: expectedSpend,
                targetBudget: targetBudget,
                daysUntilEvent: Math.round(daysUntilEvent),
                daysElapsed: Math.round(daysElapsed),
                pacingPercentage: pacingPercentage,
                isUnderspending: isUnderspending,
                currency: currency,
                timestamp: new Date().toISOString()
              });
            }
          }
        }
      }
    } catch (metaAdsError: any) {
      debugInfo.meta_ads_error = metaAdsError.message;
    }

    // Filter out suppressed findings
    try {
      const { data: suppressions, error: suppressError } = await supabaseClient
        .from('linter_suppressions')
        .select('rule_id, event_id, artist_id, city_id, suppressed_until');

      if (!suppressError && suppressions && suppressions.length > 0) {
        const now = new Date();
        const activeSuppressions = suppressions.filter((s: any) =>
          !s.suppressed_until || new Date(s.suppressed_until) > now
        );

        debugInfo.total_suppressions = suppressions.length;
        debugInfo.active_suppressions = activeSuppressions.length;
        debugInfo.suppression_sample = activeSuppressions.slice(0, 2).map((s: any) => ({
          rule_id: s.rule_id,
          event_id: s.event_id,
          artist_id: s.artist_id
        }));

        const suppressedFindings: any[] = [];
        findings = findings.filter((finding: any) => {
          // Check if this finding is suppressed
          const isSuppressed = activeSuppressions.some((s: any) => {
            // Must match rule_id
            if (s.rule_id !== finding.ruleId) return false;

            // If suppression has event_id, finding must match (case-insensitive UUID comparison)
            if (s.event_id) {
              const suppressionEventId = String(s.event_id).toLowerCase();
              const findingEventId = String(finding.eventId).toLowerCase();
              if (suppressionEventId !== findingEventId) return false;
            }

            // If suppression has artist_id, finding must match (case-insensitive UUID comparison)
            if (s.artist_id) {
              const suppressionArtistId = String(s.artist_id).toLowerCase();
              const findingArtistId = String(finding.artistId || '').toLowerCase();
              if (suppressionArtistId !== findingArtistId) return false;
            }

            // If suppression has city_id, finding must match (case-insensitive UUID comparison)
            if (s.city_id) {
              const suppressionCityId = String(s.city_id).toLowerCase();
              const findingCityId = String(finding.cityId || '').toLowerCase();
              if (suppressionCityId !== findingCityId) return false;
            }

            // If suppression has none of event_id, artist_id, or city_id, it shouldn't exist (DB constraint)
            // But if it somehow does, don't match
            if (!s.event_id && !s.artist_id && !s.city_id) return false;

            return true;
          });

          if (isSuppressed) {
            suppressedFindings.push({
              ruleId: finding.ruleId,
              eventId: finding.eventId,
              artistId: finding.artistId
            });
          }

          return !isSuppressed;
        });

        debugInfo.suppressions_checked = activeSuppressions.length;
        debugInfo.findings_suppressed = suppressedFindings.length;
        if (suppressedFindings.length > 0) {
          debugInfo.suppressed_findings_sample = suppressedFindings.slice(0, 3);
        }
      }
    } catch (suppressError: any) {
      debugInfo.suppression_error = suppressError.message;
    }

    // Sort by severity
    const severityOrder: any = { error: 0, warning: 1, reminder: 2, info: 3, success: 4 };
    findings.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

    // Filter by severity if specified
    let filteredFindings = filterSeverity
      ? findings.filter(f => f.severity === filterSeverity)
      : findings;

    // Calculate summary
    const summary = filteredFindings.reduce((acc: any, f) => {
      acc[f.severity] = (acc[f.severity] || 0) + 1;
      return acc;
    }, { error: 0, warning: 0, reminder: 0, info: 0, success: 0 });

    debugInfo.findings_count = filteredFindings.length;
    debugInfo.summary = summary;

    // Return response
    const response: any = {
      success: true,
      summary,
      rules_count: rules.length,
      events_count: eventsToLint.length,
      findings_count: filteredFindings.length,
      timestamp: new Date().toISOString()
    };

    if (!summaryOnly) {
      response.findings = filteredFindings;
    }

    // Always include debug info for transparency
    response.debug = debugInfo;

    return new Response(
      JSON.stringify(response),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200
      }
    );

  } catch (error: any) {
    return new Response(
      JSON.stringify({
        error: 'Event linter failed',
        success: false,
        debug: {
          ...debugInfo,
          error_message: error.message,
          error_type: error.constructor.name,
          error_stack: error.stack
        }
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500
      }
    );
  }
});

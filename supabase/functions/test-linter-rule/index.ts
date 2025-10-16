// Test Linter Rule - Diagnostic Tool
// Tests a single rule against all events to diagnose why it's not triggering
// Updated to use database rules and batch metrics enrichment like main linter

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.53.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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
      const compareValue = comparativeData[compare_to] || getNestedField(event, compare_to) || 0;
      if (compareValue === 0) return false;
      const percent = (Number(fieldValue) / compareValue) * 100;
      return percent > Number(value);
    case 'less_than_percent':
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

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: req.headers.get('Authorization')! },
        },
      }
    );

    // Get rule_id from query params or body
    const url = new URL(req.url);
    const ruleIdParam = url.searchParams.get('rule_id');

    let ruleId = ruleIdParam;
    if (!ruleId && req.method === 'POST') {
      const body = await req.json();
      ruleId = body.rule_id || body.ruleId;
    }

    if (!ruleId) {
      throw new Error('rule_id is required');
    }

    // Load the rule from database
    const { data: rules, error: rulesError } = await supabaseClient
      .from('event_linter_rules')
      .select('*')
      .eq('rule_id', ruleId)
      .eq('status', 'active');

    if (rulesError) {
      throw new Error(`Database error: ${rulesError.message}`);
    }

    if (!rules || rules.length === 0) {
      throw new Error(`Rule ${ruleId} not found or not active`);
    }

    const rule = rules[0];
    const conditions = rule.conditions || [];

    // Get events to test against
    const { data: events, error: eventsError } = await supabaseClient
      .from('events')
      .select('*')
      .limit(1000);

    if (eventsError) {
      throw new Error(`Failed to fetch events: ${eventsError.message}`);
    }

    if (!events) {
      throw new Error('No events found');
    }

    // Filter to last 4 years
    const fourYearsAgo = new Date(Date.now() - 1460 * 24 * 60 * 60 * 1000);
    let recentEvents = events.filter(e => {
      if (!e.event_start_datetime) return true;
      return new Date(e.event_start_datetime) >= fourYearsAgo;
    });

    // Filter out test/internal events (AB4000-AB6999 range) - matches main linter logic
    recentEvents = recentEvents.filter(e => {
      if (!e.eid) return true;
      const match = e.eid.match(/^AB(\d+)$/);
      if (!match) return true;
      const eidNum = parseInt(match[1]);
      return eidNum < 4000 || eidNum >= 7000;
    });

    // Enrich ALL events with computed metrics using batch call
    recentEvents = await enrichEventsWithMetrics(supabaseClient, recentEvents);

    // Test each event against the rule
    const diagnostics = {
      totalEventsChecked: recentEvents.length,
      matchingEvents: 0,
      matchingEventsList: [] as any[],
      almostMatchingEvents: [] as any[],
      sampleFailures: [] as any[],
      fieldPresence: {} as any,
      conditionResults: {} as any
    };

    for (const event of recentEvents) {
      const conditionResults: any = {};
      let allConditionsMet = true;
      let conditionsMetCount = 0;

      // If rule has no conditions, skip evaluation (likely handled by DB function)
      if (conditions.length === 0) {
        continue;
      }

      for (const condition of conditions) {
        const { field, operator, value } = condition;
        const fieldValue = getNestedField(event, field);

        // Track field presence
        if (!diagnostics.fieldPresence[field]) {
          diagnostics.fieldPresence[field] = { present: 0, missing: 0, sample: [] };
        }

        if (fieldValue !== null && fieldValue !== undefined && fieldValue !== '') {
          diagnostics.fieldPresence[field].present++;
          if (diagnostics.fieldPresence[field].sample.length < 3) {
            diagnostics.fieldPresence[field].sample.push(fieldValue);
          }
        } else {
          diagnostics.fieldPresence[field].missing++;
        }

        // Evaluate condition
        const met = evaluateCondition(condition, event);

        conditionResults[field] = { operator, value, fieldValue, met };

        if (met) {
          conditionsMetCount++;
        } else {
          allConditionsMet = false;
        }
      }

      if (allConditionsMet && conditions.length > 0) {
        diagnostics.matchingEvents++;
        if (diagnostics.matchingEventsList.length < 5) {
          diagnostics.matchingEventsList.push({
            eid: event.eid,
            name: event.name,
            event_start_datetime: event.event_start_datetime,
            conditionResults
          });
        }
      } else if (conditionsMetCount >= conditions.length - 1 && conditions.length > 0 && diagnostics.almostMatchingEvents.length < 5) {
        // Almost matching (missed by one condition)
        diagnostics.almostMatchingEvents.push({
          eid: event.eid,
          name: event.name,
          event_start_datetime: event.event_start_datetime,
          conditionResults,
          metCount: conditionsMetCount,
          totalConditions: conditions.length
        });
      }

      if (diagnostics.sampleFailures.length < 3 && conditionsMetCount === 0 && conditions.length > 0) {
        diagnostics.sampleFailures.push({
          eid: event.eid,
          name: event.name,
          event_start_datetime: event.event_start_datetime,
          conditionResults
        });
      }
    }

    // Generate recommendations
    const recommendations = [];

    if (diagnostics.matchingEvents === 0) {
      if (conditions.length === 0) {
        recommendations.push('Rule has no conditions defined - it may be handled by database functions or RPC calls instead');
      } else {
        // Check if fields are missing from database
        for (const [field, stats] of Object.entries(diagnostics.fieldPresence)) {
          const s = stats as any;
          if (s.missing > s.present * 0.8) {
            recommendations.push(`Field "${field}" is missing in ${Math.round((s.missing / (s.missing + s.present)) * 100)}% of events - may not be populated in database`);
          }
        }

        // Check if conditions are too strict
        if (diagnostics.almostMatchingEvents.length > 0) {
          recommendations.push(`Found ${diagnostics.almostMatchingEvents.length} events that almost match (off by 1 condition) - conditions may be too strict`);
        }
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        rule_id: rule.rule_id,
        rule_name: rule.name,
        rule_description: rule.description,
        severity: rule.severity,
        category: rule.category,
        context: rule.context,
        conditions: conditions,
        matching_count: diagnostics.matchingEvents,
        diagnostics,
        recommendations,
        reason: diagnostics.matchingEvents === 0 ? 'No events match all conditions' : `${diagnostics.matchingEvents} events match`
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('Test linter rule error:', error);
    return new Response(
      JSON.stringify({ error: error.message, stack: error.stack }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

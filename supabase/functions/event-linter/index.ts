// Event Linter Edge Function
// Runs event health checks and returns findings
// Called by both web UI and CLI

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.53.0';
import { parse as parseYAML } from 'https://deno.land/std@0.177.0/encoding/yaml.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Load YAML rules from CDN
async function loadRules() {
  try {
    const response = await fetch('https://artb.tor1.cdn.digitaloceanspaces.com/admin/eventLinterRules.yaml');
    if (!response.ok) {
      throw new Error(`Failed to fetch rules: ${response.status}`);
    }
    const yamlText = await response.text();
    const config = parseYAML(yamlText) as any;
    return config.rules || [];
  } catch (error) {
    throw new Error(`Failed to load rules: ${error.message}`);
  }
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

// Evaluate condition
function evaluateCondition(condition: any, event: any, comparativeData: any = {}): boolean {
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
  const context = { ...event, ...timeContext, ...comparativeData };

  message = message.replace(/\{\{([^}]+)\}\}/g, (match, field) => {
    const value = getNestedField(context, field.trim());
    return value !== undefined && value !== null ? String(value) : match;
  });

  return message;
}

// Evaluate rule
function evaluateRule(rule: any, event: any, comparativeData: any = {}): any | null {
  const allConditionsMet = rule.conditions.every((condition: any) =>
    evaluateCondition(condition, event, comparativeData)
  );

  if (!allConditionsMet) return null;

  const severityEmoji: any = {
    error: '❌',
    warning: '⚠️',
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

    debugInfo.filters = {
      eid: filterEid,
      severity: filterSeverity,
      summary_only: summaryOnly,
      future_only: futureOnly,
      active_only: activeOnly
    };

    // Create Supabase client
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Load rules
    const rules = await loadRules();
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

    // Run linter
    const findings: any[] = [];
    for (const event of eventsToLint) {
      for (const rule of rules) {
        const finding = evaluateRule(rule, event, {});
        if (finding) {
          findings.push(finding);
        }
      }
    }

    // Sort by severity
    const severityOrder: any = { error: 0, warning: 1, info: 2, success: 3 };
    findings.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

    // Filter by severity if specified
    let filteredFindings = filterSeverity
      ? findings.filter(f => f.severity === filterSeverity)
      : findings;

    // Calculate summary
    const summary = filteredFindings.reduce((acc: any, f) => {
      acc[f.severity] = (acc[f.severity] || 0) + 1;
      return acc;
    }, { error: 0, warning: 0, info: 0, success: 0 });

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

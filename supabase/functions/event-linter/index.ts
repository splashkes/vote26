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
          .select('event_eid, confirmation_status, withdrawn_at')
          .in('event_eid', futureEventEids);

        if (!confirmationError && confirmationData) {
          // Group confirmation counts by event_eid
          const confirmationCountMap = new Map();
          confirmationData.forEach((ac: any) => {
            if (!confirmationCountMap.has(ac.event_eid)) {
              confirmationCountMap.set(ac.event_eid, { confirmed: 0, withdrawn: 0 });
            }
            const counts = confirmationCountMap.get(ac.event_eid);
            if (ac.confirmation_status === 'confirmed' && !ac.withdrawn_at) {
              counts.confirmed++;
            }
            if (ac.withdrawn_at) {
              counts.withdrawn++;
            }
          });

          // Enrich future events with confirmation counts
          for (const event of futureEvents) {
            const counts = confirmationCountMap.get(event.eid) || { confirmed: 0, withdrawn: 0 };
            event.confirmed_artists_count = counts.confirmed;
            event.withdrawn_artists_count = counts.withdrawn;
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
    const findings: any[] = [];
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
        const finding = evaluateRule(rule, event, {}, supabaseClient);
        if (finding) {
          findings.push(finding);
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

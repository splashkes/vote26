// Event Linter Engine
// Evaluates events against YAML-defined rules and generates findings

import { parse as parseYAML } from 'yaml';

// Emoji mapping for severity levels
const SEVERITY_EMOJI = {
  error: '❌',
  warning: '⚠️',
  reminder: '🔔',
  info: '📊',
  success: '✅'
};

// Load and parse YAML rules
export const loadRules = async () => {
  try {
    console.log('Loading linter rules...');
    const response = await fetch('/admin/eventLinterRules.yaml');
    console.log('Fetch response status:', response.status);

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const yamlText = await response.text();
    console.log('YAML text length:', yamlText.length);

    const config = parseYAML(yamlText);
    console.log('Parsed config:', config);
    console.log('Rules count:', config?.rules?.length || 0);

    return config.rules || [];
  } catch (error) {
    console.error('Failed to load linter rules:', error);
    console.error('Error details:', error.message, error.stack);
    return [];
  }
};

// Evaluate a single condition against event data
const evaluateCondition = (condition, event, comparativeData = {}) => {
  const { field, operator, value, compare_to } = condition;

  // Get field value (supports nested fields like "rounds.3.end_time")
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
      console.warn(`Unknown operator: ${operator}`);
      return false;
  }
};

// Get nested field value (e.g., "rounds.3.end_time" or "cities.id")
const getNestedField = (obj, path) => {
  if (!obj || !path) return undefined;

  const keys = path.split('.');
  let value = obj;

  for (const key of keys) {
    if (value === null || value === undefined) return undefined;

    // Handle array index (e.g., "rounds.3")
    if (!isNaN(key)) {
      value = Array.isArray(value) ? value[parseInt(key)] : undefined;
    } else {
      value = value[key];
    }
  }

  return value;
};

// Time comparison helpers
const isPastMinutes = (datetime, minutes) => {
  if (!datetime) return false;
  const then = new Date(datetime);
  const now = new Date();
  const diffMinutes = (now - then) / 1000 / 60;
  return diffMinutes >= minutes;
};

const isPastHours = (datetime, hours) => {
  if (!datetime) return false;
  const then = new Date(datetime);
  const now = new Date();
  const diffHours = (now - then) / 1000 / 60 / 60;
  return diffHours >= hours;
};

const isPastDays = (datetime, days) => {
  if (!datetime) return false;
  const then = new Date(datetime);
  const now = new Date();
  const diffDays = (now - then) / 1000 / 60 / 60 / 24;
  return diffDays >= days;
};

const isUpcomingMinutes = (datetime, minutes) => {
  if (!datetime) return false;
  const then = new Date(datetime);
  const now = new Date();
  const diffMinutes = (then - now) / 1000 / 60;
  return diffMinutes > 0 && diffMinutes <= minutes;
};

const isUpcomingHours = (datetime, hours) => {
  if (!datetime) return false;
  const then = new Date(datetime);
  const now = new Date();
  const diffHours = (then - now) / 1000 / 60 / 60;
  return diffHours > 0 && diffHours <= hours;
};

const isUpcomingDays = (datetime, days) => {
  if (!datetime) return false;
  const then = new Date(datetime);
  const now = new Date();
  const diffDays = (then - now) / 1000 / 60 / 60 / 24;
  return diffDays > 0 && diffDays <= days;
};

// Calculate time context data for message interpolation
const getTimeContext = (event) => {
  const now = new Date();
  const context = {};

  if (event.event_start_datetime) {
    const start = new Date(event.event_start_datetime);
    const diffMs = now - start;
    const diffMinutes = Math.floor(diffMs / 1000 / 60);
    const diffHours = Math.floor(diffMs / 1000 / 60 / 60);
    const diffDays = Math.floor(diffMs / 1000 / 60 / 60 / 24);

    if (diffMs > 0) {
      // Past
      context.minutes_ago = diffMinutes;
      context.hours_ago = diffHours;
      context.days_ago = diffDays;
    } else {
      // Future
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
};

// Interpolate message template with event data
const interpolateMessage = (template, event, comparativeData = {}) => {
  let message = template;
  const timeContext = getTimeContext(event);

  // Create a combined context with event fields, time context, and comparative data
  const context = {
    ...event,
    ...timeContext,
    ...comparativeData
  };

  // Replace {{field}} placeholders
  message = message.replace(/\{\{([^}]+)\}\}/g, (match, field) => {
    const value = getNestedField(context, field.trim());
    return value !== undefined && value !== null ? value : match;
  });

  return message;
};

// Evaluate a single rule against an event
const evaluateRule = (rule, event, comparativeData = {}) => {
  // Check if all conditions are met
  const allConditionsMet = rule.conditions.every(condition =>
    evaluateCondition(condition, event, comparativeData)
  );

  if (!allConditionsMet) {
    return null;
  }

  // Generate finding
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
};

// Get comparative data for an event (city averages, etc.)
const getComparativeData = async (event, allEvents) => {
  if (!event.cities?.id || !allEvents) {
    return {};
  }

  // Filter events from the same city (excluding current event)
  const cityEvents = allEvents.filter(e =>
    e.cities?.id === event.cities?.id &&
    e.id !== event.id &&
    e.event_end_datetime &&
    new Date(e.event_end_datetime) < new Date()
  );

  if (cityEvents.length === 0) {
    return {};
  }

  // Calculate averages
  const avgTicketSales = cityEvents.reduce((sum, e) => sum + (e.ticket_sales || 0), 0) / cityEvents.length;
  const avgFoodBeverage = cityEvents.reduce((sum, e) => sum + (e.food_beverage_revenue || 0), 0) / cityEvents.length;
  const avgArtistCount = cityEvents.reduce((sum, e) => sum + (e.applied_artists_count || 0), 0) / cityEvents.length;

  return {
    city_average: avgTicketSales,
    city_average_food_beverage: avgFoodBeverage,
    city_typical: Math.round(avgArtistCount)
  };
};

// Main linter function - evaluate all rules against all events
export const lintEvents = async (events, rules = null) => {
  if (!rules) {
    rules = await loadRules();
  }

  if (!events || events.length === 0) {
    return [];
  }

  const findings = [];

  for (const event of events) {
    // Get comparative data for this event
    const comparativeData = await getComparativeData(event, events);

    // Evaluate all rules
    for (const rule of rules) {
      const finding = evaluateRule(rule, event, comparativeData);
      if (finding) {
        findings.push(finding);
      }
    }
  }

  // Sort findings by severity (error > warning > reminder > info > success)
  const severityOrder = { error: 0, warning: 1, reminder: 2, info: 3, success: 4 };
  findings.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

  return findings;
};

// Lint a single event
export const lintEvent = async (event, allEvents = null, rules = null) => {
  if (!rules) {
    rules = await loadRules();
  }

  const findings = [];
  const comparativeData = allEvents ? await getComparativeData(event, allEvents) : {};

  for (const rule of rules) {
    const finding = evaluateRule(rule, event, comparativeData);
    if (finding) {
      findings.push(finding);
    }
  }

  const severityOrder = { error: 0, warning: 1, reminder: 2, info: 3, success: 4 };
  findings.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

  return findings;
};

// Get severity counts for an event
export const getSeverityCounts = (findings) => {
  return findings.reduce((counts, finding) => {
    counts[finding.severity] = (counts[finding.severity] || 0) + 1;
    return counts;
  }, { error: 0, warning: 0, reminder: 0, info: 0, success: 0 });
};

// Filter findings by severity, category, or context
export const filterFindings = (findings, filters = {}) => {
  return findings.filter(finding => {
    if (filters.severity && finding.severity !== filters.severity) return false;
    if (filters.category && finding.category !== filters.category) return false;
    if (filters.context && finding.context !== filters.context) return false;
    if (filters.eventId && finding.eventId !== filters.eventId) return false;
    if (filters.search) {
      const searchLower = filters.search.toLowerCase();
      return (
        finding.message.toLowerCase().includes(searchLower) ||
        finding.eventEid?.toLowerCase().includes(searchLower) ||
        finding.eventName?.toLowerCase().includes(searchLower) ||
        finding.ruleName.toLowerCase().includes(searchLower)
      );
    }
    return true;
  });
};

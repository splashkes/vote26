import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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

    const { ruleId } = await req.json();

    if (!ruleId) {
      throw new Error('ruleId is required');
    }

    // Load the rule
    const rulesResponse = await fetch('https://artb.tor1.cdn.digitaloceanspaces.com/admin/eventLinterRules.yaml');
    const yamlText = await rulesResponse.text();

    // Parse YAML to find the rule
    const ruleBlocks = yamlText.split(/\n\s*- id:\s*/);
    let targetRule: any = null;

    for (let i = 1; i < ruleBlocks.length; i++) {
      const block = ruleBlocks[i];
      const lines = block.split('\n');
      const id = lines[0].trim();

      if (id === ruleId) {
        // Parse this rule
        targetRule = { id, conditions: [], raw: block };

        let currentCondition: any = null;
        let inConditions = false;

        for (const line of lines) {
          const trimmed = line.trim();

          if (trimmed.startsWith('name:')) {
            targetRule.name = trimmed.substring(5).trim().replace(/^['"]|['"]$/g, '');
          }
          if (trimmed.startsWith('description:')) {
            targetRule.description = trimmed.substring(12).trim().replace(/^['"]|['"]$/g, '');
          }
          if (trimmed.startsWith('severity:')) {
            targetRule.severity = trimmed.substring(9).trim();
          }
          if (trimmed.startsWith('category:')) {
            targetRule.category = trimmed.substring(9).trim();
          }
          if (trimmed.startsWith('context:')) {
            targetRule.context = trimmed.substring(8).trim();
          }
          if (trimmed.startsWith('conditions:')) {
            inConditions = true;
          }

          if (inConditions) {
            if (trimmed.startsWith('- field:')) {
              if (currentCondition) {
                targetRule.conditions.push(currentCondition);
              }
              currentCondition = { field: trimmed.substring(8).trim() };
            } else if (trimmed.startsWith('operator:') && currentCondition) {
              currentCondition.operator = trimmed.substring(9).trim();
            } else if (trimmed.startsWith('value:') && currentCondition) {
              const valueStr = trimmed.substring(6).trim();
              currentCondition.value = isNaN(Number(valueStr)) ? valueStr : Number(valueStr);
            }
          }
        }

        if (currentCondition) {
          targetRule.conditions.push(currentCondition);
        }

        break;
      }
    }

    if (!targetRule) {
      throw new Error(`Rule ${ruleId} not found`);
    }

    // Get events to test against
    const { data: events } = await supabaseClient
      .from('events')
      .select('*')
      .limit(1000);

    if (!events) {
      throw new Error('Failed to fetch events');
    }

    // Filter to last 4 years
    const fourYearsAgo = new Date(Date.now() - 1460 * 24 * 60 * 60 * 1000);
    const recentEvents = events.filter(e => {
      if (!e.event_start_datetime) return true;
      return new Date(e.event_start_datetime) >= fourYearsAgo;
    });

    // Test each event against the rule
    const diagnostics = {
      totalEventsChecked: recentEvents.length,
      matchingEvents: 0,
      almostMatchingEvents: [],
      sampleFailures: [],
      fieldPresence: {} as any,
      conditionResults: {} as any
    };

    for (const event of recentEvents.slice(0, 100)) { // Sample first 100
      const conditionResults: any = {};
      let allConditionsMet = true;
      let conditionsMetCount = 0;

      for (const condition of targetRule.conditions) {
        const { field, operator, value } = condition;
        const fieldValue = event[field];

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
        let met = false;

        switch (operator) {
          case 'is_empty':
            met = fieldValue === null || fieldValue === undefined || fieldValue === '';
            break;
          case 'is_not_empty':
            met = fieldValue !== null && fieldValue !== undefined && fieldValue !== '';
            break;
          case 'equals':
            met = fieldValue === value;
            break;
          case 'greater_than':
            met = fieldValue > value;
            break;
          case 'less_than':
            met = fieldValue < value;
            break;
          case 'upcoming_days':
            if (fieldValue) {
              const eventDate = new Date(fieldValue);
              const now = new Date();
              const diffDays = (eventDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
              met = diffDays > 0 && diffDays <= value;
            }
            break;
          case 'within_days':
            if (fieldValue) {
              const eventDate = new Date(fieldValue);
              const now = new Date();
              const diffDays = (now.getTime() - eventDate.getTime()) / (1000 * 60 * 60 * 24);
              met = diffDays >= 0 && diffDays <= value;
            }
            break;
          default:
            met = false;
        }

        conditionResults[field] = { operator, value, fieldValue, met };

        if (met) {
          conditionsMetCount++;
        } else {
          allConditionsMet = false;
        }
      }

      if (allConditionsMet) {
        diagnostics.matchingEvents++;
      } else if (conditionsMetCount >= targetRule.conditions.length - 1 && diagnostics.almostMatchingEvents.length < 5) {
        // Almost matching (missed by one condition)
        diagnostics.almostMatchingEvents.push({
          eid: event.eid,
          name: event.name,
          conditionResults
        });
      }

      if (diagnostics.sampleFailures.length < 3 && conditionsMetCount === 0) {
        diagnostics.sampleFailures.push({
          eid: event.eid,
          name: event.name,
          conditionResults
        });
      }
    }

    // Generate recommendations
    const recommendations = [];

    if (diagnostics.matchingEvents === 0) {
      // Check if fields are missing from database
      for (const [field, stats] of Object.entries(diagnostics.fieldPresence)) {
        const s = stats as any;
        if (s.missing > s.present * 0.8) {
          recommendations.push(`Field "${field}" is missing in ${Math.round((s.missing / (s.missing + s.present)) * 100)}% of events - may not be populated in database`);
        }
      }

      // Check if conditions are too strict
      if (diagnostics.almostMatchingEvents.length > 0) {
        recommendations.push(`Found ${diagnostics.almostMatchingEvents.length} events that almost match - conditions may be too strict`);
      }

      if (targetRule.conditions.length === 0) {
        recommendations.push('Rule has no conditions defined - it may be handled by database functions instead');
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        rule: {
          id: targetRule.id,
          name: targetRule.name,
          description: targetRule.description,
          severity: targetRule.severity,
          category: targetRule.category,
          context: targetRule.context,
          conditions: targetRule.conditions
        },
        diagnostics,
        recommendations
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

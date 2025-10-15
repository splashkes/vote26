// Event Linter AI Analysis
// Purpose: Generate AI-powered insights for event linter findings using OpenAI API

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    console.log('🤖 Event Linter AI Analysis function called');

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    // Validate admin access
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization' }),
        { status: 401, headers: corsHeaders }
      );
    }

    const requestBody = await req.json();
    const { findings } = requestBody;

    if (!findings) {
      return new Response(
        JSON.stringify({ error: 'Missing findings data' }),
        { status: 400, headers: corsHeaders }
      );
    }

    console.log('📊 Analyzing findings:', {
      total: findings.total,
      severities: findings.severityCounts,
      categories: findings.categories
    });

    // Generate AI analysis
    const analysis = await generateAIAnalysis(findings);

    return new Response(
      JSON.stringify({
        success: true,
        analysis,
        timestamp: new Date().toISOString()
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('AI Analysis Error:', error);
    return new Response(
      JSON.stringify({
        error: 'Failed to generate AI analysis',
        details: error.message
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

async function generateAIAnalysis(findings: any) {
  const openaiApiKey = Deno.env.get('OPENAI_API_KEY');

  if (!openaiApiKey) {
    throw new Error('OpenAI API key not configured');
  }

  console.log('🧠 Generating AI analysis with OpenAI...');
  const prompt = createPrompt(findings);
  console.log('📝 Prompt length:', prompt.length);

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${openaiApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `You are an expert event operations analyst specializing in Art Battle live painting competitions. Your role is to analyze event health metrics, identify operational risks, and provide actionable recommendations to event managers. Focus on:
- Critical issues that could disrupt events
- Operational efficiency improvements
- Resource allocation priorities
- Risk mitigation strategies`
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      response_format: { type: 'json_object' },
      max_tokens: 1500,
      temperature: 0.7
    })
  });

  console.log('🔄 OpenAI response status:', response.status);

  if (!response.ok) {
    const errorText = await response.text();
    console.error('❌ OpenAI API error:', errorText);
    throw new Error(`OpenAI API error: ${response.status} - ${errorText}`);
  }

  const result = await response.json();
  console.log('✨ OpenAI tokens used:', result.usage);

  const content = result.choices[0].message.content;
  console.log('📄 OpenAI response received');

  try {
    const parsedResponse = JSON.parse(content);
    console.log('🔍 Parsed response structure:', Object.keys(parsedResponse));

    // Validate the response structure
    const validatedResponse = {
      overview: typeof parsedResponse.overview === 'string' ? parsedResponse.overview : 'Analysis unavailable',
      key_issues: Array.isArray(parsedResponse.key_issues) ? parsedResponse.key_issues : [],
      recommendations: Array.isArray(parsedResponse.recommendations) ? parsedResponse.recommendations : [],
      priority_actions: Array.isArray(parsedResponse.priority_actions) ? parsedResponse.priority_actions : []
    };

    console.log('✅ Validated response');
    return validatedResponse;
  } catch (parseError) {
    console.error('❌ Failed to parse OpenAI response:', parseError);
    throw new Error(`Invalid JSON response from OpenAI: ${parseError.message}`);
  }
}

function createPrompt(findings: any): string {
  const { total, severityCounts, categories, contexts, allFindings, filters } = findings;

  // Build ALL findings summary with rule information
  const findingsSummary = allFindings.map((f: any, idx: number) =>
    `${idx + 1}. [${f.severity.toUpperCase()}] ${f.ruleName || f.category}: ${f.message} (${f.eventEid || 'N/A'} - ${f.eventName || 'Unknown'})`
  ).join('\n');

  // Build active filters summary
  const activeFilters: string[] = [];
  if (filters.search) activeFilters.push(`Search: "${filters.search}"`);
  if (filters.severities.length > 0) activeFilters.push(`Severities: ${filters.severities.join(', ')}`);
  if (filters.category !== 'all') activeFilters.push(`Category: ${filters.category}`);
  if (filters.context !== 'all') activeFilters.push(`Context: ${filters.context}`);
  if (filters.futureOnly) activeFilters.push('Future events only');
  if (filters.activeOnly) activeFilters.push('Active events only (±24h)');

  const filtersText = activeFilters.length > 0 ? `\nACTIVE FILTERS:\n${activeFilters.join('\n')}` : '\nNO FILTERS APPLIED (showing all findings)';

  return `Analyze this filtered view of event linter findings from Art Battle's event management system.

CURRENT FILTERED VIEW:
- Total Findings: ${total}
- Severity Breakdown:
  • Errors: ${severityCounts.error || 0} (critical operational blockers)
  • Warnings: ${severityCounts.warning || 0} (issues requiring attention)
  • Info: ${severityCounts.info || 0} (informational items)
  • Success: ${severityCounts.success || 0} (positive indicators)
- Categories Present: ${categories.join(', ')}
- Contexts: ${contexts.join(', ')}
${filtersText}

ALL FINDINGS (complete list of ${allFindings.length}):
${findingsSummary}

ANALYSIS REQUIREMENTS:
Provide a technical, data-driven analysis focused on operational priorities. You have the COMPLETE list of all findings. Consider:
1. The severity distribution and what it indicates about overall system health
2. Patterns across events (which specific events appear most frequently? Are issues concentrated?)
3. Pattern recognition (which rule types appear most frequently? Group similar issues)
4. Urgent vs. routine operational needs (prioritize events happening soon)
5. Resource allocation recommendations based on issue priority
6. Identify specific event IDs that need immediate attention
7. Any filters applied that may affect the scope of your analysis

Return your analysis in JSON format with EXACTLY these 4 fields:
{
  "overview": "2-3 sentence executive summary of the current operational state based on these findings",
  "key_issues": ["array", "of", "3-5", "most", "critical", "issues", "identified"],
  "recommendations": ["array", "of", "3-5", "specific", "actionable", "recommendations"],
  "priority_actions": ["array", "of", "1-3", "highest", "priority", "actions", "needed", "immediately"]
}

CRITICAL: Return ONLY these 4 fields with the exact types specified (strings and arrays). Be specific and actionable - reference event IDs, categories, or specific metrics where relevant. If filters are active, acknowledge that your analysis is scoped to the filtered view.`;
}

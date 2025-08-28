// Auth Monitoring Queries Edge Function
// Comprehensive monitoring strategy for authentication issues

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface AuthMonitoringRequest {
  query_type: string
  time_window?: string
  limit?: number
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const { query_type, time_window = '1 hour', limit = 100 }: AuthMonitoringRequest = await req.json()

    let queryResult = null

    switch (query_type) {
      case 'invalid_auth_attempts':
        queryResult = await getInvalidAuthAttempts(supabase, time_window, limit)
        break
      
      case 'sms_failures':
        queryResult = await getSMSFailures(supabase, time_window, limit)
        break
      
      case 'phone_format_issues':
        queryResult = await getPhoneFormatIssues(supabase, time_window, limit)
        break
      
      case 'webhook_failures':
        queryResult = await getWebhookFailures(supabase, time_window, limit)
        break
      
      case 'auth_success_rates':
        queryResult = await getAuthSuccessRates(supabase, time_window)
        break
      
      case 'suspicious_patterns':
        queryResult = await getSuspiciousPatterns(supabase, time_window, limit)
        break
      
      case 'comprehensive_health':
        queryResult = await getComprehensiveHealthCheck(supabase, time_window)
        break
      
      default:
        throw new Error(`Unknown query type: ${query_type}`)
    }

    return new Response(JSON.stringify({
      success: true,
      query_type,
      time_window,
      data: queryResult,
      timestamp: new Date().toISOString()
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (error) {
    console.error('Auth monitoring error:', error)
    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})

// 1. Base Query: Invalid Authentication Attempts
async function getInvalidAuthAttempts(supabase: any, timeWindow: string, limit: number) {
  const { data, error } = await supabase.rpc('execute_raw_sql', {
    query: `
      SELECT 
        id, 
        timestamp, 
        event_message, 
        metadata.level, 
        metadata.status, 
        metadata.path, 
        metadata.msg as msg, 
        metadata.error,
        metadata.phone,
        metadata.email
      FROM auth_logs
      CROSS JOIN unnest(metadata) as metadata
      WHERE 
        regexp_contains(event_message, 'invalid|error|fail|denied|reject')
        AND timestamp >= NOW() - INTERVAL '${timeWindow}'
      ORDER BY timestamp DESC
      LIMIT ${limit}
    `
  })
  
  return { data, error, description: 'Invalid authentication attempts and errors' }
}

// 2. SMS-Specific Failures
async function getSMSFailures(supabase: any, timeWindow: string, limit: number) {
  const { data, error } = await supabase.rpc('execute_raw_sql', {
    query: `
      SELECT 
        id, 
        timestamp, 
        event_message, 
        metadata.phone,
        metadata.error,
        metadata.status,
        metadata.msg
      FROM auth_logs
      CROSS JOIN unnest(metadata) as metadata
      WHERE 
        (regexp_contains(event_message, 'sms|otp|phone|twilio') 
         OR regexp_contains(metadata.msg, 'sms|otp|phone|twilio'))
        AND (regexp_contains(event_message, 'error|fail|invalid|denied')
             OR regexp_contains(metadata.msg, 'error|fail|invalid|denied'))
        AND timestamp >= NOW() - INTERVAL '${timeWindow}'
      ORDER BY timestamp DESC
      LIMIT ${limit}
    `
  })
  
  return { data, error, description: 'SMS and phone verification failures' }
}

// 3. Phone Format Issues
async function getPhoneFormatIssues(supabase: any, timeWindow: string, limit: number) {
  const queries = [
    // Check auth_users for new problematic phone formats
    `
      SELECT 
        'auth_users_invalid_format' as source,
        phone,
        created_at,
        id,
        CASE 
          WHEN phone ~ '^\\+\\+' THEN 'Double plus prefix'
          WHEN phone ~ '^\\+1[0-9]{12,}' THEN 'Too many digits after +1'
          WHEN phone ~ '^\\+1[0-9]{8,9}$' THEN 'Too few digits after +1'
          WHEN phone ~ '^\\+[0-9]+' AND LENGTH(phone) > 16 THEN 'Too long for E.164'
          WHEN phone ~ '^\\+[0-9]+' AND LENGTH(phone) < 8 THEN 'Too short for E.164'
          ELSE 'Unknown format issue'
        END as issue_type
      FROM auth.users 
      WHERE 
        phone IS NOT NULL
        AND created_at >= NOW() - INTERVAL '${timeWindow}'
        AND (
          phone ~ '^\\+\\+' OR  -- Double plus
          phone ~ '^\\+1[0-9]{12,}' OR  -- Too many digits
          phone ~ '^\\+1[0-9]{8,9}$' OR  -- Too few digits  
          (phone ~ '^\\+[0-9]+' AND LENGTH(phone) > 16) OR  -- Too long
          (phone ~ '^\\+[0-9]+' AND LENGTH(phone) < 8)  -- Too short
        )
    `,
    // Check for users who registered but never confirmed
    `
      SELECT 
        'unconfirmed_phone' as source,
        phone,
        created_at,
        id,
        'Phone never confirmed' as issue_type
      FROM auth.users 
      WHERE 
        phone IS NOT NULL
        AND phone_confirmed_at IS NULL
        AND created_at >= NOW() - INTERVAL '${timeWindow}'
        AND created_at < NOW() - INTERVAL '10 minutes'  -- Give them time
      ORDER BY created_at DESC
      LIMIT ${Math.floor(limit/2)}
    `
  ]

  const results = []
  for (const query of queries) {
    const { data, error } = await supabase.rpc('execute_raw_sql', { query })
    results.push({ data, error })
  }
  
  return { results, description: 'Phone format and confirmation issues' }
}

// 4. Webhook Failures
async function getWebhookFailures(supabase: any, timeWindow: string, limit: number) {
  const { data, error } = await supabase.rpc('execute_raw_sql', {
    query: `
      SELECT 
        id, 
        timestamp, 
        event_message, 
        metadata.status,
        metadata.error,
        metadata.path,
        metadata.msg
      FROM auth_logs
      CROSS JOIN unnest(metadata) as metadata
      WHERE 
        (regexp_contains(event_message, 'webhook|auth-webhook')
         OR regexp_contains(metadata.path, 'webhook'))
        AND (regexp_contains(event_message, 'error|fail|500|timeout')
             OR regexp_contains(metadata.msg, 'error|fail|500|timeout')
             OR metadata.status >= 400)
        AND timestamp >= NOW() - INTERVAL '${timeWindow}'
      ORDER BY timestamp DESC
      LIMIT ${limit}
    `
  })
  
  return { data, error, description: 'Auth webhook failures and errors' }
}

// 5. Authentication Success Rates
async function getAuthSuccessRates(supabase: any, timeWindow: string) {
  const { data, error } = await supabase.rpc('execute_raw_sql', {
    query: `
      WITH auth_attempts AS (
        SELECT 
          DATE_TRUNC('hour', created_at) as hour_bucket,
          COUNT(*) as total_attempts,
          COUNT(phone_confirmed_at) as successful_confirmations,
          COUNT(last_sign_in_at) as successful_signins
        FROM auth.users 
        WHERE created_at >= NOW() - INTERVAL '${timeWindow}'
          AND phone IS NOT NULL
        GROUP BY DATE_TRUNC('hour', created_at)
      )
      SELECT 
        hour_bucket,
        total_attempts,
        successful_confirmations,
        successful_signins,
        ROUND(100.0 * successful_confirmations / NULLIF(total_attempts, 0), 2) as confirmation_rate,
        ROUND(100.0 * successful_signins / NULLIF(total_attempts, 0), 2) as signin_rate,
        (total_attempts - successful_confirmations) as failed_confirmations
      FROM auth_attempts
      ORDER BY hour_bucket DESC
    `
  })
  
  return { data, error, description: 'Hourly authentication success rates' }
}

// 6. Suspicious Patterns Detection
async function getSuspiciousPatterns(supabase: any, timeWindow: string, limit: number) {
  const queries = [
    // Same phone number, multiple failed attempts
    `
      SELECT 
        'repeated_phone_failures' as pattern_type,
        phone,
        COUNT(*) as attempt_count,
        array_agg(DISTINCT id) as user_ids,
        MIN(created_at) as first_attempt,
        MAX(created_at) as last_attempt
      FROM auth.users 
      WHERE 
        phone IS NOT NULL
        AND phone_confirmed_at IS NULL
        AND created_at >= NOW() - INTERVAL '${timeWindow}'
      GROUP BY phone
      HAVING COUNT(*) >= 3
      ORDER BY attempt_count DESC
      LIMIT ${Math.floor(limit/3)}
    `,
    // Rapid signup attempts from similar phones
    `
      SELECT 
        'rapid_similar_phones' as pattern_type,
        SUBSTRING(phone FROM 1 FOR 6) as phone_prefix,
        COUNT(*) as attempt_count,
        array_agg(phone) as phones,
        array_agg(id) as user_ids
      FROM auth.users 
      WHERE 
        phone IS NOT NULL
        AND created_at >= NOW() - INTERVAL '1 hour'  -- Rapid = within 1 hour
      GROUP BY SUBSTRING(phone FROM 1 FOR 6)
      HAVING COUNT(*) >= 5
      ORDER BY attempt_count DESC
      LIMIT ${Math.floor(limit/3)}
    `,
    // Users stuck in confirmation loop
    `
      SELECT 
        'confirmation_loop' as pattern_type,
        phone,
        id,
        created_at,
        updated_at,
        (updated_at - created_at) as time_stuck
      FROM auth.users 
      WHERE 
        phone IS NOT NULL
        AND phone_confirmed_at IS NULL
        AND created_at >= NOW() - INTERVAL '${timeWindow}'
        AND updated_at > created_at + INTERVAL '5 minutes'  -- Multiple attempts
        AND updated_at - created_at > INTERVAL '30 minutes'  -- Stuck for a while
      ORDER BY time_stuck DESC
      LIMIT ${Math.floor(limit/3)}
    `
  ]

  const results = []
  for (const query of queries) {
    const { data, error } = await supabase.rpc('execute_raw_sql', { query })
    results.push({ data, error })
  }
  
  return { results, description: 'Suspicious authentication patterns' }
}

// 7. Comprehensive Health Check
async function getComprehensiveHealthCheck(supabase: any, timeWindow: string) {
  const healthChecks = [
    // Overall auth health
    `
      SELECT 
        'overall_auth_health' as metric,
        COUNT(*) as total_registrations,
        COUNT(phone_confirmed_at) as confirmed_phones,
        COUNT(last_sign_in_at) as successful_signins,
        ROUND(100.0 * COUNT(phone_confirmed_at) / NULLIF(COUNT(*), 0), 2) as phone_confirmation_rate,
        ROUND(100.0 * COUNT(last_sign_in_at) / NULLIF(COUNT(*), 0), 2) as signin_success_rate
      FROM auth.users 
      WHERE created_at >= NOW() - INTERVAL '${timeWindow}'
        AND phone IS NOT NULL
    `,
    // Phone format distribution
    `
      SELECT 
        'phone_format_distribution' as metric,
        CASE 
          WHEN phone ~ '^\\+1[0-9]{10}$' THEN 'US/Canada (+1)'
          WHEN phone ~ '^\\+61[0-9]+' THEN 'Australia (+61)'
          WHEN phone ~ '^\\+64[0-9]+' THEN 'New Zealand (+64)'
          WHEN phone ~ '^\\+66[0-9]+' THEN 'Thailand (+66)'
          WHEN phone ~ '^\\+31[0-9]+' THEN 'Netherlands (+31)'
          WHEN phone ~ '^\\+[0-9]+' THEN 'Other international'
          WHEN phone ~ '^1[0-9]{10}$' THEN 'US/Canada (no +)'
          WHEN phone ~ '^[0-9]+$' THEN 'Numbers only'
          ELSE 'Unknown format'
        END as phone_format,
        COUNT(*) as count,
        COUNT(phone_confirmed_at) as confirmed,
        ROUND(100.0 * COUNT(phone_confirmed_at) / NULLIF(COUNT(*), 0), 2) as confirmation_rate
      FROM auth.users 
      WHERE created_at >= NOW() - INTERVAL '${timeWindow}'
        AND phone IS NOT NULL
      GROUP BY phone_format
      ORDER BY count DESC
    `,
    // Recent error patterns
    `
      SELECT 
        'recent_error_patterns' as metric,
        COUNT(*) as error_count,
        COUNT(DISTINCT metadata.phone) as affected_phones,
        array_agg(DISTINCT metadata.error) FILTER (WHERE metadata.error IS NOT NULL) as error_types
      FROM auth_logs
      CROSS JOIN unnest(metadata) as metadata
      WHERE 
        timestamp >= NOW() - INTERVAL '${timeWindow}'
        AND regexp_contains(event_message, 'error|fail|invalid|denied')
    `
  ]

  const results = []
  for (const query of healthChecks) {
    const { data, error } = await supabase.rpc('execute_raw_sql', { query })
    results.push({ data, error })
  }
  
  return { 
    results, 
    description: 'Comprehensive authentication system health check',
    recommendations: generateHealthRecommendations(results)
  }
}

function generateHealthRecommendations(healthResults: any[]) {
  const recommendations = []
  
  // Analyze overall health
  const overallHealth = healthResults[0]?.data?.[0]
  if (overallHealth) {
    if (overallHealth.phone_confirmation_rate < 70) {
      recommendations.push({
        priority: 'HIGH',
        issue: 'Low phone confirmation rate',
        recommendation: 'Investigate SMS delivery issues and phone format validation'
      })
    }
    
    if (overallHealth.signin_success_rate < 50) {
      recommendations.push({
        priority: 'CRITICAL',
        issue: 'Very low signin success rate',
        recommendation: 'Check auth webhook functionality and user experience flow'
      })
    }
  }
  
  // Analyze phone format distribution
  const phoneFormats = healthResults[1]?.data
  if (phoneFormats) {
    const unknownFormats = phoneFormats.filter((f: any) => f.phone_format === 'Unknown format')
    if (unknownFormats.length > 0 && unknownFormats[0].count > 5) {
      recommendations.push({
        priority: 'MEDIUM',
        issue: 'Users with unknown phone formats',
        recommendation: 'Update phone validation to handle new patterns'
      })
    }
  }
  
  return recommendations
}
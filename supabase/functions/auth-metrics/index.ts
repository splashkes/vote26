// Auth Metrics Prometheus Export
// Exports authentication metrics in Prometheus format for Grafana

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
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

    console.log('🔢 Generating Prometheus metrics...')

    // Generate metrics for different time windows
    const metrics = await generateAllMetrics(supabase)
    
    return new Response(metrics, {
      headers: {
        ...corsHeaders,
        'Content-Type': 'text/plain; charset=utf-8'
      }
    })

  } catch (error) {
    console.error('❌ Metrics export error:', error)
    return new Response(`# ERROR: ${error.message}`, {
      status: 500,
      headers: {
        ...corsHeaders,
        'Content-Type': 'text/plain; charset=utf-8'
      }
    })
  }
})

async function generateAllMetrics(supabase: any): Promise<string> {
  const timestamp = Math.floor(Date.now() / 1000)
  let metrics = ''
  
  // Helper function to add metric
  const addMetric = (name: string, help: string, type: string, values: Array<{labels: string, value: number, timestamp?: number}>) => {
    metrics += `# HELP ${name} ${help}\n`
    metrics += `# TYPE ${name} ${type}\n`
    for (const {labels, value, timestamp: customTimestamp} of values) {
      const ts = customTimestamp || timestamp
      metrics += `${name}{${labels}} ${value} ${ts}000\n`
    }
    metrics += '\n'
  }

  // 1. Time-scoped Counter Metrics (for rate calculations in Grafana)
  const timeScopes = [
    { period: '5min', minutes: 5 },
    { period: '1hour', minutes: 60 },
    { period: '6hour', minutes: 360 },
    { period: '24hour', minutes: 1440 },
    { period: '7days', minutes: 10080 }
  ]

  for (const scope of timeScopes) {
    const activityData = await supabase.rpc('get_auth_activity_summary', { minutes_back: scope.minutes })
    
    if (activityData.data) {
      const processed = processActivityDataDetailed(activityData.data, scope.period)
      
      // Successful logins by country and method
      addMetric(
        'auth_successful_logins_total',
        'Total successful authentication attempts',
        'counter',
        processed.successful_logins
      )
      
      // Failed attempts by country and error type
      addMetric(
        'auth_failed_attempts_total', 
        'Total failed authentication attempts',
        'counter',
        processed.failed_attempts
      )
      
      // OTP requests by country
      addMetric(
        'auth_otp_requests_total',
        'Total OTP requests sent', 
        'counter',
        processed.otp_requests
      )
      
      // SMS recovery requests
      addMetric(
        'auth_sms_recovery_total',
        'Total SMS recovery requests',
        'counter',
        processed.sms_recovery
      )
      
      // Email logins 
      addMetric(
        'auth_email_logins_total',
        'Total email-based logins',
        'counter',
        processed.email_logins
      )
    }
  }

  // 2. Historical Time Series Data (hourly buckets for the last week)
  const historicalMetrics = await generateHistoricalTimeSeries(supabase)
  metrics += historicalMetrics

  // 3. Auth Activity by Country (detailed breakdown)
  const countryMetrics = await generateDetailedCountryMetrics(supabase)
  metrics += countryMetrics

  // 4. Error Type Classification
  const errorMetrics = await generateErrorTypeMetrics(supabase)
  metrics += errorMetrics

  // 5. System Health and Performance
  const healthMetrics = await generateHealthMetrics(supabase)
  metrics += healthMetrics

  // 6. Success Rate Time Series
  const rateMetrics = await generateSuccessRateTimeSeries(supabase)
  metrics += rateMetrics

  return metrics
}

function processActivityDataDetailed(data: any[], period: string) {
  const result = {
    successful_logins: [] as Array<{labels: string, value: number}>,
    failed_attempts: [] as Array<{labels: string, value: number}>,
    otp_requests: [] as Array<{labels: string, value: number}>,
    sms_recovery: [] as Array<{labels: string, value: number}>,
    email_logins: [] as Array<{labels: string, value: number}>
  }

  for (const item of data) {
    const count = parseInt(item.count)
    const phones = item.phone_numbers || []
    
    if (item.activity_type === 'successful_logins') {
      const countryBreakdown = groupPhonesByCountry(phones)
      for (const [country, phoneList] of Object.entries(countryBreakdown)) {
        result.successful_logins.push({
          labels: `country="${country}",method="phone",period="${period}"`,
          value: phoneList.length
        })
      }
    }
    
    if (item.activity_type === 'otp_requests') {
      const countryBreakdown = groupPhonesByCountry(phones)
      for (const [country, phoneList] of Object.entries(countryBreakdown)) {
        result.otp_requests.push({
          labels: `country="${country}",method="sms",period="${period}"`,
          value: phoneList.length
        })
      }
    }
    
    if (item.activity_type === 'sms_recovery_requests') {
      const countryBreakdown = groupPhonesByCountry(phones)
      for (const [country, phoneList] of Object.entries(countryBreakdown)) {
        result.sms_recovery.push({
          labels: `country="${country}",method="sms_recovery",period="${period}"`,
          value: phoneList.length
        })
      }
    }
    
    if (item.activity_type === 'email_logins') {
      result.email_logins.push({
        labels: `method="email",period="${period}"`,
        value: count
      })
    }
  }

  // Calculate failed attempts by comparing OTP requests to successful logins
  const successfulByCountry = new Map()
  const requestsByCountry = new Map()
  
  result.successful_logins.forEach(item => {
    const countryMatch = item.labels.match(/country="([^"]+)"/)
    if (countryMatch) {
      successfulByCountry.set(countryMatch[1], item.value)
    }
  })
  
  result.otp_requests.forEach(item => {
    const countryMatch = item.labels.match(/country="([^"]+)"/)
    if (countryMatch) {
      requestsByCountry.set(countryMatch[1], item.value)
    }
  })
  
  for (const [country, requests] of requestsByCountry) {
    const successful = successfulByCountry.get(country) || 0
    const failed = requests - successful
    if (failed > 0) {
      result.failed_attempts.push({
        labels: `country="${country}",method="otp_timeout",period="${period}"`,
        value: failed
      })
    }
  }

  return result
}

async function generateHistoricalTimeSeries(supabase: any): Promise<string> {
  let metrics = ''
  
  // Get hourly data for the last week using the database function approach
  const weeklyBuckets = []
  const hoursBack = 7 * 24 // 7 days * 24 hours
  
  for (let i = 0; i < hoursBack; i++) {
    const endTime = i
    const startTime = i + 1
    
    const { data: hourData } = await supabase.rpc('get_auth_activity_summary', { 
      minutes_back: startTime * 60 // Convert hours to minutes
    })
    
    if (hourData) {
      const hourTimestamp = Math.floor((Date.now() - (endTime * 60 * 60 * 1000)) / 1000)
      
      let successful = 0
      let requests = 0
      let recovery = 0
      let email = 0
      
      for (const item of hourData) {
        const count = parseInt(item.count)
        switch (item.activity_type) {
          case 'successful_logins':
            successful = count
            break
          case 'otp_requests':
            requests = count
            break  
          case 'sms_recovery_requests':
            recovery = count
            break
          case 'email_logins':
            email = count
            break
        }
      }
      
      weeklyBuckets.push({
        timestamp: hourTimestamp,
        successful,
        requests,
        recovery,
        email,
        failed: Math.max(0, requests - successful)
      })
    }
    
    // Only sample every few hours to avoid too many database calls
    if (i % 3 !== 0) continue
  }
  
  // Output time series data
  metrics += '# HELP auth_hourly_successful_logins Successful logins per hour (time series)\n'
  metrics += '# TYPE auth_hourly_successful_logins gauge\n'
  
  metrics += '# HELP auth_hourly_failed_attempts Failed attempts per hour (time series)\n' 
  metrics += '# TYPE auth_hourly_failed_attempts gauge\n'
  
  metrics += '# HELP auth_hourly_otp_requests OTP requests per hour (time series)\n'
  metrics += '# TYPE auth_hourly_otp_requests gauge\n'
  
  for (const bucket of weeklyBuckets) {
    metrics += `auth_hourly_successful_logins{method="phone"} ${bucket.successful} ${bucket.timestamp}000\n`
    metrics += `auth_hourly_successful_logins{method="email"} ${bucket.email} ${bucket.timestamp}000\n`
    
    if (bucket.failed > 0) {
      metrics += `auth_hourly_failed_attempts{method="otp_timeout"} ${bucket.failed} ${bucket.timestamp}000\n`
    }
    
    metrics += `auth_hourly_otp_requests{method="sms"} ${bucket.requests} ${bucket.timestamp}000\n`
  }
  
  metrics += '\n'
  return metrics
}

async function generateDetailedCountryMetrics(supabase: any): Promise<string> {
  let metrics = ''
  
  // Get detailed country breakdown for the last 7 days
  const { data: countryData } = await supabase.rpc('get_auth_activity_summary', { minutes_back: 10080 }) // 7 days
  
  if (countryData) {
    const countryStats = new Map()
    
    // Process all activity types by country
    for (const item of countryData) {
      if (item.phone_numbers) {
        const countryBreakdown = groupPhonesByCountry(item.phone_numbers)
        
        for (const [country, phones] of Object.entries(countryBreakdown)) {
          if (!countryStats.has(country)) {
            countryStats.set(country, {
              successful: 0,
              requests: 0,
              recovery: 0
            })
          }
          
          const stats = countryStats.get(country)
          
          switch (item.activity_type) {
            case 'successful_logins':
              stats.successful = phones.length
              break
            case 'otp_requests':
              stats.requests = phones.length
              break
            case 'sms_recovery_requests':
              stats.recovery = phones.length
              break
          }
        }
      }
    }
    
    metrics += '# HELP auth_country_success_rate_7days Authentication success rate by country (7 days)\n'
    metrics += '# TYPE auth_country_success_rate_7days gauge\n'
    
    metrics += '# HELP auth_country_total_attempts_7days Total authentication attempts by country (7 days)\n'
    metrics += '# TYPE auth_country_total_attempts_7days gauge\n'
    
    const timestamp = Math.floor(Date.now() / 1000)
    
    for (const [country, stats] of countryStats) {
      const successRate = stats.requests > 0 ? (stats.successful / stats.requests) * 100 : 0
      const totalAttempts = stats.requests
      
      metrics += `auth_country_success_rate_7days{country="${country}"} ${successRate.toFixed(2)} ${timestamp}000\n`
      metrics += `auth_country_total_attempts_7days{country="${country}"} ${totalAttempts} ${timestamp}000\n`
    }
  }
  
  metrics += '\n'
  return metrics
}

async function generateErrorTypeMetrics(supabase: any): Promise<string> {
  let metrics = ''
  const timestamp = Math.floor(Date.now() / 1000)
  
  // Since we don't have explicit error types in audit_log_entries, 
  // we'll classify based on patterns we can infer
  const { data: recentActivity } = await supabase.rpc('get_auth_activity_summary', { minutes_back: 1440 }) // 24h
  
  if (recentActivity) {
    let otpTimeouts = 0
    
    for (const item of recentActivity) {
      if (item.activity_type === 'otp_requests') {
        const requests = parseInt(item.count)
        const successful = recentActivity.find(r => r.activity_type === 'successful_logins')
        const successCount = successful ? parseInt(successful.count) : 0
        otpTimeouts = Math.max(0, requests - successCount)
      }
    }
    
    metrics += '# HELP auth_error_types_24h Authentication error types in last 24 hours\n'
    metrics += '# TYPE auth_error_types_24h gauge\n'
    
    if (otpTimeouts > 0) {
      metrics += `auth_error_types_24h{error_type="otp_timeout_or_invalid"} ${otpTimeouts} ${timestamp}000\n`
    }
    
    metrics += `auth_error_types_24h{error_type="phone_format_invalid"} 0 ${timestamp}000\n`
    metrics += `auth_error_types_24h{error_type="unknown"} 0 ${timestamp}000\n`
  }
  
  metrics += '\n'
  return metrics
}

async function generateSuccessRateTimeSeries(supabase: any): Promise<string> {
  let metrics = ''
  
  // Generate success rate time series for different periods
  const periods = [
    { name: '5min', minutes: 5 },
    { name: '1hour', minutes: 60 },  
    { name: '6hour', minutes: 360 },
    { name: '24hour', minutes: 1440 },
    { name: '7days', minutes: 10080 }
  ]
  
  metrics += '# HELP auth_success_rate Authentication success rate by time period\n'
  metrics += '# TYPE auth_success_rate gauge\n'
  
  const timestamp = Math.floor(Date.now() / 1000)
  
  for (const period of periods) {
    const { data } = await supabase.rpc('get_auth_activity_summary', { minutes_back: period.minutes })
    
    if (data) {
      let totalRequests = 0
      let totalSuccessful = 0
      
      for (const item of data) {
        if (item.activity_type === 'otp_requests') {
          totalRequests = parseInt(item.count)
        }
        if (item.activity_type === 'successful_logins') {
          totalSuccessful = parseInt(item.count)
        }
      }
      
      const successRate = totalRequests > 0 ? (totalSuccessful / totalRequests) * 100 : 100
      metrics += `auth_success_rate{period="${period.name}"} ${successRate.toFixed(2)} ${timestamp}000\n`
    }
  }
  
  metrics += '\n'
  return metrics
}

function processActivityData(data: any[]) {
  const result = {
    successful_logins: [] as Array<{labels: string, value: number}>,
    failed_attempts: [] as Array<{labels: string, value: number}>,
    otp_requests: [] as Array<{labels: string, value: number}>,
    success_rates: [] as Array<{labels: string, value: number}>
  }

  let totalSuccessful = 0
  let totalOtpRequests = 0
  let totalFailed = 0

  for (const item of data) {
    const count = parseInt(item.count)
    
    if (item.activity_type === 'successful_logins') {
      const countryBreakdown = groupPhonesByCountry(item.phone_numbers || [])
      for (const [country, phones] of Object.entries(countryBreakdown)) {
        result.successful_logins.push({
          labels: `country="${country}"`,
          value: phones.length
        })
      }
      totalSuccessful = count
    }
    
    if (item.activity_type === 'otp_requests') {
      const countryBreakdown = groupPhonesByCountry(item.phone_numbers || [])
      for (const [country, phones] of Object.entries(countryBreakdown)) {
        result.otp_requests.push({
          labels: `country="${country}"`,
          value: phones.length
        })
      }
      totalOtpRequests = count
    }
  }

  // Calculate failed attempts (OTP requests - successful logins)
  totalFailed = totalOtpRequests - totalSuccessful
  if (totalFailed > 0) {
    result.failed_attempts.push({
      labels: 'method="otp"',
      value: totalFailed
    })
  }

  // Calculate success rate
  if (totalOtpRequests > 0) {
    const successRate = (totalSuccessful / totalOtpRequests) * 100
    result.success_rates.push({
      labels: 'method="phone"',
      value: Math.round(successRate * 100) / 100 // Round to 2 decimal places
    })
  }

  return result
}

function groupPhonesByCountry(phones: string[]): { [key: string]: string[] } {
  const groups: { [key: string]: string[] } = {}
  
  for (const phone of phones) {
    let country = 'unknown'
    
    if (phone.match(/^(\+1|1)[0-9]{10}$/)) {
      country = 'us_canada'
    } else if (phone.startsWith('61') || phone.startsWith('+61')) {
      country = 'australia'
    } else if (phone.startsWith('64') || phone.startsWith('+64')) {
      country = 'new_zealand'  
    } else if (phone.startsWith('66') || phone.startsWith('+66')) {
      country = 'thailand'
    } else if (phone.startsWith('31') || phone.startsWith('+31')) {
      country = 'netherlands'
    } else if (phone.startsWith('+')) {
      country = 'international'
    } else {
      country = 'other'
    }
    
    if (!groups[country]) {
      groups[country] = []
    }
    groups[country].push(phone)
  }
  
  return groups
}

async function generateCountryMetrics(supabase: any): Promise<string> {
  let metrics = ''
  const timestamp = Math.floor(Date.now() / 1000)
  
  // Get 24-hour activity by country
  const { data: activity24h } = await supabase.rpc('get_auth_activity_summary', { minutes_back: 1440 })
  
  if (activity24h) {
    const countryCounts: { [key: string]: { successful: number, failed: number, total: number } } = {}
    
    // Process successful logins by country
    for (const item of activity24h) {
      if (item.activity_type === 'successful_logins' && item.phone_numbers) {
        const countryGroups = groupPhonesByCountry(item.phone_numbers)
        for (const [country, phones] of Object.entries(countryGroups)) {
          if (!countryCounts[country]) countryCounts[country] = { successful: 0, failed: 0, total: 0 }
          countryCounts[country].successful = phones.length
        }
      }
      
      if (item.activity_type === 'otp_requests' && item.phone_numbers) {
        const countryGroups = groupPhonesByCountry(item.phone_numbers)
        for (const [country, phones] of Object.entries(countryGroups)) {
          if (!countryCounts[country]) countryCounts[country] = { successful: 0, failed: 0, total: 0 }
          countryCounts[country].total = phones.length
        }
      }
    }
    
    // Calculate failed attempts per country
    metrics += '# HELP auth_country_success_rate Authentication success rate by country (24h)\n'
    metrics += '# TYPE auth_country_success_rate gauge\n'
    
    metrics += '# HELP auth_country_failed_attempts Failed authentication attempts by country (24h)\n' 
    metrics += '# TYPE auth_country_failed_attempts gauge\n'
    
    for (const [country, counts] of Object.entries(countryCounts)) {
      const failed = counts.total - counts.successful
      const successRate = counts.total > 0 ? (counts.successful / counts.total) * 100 : 0
      
      metrics += `auth_country_success_rate{country="${country}"} ${successRate.toFixed(2)} ${timestamp}000\n`
      metrics += `auth_country_failed_attempts{country="${country}"} ${failed} ${timestamp}000\n`
    }
    
    metrics += '\n'
  }
  
  return metrics
}

async function generateHealthMetrics(supabase: any): Promise<string> {
  let metrics = ''
  const timestamp = Math.floor(Date.now() / 1000)
  
  // Overall system health score (0-100)
  const { data: recent } = await supabase.rpc('get_auth_activity_summary', { minutes_back: 60 })
  
  let healthScore = 100
  let totalRequests = 0
  let totalSuccessful = 0
  
  if (recent) {
    for (const item of recent) {
      if (item.activity_type === 'otp_requests') {
        totalRequests = parseInt(item.count)
      }
      if (item.activity_type === 'successful_logins') {
        totalSuccessful = parseInt(item.count)
      }
    }
    
    if (totalRequests > 0) {
      healthScore = (totalSuccessful / totalRequests) * 100
    }
  }
  
  metrics += '# HELP auth_system_health_score Overall authentication system health score (0-100)\n'
  metrics += '# TYPE auth_system_health_score gauge\n'
  metrics += `auth_system_health_score{component="authentication"} ${healthScore.toFixed(2)} ${timestamp}000\n\n`
  
  // Uptime metric (always 1 if this function is responding)
  metrics += '# HELP auth_metrics_up Metrics endpoint availability\n'
  metrics += '# TYPE auth_metrics_up gauge\n'
  metrics += `auth_metrics_up{service="auth-metrics"} 1 ${timestamp}000\n\n`
  
  return metrics
}

async function generateErrorMetrics(supabase: any): Promise<string> {
  let metrics = ''
  const timestamp = Math.floor(Date.now() / 1000)
  
  // Get recent activity to calculate error rates
  const { data: recent5min } = await supabase.rpc('get_auth_activity_summary', { minutes_back: 5 })
  const { data: recent1hour } = await supabase.rpc('get_auth_activity_summary', { minutes_back: 60 })
  
  // Calculate error rates for different time windows
  const calculateErrorRate = (data: any[]) => {
    let requests = 0
    let successful = 0
    
    for (const item of data || []) {
      if (item.activity_type === 'otp_requests') requests = parseInt(item.count)
      if (item.activity_type === 'successful_logins') successful = parseInt(item.count)
    }
    
    return requests > 0 ? ((requests - successful) / requests) * 100 : 0
  }
  
  const errorRate5min = calculateErrorRate(recent5min)
  const errorRate1hour = calculateErrorRate(recent1hour)
  
  metrics += '# HELP auth_error_rate Authentication error rate percentage\n'
  metrics += '# TYPE auth_error_rate gauge\n'
  metrics += `auth_error_rate{timeframe="5min"} ${errorRate5min.toFixed(2)} ${timestamp}000\n`
  metrics += `auth_error_rate{timeframe="1hour"} ${errorRate1hour.toFixed(2)} ${timestamp}000\n\n`
  
  return metrics
}
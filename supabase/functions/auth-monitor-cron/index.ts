// Auth Monitor Cron Job
// Runs every 5 minutes to monitor auth issues and successes
// Posts to #profile-debug in Slack only when there's activity

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

    console.log('🔍 Auth Monitor Cron: Starting 5-minute check...')

    // Check activity in the last 5 minutes
    const results = await checkAuthActivity(supabase)
    
    // Only post to Slack if there's activity (successes OR failures)
    if (results.hasActivity) {
      await postToSlack(supabase, results)
      console.log('✅ Posted auth activity to Slack')
    } else {
      console.log('⏸️ No auth activity in last 5 minutes, skipping Slack notification')
    }

    return new Response(JSON.stringify({
      success: true,
      timestamp: new Date().toISOString(),
      activity_detected: results.hasActivity,
      summary: results.summary
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (error) {
    console.error('❌ Auth Monitor Cron Error:', error)
    
    // Post error to Slack
    try {
      const supabase = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
      )
      
      await supabase.rpc('queue_slack_notification', {
        channel: 'profile-debug',
        notification_type: 'auth_monitor_error',
        message: `🚨 Auth Monitor Cron Error\nError: ${error.message}\nTime: ${new Date().toISOString()}`
      })
    } catch (slackError) {
      console.error('Failed to post error to Slack:', slackError)
    }

    return new Response(JSON.stringify({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})

async function checkAuthActivity(supabase: any) {
  const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString()
  
  // Get comprehensive auth activity analysis using the new function
  const { data: authActivity, error: activityError } = await supabase.rpc('get_auth_activity_summary', {
    minutes_back: 5
  })
  
  if (activityError) {
    console.error('Error checking auth activity:', activityError)
    return {
      hasActivity: false,
      summary: { successful_logins: 0, failed_attempts: 0, otp_requests: 0, sms_recovery_requests: 0, email_logins: 0, total_activity: 0 },
      authActivity: []
    }
  }

  // Process the results into a more usable format
  const activityMap = new Map()
  authActivity?.forEach((item: any) => {
    activityMap.set(item.activity_type, {
      count: parseInt(item.count),
      phones: item.phone_numbers || []
    })
  })

  const successfulLogins = activityMap.get('successful_logins') || { count: 0, phones: [] }
  const otpRequests = activityMap.get('otp_requests') || { count: 0, phones: [] }  
  const smsRecovery = activityMap.get('sms_recovery_requests') || { count: 0, phones: [] }
  const emailLogins = activityMap.get('email_logins') || { count: 0, phones: [] }

  // Calculate failed attempts: OTP requests that didn't result in successful logins
  const failedOtpPhones = otpRequests.phones.filter((phone: string) => 
    !successfulLogins.phones.includes(phone)
  )
  const failedAttempts = { count: failedOtpPhones.length, phones: failedOtpPhones }

  const totalActivity = successfulLogins.count + failedAttempts.count + smsRecovery.count + emailLogins.count
  const hasActivity = totalActivity > 0

  // Generate summary for logging  
  const summary = {
    successful_logins: successfulLogins.count,
    failed_attempts: failedAttempts.count,
    otp_requests: otpRequests.count,
    sms_recovery_requests: smsRecovery.count, 
    email_logins: emailLogins.count,
    total_activity: totalActivity
  }

  return {
    hasActivity,
    summary,
    successfulLogins,
    failedAttempts,
    otpRequests,
    smsRecovery,
    emailLogins
  }
}

async function postToSlack(supabase: any, results: any) {
  const { 
    summary, 
    successfulLogins,
    failedAttempts, 
    otpRequests,
    smsRecovery,
    emailLogins
  } = results
  
  // Build Slack message
  let message = `🔐 **Auth Activity Report** (Last 5 minutes)\n`
  message += `Time: ${new Date().toISOString()}\n\n`

  // Success section
  if (summary.successful_logins > 0) {
    message += `✅ **${summary.successful_logins} Successful Phone Login${summary.successful_logins > 1 ? 's' : ''}**\n`
    
    // Group by country code for summary
    const countryGroups = groupPhonesByCountry(successfulLogins.phones)
    for (const [country, phones] of Object.entries(countryGroups)) {
      message += `   ${country}: ${phones.length}\n`
    }
    message += '\n'
  }

  // Email logins
  if (summary.email_logins > 0) {
    message += `📧 **${summary.email_logins} Email Login${summary.email_logins > 1 ? 's' : ''}**\n`
    message += `   👤 Admin/Staff accounts\n\n`
  }

  // Failed OTP attempts section  
  if (summary.failed_attempts > 0) {
    message += `❌ **${summary.failed_attempts} Failed OTP Attempt${summary.failed_attempts > 1 ? 's' : ''}**\n`
    
    // Group failed attempts by country
    const failedCountryGroups = groupPhonesByCountry(failedAttempts.phones)
    for (const [country, phones] of Object.entries(failedCountryGroups)) {
      message += `   ${country}: ${phones.length} (${phones.slice(0, 2).map(maskPhone).join(', ')}${phones.length > 2 ? '...' : ''})\n`
    }
    message += '\n'
  }

  // SMS Recovery requests
  if (summary.sms_recovery_requests > 0) {
    message += `🔄 **${summary.sms_recovery_requests} SMS Recovery Request${summary.sms_recovery_requests > 1 ? 's' : ''}**\n\n`
  }

  // Overall OTP success rate
  if (summary.otp_requests > 0) {
    const otpSuccessRate = (summary.successful_logins / summary.otp_requests) * 100
    if (otpSuccessRate >= 80) {
      message += `💚 OTP Success Rate: ${otpSuccessRate.toFixed(1)}% (Healthy)\n`
    } else if (otpSuccessRate >= 60) {
      message += `💛 OTP Success Rate: ${otpSuccessRate.toFixed(1)}% (Concerning)\n`
    } else {
      message += `❤️ OTP Success Rate: ${otpSuccessRate.toFixed(1)}% (Critical)\n`
    }
    
    message += `📊 Total OTP Requests: ${summary.otp_requests} | Successful: ${summary.successful_logins}`
  }

  // Post to Slack
  await supabase.rpc('queue_slack_notification', {
    channel: 'profile-debug',
    notification_type: 'auth_monitor_report',
    message: message
  })
}

function groupPhonesByCountry(phones: string[]) {
  const groups: { [key: string]: string[] } = {}
  
  for (const phone of phones) {
    let country = 'Unknown'
    
    if (phone.match(/^(\+1|1)[0-9]{10}$/)) {
      country = '🇺🇸🇨🇦 US/Canada'
    } else if (phone.startsWith('61') || phone.startsWith('+61')) {
      country = '🇦🇺 Australia'
    } else if (phone.startsWith('64') || phone.startsWith('+64')) {
      country = '🇳🇿 New Zealand'  
    } else if (phone.startsWith('66') || phone.startsWith('+66')) {
      country = '🇹🇭 Thailand'
    } else if (phone.startsWith('31') || phone.startsWith('+31')) {
      country = '🇳🇱 Netherlands'
    } else if (phone.startsWith('+')) {
      country = '🌍 International'
    } else {
      country = '📱 Other'
    }
    
    if (!groups[country]) {
      groups[country] = []
    }
    groups[country].push(phone)
  }
  
  return groups
}

function maskPhone(phone: string): string {
  if (!phone) return 'Unknown'
  if (phone.length <= 4) return phone
  
  // Show first 3 and last 3 characters, mask middle
  const start = phone.substring(0, 3)
  const end = phone.substring(phone.length - 3)
  const middle = '*'.repeat(Math.max(0, phone.length - 6))
  
  return `${start}${middle}${end}`
}

function getTimeAgo(timestamp: string): string {
  const now = new Date()
  const time = new Date(timestamp)
  const diffMs = now.getTime() - time.getTime()
  const diffMins = Math.floor(diffMs / (1000 * 60))
  
  if (diffMins < 1) return 'now'
  if (diffMins < 60) return `${diffMins}m ago`
  
  const diffHours = Math.floor(diffMins / 60)
  return `${diffHours}h ${diffMins % 60}m ago`
}
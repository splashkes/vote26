import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

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
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Get Twilio credentials
    const twilioAccountSid = Deno.env.get('TWILIO_ACCOUNT_SID');
    const twilioAuthToken = Deno.env.get('TWILIO_AUTH_TOKEN');
    
    if (!twilioAccountSid || !twilioAuthToken) {
      return new Response(JSON.stringify({ 
        error: 'Twilio credentials not configured' 
      }), { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      })
    }

    const url = new URL(req.url)
    const mode = url.searchParams.get('mode') || 'analyze' // analyze, fix, or test
    const limit = parseInt(url.searchParams.get('limit') || '50')
    const eventId = url.searchParams.get('event_id')

    let whereClause = ''
    if (eventId) {
      whereClause = `AND EXISTS (
        SELECT 1 FROM bids b 
        JOIN art a ON b.art_id = a.id 
        WHERE b.auth_phone = auth.users.phone 
        AND a.event_id = '${eventId}'
      )`
    }

    // Get problematic phone numbers from auth.users
    const { data: users, error: usersError } = await supabase.rpc('get_problematic_phones', {
      p_limit: limit,
      p_where_clause: whereClause
    })

    if (usersError) {
      console.log('Error getting users, falling back to direct query:', usersError)
      
      // Fallback: direct query for suspicious patterns
      const { data: fallbackUsers, error: fallbackError } = await supabase
        .from('auth.users')
        .select('id, phone')
        .not('phone', 'is', null)
        .or(`phone.like.+161%,phone.like.020%,phone.like.+1614%`)
        .limit(limit)
      
      if (fallbackError) {
        throw new Error(`Failed to get users: ${fallbackError.message}`)
      }
      
      // Convert to expected format
      users = fallbackUsers?.map(user => ({
        user_id: user.id,
        phone: user.phone,
        issue_type: user.phone.startsWith('+161') ? 'doubled_country_code' : 
                   user.phone.startsWith('020') ? 'missing_country_code' : 'other'
      })) || []
    }

    console.log(`Found ${users?.length || 0} problematic phone numbers`)

    const results = {
      mode,
      total_found: users?.length || 0,
      processed: 0,
      fixed: 0,
      errors: 0,
      details: [] as any[]
    }

    // Process each phone number
    for (const user of users || []) {
      try {
        results.processed++
        
        const originalPhone = user.phone
        let testPhone = originalPhone

        // Apply common fixes based on patterns
        if (originalPhone.startsWith('+161') && originalPhone.length > 13) {
          // Australian numbers with doubled country code: +161 -> +61
          testPhone = '+61' + originalPhone.substring(4)
        } else if (originalPhone.startsWith('020') && originalPhone.length >= 10) {
          // UK numbers missing country code: 020 -> +44 20
          testPhone = '+44' + originalPhone.substring(1)  // Remove leading 0, add +44
        } else if (originalPhone.match(/^\+1614\d{7}$/)) {
          // US/Canada numbers with area code duplication: +1614 -> +1
          testPhone = '+1' + originalPhone.substring(5)
        }

        // Validate with Twilio
        const twilioResult = await validateWithTwilio(testPhone, twilioAccountSid, twilioAuthToken)
        
        const detail = {
          user_id: user.user_id,
          original_phone: originalPhone,
          suggested_phone: testPhone,
          twilio_result: twilioResult,
          issue_type: user.issue_type,
          action_taken: 'none'
        }

        // If mode is 'fix' and Twilio validates the corrected number, update it
        if (mode === 'fix' && twilioResult.valid && testPhone !== originalPhone) {
          const { error: updateError } = await supabase.auth.admin.updateUserById(
            user.user_id,
            { phone: testPhone }
          )
          
          if (updateError) {
            detail.action_taken = 'failed'
            detail.error = updateError.message
            results.errors++
          } else {
            detail.action_taken = 'updated'
            results.fixed++
          }
        }

        results.details.push(detail)
        
      } catch (error) {
        console.error(`Error processing user ${user.user_id}:`, error)
        results.errors++
        results.details.push({
          user_id: user.user_id,
          original_phone: user.phone,
          error: error.message,
          action_taken: 'error'
        })
      }
    }

    // Summary report
    let summary = `Phone Number Cleanup Report (${mode.toUpperCase()} mode)\n`
    summary += `=====================================\n\n`
    summary += `Total problematic numbers found: ${results.total_found}\n`
    summary += `Numbers processed: ${results.processed}\n`
    summary += `Numbers fixed: ${results.fixed}\n`
    summary += `Errors encountered: ${results.errors}\n\n`

    if (mode === 'analyze') {
      summary += `Run with ?mode=fix to apply corrections\n\n`
    }

    summary += `Detailed Results:\n`
    summary += `-----------------\n\n`

    results.details.forEach((detail, index) => {
      summary += `${index + 1}. User: ${detail.user_id}\n`
      summary += `   Original: ${detail.original_phone}\n`
      summary += `   Suggested: ${detail.suggested_phone}\n`
      summary += `   Twilio Valid: ${detail.twilio_result?.valid ? 'YES' : 'NO'}\n`
      summary += `   Twilio Format: ${detail.twilio_result?.phoneNumber || 'N/A'}\n`
      summary += `   Issue: ${detail.issue_type}\n`
      summary += `   Action: ${detail.action_taken}\n`
      if (detail.error) {
        summary += `   Error: ${detail.error}\n`
      }
      summary += `\n`
    })

    return new Response(summary, {
      headers: {
        ...corsHeaders,
        'Content-Type': 'text/plain'
      }
    })

  } catch (error) {
    console.error('Cleanup error:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})

// Helper function to validate phone with Twilio
async function validateWithTwilio(phoneNumber: string, accountSid: string, authToken: string) {
  try {
    const url = `https://lookups.twilio.com/v2/PhoneNumbers/${encodeURIComponent(phoneNumber)}`
    const params = new URLSearchParams({
      Fields: 'line_type_intelligence'
    })
    
    const response = await fetch(`${url}?${params}`, {
      method: 'GET',
      headers: {
        'Authorization': `Basic ${btoa(`${accountSid}:${authToken}`)}`,
        'Accept': 'application/json'
      }
    })

    if (!response.ok) {
      const errorText = await response.text()
      return {
        valid: false,
        error: `Twilio API error: ${response.status} - ${errorText}`
      }
    }

    const data = await response.json()
    return {
      valid: data.valid || false,
      phoneNumber: data.phone_number || phoneNumber,
      nationalFormat: data.national_format,
      countryCode: data.country_code,
      carrierName: data.line_type_intelligence?.carrier_name,
      lineType: data.line_type_intelligence?.type
    }
  } catch (error) {
    return {
      valid: false,
      error: error.message
    }
  }
}
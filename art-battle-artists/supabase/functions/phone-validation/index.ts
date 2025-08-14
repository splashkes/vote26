import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { corsHeaders } from '../_shared/cors.ts'

serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { phoneNumber, countryCode } = await req.json()

    if (!phoneNumber) {
      return new Response(
        JSON.stringify({ error: 'Phone number is required' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }

    // Get Twilio credentials from environment
    const twilioAccountSid = Deno.env.get('TWILIO_ACCOUNT_SID')
    const twilioAuthToken = Deno.env.get('TWILIO_AUTH_TOKEN')

    if (!twilioAccountSid || !twilioAuthToken) {
      // Fallback to basic validation if Twilio not configured
      return new Response(
        JSON.stringify({ 
          valid: phoneNumber.length >= 10,
          phoneNumber: phoneNumber,
          source: 'basic',
          confidence: 'low'
        }),
        { 
          status: 200, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }

    // Call Twilio Lookup API v2
    const url = `https://lookups.twilio.com/v2/PhoneNumbers/${encodeURIComponent(phoneNumber)}`
    const params = new URLSearchParams({
      Fields: 'line_type_intelligence'  // Removed 'validation' field that was causing issues
    })
    
    if (countryCode) {
      params.append('CountryCode', countryCode.toUpperCase())
    }

    console.log('🔍 Calling Twilio with:', { url: `${url}?${params}`, phoneNumber, countryCode })
    
    const response = await fetch(`${url}?${params}`, {
      method: 'GET',
      headers: {
        'Authorization': `Basic ${btoa(`${twilioAccountSid}:${twilioAuthToken}`)}`,
        'Accept': 'application/json'
      }
    })

    console.log('📞 Twilio response status:', response.status)

    if (!response.ok) {
      const errorText = await response.text()
      console.log('❌ Twilio error response:', errorText)
      throw new Error(`Twilio API error: ${response.status} - ${errorText}`)
    }

    const data = await response.json()
    console.log('📞 Raw Twilio response:', JSON.stringify(data, null, 2))

    // Format response - use Twilio's top-level 'valid' field
    const result = {
      valid: data.valid || false,  // Use top-level valid field from Twilio
      phoneNumber: data.phone_number || phoneNumber,
      nationalFormat: data.national_format,
      countryCode: data.country_code,
      carrierName: data.line_type_intelligence?.carrier_name,
      lineType: data.line_type_intelligence?.type,
      isMobile: data.line_type_intelligence?.type === 'mobile',
      validationErrors: [], // No validation field anymore
      source: 'twilio',
      confidence: 'high'
    }

    return new Response(
      JSON.stringify(result),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )

  } catch (error) {
    console.error('Phone validation error:', error)
    
    return new Response(
      JSON.stringify({ 
        error: 'Phone validation failed',
        details: error.message 
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )
  }
})
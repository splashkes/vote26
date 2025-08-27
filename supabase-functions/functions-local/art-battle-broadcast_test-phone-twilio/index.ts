import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const url = new URL(req.url)
    const phoneNumber = url.searchParams.get('phone')
    const country = url.searchParams.get('country')

    if (!phoneNumber) {
      return new Response('Missing phone parameter', { 
        status: 400, 
        headers: { ...corsHeaders, 'Content-Type': 'text/plain' } 
      })
    }

    // Get Twilio credentials
    const twilioAccountSid = Deno.env.get('TWILIO_ACCOUNT_SID');
    const twilioAuthToken = Deno.env.get('TWILIO_AUTH_TOKEN');
    
    if (!twilioAccountSid || !twilioAuthToken) {
      return new Response('Twilio not configured', { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'text/plain' } 
      })
    }

    // Call Twilio
    const twilioUrl = `https://lookups.twilio.com/v2/PhoneNumbers/${encodeURIComponent(phoneNumber)}`
    const params = new URLSearchParams({ Fields: 'line_type_intelligence' })
    if (country) {
      params.append('CountryCode', country.toUpperCase())
    }

    const response = await fetch(`${twilioUrl}?${params}`, {
      method: 'GET',
      headers: {
        'Authorization': `Basic ${btoa(`${twilioAccountSid}:${twilioAuthToken}`)}`,
        'Accept': 'application/json'
      }
    })

    const data = await response.json()

    let result = `Phone Number Test Results\n`
    result += `========================\n\n`
    result += `Input Phone: ${phoneNumber}\n`
    result += `Input Country: ${country || 'none'}\n`
    result += `Twilio Status: ${response.status}\n\n`

    if (response.ok) {
      result += `Twilio Results:\n`
      result += `- Valid: ${data.valid}\n`
      result += `- Phone Number: ${data.phone_number}\n`
      result += `- National Format: ${data.national_format}\n`
      result += `- Country Code: ${data.country_code}\n`
      result += `- Carrier: ${data.line_type_intelligence?.carrier_name || 'unknown'}\n`
      result += `- Line Type: ${data.line_type_intelligence?.type || 'unknown'}\n`
    } else {
      result += `Twilio Error: ${JSON.stringify(data, null, 2)}\n`
    }

    return new Response(result, {
      headers: { ...corsHeaders, 'Content-Type': 'text/plain' }
    })

  } catch (error) {
    return new Response(`Error: ${error.message}`, { 
      status: 500, 
      headers: { ...corsHeaders, 'Content-Type': 'text/plain' } 
    })
  }
})
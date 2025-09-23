import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { to, from, body, messageId } = await req.json()

    // Get Twilio credentials from environment
    const TWILIO_ACCOUNT_SID = Deno.env.get('TWILIO_ACCOUNT_SID')
    const TWILIO_AUTH_TOKEN = Deno.env.get('TWILIO_AUTH_TOKEN')
    const TWILIO_FROM_NUMBER = Deno.env.get('TWILIO_FROM_NUMBER')

    if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN) {
      throw new Error('Twilio credentials not configured')
    }

    // Use provided from number or default
    const fromNumber = from || TWILIO_FROM_NUMBER

    if (!fromNumber) {
      throw new Error('No from phone number provided')
    }

    // Ensure phone number is in E.164 format
    const formatPhoneNumber = (phone: string): string => {
      // If already properly formatted with +, return as-is
      if (phone.startsWith('+') && phone.length >= 10) {
        return phone
      }

      // Remove all non-numeric characters
      const cleaned = phone.replace(/\D/g, '')

      // Handle 10-digit numbers - check area codes to determine country
      if (cleaned.length === 10) {
        const areaCode = cleaned.substring(0, 3)

        // Dominican Republic area codes (829, 809, 849)
        if (['829', '809', '849'].includes(areaCode)) {
          return `+1${cleaned}` // Dominican Republic uses +1 but different validation rules
        }
        // US/Canada area codes (assume everything else for now)
        else {
          return `+1${cleaned}`
        }
      }
      // Handle 11-digit numbers starting with 1
      else if (cleaned.length === 11 && cleaned.startsWith('1')) {
        return `+${cleaned}`
      }
      // Default: assume it's international and add +
      else {
        return `+${cleaned}`
      }
    }

    const toFormatted = formatPhoneNumber(to)

    // Log phone number formatting for debugging
    console.log('SMS Debug:', {
      original: to,
      formatted: toFormatted,
      bodyLength: body.length
    })

    // Create Twilio API request
    const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`
    
    const authHeader = btoa(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`)
    
    const formData = new URLSearchParams({
      To: toFormatted,
      From: fromNumber,
      Body: body,
    })

    const twilioResponse = await fetch(twilioUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${authHeader}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: formData.toString(),
    })

    const twilioData = await twilioResponse.json()

    if (!twilioResponse.ok) {
      console.error('Twilio error:', twilioData)

      // Handle specific Twilio errors
      if (twilioData.code === 21408) {
        throw new Error(`SMS not enabled for this region (${toFormatted}). Contact Twilio support to enable messaging for this destination.`)
      }

      throw new Error(twilioData.message || 'Failed to send SMS')
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        sid: twilioData.sid,
        messageId: messageId,
        to: twilioData.to,
        status: twilioData.status
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    )

  } catch (error) {
    console.error('Error in send-sms function:', error)
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error.message,
        details: error.toString()
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400
      }
    )
  }
})
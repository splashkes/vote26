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
      return new Response('Twilio not configured', { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'text/plain' } 
      })
    }

    const url = new URL(req.url)
    const eventEid = url.pathname.split('/').pop() // Get EID from URL path

    if (!eventEid) {
      return new Response('Event EID required in URL path', { 
        status: 400, 
        headers: { ...corsHeaders, 'Content-Type': 'text/plain' } 
      })
    }

    // Get event info
    const { data: event, error: eventError } = await supabase
      .from('events')
      .select('id, eid, name')
      .eq('eid', eventEid)
      .single()

    if (eventError) {
      throw new Error(`Event not found: ${eventError.message}`)
    }

    // Hardcode country for known events for now
    const countryCode = eventEid.includes('AB2995') ? 'AU' : 'US'

    // Get artist data using the same query as CSV export
    const { data: artworks, error: artError } = await supabase
      .from('art')
      .select(`
        id, art_code, round, easel, artist_id,
        artist_profiles (
          name, entry_id, email, phone,
          people!artist_profiles_person_id_fkey (
            phone_number, email
          )
        )
      `)
      .eq('event_id', event.id)
      .not('artist_profiles.entry_id', 'is', null)
      .order('art_code')

    if (artError) {
      throw new Error(`Failed to get artist data: ${artError.message}`)
    }

    // Extract unique artist phone numbers
    const uniquePhones = new Map()
    
    artworks?.forEach(artwork => {
      const artistPhone = artwork.artist_profiles?.phone || artwork.artist_profiles?.people?.phone_number
      const artistName = artwork.artist_profiles?.name || 'Unknown Artist'
      
      if (artistPhone) {
        if (!uniquePhones.has(artistPhone)) {
          uniquePhones.set(artistPhone, {
            phone: artistPhone,
            name: artistName,
            art_codes: []
          })
        }
        uniquePhones.get(artistPhone).art_codes.push(artwork.art_code)
      }
    })

    let result = `Phone Number Validation for ${eventEid} (${event.name})\n`
    result += `Country: ${countryCode}\n`
    result += `${'='.repeat(60)}\n\n`

    let processed = 0
    let fixed = 0

    for (const [phone, userData] of uniquePhones) {
      processed++
      
      // Try different variations until we find a valid one
      const variations = generatePhoneVariations(phone, countryCode)
      let validPhone = null

      for (const variation of variations) {
        const twilioResult = await testWithTwilio(variation, countryCode, twilioAccountSid, twilioAuthToken)
        
        if (twilioResult.valid) {
          validPhone = {
            phone: twilioResult.phoneNumber,
            nationalFormat: twilioResult.nationalFormat,
            carrier: twilioResult.carrier,
            lineType: twilioResult.lineType,
            countryCode: twilioResult.countryCode
          }
          break
        }
      }

      // Format the output exactly as requested
      result += `${processed}. Artist: ${userData.name}\n`
      result += `   Event Country: ${countryCode}\n`
      result += `   Phone: ${phone}\n`
      
      if (validPhone) {
        const actualCountry = validPhone.countryCode || 'Unknown'
        const carrier = validPhone.carrier || 'Unknown'
        const lineType = validPhone.lineType || 'Unknown'
        
        result += `   Valid Format: ${validPhone.phone} (${validPhone.nationalFormat})\n`
        result += `   Detected Country: ${actualCountry}\n`
        result += `   Carrier: ${carrier}\n`
        result += `   Line Type: ${lineType}\n`
        
        if (validPhone.phone !== phone) {
          fixed++
        }
      } else {
        result += `   Valid Format: NONE FOUND\n`
      }
      
      result += `\n`
    }

    result += `\nSummary:\n`
    result += `--------\n`
    result += `Total bidders: ${processed}\n`
    result += `Numbers fixed: ${fixed}\n`
    result += `Already valid: ${processed - fixed - (processed - Array.from(uniquePhones.values()).filter(u => u.validPhone).length)}\n`

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

// Generate phone number variations to test
function generatePhoneVariations(phone: string, countryCode: string): string[] {
  const variations = [phone] // Always test original first
  
  // Australian variations - handle +104 pattern (common corruption)
  if (countryCode === 'AU') {
    if (phone.startsWith('+104')) {
      // +10403061779 -> +61403061779 (replace +104 with +61, keep rest)
      // The "04" part is actually the start of Australian mobile number
      variations.push('+61' + phone.substring(3))
      
      // Also try other patterns just in case
      variations.push('+61' + phone.substring(4))  // Remove +104, add +61
    }
    if (phone.startsWith('+161')) {
      // +161XXXXXXXXX -> +61XXXXXXXXX (doubled country code)
      variations.push('+61' + phone.substring(4))
    }
    if (phone.startsWith('104') && !phone.startsWith('+')) {
      // 104XXXXXXXXX -> +61XXXXXXXXX
      variations.push('+61' + phone.substring(3))
    }
    if (phone.startsWith('04') && phone.length === 10) {
      // 04XXXXXXXX -> +614XXXXXXXX (mobile without country)
      variations.push('+61' + phone)
    }
  }
  
  // UK variations  
  if (countryCode === 'GB' || phone.startsWith('020')) {
    if (phone.startsWith('020')) {
      variations.push('+44' + phone.substring(1))
    }
    if (phone.startsWith('0')) {
      variations.push('+44' + phone.substring(1))
    }
  }
  
  // US/Canada variations
  if (countryCode === 'US' || countryCode === 'CA' || phone.includes('1614')) {
    if (phone.match(/^\+?1614\d{7}/)) {
      variations.push('+1' + phone.replace(/^\+?1614/, '614'))
    }
  }
  
  // Generic +1 additions for North American numbers
  if ((countryCode === 'US' || countryCode === 'CA') && !phone.startsWith('+')) {
    if (phone.length === 10) {
      variations.push('+1' + phone)
    }
  }
  
  return [...new Set(variations)] // Remove duplicates
}

// Test phone number with Twilio
async function testWithTwilio(phoneNumber: string, countryCode: string, accountSid: string, authToken: string) {
  try {
    const url = `https://lookups.twilio.com/v2/PhoneNumbers/${encodeURIComponent(phoneNumber)}`
    const params = new URLSearchParams({ 
      Fields: 'line_type_intelligence',
      CountryCode: countryCode
    })

    const response = await fetch(`${url}?${params}`, {
      method: 'GET',
      headers: {
        'Authorization': `Basic ${btoa(`${accountSid}:${authToken}`)}`,
        'Accept': 'application/json'
      }
    })

    if (!response.ok) {
      return { valid: false, error: `HTTP ${response.status}` }
    }

    const data = await response.json()
    return {
      valid: data.valid || false,
      phoneNumber: data.phone_number,
      nationalFormat: data.national_format,
      countryCode: data.country_code,
      carrier: data.line_type_intelligence?.carrier_name,
      lineType: data.line_type_intelligence?.type
    }
  } catch (error) {
    return { valid: false, error: error.message }
  }
}
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
    const mode = url.searchParams.get('mode') || 'analyze' // analyze or fix
    const events = url.searchParams.get('events') || 'AB2995,AB3018,AB3028' // comma-separated list

    const eventList = events.split(',').map(e => e.trim())
    
    let result = `ARTIST PROFILES PHONE FIX (${mode.toUpperCase()} MODE)\n`
    result += `Events: ${eventList.join(', ')}\n`
    result += `${'='.repeat(80)}\n\n`

    let totalProcessed = 0
    let totalFixed = 0
    let totalErrors = 0

    for (const eventEid of eventList) {
      let countryCode = 'US' // default
      if (eventEid.includes('AB2995')) countryCode = 'AU'
      if (eventEid.includes('AB3019')) countryCode = 'NZ'
      
      result += `EVENT: ${eventEid}\n`
      result += `Country: ${countryCode}\n`
      result += `${'-'.repeat(40)}\n`

      // First get event ID
      const { data: event, error: eventError } = await supabase
        .from('events')
        .select('id')
        .eq('eid', eventEid)
        .single()

      if (eventError) {
        result += `Event ${eventEid} not found: ${eventError.message}\n\n`
        continue
      }

      // Get all artist profiles with phone numbers for this event
      const { data: profiles, error: profilesError } = await supabase
        .from('artist_profiles')
        .select(`
          id, entry_id, name, phone,
          art!inner(event_id)
        `)
        .eq('art.event_id', event.id)
        .not('phone', 'is', null)
        .not('entry_id', 'is', null)

      if (profilesError) {
        result += `Error getting profiles: ${profilesError.message}\n\n`
        continue
      }

      // Remove duplicates by artist profile ID
      const uniqueProfiles = new Map()
      profiles?.forEach(profile => {
        if (!uniqueProfiles.has(profile.id)) {
          uniqueProfiles.set(profile.id, profile)
        }
      })

      let eventProcessed = 0
      let eventFixed = 0

      for (const [profileId, profile] of uniqueProfiles) {
        eventProcessed++
        totalProcessed++

        const originalPhone = profile.phone
        const variations = generatePhoneVariations(originalPhone, countryCode)
        let validPhone = null

        // Find valid variation
        for (const variation of variations) {
          const twilioResult = await testWithTwilio(variation, countryCode, twilioAccountSid, twilioAuthToken)
          if (twilioResult.valid) {
            validPhone = {
              phone: twilioResult.phoneNumber,
              nationalFormat: twilioResult.nationalFormat,
              countryCode: twilioResult.countryCode
            }
            break
          }
        }

        result += `${eventProcessed}. ${profile.name} (ID: ${profile.entry_id})\n`
        result += `   Original: ${originalPhone}\n`
        
        if (validPhone) {
          if (validPhone.phone !== originalPhone) {
            result += `   Valid: ${validPhone.phone} (${validPhone.nationalFormat})\n`
            result += `   Status: NEEDS FIX\n`
            
            // If in fix mode, update the database
            if (mode === 'fix') {
              const { error: updateError } = await supabase
                .from('artist_profiles')
                .update({ phone: validPhone.phone })
                .eq('id', profileId)

              if (updateError) {
                result += `   Result: ❌ UPDATE FAILED - ${updateError.message}\n`
                totalErrors++
              } else {
                result += `   Result: ✅ UPDATED TO ${validPhone.phone}\n`
                eventFixed++
                totalFixed++
              }
            } else {
              result += `   Result: 🔧 WOULD FIX (run with ?mode=fix to apply)\n`
            }
          } else {
            result += `   Valid: ${validPhone.phone}\n`
            result += `   Status: ✅ ALREADY CORRECT\n`
          }
        } else {
          result += `   Valid: NONE FOUND\n`
          result += `   Status: ❌ NO VALID FORMAT\n`
        }
        result += `\n`
      }

      result += `Event Summary: ${eventProcessed} processed, ${eventFixed} fixed\n`
      result += `${'='.repeat(40)}\n\n`
    }

    result += `OVERALL SUMMARY:\n`
    result += `Total Processed: ${totalProcessed}\n`
    result += `Total Fixed: ${totalFixed}\n`
    result += `Total Errors: ${totalErrors}\n`
    
    if (mode === 'analyze') {
      result += `\nTo apply fixes, run with: ?mode=fix\n`
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

// Phone variation logic (reused from other functions)
function generatePhoneVariations(phone: string, countryCode: string): string[] {
  const variations = [phone]
  
  if (countryCode === 'AU') {
    if (phone.startsWith('+104')) {
      // +10403061779 -> +61403061779 (replace +104 with +61)
      variations.push('+61' + phone.substring(3))
      variations.push('+61' + phone.substring(4))
    }
    if (phone.startsWith('+161')) {
      variations.push('+61' + phone.substring(4))
    }
  }
  
  if (countryCode === 'NZ') {
    if (phone.startsWith('+102')) {
      // +10212345678 -> +6412345678 (replace +102 with +64, NZ pattern)
      variations.push('+64' + phone.substring(3))
      variations.push('+64' + phone.substring(4))
    }
    if (phone.startsWith('+021')) {
      // +02102364357 -> +642102364357 (replace +021 with +64)
      variations.push('+64' + phone.substring(3))
      // Also try treating it as +6421...
      variations.push('+6421' + phone.substring(4))
    }
  }
  
  if ((countryCode === 'US' || countryCode === 'CA') && !phone.startsWith('+')) {
    if (phone.length === 10) {
      variations.push('+1' + phone)
    }
  }
  
  return [...new Set(variations)]
}

// Twilio validation (reused from other functions)
async function testWithTwilio(phoneNumber: string, countryCode: string, accountSid: string, authToken: string) {
  try {
    const url = `https://lookups.twilio.com/v2/PhoneNumbers/${encodeURIComponent(phoneNumber)}`
    const params = new URLSearchParams({ Fields: 'line_type_intelligence' })
    if (countryCode) {
      params.append('CountryCode', countryCode)
    }

    const response = await fetch(`${url}?${params}`, {
      method: 'GET',
      headers: {
        'Authorization': `Basic ${btoa(`${accountSid}:${authToken}`)}`,
        'Accept': 'application/json'
      }
    })

    if (!response.ok) {
      return { valid: false }
    }

    const data = await response.json()
    return {
      valid: data.valid || false,
      phoneNumber: data.phone_number,
      nationalFormat: data.national_format,
      countryCode: data.country_code
    }
  } catch (error) {
    return { valid: false }
  }
}
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

    // Target events
    const eventEids = ['AB2995', 'AB3018', 'AB3028']
    
    let result = `COMPREHENSIVE PHONE DATA ANALYSIS\n`
    result += `Events: ${eventEids.join(', ')}\n`
    result += `${'='.repeat(100)}\n\n`

    for (const eventEid of eventEids) {
      // Get event
      const { data: event, error: eventError } = await supabase
        .from('events')
        .select('id, eid, name')
        .eq('eid', eventEid)
        .single()

      if (eventError) {
        result += `${eventEid}: Event not found (${eventError.message})\n\n`
        continue
      }

      const countryCode = eventEid.includes('AB2995') ? 'AU' : 'US'
      
      result += `EVENT: ${eventEid} (${event.name})\n`
      result += `Country: ${countryCode}\n`
      result += `${'-'.repeat(80)}\n`

      // Get comprehensive artist data with ALL phone fields (simplified)
      const { data: artists, error: artistError } = await supabase
        .from('art')
        .select(`
          art_code, artist_id,
          artist_profiles (
            name, entry_id, phone,
            people (
              phone,
              phone_number,
              auth_phone,
              display_phone,
              auth_user_id
            )
          )
        `)
        .eq('event_id', event.id)
        .not('artist_profiles.entry_id', 'is', null)
        .order('art_code')

      if (artistError) {
        result += `Error getting artists: ${artistError.message}\n\n`
        continue
      }

      // Group by artist
      const artistMap = new Map()
      artists?.forEach(art => {
        const artistId = art.artist_id
        if (!artistMap.has(artistId)) {
          artistMap.set(artistId, {
            name: art.artist_profiles?.name || 'Unknown',
            entry_id: art.artist_profiles?.entry_id,
            art_codes: [],
            phones: {
              profile_phone: art.artist_profiles?.phone,
              people_phone: art.artist_profiles?.people?.phone,
              people_phone_number: art.artist_profiles?.people?.phone_number,
              people_auth_phone: art.artist_profiles?.people?.auth_phone,
              people_display_phone: art.artist_profiles?.people?.display_phone,
              auth_user_id: art.artist_profiles?.people?.auth_user_id
            }
          })
        }
        artistMap.get(artistId).art_codes.push(art.art_code)
      })

      // Process each artist
      let artistCount = 0
      for (const [artistId, artistData] of artistMap) {
        artistCount++
        
        result += `\n${artistCount}. Artist: ${artistData.name} (Entry ID: ${artistData.entry_id})\n`
        result += `   Art Codes: ${artistData.art_codes.join(', ')}\n`
        result += `   Phone Data Sources:\n`
        
        // Show all phone fields
        const phoneFields = [
          { label: 'Profile Phone', value: artistData.phones.profile_phone },
          { label: 'People Phone', value: artistData.phones.people_phone },
          { label: 'People Phone Number', value: artistData.phones.people_phone_number },
          { label: 'People Auth Phone', value: artistData.phones.people_auth_phone },
          { label: 'People Display Phone', value: artistData.phones.people_display_phone },
          { label: 'Auth User ID', value: artistData.phones.auth_user_id }
        ]

        // Find unique phone numbers and validate them (skip non-phone fields)
        const uniquePhones = new Set()
        phoneFields.forEach(field => {
          if (field.value && field.label !== 'Auth User ID') {
            uniquePhones.add(field.value)
          }
        })

        // Display phone field data
        phoneFields.forEach(field => {
          const value = field.value || 'NULL'
          const isUnique = field.value && [...uniquePhones].length > 1 ? 
            (![...uniquePhones].filter(p => p !== field.value).length ? '' : ' ⚠️') : ''
          result += `     ${field.label.padEnd(20)}: ${value}${isUnique}\n`
        })

        // Validate unique phone numbers with Twilio
        result += `\n   Twilio Validation Results:\n`
        
        if (uniquePhones.size === 0) {
          result += `     No phone numbers to validate\n`
        } else {
          let validationCount = 0
          for (const phone of uniquePhones) {
            validationCount++
            const variations = generatePhoneVariations(phone, countryCode)
            let validPhone = null

            for (const variation of variations) {
              const twilioResult = await testWithTwilio(variation, countryCode, twilioAccountSid, twilioAuthToken)
              if (twilioResult.valid) {
                validPhone = twilioResult
                break
              }
            }

            result += `     Phone ${validationCount}: ${phone}\n`
            if (validPhone) {
              result += `       ✅ VALID: ${validPhone.phoneNumber} (${validPhone.nationalFormat})\n`
              result += `       Country: ${validPhone.countryCode}, Carrier: ${validPhone.carrier || 'Unknown'}\n`
              if (validPhone.phoneNumber !== phone) {
                result += `       🔧 NEEDS FIX: ${phone} → ${validPhone.phoneNumber}\n`
              }
            } else {
              result += `       ❌ INVALID: No valid format found\n`
              result += `       Tried: ${variations.slice(0, 3).join(', ')}${variations.length > 3 ? '...' : ''}\n`
            }
          }
        }
        
        // Check for inconsistencies
        if (uniquePhones.size > 1) {
          result += `\n   ⚠️  INCONSISTENCY: ${uniquePhones.size} different phone numbers found!\n`
          result += `       Numbers: ${[...uniquePhones].join(', ')}\n`
        }
      }

      result += `\nEvent Summary: ${artistCount} artists processed\n`
      result += `${'='.repeat(80)}\n\n`
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

// Reuse the same phone variation logic
function generatePhoneVariations(phone: string, countryCode: string): string[] {
  const variations = [phone]
  
  if (countryCode === 'AU') {
    if (phone.startsWith('+104')) {
      variations.push('+61' + phone.substring(3))
      variations.push('+61' + phone.substring(4))
    }
    if (phone.startsWith('+161')) {
      variations.push('+61' + phone.substring(4))
    }
  }
  
  if ((countryCode === 'US' || countryCode === 'CA') && !phone.startsWith('+')) {
    if (phone.length === 10) {
      variations.push('+1' + phone)
    }
  }
  
  return [...new Set(variations)]
}

// Reuse the same Twilio testing logic
async function testWithTwilio(phoneNumber: string, countryCode: string, accountSid: string, authToken: string) {
  try {
    const url = `https://lookups.twilio.com/v2/PhoneNumbers/${encodeURIComponent(phoneNumber)}`
    const params = new URLSearchParams({ 
      Fields: 'line_type_intelligence'
    })
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
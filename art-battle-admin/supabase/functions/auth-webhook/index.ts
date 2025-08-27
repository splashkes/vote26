// Auth Webhook Edge Function
// Handles person linking after successful phone verification

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface AuthWebhookPayload {
  type: string
  table: string
  record: any
  schema: string
  old_record?: any
}

serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Get Supabase client with service role (internal webhook, no user auth needed)
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Parse webhook payload
    const payload: AuthWebhookPayload = await req.json()
    
    console.log('Auth webhook received:', payload.type, payload.table)

    // Only handle user updates where phone_confirmed_at changed
    if (payload.type !== 'UPDATE' || payload.table !== 'users') {
      return new Response(JSON.stringify({ success: true, message: 'Ignored non-user update' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const newRecord = payload.record
    const oldRecord = payload.old_record

    // Check if phone_confirmed_at changed from null to a value
    if (oldRecord?.phone_confirmed_at || !newRecord?.phone_confirmed_at) {
      return new Response(JSON.stringify({ success: true, message: 'Phone not newly confirmed' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    console.log('Processing phone confirmation for user:', newRecord.id)

    // Check if already linked
    const { data: existingPerson } = await supabase
      .from('people')
      .select('id')
      .eq('auth_user_id', newRecord.id)
      .single()

    if (existingPerson) {
      console.log('User already linked to person:', existingPerson.id)
      return new Response(JSON.stringify({ 
        success: true, 
        message: 'User already linked',
        person_id: existingPerson.id 
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Handle person linking
    const personIdFromMeta = newRecord.raw_user_meta_data?.person_id
    const personName = newRecord.raw_user_meta_data?.person_name
    const authPhone = newRecord.phone
    let personId = null

    if (personIdFromMeta) {
      // QR scan user: Link existing person record
      console.log('Linking QR scan user to existing person:', personIdFromMeta)
      const { error: updateError } = await supabase
        .from('people')
        .update({
          auth_user_id: newRecord.id,
          nickname: personName || 'User',
          updated_at: new Date().toISOString()
        })
        .eq('id', personIdFromMeta)

      if (updateError) {
        console.error('Error linking existing person:', updateError)
        throw new Error(`Person linking failed: ${updateError.message}`)
      }

      personId = personIdFromMeta
      console.log('Successfully linked QR user to person:', personId)
    } else {
      // Direct OTP user: Find or create person
      // Use the phone number exactly as validated by Supabase Auth (already E.164 format)
      console.log('Using validated phone from Auth:', authPhone)

      // Generate phone variations to handle corrupted numbers in database
      const phoneVariations = generatePhoneVariations(authPhone)
      console.log('Generated phone variations:', phoneVariations)

      // Try to find existing person with matching phone (including corrupted versions)
      let existingPersonByPhone = null
      
      for (const variation of phoneVariations) {
        const { data: foundPerson } = await supabase
          .from('people')
          .select('id, name, phone')
          .is('auth_user_id', null)
          .eq('phone', variation)
          .order('created_at', { ascending: false })
          .limit(1)
          .single()
        
        if (foundPerson) {
          console.log(`Found person with phone variation: ${variation} (original in DB: ${foundPerson.phone})`)
          existingPersonByPhone = foundPerson
          break
        }
      }

      // If we found a person with corrupted phone, validate and fix it with Twilio
      if (existingPersonByPhone && existingPersonByPhone.phone !== authPhone) {
        console.log('Found person with corrupted phone, validating with Twilio...')
        const twilioResult = await validateWithTwilio(authPhone)
        
        if (twilioResult.valid) {
          console.log('Twilio confirmed valid phone, updating person record')
          // Update the corrupted phone number in the database
          const { error: phoneUpdateError } = await supabase
            .from('people')
            .update({ phone: twilioResult.phoneNumber })
            .eq('id', existingPersonByPhone.id)
          
          if (phoneUpdateError) {
            console.error('Failed to update corrupted phone:', phoneUpdateError)
          } else {
            console.log(`Successfully updated phone from ${existingPersonByPhone.phone} to ${twilioResult.phoneNumber}`)
            // Send Slack notification about the fix
            try {
              await supabase.rpc('queue_slack_notification', {
                channel: 'profile-debug',
                notification_type: 'phone_corruption_fixed',
                message: `📞 Phone Corruption Fixed!\nUser: ${newRecord.id}\nCorrected: ${existingPersonByPhone.phone} → ${twilioResult.phoneNumber}\nMethod: Twilio validation during auth`
              })
            } catch (slackError) {
              console.warn('Slack notification failed:', slackError)
            }
          }
        }
      }

      if (existingPersonByPhone) {
        // Link existing person
        console.log('Linking OTP user to existing person by phone:', existingPersonByPhone.id)
        const { error: updateError } = await supabase
          .from('people')
          .update({
            auth_user_id: newRecord.id,
            updated_at: new Date().toISOString()
          })
          .eq('id', existingPersonByPhone.id)

        if (updateError) {
          console.error('Error linking existing person by phone:', updateError)
          throw new Error(`Person linking failed: ${updateError.message}`)
        }

        personId = existingPersonByPhone.id
        console.log('Successfully linked OTP user to existing person:', personId)
      } else {
        // Create new person
        console.log('Creating new person for OTP user')
        const { data: newPerson, error: createError } = await supabase
          .from('people')
          .insert({
            phone: authPhone,
            name: 'User',
            nickname: 'User',
            auth_user_id: newRecord.id,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          })
          .select('id')
          .single()

        if (createError) {
          console.error('Error creating new person:', createError)
          throw new Error(`Person creation failed: ${createError.message}`)
        }

        personId = newPerson.id
        console.log('Successfully created new person:', personId)
      }
    }

    return new Response(JSON.stringify({
      success: true,
      message: 'Person linked successfully',
      user_id: newRecord.id,
      person_id: personId
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (error) {
    console.error('Error in auth webhook:', error)
    return new Response(JSON.stringify({
      success: false,
      error: 'Auth webhook error',
      message: error.message
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})

// Generate phone variations to match corrupted numbers in database
function generatePhoneVariations(phone: string): string[] {
  const variations = [phone]
  
  // Handle corruption patterns we found in database
  if (phone.startsWith('+31')) {
    // Netherlands: +31610654546 was corrupted to +131610654546
    variations.push('+1' + phone.substring(1)) // +131610654546
  }
  
  if (phone.startsWith('+61')) {
    // Australia: +61407290480 was corrupted to +161407290480
    variations.push('+1' + phone.substring(1)) // +161407290480
  }
  
  if (phone.startsWith('+64')) {
    // New Zealand: +64211674847 was corrupted to +164211674847
    variations.push('+1' + phone.substring(1)) // +164211674847
  }
  
  if (phone.startsWith('+44')) {
    // UK: +447466118852 was corrupted to +1447466118852
    variations.push('+1' + phone.substring(1)) // +1447466118852
  }
  
  // Handle other common country codes that might be corrupted
  if (phone.startsWith('+33')) { // France
    variations.push('+1' + phone.substring(1))
  }
  if (phone.startsWith('+49')) { // Germany
    variations.push('+1' + phone.substring(1))
  }
  if (phone.startsWith('+81')) { // Japan
    variations.push('+1' + phone.substring(1))
  }
  if (phone.startsWith('+52')) { // Mexico
    variations.push('+1' + phone.substring(1))
  }
  if (phone.startsWith('+55')) { // Brazil
    variations.push('+1' + phone.substring(1))
  }
  
  return [...new Set(variations)]
}

// Validate phone number with Twilio
async function validateWithTwilio(phoneNumber: string) {
  try {
    const twilioAccountSid = Deno.env.get('TWILIO_ACCOUNT_SID')
    const twilioAuthToken = Deno.env.get('TWILIO_AUTH_TOKEN')
    
    if (!twilioAccountSid || !twilioAuthToken) {
      console.warn('Twilio credentials not available for validation')
      return { valid: false }
    }

    const url = `https://lookups.twilio.com/v2/PhoneNumbers/${encodeURIComponent(phoneNumber)}`
    const params = new URLSearchParams({ Fields: 'line_type_intelligence' })

    const response = await fetch(`${url}?${params}`, {
      method: 'GET',
      headers: {
        'Authorization': `Basic ${btoa(`${twilioAccountSid}:${twilioAuthToken}`)}`,
        'Accept': 'application/json'
      }
    })

    if (!response.ok) {
      console.log('Twilio validation failed:', response.status, response.statusText)
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
    console.warn('Twilio validation error:', error)
    return { valid: false }
  }
}
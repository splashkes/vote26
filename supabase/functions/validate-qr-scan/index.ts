// Validate QR Scan Edge Function
// Validates QR codes and records scan attempts

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface ScanRequest {
  qr_code: string
  user_agent?: string
  location_data?: any
}

serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Get Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Get user from JWT token
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(
        JSON.stringify({ 
          success: false,
          error: 'Authentication required',
          message: 'Please log in to scan QR codes.',
          is_valid: false
        }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Extract JWT and get user
    const jwt = authHeader.replace('Bearer ', '')
    const { data: { user }, error: userError } = await supabase.auth.getUser(jwt)
    
    if (userError || !user) {
      console.error('Auth error:', userError)
      return new Response(
        JSON.stringify({ 
          success: false,
          error: 'Invalid authentication',
          message: 'Your login session has expired. Please log in again.',
          is_valid: false
        }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Parse request body
    const { qr_code, user_agent, location_data }: ScanRequest = await req.json()

    if (!qr_code) {
      return new Response(
        JSON.stringify({ error: 'QR code required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Get client IP
    const clientIP = req.headers.get('x-forwarded-for') || 
                    req.headers.get('x-real-ip') || 
                    'unknown'

    // Find the QR code and check if it's valid
    const { data: qrData, error: qrError } = await supabase
      .from('qr_codes')
      .select('id, event_id, expires_at, is_active')
      .eq('code', qr_code)
      .eq('is_active', true)
      .single()

    let isValid = false
    let eventId = null
    let scanResult = {
      success: false,
      message: 'Invalid QR code',
      is_valid: false
    }

    if (!qrError && qrData) {
      eventId = qrData.event_id
      const now = new Date()
      const expiresAt = new Date(qrData.expires_at)
      
      // Check if code is still valid (not expired)
      if (now <= expiresAt) {
        isValid = true
        scanResult = {
          success: true,
          message: 'QR code validated successfully',
          is_valid: true
        }
      } else {
        scanResult = {
          success: false,
          message: 'QR code has expired',
          is_valid: false
        }
      }
    }

    // Get or create person record
    let personId = null
    
    // Try to find existing person by auth_user_id
    const { data: existingPerson } = await supabase
      .from('people')
      .select('id')
      .eq('auth_user_id', user.id)
      .single()

    if (existingPerson) {
      personId = existingPerson.id
    } else {
      // Create minimal person record
      const authPhone = user.user_metadata?.phone
      const nickname = user.user_metadata?.nickname || 
                      user.user_metadata?.name || 
                      user.email?.split('@')[0]

      const { data: newPerson, error: personError } = await supabase
        .from('people')
        .insert({
          auth_user_id: user.id,
          auth_phone: authPhone,
          phone_number: authPhone,
          nickname: nickname,
          email: user.email
        })
        .select('id')
        .single()

      if (personError) {
        console.error('Error creating person:', personError)
        return new Response(
          JSON.stringify({ error: 'Failed to create user record' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      personId = newPerson.id
    }

    // Record the scan attempt (always record, regardless of validity)
    if (eventId && personId) {
      // Check if person has already scanned for this event
      const { data: existingScan } = await supabase
        .from('people_qr_scans')
        .select('id')
        .eq('person_id', personId)
        .eq('event_id', eventId)
        .eq('is_valid', true)
        .single()

      if (existingScan && isValid) {
        // Person already has a valid scan for this event
        scanResult = {
          success: true,
          message: 'QR code valid, but you already have an active scan for this event',
          is_valid: true
        }
      } else {
        // Record the new scan
        const { error: insertError } = await supabase
          .from('people_qr_scans')
          .insert({
            person_id: personId,
            event_id: eventId,
            qr_code: qr_code,
            scan_timestamp: new Date().toISOString(),
            ip_address: clientIP,
            user_agent: user_agent,
            location_data: location_data,
            is_valid: isValid
          })

        if (insertError) {
          console.error('Error recording scan:', insertError)
          return new Response(
            JSON.stringify({ error: 'Failed to record scan' }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }
      }
    }

    // Get event info if valid
    let eventInfo = null
    if (isValid && eventId) {
      const { data: event } = await supabase
        .from('events')
        .select('id, name, venue')
        .eq('id', eventId)
        .single()
      
      eventInfo = event
    }

    return new Response(
      JSON.stringify({
        ...scanResult,
        event: eventInfo,
        timestamp: new Date().toISOString(),
        qr_code: qr_code
      }),
      { 
        status: isValid ? 200 : 400, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )

  } catch (error) {
    console.error('Error in validate-qr-scan function:', error)
    return new Response(
      JSON.stringify({ 
        success: false,
        error: 'Unable to validate QR code',
        message: 'There was an issue processing your QR scan. Please try again or contact event staff.',
        is_valid: false
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  }
})
// Validate QR Scan Edge Function
// Simplified version: focuses on QR validation, not person creation
// Person records are now created by auth-webhook during phone confirmation

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
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Get authenticated user
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Authentication required'
      }), { 
        status: 401, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      })
    }

    const { data: { user }, error: userError } = await supabase.auth.getUser(
      authHeader.replace('Bearer ', '')
    )

    if (userError || !user) {
      console.error('Auth error:', userError)
      return new Response(JSON.stringify({
        success: false,
        error: 'Authentication failed'
      }), { 
        status: 401, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      })
    }

    console.log('QR validation for user:', user.id)

    // Parse request body
    const { qr_code, user_agent, location_data } = await req.json()

    if (!qr_code) {
      return new Response(JSON.stringify({
        success: false,
        error: 'QR code required'
      }), { 
        status: 400, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      })
    }

    // Get person record - AUTH-FIRST APPROACH (no creation, just lookup)
    const { data: person, error: personError } = await supabase
      .from('people')
      .select('id')
      .eq('auth_user_id', user.id)
      .single()

    if (personError || !person) {
      console.error('Person not found for authenticated user:', user.id)
      return new Response(JSON.stringify({
        success: false,
        error: 'User profile not found - please complete phone verification',
        auth_user_id: user.id
      }), { 
        status: 400, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      })
    }

    console.log('Found person for user:', person.id)

    // Validate QR code
    const { data: qrData, error: qrError } = await supabase
      .from('qr_codes')
      .select('event_id, expires_at, is_active')
      .eq('code', qr_code)
      .single()

    if (qrError) {
      console.error('QR code lookup error:', qrError)
      return new Response(JSON.stringify({
        success: false,
        message: 'Invalid QR code',
        is_valid: false,
        timestamp: new Date().toISOString()
      }), { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      })
    }

    // Check if QR code is expired or inactive
    const now = new Date()
    const expiresAt = new Date(qrData.expires_at)

    if (!qrData.is_active || now > expiresAt) {
      console.log('QR code expired or inactive:', qr_code)
      return new Response(JSON.stringify({
        success: false,
        message: 'QR code has expired - scan a fresh code from the event screen',
        is_valid: false,
        timestamp: now.toISOString()
      }), { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      })
    }

    // Get event details
    const { data: event, error: eventError } = await supabase
      .from('events')
      .select('id, name, venue, eid')
      .eq('id', qrData.event_id)
      .single()

    if (eventError || !event) {
      console.error('Event not found:', qrData.event_id)
      return new Response(JSON.stringify({
        success: false,
        message: 'Event not found for this QR code',
        is_valid: false,
        timestamp: now.toISOString()
      }), { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      })
    }

    // Record the QR scan
    const { error: scanError } = await supabase.from('people_qr_scans').insert({
      person_id: person.id,
      event_id: event.id,
      qr_code: qr_code,
      is_valid: true,
      user_agent: user_agent || '',
      scanned_at: now.toISOString(),
      created_at: now.toISOString()
    })

    if (scanError) {
      console.error('Error recording QR scan:', scanError)
      // Don't fail the request for scan recording issues
    }

    // Create or update event registration
    const { error: registrationError } = await supabase.from('event_registrations').upsert({
      person_id: person.id,
      event_id: event.id,
      registration_date: now.toISOString(),
      registration_method: 'qr_scan',
      updated_at: now.toISOString()
    }, {
      onConflict: 'person_id,event_id'
    })

    if (registrationError) {
      console.error('Error creating event registration:', registrationError)
      // Don't fail the request for registration issues
    }

    // Return success response
    return new Response(JSON.stringify({
      success: true,
      message: 'QR code validated successfully - vote boost activated!',
      is_valid: true,
      event: {
        id: event.id,
        name: event.name,
        venue: event.venue,
        eid: event.eid
      },
      person_id: person.id,
      timestamp: now.toISOString()
    }), { 
      status: 200, 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    })

  } catch (error) {
    console.error('Error in validate-qr-scan:', error)
    return new Response(JSON.stringify({
      success: false,
      error: 'Internal server error',
      message: 'An unexpected error occurred during QR validation'
    }), { 
      status: 500, 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    })
  }
})
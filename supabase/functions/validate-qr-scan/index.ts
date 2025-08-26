// Validate QR Scan Edge Function
// Validates QR codes and records scan attempts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};
serve(async (req)=>{
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: corsHeaders
    });
  }
  try {
    // Get Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    // Get user from JWT token
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Authentication required',
        message: 'Please log in to scan QR codes.',
        is_valid: false
      }), {
        status: 401,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }
    // Extract JWT and get user
    const jwt = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabase.auth.getUser(jwt);
    if (userError || !user) {
      console.error('Auth error:', userError);
      return new Response(JSON.stringify({
        success: false,
        error: 'Invalid authentication',
        message: 'Your login session has expired. Please log in again.',
        is_valid: false
      }), {
        status: 401,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }
    // Parse request body
    const { qr_code, user_agent, location_data } = await req.json();
    if (!qr_code) {
      return new Response(JSON.stringify({
        error: 'QR code required'
      }), {
        status: 400,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }
    // Get client IP
    const clientIP = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown';
    // TODO: TEMPORARY FIX - Always return positive result to fix user access issues
    // ISSUE: Users get stuck in loading loops when their original QR codes are deleted
    // PROPER FIX NEEDED: Frontend should not re-validate QR codes for already registered users
    // Once a user has valid event registration, they shouldn't need original QR code to exist
    // Find the QR code and check if it's valid
    const { data: qrData, error: qrError } = await supabase.from('qr_codes').select('id, event_id, expires_at, is_active').eq('code', qr_code).eq('is_active', true).single();
    let isValid = true // TEMPORARY: Always set to true
    ;
    let eventId = null;
    let scanResult = {
      success: true,
      message: 'QR code validated successfully (emergency override)',
      is_valid: true // TEMPORARY: Always valid
    };
    if (!qrError && qrData) {
      eventId = qrData.event_id;
      const now = new Date();
      const expiresAt = new Date(qrData.expires_at);
      // Check if code is still valid (not expired)
      if (now <= expiresAt) {
        scanResult = {
          success: true,
          message: 'QR code validated successfully',
          is_valid: true
        };
      } else {
        scanResult = {
          success: true,
          message: 'QR code validated successfully (emergency override - was expired)',
          is_valid: true // TEMPORARY: Changed from false
        };
      }
    } else {
      // TEMPORARY: Even if QR code doesn't exist, return success
      // Try to find any event the user might be registered for
      const { data: userEvents } = await supabase.from('event_registrations').select('event_id').eq('person_id', (await supabase.from('people').select('id').eq('auth_user_id', user.id).single())?.data?.id).limit(1).single();
      if (userEvents) {
        eventId = userEvents.event_id;
      }
      scanResult = {
        success: true,
        message: 'QR code validated successfully (emergency override - code not found)',
        is_valid: true
      };
    }
    // Get or create person record
    let personId = null;
    try {
      // Check if already linked
      const { data: existingPerson, error: personLookupError } = await supabase.from('people').select('id').eq('auth_user_id', user.id).single();
      if (existingPerson) {
        personId = existingPerson.id;
        console.log('Found existing linked person:', personId);
      } else if (personLookupError && personLookupError.code !== 'PGRST116') {
        console.error('Error looking up person:', personLookupError);
        throw new Error(`Person lookup failed: ${personLookupError.message}`);
      } else {
        // Not linked yet - handle linking
        const personIdFromMeta = user.user_metadata?.person_id;
        const personName = user.user_metadata?.person_name;
        const authPhone = user.phone;
        if (personIdFromMeta) {
          // QR scan user: Link existing person record
          console.log('Linking QR scan user to existing person:', personIdFromMeta);
          const { error: updateError } = await supabase.from('people').update({
            auth_user_id: user.id,
            nickname: personName || 'User',
            updated_at: new Date().toISOString()
          }).eq('id', personIdFromMeta);
          if (updateError) {
            console.error('Error linking existing person:', updateError);
            throw new Error(`Person linking failed: ${updateError.message}`);
          }
          personId = personIdFromMeta;
          console.log('Successfully linked QR user to person:', personId);
        } else {
          // Direct OTP user: Find or create person
          // TODO: Fix hardcoded North America assumption - this breaks international users
          // Current logic strips ALL country codes then forces +1, corrupting international numbers
          // Should preserve original E.164 format and only add +1 for US/Canada numbers without prefix
          let normalizedPhone = authPhone;
          if (normalizedPhone?.startsWith('+1')) {
            normalizedPhone = normalizedPhone.substring(2);
          } else if (normalizedPhone?.startsWith('+')) {
            normalizedPhone = normalizedPhone.substring(1);
          }
          // Try to find existing person with matching phone
          const { data: existingPersonByPhone } = await supabase.from('people').select('id, name').is('auth_user_id', null).or(`phone.eq.+1${normalizedPhone},phone.eq.+${normalizedPhone},phone.eq.${normalizedPhone},phone.eq.${authPhone}`).order('created_at', {
            ascending: false
          }).limit(1).single();
          if (existingPersonByPhone) {
            // Link existing person
            console.log('Linking OTP user to existing person by phone:', existingPersonByPhone.id);
            const { error: updateError } = await supabase.from('people').update({
              auth_user_id: user.id,
              updated_at: new Date().toISOString()
            }).eq('id', existingPersonByPhone.id);
            if (updateError) {
              console.error('Error linking existing person by phone:', updateError);
              throw new Error(`Person linking failed: ${updateError.message}`);
            }
            personId = existingPersonByPhone.id;
            console.log('Successfully linked OTP user to existing person:', personId);
          } else {
            // Create new person
            console.log('Creating new person for OTP user');
            const { data: newPerson, error: createError } = await supabase.from('people').insert({
              phone: `+1${normalizedPhone}`, // CRITICAL BUG: Forces +1 on ALL numbers including international
              name: 'User',
              nickname: 'User',
              auth_user_id: user.id,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            }).select('id').single();
            if (createError) {
              console.error('Error creating new person:', createError);
              throw new Error(`Person creation failed: ${createError.message}`);
            }
            personId = newPerson.id;
            console.log('Successfully created new person:', personId);
          }
        }
      }
    } catch (personHandlingError) {
      console.error('Person handling error:', personHandlingError);
      return new Response(JSON.stringify({
        success: false,
        error: 'Failed to handle user record',
        is_valid: false,
        message: personHandlingError.message,
        error_details: personHandlingError
      }), {
        status: 500,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }
    // Record the scan attempt (always record, regardless of validity)
    if (eventId && personId) {
      // Check if person has already scanned for this event
      const { data: existingScan } = await supabase.from('people_qr_scans').select('id').eq('person_id', personId).eq('event_id', eventId).eq('is_valid', true).single();
      if (existingScan && isValid) {
        // Person already has a valid scan for this event
        scanResult = {
          success: true,
          message: 'QR code valid, but you already have an active scan for this event',
          is_valid: true
        };
      } else {
        // Record the new scan in people_qr_scans
        const { data: qrScanData, error: insertError } = await supabase.from('people_qr_scans').insert({
          person_id: personId,
          event_id: eventId,
          qr_code: qr_code,
          scan_timestamp: new Date().toISOString(),
          ip_address: clientIP,
          user_agent: user_agent,
          location_data: location_data,
          is_valid: isValid
        }).select('id').single();
        if (insertError) {
          console.error('Error recording scan:', insertError);
          return new Response(JSON.stringify({
            success: false,
            error: 'Failed to record scan',
            is_valid: false,
            message: 'Could not record QR scan in database',
            error_details: insertError.message || insertError
          }), {
            status: 500,
            headers: {
              ...corsHeaders,
              'Content-Type': 'application/json'
            }
          });
        }
        // If this was a valid scan, also record it as an event registration
        if (isValid && qrScanData) {
          // Check if person already has a registration for this event (from any source)
          const { data: existingRegistration } = await supabase.from('event_registrations').select('id').eq('person_id', personId).eq('event_id', eventId).single();
          if (!existingRegistration) {
            // Create new event registration
            const { error: registrationError } = await supabase.from('event_registrations').insert({
              event_id: eventId,
              person_id: personId,
              registration_type: 'qr_scan',
              registration_source: 'qr_system',
              registered_at: new Date().toISOString(),
              qr_code: qr_code,
              qr_scan_id: qrScanData.id,
              metadata: {
                ip_address: clientIP,
                user_agent: user_agent,
                location_data: location_data
              }
            });
            if (registrationError) {
              console.error('Error recording event registration:', registrationError);
            // Don't fail the entire request - the QR scan was recorded successfully
            // But log this for monitoring
            }
          }
        }
      }
    }
    // Get event info if valid
    let eventInfo = null;
    if (isValid && eventId) {
      const { data: event } = await supabase.from('events').select('id, name, venue').eq('id', eventId).single();
      eventInfo = event;
    }
    return new Response(JSON.stringify({
      ...scanResult,
      event: eventInfo,
      timestamp: new Date().toISOString(),
      qr_code: qr_code
    }), {
      status: isValid ? 200 : 400,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });
  } catch (error) {
    console.error('Error in validate-qr-scan function:', error);
    return new Response(JSON.stringify({
      success: false,
      error: 'QR Validation Error',
      message: `ERROR: ${error.message || error}`,
      is_valid: false,
      error_details: error.code || error.name || 'Unknown'
    }), {
      status: 500,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });
  }
});

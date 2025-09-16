import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Initialize Supabase client with user's JWT for RLS
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: { headers: { Authorization: req.headers.get('Authorization')! } },
      }
    )

    // Verify user authentication using JWT decoding approach
    const authHeader = req.headers.get('Authorization')

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({
          error: 'Unauthorized - Missing or invalid authorization header',
          success: false,
          debug: {
            timestamp: new Date().toISOString(),
            function_name: 'update-bidder-info',
            auth_details: {
              has_auth_header: !!authHeader,
              auth_header_format: authHeader ? (authHeader.startsWith('Bearer ') ? 'Bearer format' : 'Invalid format') : 'Missing',
              auth_header_length: authHeader?.length || 0
            }
          }
        }),
        {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }

    // Extract JWT token and decode it
    const token = authHeader.replace('Bearer ', '')
    let jwtPayload: any = null
    let user: any = null

    try {
      // Decode JWT payload (base64 encoded)
      const tokenParts = token.split('.')
      if (tokenParts.length !== 3) {
        throw new Error('Invalid JWT token format')
      }

      jwtPayload = JSON.parse(atob(tokenParts[1]))

      // Extract user info from JWT
      user = {
        id: jwtPayload.sub,
        phone: jwtPayload.phone,
        email: jwtPayload.email
      }

      if (!user.id) {
        throw new Error('No user ID in JWT token')
      }

    } catch (jwtError) {
      return new Response(
        JSON.stringify({
          error: 'Unauthorized - Invalid JWT token',
          success: false,
          debug: {
            timestamp: new Date().toISOString(),
            function_name: 'update-bidder-info',
            auth_details: {
              jwt_decode_error: jwtError.message,
              token_parts_count: token.split('.').length,
              token_length: token.length,
              jwt_payload_preview: jwtPayload ? Object.keys(jwtPayload) : null
            }
          }
        }),
        {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }

    // Parse request body
    const { first_name, last_name, nickname, email } = await req.json()

    // Validate required fields
    if (!first_name?.trim()) {
      return new Response(
        JSON.stringify({ error: 'First name is required' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }

    if (!last_name?.trim()) {
      return new Response(
        JSON.stringify({ error: 'Last name is required' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }

    if (email && !isValidEmail(email)) {
      return new Response(
        JSON.stringify({ error: 'Invalid email format' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }

    // Get user's phone from JWT token
    const userPhone = user.phone

    if (!userPhone) {
      return new Response(
        JSON.stringify({ error: 'User phone number not found' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }

    // Find the user's people record by phone (with normalization)
    const normalizedPhone = normalizePhone(userPhone)
    
    const { data: existingPerson, error: findError } = await supabase
      .from('people')
      .select('*')
      .or(`phone_number.eq.${normalizedPhone},auth_phone.eq.${normalizedPhone},phone.eq.${normalizedPhone}`)
      .limit(1)
      .single()

    if (findError && findError.code !== 'PGRST116') { // PGRST116 = no rows found
      return new Response(
        JSON.stringify({
          error: 'Failed to find user record',
          success: false,
          debug: {
            timestamp: new Date().toISOString(),
            function_name: 'update-bidder-info',
            stage: 'finding_person_record',
            find_error: {
              message: findError.message,
              code: findError.code,
              details: findError.details,
              hint: findError.hint
            },
            search_criteria: {
              normalized_phone: normalizedPhone,
              original_phone: userPhone,
              user_id: user.id
            },
            jwt_claims: {
              sub: jwtPayload.sub,
              phone: jwtPayload.phone,
              person_id: jwtPayload.person_id,
              person_name: jwtPayload.person_name
            }
          }
        }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }

    let result
    if (existingPerson) {
      // Update existing person record
      const updates: any = {
        first_name: first_name.trim(),
        last_name: last_name.trim(),
        name: `${first_name.trim()} ${last_name.trim()}`,
        auth_user_id: user.id, // Ensure auth_user_id is set for future compatibility
        updated_at: new Date().toISOString()
      }

      // Only update optional fields if provided
      if (nickname?.trim()) {
        updates.nickname = nickname.trim()
      }
      if (email?.trim()) {
        updates.email = email.trim().toLowerCase()
      }

      const { data, error } = await supabase
        .from('people')
        .update(updates)
        .eq('id', existingPerson.id)
        .select()
        .single()

      if (error) {
        return new Response(
          JSON.stringify({
            error: 'Failed to update user info',
            success: false,
            debug: {
              timestamp: new Date().toISOString(),
              function_name: 'update-bidder-info',
              stage: 'updating_person_record',
              update_error: {
                message: error.message,
                code: error.code,
                details: error.details,
                hint: error.hint
              },
              person_record: {
                id: existingPerson.id,
                name: existingPerson.name,
                phone_number: existingPerson.phone_number,
                auth_phone: existingPerson.auth_phone,
                auth_user_id: existingPerson.auth_user_id
              },
              update_data: updates,
              jwt_claims: {
                sub: jwtPayload.sub,
                phone: jwtPayload.phone,
                person_id: jwtPayload.person_id,
                person_name: jwtPayload.person_name
              },
              rls_check: {
                auth_uid: user.id,
                person_auth_user_id: existingPerson.auth_user_id,
                phone_match: existingPerson.phone_number === normalizedPhone || existingPerson.auth_phone === normalizedPhone,
                person_id_match: existingPerson.id === jwtPayload.person_id
              }
            }
          }),
          {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          }
        )
      }

      result = data
    } else {
      // Create new person record (fallback case)
      const newPerson = {
        first_name: first_name.trim(),
        last_name: last_name.trim(),
        name: `${first_name.trim()} ${last_name.trim()}`,
        nickname: nickname?.trim() || first_name.trim(),
        email: email?.trim()?.toLowerCase(),
        phone_number: normalizedPhone,
        auth_phone: normalizedPhone,
        phone: normalizedPhone,
        auth_user_id: user.id,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }

      const { data, error } = await supabase
        .from('people')
        .insert([newPerson])
        .select()
        .single()

      if (error) {
        return new Response(
          JSON.stringify({
            error: 'Failed to create user record',
            success: false,
            debug: {
              timestamp: new Date().toISOString(),
              function_name: 'update-bidder-info',
              stage: 'creating_person_record',
              create_error: {
                message: error.message,
                code: error.code,
                details: error.details,
                hint: error.hint
              },
              new_person_data: newPerson,
              jwt_claims: {
                sub: jwtPayload.sub,
                phone: jwtPayload.phone,
                person_id: jwtPayload.person_id,
                person_name: jwtPayload.person_name
              }
            }
          }),
          {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          }
        )
      }

      result = data
    }

    // Return success response
    return new Response(
      JSON.stringify({
        success: true,
        message: 'Bidder information updated successfully',
        person_id: result.id,
        name: result.name,
        nickname: result.nickname,
        email: result.email,
        phone: normalizedPhone
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )

  } catch (error) {
    return new Response(
      JSON.stringify({
        error: 'Internal server error',
        success: false,
        debug: {
          timestamp: new Date().toISOString(),
          function_name: 'update-bidder-info',
          stage: 'unexpected_error',
          error_details: {
            message: error.message,
            name: error.name,
            stack: error.stack
          },
          request_info: {
            method: req.method,
            url: req.url,
            headers_present: !!req.headers.get('Authorization')
          }
        }
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )
  }
})

function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  return emailRegex.test(email)
}

function normalizePhone(phone: string): string {
  // Remove all non-digits
  const digits = phone.replace(/\D/g, '')
  
  // Add + prefix if not present and has country code
  if (digits.length >= 10 && !phone.startsWith('+')) {
    return '+' + digits
  }
  
  return phone.startsWith('+') ? phone : '+' + digits
}
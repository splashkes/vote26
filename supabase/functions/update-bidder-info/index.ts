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

    // Verify user authentication
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized', details: authError?.message }),
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

    // Get user's phone from auth metadata or find their people record
    const userPhone = user.phone || user.user_metadata?.phone

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
      console.error('Error finding person:', findError)
      return new Response(
        JSON.stringify({ error: 'Failed to find user record', details: findError.message }),
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
        console.error('Error updating person:', error)
        return new Response(
          JSON.stringify({ error: 'Failed to update user info', details: error.message }),
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
        console.error('Error creating person:', error)
        return new Response(
          JSON.stringify({ error: 'Failed to create user record', details: error.message }),
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
    console.error('Unexpected error:', error)
    return new Response(
      JSON.stringify({ 
        error: 'Internal server error', 
        details: error.message 
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
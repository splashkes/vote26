// Custom Access Token Hook - Full person linking implementation
// Handles person creation and linking on every JWT generation
// Date: 2025-01-09

import { Webhook } from 'https://esm.sh/standardwebhooks@1.0.0'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'

Deno.serve(async (req) => {
  try {
    const payload = await req.text()
    const base64_secret = Deno.env.get('CUSTOM_ACCESS_TOKEN_SECRET')?.replace('v1,whsec_', '')
    
    if (!base64_secret) {
      return new Response(
        JSON.stringify({
          error: 'Webhook secret not configured',
        }),
        {
          status: 500,
          headers: {
            'Content-Type': 'application/json',
          },
        }
      )
    }
    
    const headers = Object.fromEntries(req.headers)
    const wh = new Webhook(base64_secret)
    
    // Verify webhook signature and extract payload
    const { user_id, claims, authentication_method } = wh.verify(payload, headers)
    
    // Get user phone from the auth user data
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL'), 
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    )
    
    // Get the user's phone number from auth.users
    const { data: userData, error: userError } = await supabase.auth.admin.getUserById(user_id)
    
    if (userError || !userData.user) {
      console.error('Failed to get user data:', userError)
      // Fallback to basic claims without person data
      return new Response(
        JSON.stringify({
          claims: {
            ...claims,
            auth_version: 'v2-http',
            person_pending: true,
          }
        }),
        {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
          },
        }
      )
    }
    
    const userPhone = userData.user.phone
    let personId = null
    
    if (userPhone) {
      // Check for existing person record by phone
      const { data: existingPerson, error: personError } = await supabase
        .from('people')
        .select('id, auth_user_id')
        .eq('phone', userPhone)
        .single()
      
      if (existingPerson) {
        // Person exists - check if it's linked
        if (existingPerson.auth_user_id === user_id) {
          // Already linked
          personId = existingPerson.id
          console.log('Person already linked:', personId)
        } else if (!existingPerson.auth_user_id) {
          // Person exists but not linked - link it
          const { error: linkError } = await supabase
            .from('people')
            .update({ 
              auth_user_id: user_id,
              verified: true 
            })
            .eq('id', existingPerson.id)
          
          if (!linkError) {
            personId = existingPerson.id
            console.log('Linked existing person to user:', personId)
          } else {
            console.error('Failed to link existing person:', linkError)
          }
        } else {
          // Person is linked to different user - create new one
          console.log('Person linked to different user, creating new person')
          existingPerson = null
        }
      }
      
      // If no existing person found or linking failed, create new person
      if (!personId) {
        const { data: newPerson, error: createError } = await supabase
          .from('people')
          .insert({
            phone: userPhone,
            auth_user_id: user_id,
            name: 'User',
            verified: true,
            email: userData.user.email || null
          })
          .select('id')
          .single()
        
        if (newPerson && !createError) {
          personId = newPerson.id
          console.log('Created new person:', personId)
        } else {
          console.error('Failed to create new person:', createError)
        }
      }
    }
    
    // Build updated claims
    const updatedClaims = {
      ...claims,
      auth_version: 'v2-http',
    }
    
    if (personId) {
      updatedClaims.person_id = personId
      console.log('Added person_id to JWT claims:', personId)
    } else {
      updatedClaims.person_pending = true
      console.log('No person_id available, setting person_pending: true')
    }

    return new Response(
      JSON.stringify({
        claims: updatedClaims,
      }),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
        },
      }
    )

  } catch (error) {
    console.error('Custom access token hook error:', error)
    return new Response(
      JSON.stringify({
        error: `Failed to process the request: ${error.message}`,
        debug_info: {
          error_name: error.constructor.name,
          error_message: error.message,
          has_secret: !!Deno.env.get('CUSTOM_ACCESS_TOKEN_SECRET'),
          secret_format: Deno.env.get('CUSTOM_ACCESS_TOKEN_SECRET')?.substring(0, 10) + '...',
        }
      }),
      {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
        },
      }
    )
  }
})
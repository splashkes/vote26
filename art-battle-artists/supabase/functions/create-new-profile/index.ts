import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};
// Helper function to log profile creation events
async function logProfileEvent(supabase, eventType, operation, success, authUserId, personId, profileId, errorType, errorMessage, metadata, durationMs, ipAddress, userAgent) {
  try {
    await supabase.from('artist_auth_logs').insert({
      auth_user_id: authUserId || null,
      person_id: personId || null,
      event_type: eventType,
      operation: operation,
      success: success,
      error_type: errorType || null,
      error_message: errorMessage || null,
      duration_ms: durationMs || null,
      ip_address: ipAddress || null,
      user_agent: userAgent || null,
      metadata: {
        profile_id: profileId,
        function: 'create-new-profile',
        ...metadata
      }
    });
  } catch (logError) {
    console.error('Failed to log profile event:', logError);
  }
}
// Helper function to send Slack notifications to profile-debug channel
async function sendSlackNotification(supabase, messageType, text) {
  try {
    await supabase.rpc('queue_slack_notification', {
      p_channel_name: 'profile-debug',
      p_message_type: messageType,
      p_text: text,
      p_blocks: null,
      p_event_id: null
    });
  } catch (slackError) {
    console.error('Failed to queue slack notification:', slackError);
  }
}
serve(async (req)=>{
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: corsHeaders
    });
  }
  const startTime = Date.now();
  const ipAddress = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown';
  const userAgent = req.headers.get('user-agent') || 'unknown';
  let authUserId;
  let personId;
  let profileId;
  try {
    // Create a Supabase client with the service role key to bypass RLS
    const supabaseAdmin1 = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');
    // Log function start
    await logProfileEvent(supabaseAdmin1, 'profile_creation', 'function_start', true, undefined, undefined, undefined, undefined, undefined, {
      ip_address: ipAddress,
      user_agent: userAgent
    }, undefined, ipAddress, userAgent);
    const { profileData, target_person_id } = await req.json();
    personId = target_person_id;
    // Log request received with data validation
    const hasRequiredData = !!(profileData && target_person_id);
    await logProfileEvent(supabaseAdmin1, 'profile_creation', 'request_validation', hasRequiredData, undefined, personId, undefined, hasRequiredData ? undefined : 'validation_error', hasRequiredData ? undefined : 'Missing profileData or target_person_id', {
      has_profile_data: !!profileData,
      has_person_id: !!target_person_id,
      profile_data_keys: profileData ? Object.keys(profileData) : []
    }, undefined, ipAddress, userAgent);
    if (!profileData || !target_person_id) {
      return new Response(JSON.stringify({
        error: 'Missing profileData or target_person_id'
      }), {
        status: 400,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }
    // Get auth user ID for logging (if available)
    const authHeader = req.headers.get('Authorization');
    if (authHeader) {
      try {
        const token = authHeader.replace('Bearer ', '');
        const { data: { user } } = await supabaseAdmin1.auth.getUser(token);
        authUserId = user?.id;
      } catch (authError) {
        console.log('Could not get auth user for logging:', authError);
      }
    }
    // Log profile creation attempt
    await logProfileEvent(supabaseAdmin1, 'profile_creation', 'database_insert_start', true, authUserId, personId, undefined, undefined, undefined, {
      profile_name: profileData.name,
      has_bio: !!profileData.bio,
      has_email: !!profileData.email,
      field_count: Object.keys(profileData).length
    }, undefined, ipAddress, userAgent);
    // Create the new profile
    const { data: newProfile, error: createError } = await supabaseAdmin1.from('artist_profiles').insert({
      ...profileData,
      person_id: target_person_id,
      set_primary_profile_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }).select().single();
    const duration = Date.now() - startTime;
    profileId = newProfile?.id;
    if (createError) {
      console.error('Profile creation error:', createError);
      // Log creation failure
      await logProfileEvent(supabaseAdmin1, 'profile_creation', 'database_insert_failed', false, authUserId, personId, undefined, 'database_error', createError.message, {
        error_code: createError.code,
        error_hint: createError.hint,
        error_details: createError.details
      }, duration, ipAddress, userAgent);
      // Send Slack notification for failed profile creation
      await sendSlackNotification(supabaseAdmin1, 'profile_creation_failed', `❌ Profile Creation Failed\nUser: ${authUserId || 'unknown'}\nPerson: ${personId}\nError: ${createError.message}\nDuration: ${duration}ms\nIP: ${ipAddress}`);
      return new Response(JSON.stringify({
        success: false,
        message: 'Failed to create profile',
        error: createError.message
      }), {
        status: 500,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }
    // Log successful creation
    await logProfileEvent(supabaseAdmin1, 'profile_creation', 'database_insert_success', true, authUserId, personId, profileId, undefined, undefined, {
      created_profile_id: profileId,
      profile_name: newProfile.name,
      is_primary: !!newProfile.set_primary_profile_at
    }, duration, ipAddress, userAgent);
    // Send Slack notification for successful profile creation
    await sendSlackNotification(supabaseAdmin1, 'profile_creation_success', `✅ Profile Created Successfully\nArtist: ${newProfile.name}\nProfile ID: ${profileId}\nUser: ${authUserId || 'unknown'}\nPerson: ${personId}\nDuration: ${duration}ms\nIP: ${ipAddress}`);
    return new Response(JSON.stringify({
      success: true,
      message: 'Profile created successfully',
      profile: newProfile
    }), {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });
  } catch (error) {
    console.error('Error:', error);
    const duration = Date.now() - startTime;
    // Log unexpected error
    await logProfileEvent(supabaseAdmin, 'profile_creation', 'unexpected_error', false, authUserId, personId, profileId, 'system_error', error.message, {
      error_name: error.name,
      error_stack: error.stack?.substring(0, 500)
    }, duration, ipAddress, userAgent);
    return new Response(JSON.stringify({
      error: error.message
    }), {
      status: 500,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });
  }
});

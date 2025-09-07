import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};
// Helper function to log profile update events
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
        function: 'update-profile-clean',
        ...metadata
      }
    });
  } catch (logError) {
    console.error('Failed to log profile event:', logError);
  }
}
// Helper function to send Slack notifications to profile-debug channel
async function sendSlackNotification(supabase, messageType, text, blocks = null) {
  try {
    await supabase.rpc('queue_slack_notification', {
      p_channel_name: 'profile-debug',
      p_message_type: messageType,
      p_text: text,
      p_blocks: blocks,
      p_event_id: null
    });
  } catch (slackError) {
    console.error('Failed to queue slack notification:', slackError);
  }
}
serve(async (req)=>{
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
    const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');
    // Log function start
    await logProfileEvent(supabase, 'profile_update', 'function_start', true, undefined, undefined, undefined, undefined, undefined, {
      ip_address: ipAddress,
      user_agent: userAgent
    }, undefined, ipAddress, userAgent);
    // Get auth token and verify user
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      await logProfileEvent(supabase, 'profile_update', 'auth_validation', false, undefined, undefined, undefined, 'auth_error', 'No authorization header', {}, Date.now() - startTime, ipAddress, userAgent);
      throw new Error('No authorization header');
    }
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      await logProfileEvent(supabase, 'profile_update', 'auth_validation', false, undefined, undefined, undefined, 'auth_error', `Unauthorized: ${authError?.message || 'No user found'}`, {
        auth_error: authError?.message
      }, Date.now() - startTime, ipAddress, userAgent);
      throw new Error('Unauthorized');
    }
    authUserId = user.id;
    // Log successful authentication
    await logProfileEvent(supabase, 'profile_update', 'auth_validation', true, authUserId, undefined, undefined, undefined, undefined, {
      user_email: user.email
    }, undefined, ipAddress, userAgent);
    const { profile_id, person_id, name, bio, city, country, email, website, instagram, facebook, twitter } = await req.json();
    profileId = profile_id;
    personId = person_id;
    // Log request data validation
    const validationErrors = [];
    if (!profile_id) validationErrors.push('profile_id is required but was missing or null');
    if (!person_id) validationErrors.push('person_id is required but was missing or null');
    if (!name || !name.trim()) validationErrors.push('name is required but was missing, null, or empty');
    const isValidRequest = validationErrors.length === 0;
    await logProfileEvent(supabase, 'profile_update', 'request_validation', isValidRequest, authUserId, personId, profileId, isValidRequest ? undefined : 'validation_error', isValidRequest ? undefined : validationErrors.join('; '), {
      has_profile_id: !!profile_id,
      has_person_id: !!person_id,
      has_name: !!(name && name.trim()),
      field_count: Object.keys({
        profile_id,
        person_id,
        name,
        bio,
        city,
        country,
        email,
        website,
        instagram,
        facebook,
        twitter
      }).filter((key)=>{
        const value = {
          profile_id,
          person_id,
          name,
          bio,
          city,
          country,
          email,
          website,
          instagram,
          facebook,
          twitter
        }[key];
        return value !== undefined && value !== null && value !== '';
      }).length
    }, undefined, ipAddress, userAgent);
    // Validate required fields with detailed error messages
    if (!profile_id) {
      throw new Error('profile_id is required but was missing or null');
    }
    if (!person_id) {
      throw new Error('person_id is required but was missing or null');
    }
    if (!name || !name.trim()) {
      throw new Error('name is required but was missing, null, or empty');
    }
    // Verify ownership - user must own this profile
    await logProfileEvent(supabase, 'profile_update', 'ownership_check_start', true, authUserId, personId, profileId, undefined, undefined, {}, undefined, ipAddress, userAgent);
    const { data: existingProfile, error: checkError } = await supabase.from('artist_profiles').select('person_id').eq('id', profile_id).single();
    if (checkError || !existingProfile) {
      await logProfileEvent(supabase, 'profile_update', 'ownership_check_failed', false, authUserId, personId, profileId, 'profile_not_found', `Profile not found: ${checkError?.message || 'No profile returned'}`, {
        check_error: checkError?.message
      }, Date.now() - startTime, ipAddress, userAgent);
      throw new Error('Profile not found');
    }
    if (existingProfile.person_id !== person_id) {
      await logProfileEvent(supabase, 'profile_update', 'ownership_check_failed', false, authUserId, personId, profileId, 'access_denied', 'Not authorized to update this profile', {
        expected_person_id: person_id,
        actual_person_id: existingProfile.person_id
      }, Date.now() - startTime, ipAddress, userAgent);
      throw new Error('Not authorized to update this profile');
    }
    // Log successful ownership check
    await logProfileEvent(supabase, 'profile_update', 'ownership_check_success', true, authUserId, personId, profileId, undefined, undefined, {}, undefined, ipAddress, userAgent);
    // Clean and validate data
    const updateData = {
      name: name.trim(),
      bio: bio?.trim() || null,
      city: city?.trim() || null,
      country: country?.trim() || null,
      email: email?.trim() || null,
      website: website?.trim() || null,
      instagram: instagram?.trim() || null,
      facebook: facebook?.trim() || null,
      twitter: twitter?.trim() || null,
      updated_at: new Date().toISOString()
    };
    // Log database update attempt
    await logProfileEvent(supabase, 'profile_update', 'database_update_start', true, authUserId, personId, profileId, undefined, undefined, {
      updated_name: updateData.name,
      has_bio: !!updateData.bio,
      has_email: !!updateData.email,
      has_social_links: !!(updateData.instagram || updateData.facebook || updateData.twitter),
      updated_field_count: Object.values(updateData).filter((v)=>v !== null && v !== undefined).length
    }, undefined, ipAddress, userAgent);
    // Update the profile
    const { data: updatedProfile, error: updateError } = await supabase.from('artist_profiles').update(updateData).eq('id', profile_id).select().single();
    const duration = Date.now() - startTime;
    if (updateError) {
      console.error('Profile update error:', updateError);
      // Log update failure
      await logProfileEvent(supabase, 'profile_update', 'database_update_failed', false, authUserId, personId, profileId, 'database_error', updateError.message, {
        error_code: updateError.code,
        error_hint: updateError.hint,
        error_details: updateError.details
      }, duration, ipAddress, userAgent);
      // Send Slack notification for failed profile update
      await sendSlackNotification(supabase, 'profile_update_failed', `❌ Profile Update Failed\nProfile: ${profileId}\nUser: ${authUserId || 'unknown'}\nPerson: ${personId}\nError: ${updateError.message}\nDuration: ${duration}ms\nIP: ${ipAddress}`);
      throw new Error(`Failed to update profile: ${updateError.message}`);
    }
    console.log(`Updated profile for ${updateData.name} (profile ${profile_id})`);
    // Log successful update
    await logProfileEvent(supabase, 'profile_update', 'database_update_success', true, authUserId, personId, profileId, undefined, undefined, {
      profile_name: updatedProfile.name,
      updated_fields: Object.keys(updateData).filter((key)=>updateData[key] !== null)
    }, duration, ipAddress, userAgent);
    // Get contact info from people table for enhanced notification
    let personEmail = null;
    let personPhone = null;
    try {
      const { data: personData } = await supabase.from('people').select('email, phone').eq('id', personId).single();
      if (personData) {
        personEmail = personData.email;
        personPhone = personData.phone;
      }
    } catch (personError) {
      console.error('Failed to get person contact info:', personError);
    }

    // Send enhanced Slack notification with contact information
    const updatedFields = Object.keys(updateData).filter((key)=>updateData[key] !== null).join(', ');
    const basicText = `✅ Profile Updated Successfully\nArtist: ${updatedProfile.name}\nProfile ID: ${profileId}\nUser: ${authUserId || 'unknown'}\nPerson: ${personId}\nUpdated Fields: ${updatedFields}\nDuration: ${duration}ms\nIP: ${ipAddress}`;
    
    const enhancedBlocks = [
      {
        type: "header",
        text: {
          type: "plain_text",
          text: "✅ Profile Updated Successfully"
        }
      },
      {
        type: "section",
        fields: [
          {
            type: "mrkdwn",
            text: `*Artist:*\n${updatedProfile.name}`
          },
          {
            type: "mrkdwn", 
            text: `*Updated Fields:*\n${updatedFields}`
          }
        ]
      },
      {
        type: "section",
        fields: [
          {
            type: "mrkdwn",
            text: `*Location:*\n${[updatedProfile.city, updatedProfile.country].filter(Boolean).join(', ') || 'Not set'}`
          },
          {
            type: "mrkdwn",
            text: `*Artist Info:*\nEntry ID: ${updatedProfile.entry_id || 'Not set'}`
          }
        ]
      },
      {
        type: "section",
        fields: [
          {
            type: "mrkdwn",
            text: `*Profile Email:*\n${updatedProfile.email || 'Not set'}`
          },
          {
            type: "mrkdwn",
            text: `*Profile Phone:*\n${updatedProfile.phone || 'Not set'}`
          }
        ]
      },
      {
        type: "section", 
        fields: [
          {
            type: "mrkdwn",
            text: `*People Email:*\n${personEmail || 'Not set'}`
          },
          {
            type: "mrkdwn",
            text: `*People Phone:*\n${personPhone || 'Not set'}`
          }
        ]
      },
      {
        type: "context",
        elements: [
          {
            type: "mrkdwn",
            text: `Profile ID: \`${profileId}\` | User: ${authUserId || 'unknown'} | Person: ${personId} | Entry ID: ${updatedProfile.entry_id || 'N/A'} | Duration: ${duration}ms | IP: ${ipAddress}`
          }
        ]
      }
    ];

    await sendSlackNotification(supabase, 'profile_update_success', basicText, enhancedBlocks);
    return new Response(JSON.stringify({
      success: true,
      profile: updatedProfile
    }), {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      },
      status: 200
    });
  } catch (error) {
    console.error('Error in update-profile-clean:', error);
    const duration = Date.now() - startTime;
    // Log unexpected error
    const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');
    await logProfileEvent(supabase, 'profile_update', 'unexpected_error', false, authUserId, personId, profileId, 'system_error', error.message, {
      error_name: error.name,
      error_stack: error.stack?.substring(0, 500)
    }, duration, ipAddress, userAgent);
    return new Response(JSON.stringify({
      error: error.message,
      success: false
    }), {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      },
      status: 400
    });
  }
});

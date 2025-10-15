import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};

/**
 * Submit Feedback Edge Function
 * Handles artist feedback submissions and Slack notifications for follow-ups
 */

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const startTime = Date.now();

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // ========================================================================
    // Authentication & Authorization
    // ========================================================================

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({
        error: 'No authorization header',
        success: false,
        debug: {
          timestamp: new Date().toISOString(),
          function_name: 'submit-feedback',
          auth_header_present: false
        }
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 401
      });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return new Response(JSON.stringify({
        error: 'Unauthorized',
        success: false,
        debug: {
          timestamp: new Date().toISOString(),
          function_name: 'submit-feedback',
          auth_error: authError?.message,
          user_present: !!user
        }
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 401
      });
    }

    // Extract person data from JWT claims (V2 auth system)
    let userPersonId = null;
    try {
      const tokenParts = token.split('.');
      if (tokenParts.length === 3) {
        const payload = JSON.parse(atob(tokenParts[1]));
        console.log('JWT payload extracted:', {
          auth_version: payload.auth_version,
          person_id: payload.person_id,
          person_pending: payload.person_pending
        });

        if (payload.auth_version === 'v2-http') {
          if (payload.person_pending === true) {
            return new Response(JSON.stringify({
              error: 'User authentication is incomplete. Please sign in again.',
              success: false,
              debug: {
                user_id: user.id,
                person_pending: true,
                timestamp: new Date().toISOString()
              }
            }), {
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
              status: 400
            });
          }
          if (!payload.person_id) {
            throw new Error('No person data found in authentication token.');
          }
          userPersonId = payload.person_id;
        } else {
          throw new Error(`Unsupported auth version: ${payload.auth_version || 'unknown'}`);
        }
      }
    } catch (jwtError) {
      console.error('Failed to extract person data from JWT:', jwtError);
      return new Response(JSON.stringify({
        error: 'User authentication is incomplete. Please sign in again.',
        success: false,
        debug: {
          user_id: user.id,
          jwt_error: jwtError.message,
          timestamp: new Date().toISOString()
        }
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400
      });
    }

    if (!userPersonId) {
      return new Response(JSON.stringify({
        error: 'User has no person_id in authentication token',
        success: false,
        debug: {
          user_id: user.id,
          timestamp: new Date().toISOString()
        }
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400
      });
    }

    // ========================================================================
    // Parse and validate request body
    // ========================================================================

    const body = await req.json();
    console.log('Feedback submission request:', {
      event_id: body.event_id,
      respondent_type: body.respondent_type,
      artist_profile_id: body.artist_profile_id,
      has_responses: !!body.responses,
      requests_followup: body.requests_followup
    });

    const {
      event_id,
      event_eid,
      feedback_context,
      respondent_type,
      artist_profile_id,
      responses,
      requests_followup,
      followup_message
    } = body;

    // Validate required fields
    if (!event_id || !respondent_type || !responses) {
      return new Response(JSON.stringify({
        error: 'Missing required fields: event_id, respondent_type, and responses are required',
        success: false,
        debug: {
          received_body: body,
          has_event_id: !!event_id,
          has_respondent_type: !!respondent_type,
          has_responses: !!responses,
          timestamp: new Date().toISOString()
        }
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400
      });
    }

    // For artist feedback, validate ownership
    if (respondent_type === 'artist') {
      if (!artist_profile_id) {
        return new Response(JSON.stringify({
          error: 'artist_profile_id is required for artist feedback',
          success: false
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400
        });
      }

      // Verify profile ownership
      const { data: profileOwnership, error: ownershipError } = await supabase
        .from('artist_profiles')
        .select('person_id')
        .eq('id', artist_profile_id)
        .single();

      if (ownershipError || !profileOwnership || profileOwnership.person_id !== userPersonId) {
        return new Response(JSON.stringify({
          error: 'Not authorized to submit feedback for this artist profile',
          success: false,
          debug: {
            user_person_id: userPersonId,
            profile_person_id: profileOwnership?.person_id,
            ownership_error: ownershipError?.message,
            artist_profile_id: artist_profile_id,
            timestamp: new Date().toISOString()
          }
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 403
        });
      }
    }

    // ========================================================================
    // Get event details for context
    // ========================================================================

    const { data: eventData, error: eventError } = await supabase
      .from('events')
      .select('id, eid, name, slack_channel')
      .eq('id', event_id)
      .single();

    if (eventError || !eventData) {
      return new Response(JSON.stringify({
        error: 'Event not found',
        success: false,
        debug: {
          event_id: event_id,
          event_error: eventError?.message,
          timestamp: new Date().toISOString()
        }
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 404
      });
    }

    // ========================================================================
    // Check for duplicate submission
    // ========================================================================

    const { data: existingFeedback } = await supabase
      .from('feedback_submissions')
      .select('id')
      .eq('event_id', event_id)
      .eq('respondent_type', respondent_type)
      .eq('person_id', userPersonId)
      .maybeSingle();

    // Allow resubmission if it's been more than 24 hours or if it's on-demand context
    // For now, we'll allow multiple submissions (user can update their feedback)

    // ========================================================================
    // Get client IP and user agent
    // ========================================================================

    const ip_address = req.headers.get('x-forwarded-for') ||
                       req.headers.get('x-real-ip') ||
                       'unknown';
    const user_agent = req.headers.get('user-agent') || 'unknown';

    // ========================================================================
    // Insert feedback submission
    // ========================================================================

    const feedbackData = {
      event_id: eventData.id,
      event_eid: eventData.eid,
      feedback_context: feedback_context || 'on_demand',
      respondent_type: respondent_type,
      person_id: userPersonId,
      artist_profile_id: artist_profile_id || null,
      submitted_at: new Date().toISOString(),
      ip_address: ip_address,
      user_agent: user_agent,
      requests_followup: requests_followup || false,
      followup_message: followup_message || null,
      followup_status: requests_followup ? 'pending' : 'no_action_needed',
      responses: responses,
      demographic_data: null, // For future guest feedback
      sentiment_score: null,  // For future AI analysis
      tags: null,
      internal_notes: null,
      incentive_granted: false,
      incentive_type: null,
      incentive_granted_at: null
    };

    const { data: newFeedback, error: insertError } = await supabase
      .from('feedback_submissions')
      .insert(feedbackData)
      .select()
      .single();

    if (insertError) {
      console.error('Failed to insert feedback:', insertError);
      return new Response(JSON.stringify({
        error: 'Failed to save feedback: ' + insertError.message,
        success: false,
        debug: {
          insert_error: insertError,
          feedback_data: feedbackData,
          timestamp: new Date().toISOString()
        }
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500
      });
    }

    console.log('Feedback submitted successfully:', {
      feedback_id: newFeedback.id,
      event_eid: eventData.eid,
      respondent_type: respondent_type
    });

    // ========================================================================
    // Send Slack notification if follow-up requested
    // ========================================================================

    if (requests_followup && followup_message) {
      try {
        // Get artist details for Slack message
        let artistDetails = null;
        if (respondent_type === 'artist' && artist_profile_id) {
          const { data: artistData } = await supabase
            .from('artist_profiles')
            .select('name, entry_id, email, phone')
            .eq('id', artist_profile_id)
            .single();
          artistDetails = artistData;
        }

        // Calculate NPS score from responses
        const npsScore = responses.artist_post_event_nps || 'N/A';

        // Build ratings summary
        const ratings = [];
        const ratingMap = {
          'artist_post_event_organization': 'Event Organization',
          'artist_post_event_producer_communication': 'Producer Communication',
          'artist_post_event_artwork_handling': 'Artwork Handling',
          'artist_post_event_technology': 'Technology',
          'artist_post_event_payment': 'Payment Ease',
          'artist_post_event_peer_quality': 'Peer Quality',
          'artist_post_event_venue': 'Venue'
        };

        for (const [key, label] of Object.entries(ratingMap)) {
          if (responses[key]) {
            const rating = responses[key];
            const emoji = rating >= 4 ? '✅' : rating <= 2 ? '⚠️' : '➖';
            ratings.push(`${emoji} ${label}: ${rating}/5`);
          }
        }

        // Format Slack message
        const slackMessage = `🎨 *Artist Feedback Follow-up Request*\n\n` +
          `*Event:* ${eventData.eid} - ${eventData.name}\n` +
          `*Artist:* ${artistDetails?.name || 'Unknown'} (#${artistDetails?.entry_id || 'N/A'})\n` +
          (artistDetails?.email ? `*Email:* ${artistDetails.email}\n` : '') +
          (artistDetails?.phone ? `*Phone:* ${artistDetails.phone}\n` : '') +
          `\n*NPS Score:* ${npsScore}/10\n\n` +
          `*Follow-up Request:*\n${followup_message}\n\n` +
          (ratings.length > 0 ? `*Ratings:*\n${ratings.join('\n')}\n\n` : '') +
          `_Feedback ID: ${newFeedback.id}_`;

        // Determine Slack channel (event-specific or default)
        const slackChannel = eventData.slack_channel || '#feedback';

        // Queue Slack notification using existing RPC function
        const { error: slackError } = await supabase.rpc('queue_slack_notification', {
          p_channel_name: slackChannel,
          p_message_type: 'artist_feedback_followup',
          p_text: slackMessage,
          p_blocks: null,
          p_event_id: eventData.id
        });

        if (slackError) {
          console.error('Failed to queue Slack notification:', slackError);
          // Don't fail the request if Slack notification fails
        } else {
          console.log('Slack notification queued successfully');

          // Update feedback with slack_ts if returned
          // (Note: queue_slack_notification may not return ts immediately)
        }
      } catch (slackError) {
        console.error('Error sending Slack notification:', slackError);
        // Continue - don't fail the feedback submission
      }
    }

    // ========================================================================
    // Return success response
    // ========================================================================

    const duration = Date.now() - startTime;

    return new Response(JSON.stringify({
      success: true,
      message: 'Feedback submitted successfully',
      feedback_id: newFeedback.id,
      duration: duration
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200
    });

  } catch (error) {
    console.error('Error in submit-feedback:', error);
    return new Response(JSON.stringify({
      error: error.message,
      success: false,
      debug: {
        timestamp: new Date().toISOString(),
        error_type: error.constructor.name,
        stack: error.stack,
        function_name: 'submit-feedback'
      }
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500
    });
  }
});

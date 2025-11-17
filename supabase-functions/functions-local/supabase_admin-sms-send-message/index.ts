import { serve } from 'https://deno.land/std@0.131.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Get Supabase client with service role
    const authHeader = req.headers.get('Authorization')!;
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // Extract token and verify user
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    if (userError || !user) {
      throw new Error('Not authenticated');
    }

    // Verify admin access
    const { data: adminCheck } = await supabase
      .from('abhq_admin_users')
      .select('email')
      .eq('email', user.email)
      .eq('active', true)
      .single();

    if (!adminCheck) {
      throw new Error('Unauthorized: Admin access required');
    }

    // Get request parameters
    const { to_phone, message_body, person_id } = await req.json();

    if (!to_phone || !message_body) {
      throw new Error('to_phone and message_body are required');
    }

    // Call the send-marketing-sms function with admin conversation metadata
    const response = await fetch(
      `${Deno.env.get('SUPABASE_URL')}/functions/v1/send-marketing-sms`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          to: to_phone,
          message: message_body,
          metadata: {
            source: 'admin_conversation',
            admin_user: user.email,
            person_id: person_id || null,
            is_reply: true,
            sent_at: new Date().toISOString()
          }
        })
      }
    );

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.error || 'Failed to send message');
    }

    // Log admin action (don't let logging errors break the response)
    try {
      await supabase.rpc('log_sms_activity', {
        p_message_type: 'admin_message',
        p_related_id: result.details?.outbound_id,
        p_phone_number: to_phone,
        p_action: 'sent',
        p_status: 'sent',
        p_message: message_body.substring(0, 100), // Log truncated message for privacy
        p_metadata: {
          admin_user: user.email,
          person_id: person_id,
          source: 'admin_conversation'
        }
      });
    } catch (logError) {
      console.error('Failed to log activity:', logError);
    }

    return new Response(JSON.stringify({
      success: true,
      message_id: result.details?.outbound_id,
      telnyx_id: result.details?.telnyx_message_id,
      sent_at: new Date().toISOString()
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200
    });

  } catch (error) {
    console.error('Error in admin-sms-send-message:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: error.message === 'Unauthorized: Admin access required' ? 403 : 400
    });
  }
});
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
    const { phone_number, limit = 100, offset = 0 } = await req.json();

    if (!phone_number) {
      throw new Error('phone_number is required');
    }

    // Fetch both inbound and outbound messages
    const [inboundResult, outboundResult] = await Promise.all([
      // Inbound messages
      supabase
        .from('sms_inbound')
        .select('*')
        .eq('from_phone', phone_number)
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1),

      // Outbound messages
      supabase
        .from('sms_outbound')
        .select('*')
        .eq('to_phone', phone_number)
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1)
    ]);

    if (inboundResult.error) throw inboundResult.error;
    if (outboundResult.error) throw outboundResult.error;

    // Combine and format messages
    const messages = [
      ...(inboundResult.data || []).map(msg => ({
        id: msg.id,
        type: 'inbound',
        message_body: msg.message_body,
        timestamp: msg.created_at,
        from_phone: msg.from_phone,
        to_phone: msg.to_phone,
        character_count: msg.character_count,
        is_stop_request: msg.is_stop_request,
        is_help_request: msg.is_help_request,
        auto_replied: msg.auto_replied,
        telnyx_message_id: msg.telnyx_message_id
      })),
      ...(outboundResult.data || []).map(msg => ({
        id: msg.id,
        type: 'outbound',
        message_body: msg.message_body,
        timestamp: msg.created_at || msg.sent_at,
        from_phone: msg.from_phone,
        to_phone: msg.to_phone,
        character_count: msg.character_count,
        message_parts: msg.message_parts,
        status: msg.status,
        telnyx_status: msg.telnyx_status,
        cost_cents: msg.cost_cents,
        error_message: msg.error_message,
        campaign_id: msg.campaign_id,
        sent_at: msg.sent_at,
        delivered_at: msg.delivered_at,
        failed_at: msg.failed_at,
        telnyx_message_id: msg.telnyx_message_id
      }))
    ];

    // Sort by timestamp (oldest first for conversation view)
    messages.sort((a, b) =>
      new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );

    // Get person data for this phone number
    const { data: personData } = await supabase
      .from('people')
      .select('id, phone, phone_number, first_name, last_name, email, message_blocked')
      .or(`phone.eq.${phone_number},phone_number.eq.${phone_number}`)
      .single();

    // Get message counts for pagination info
    const [inboundCount, outboundCount] = await Promise.all([
      supabase
        .from('sms_inbound')
        .select('id', { count: 'exact', head: true })
        .eq('from_phone', phone_number),
      supabase
        .from('sms_outbound')
        .select('id', { count: 'exact', head: true })
        .eq('to_phone', phone_number)
    ]);

    const totalMessages = (inboundCount.count || 0) + (outboundCount.count || 0);

    return new Response(JSON.stringify({
      success: true,
      messages,
      person: personData ? {
        id: personData.id,
        name: `${personData.first_name || ''} ${personData.last_name || ''}`.trim(),
        email: personData.email,
        phone: personData.phone || personData.phone_number,
        blocked: personData.message_blocked === 1
      } : null,
      pagination: {
        total: totalMessages,
        limit,
        offset,
        has_more: offset + limit < totalMessages
      }
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200
    });

  } catch (error) {
    console.error('Error in admin-sms-get-conversation:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: error.message === 'Unauthorized: Admin access required' ? 403 : 400
    });
  }
});
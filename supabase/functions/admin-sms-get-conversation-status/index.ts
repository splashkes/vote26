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

    const body = await req.json();
    const { phone_number, phone_numbers, include_history } = body;

    // Batch mode: get statuses for multiple phone numbers
    if (phone_numbers && Array.isArray(phone_numbers)) {
      const { data: statuses, error } = await supabase
        .from('sms_conversation_status')
        .select('phone_number, is_done, marked_at')
        .in('phone_number', phone_numbers)
        .order('marked_at', { ascending: false });

      if (error) throw error;

      // Build map of phone -> latest status
      const statusMap: Record<string, boolean> = {};
      statuses?.forEach(status => {
        if (!statusMap.hasOwnProperty(status.phone_number)) {
          statusMap[status.phone_number] = status.is_done;
        }
      });

      return new Response(JSON.stringify({
        success: true,
        statuses: statusMap
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200
      });
    }

    // Single phone number mode
    if (!phone_number) {
      throw new Error('phone_number or phone_numbers required');
    }

    // Get current status (most recent record)
    const { data: currentStatus } = await supabase
      .from('sms_conversation_status')
      .select('is_done, marked_by_email, marked_at, notes')
      .eq('phone_number', phone_number)
      .order('marked_at', { ascending: false })
      .limit(1)
      .maybeSingle(); // Returns null if no record found

    let history = [];
    if (include_history) {
      const { data: historyData } = await supabase
        .from('sms_conversation_status')
        .select('id, is_done, marked_by_email, marked_at, notes')
        .eq('phone_number', phone_number)
        .order('marked_at', { ascending: true });

      history = historyData || [];
    }

    return new Response(JSON.stringify({
      success: true,
      current_status: currentStatus,
      history
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200
    });

  } catch (error) {
    console.error('Error in admin-sms-get-conversation-status:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: error.message === 'Unauthorized: Admin access required' ? 403 : 400
    });
  }
});

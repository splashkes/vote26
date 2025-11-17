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

    // Get date filter (last 30 days by default)
    const { days = 30 } = await req.json().catch(() => ({}));
    const sinceDate = new Date();
    sinceDate.setDate(sinceDate.getDate() - days);

    // Get all recent SMS activity
    const [inboundResult, outboundResult] = await Promise.all([
      // Get inbound messages
      supabase
        .from('sms_inbound')
        .select('from_phone, message_body, created_at')
        .gte('created_at', sinceDate.toISOString())
        .order('created_at', { ascending: false })
        .limit(500),

      // Get outbound messages
      supabase
        .from('sms_outbound')
        .select('to_phone, message_body, created_at, sent_at')
        .gte('created_at', sinceDate.toISOString())
        .order('created_at', { ascending: false })
        .limit(500)
    ]);

    if (inboundResult.error) throw inboundResult.error;
    if (outboundResult.error) throw outboundResult.error;

    // Build phone activity map
    const phoneMap = new Map();

    // Process inbound messages
    for (const msg of inboundResult.data || []) {
      const phone = msg.from_phone;
      if (!phone) continue;

      const existing = phoneMap.get(phone);
      const msgTime = new Date(msg.created_at);

      if (!existing || msgTime > new Date(existing.last_activity)) {
        phoneMap.set(phone, {
          phone,
          last_message: msg.message_body,
          last_activity: msg.created_at,
          last_inbound: msg.created_at,
          last_outbound: existing?.last_outbound || null,
          inbound_count: (existing?.inbound_count || 0) + 1,
          outbound_count: existing?.outbound_count || 0
        });
      } else {
        existing.inbound_count++;
        if (!existing.last_inbound || msgTime > new Date(existing.last_inbound)) {
          existing.last_inbound = msg.created_at;
        }
      }
    }

    // Process outbound messages
    for (const msg of outboundResult.data || []) {
      const phone = msg.to_phone;
      if (!phone) continue;

      const existing = phoneMap.get(phone);
      const msgTime = new Date(msg.created_at || msg.sent_at);

      if (!existing) {
        phoneMap.set(phone, {
          phone,
          last_message: msg.message_body,
          last_activity: msg.created_at || msg.sent_at,
          last_inbound: null,
          last_outbound: msg.created_at || msg.sent_at,
          inbound_count: 0,
          outbound_count: 1
        });
      } else {
        existing.outbound_count++;
        if (!existing.last_outbound || msgTime > new Date(existing.last_outbound)) {
          existing.last_outbound = msg.created_at || msg.sent_at;
        }
        // Update last activity if this is more recent
        if (msgTime > new Date(existing.last_activity)) {
          existing.last_message = msg.message_body;
          existing.last_activity = msg.created_at || msg.sent_at;
        }
      }
    }

    // Get people data for all phone numbers
    const phoneNumbers = Array.from(phoneMap.keys());
    if (phoneNumbers.length === 0) {
      return new Response(JSON.stringify({
        success: true,
        contacts: []
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200
      });
    }

    // Batch fetch people data
    const { data: peopleData, error: peopleError } = await supabase
      .from('people')
      .select('id, phone, phone_number, first_name, last_name, email, message_blocked')
      .or(phoneNumbers.map(p => `phone.eq.${p}`).join(',') + ',' +
          phoneNumbers.map(p => `phone_number.eq.${p}`).join(','));

    if (peopleError) throw peopleError;

    // Create people lookup map
    const peopleMap = new Map();
    for (const person of peopleData || []) {
      if (person.phone) peopleMap.set(person.phone, person);
      if (person.phone_number) peopleMap.set(person.phone_number, person);
    }

    // Build final contacts list
    const contacts = Array.from(phoneMap.values()).map(contact => {
      const person = peopleMap.get(contact.phone);

      // Calculate unread count (inbound messages after last outbound)
      let unread_count = 0;
      if (contact.last_inbound) {
        if (!contact.last_outbound ||
            new Date(contact.last_inbound) > new Date(contact.last_outbound)) {
          // Has unread messages - for simplicity, show as 1
          // Could do more complex calculation if needed
          unread_count = 1;
        }
      }

      return {
        phone: contact.phone,
        person_id: person?.id || null,
        name: person ? `${person.first_name || ''} ${person.last_name || ''}`.trim() : null,
        email: person?.email || null,
        blocked: person?.message_blocked === 1,
        last_message: contact.last_message?.substring(0, 100), // Truncate for preview
        last_message_at: contact.last_activity,
        unread_count,
        total_messages: contact.inbound_count + contact.outbound_count
      };
    });

    // Sort by most recent activity
    contacts.sort((a, b) =>
      new Date(b.last_message_at).getTime() - new Date(a.last_message_at).getTime()
    );

    return new Response(JSON.stringify({
      success: true,
      contacts,
      total: contacts.length
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200
    });

  } catch (error) {
    console.error('Error in admin-sms-get-contacts:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: error.message === 'Unauthorized: Admin access required' ? 403 : 400
    });
  }
});
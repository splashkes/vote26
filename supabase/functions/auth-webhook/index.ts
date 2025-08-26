// Auth Webhook Edge Function
// Handles person linking after successful phone verification
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};
serve(async (req)=>{
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: corsHeaders
    });
  }
  try {
    // Get Supabase client with service role (internal webhook, no user auth needed)
    const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');
    // Parse webhook payload
    const payload = await req.json();
    console.log('Auth webhook received:', payload.type, payload.table);
    // Only handle user updates where phone_confirmed_at changed
    if (payload.type !== 'UPDATE' || payload.table !== 'users') {
      return new Response(JSON.stringify({
        success: true,
        message: 'Ignored non-user update'
      }), {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }
    const newRecord = payload.record;
    const oldRecord = payload.old_record;
    // Check if phone_confirmed_at changed from null to a value
    if (oldRecord?.phone_confirmed_at || !newRecord?.phone_confirmed_at) {
      return new Response(JSON.stringify({
        success: true,
        message: 'Phone not newly confirmed'
      }), {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }
    console.log('Processing phone confirmation for user:', newRecord.id);
    // Check if already linked
    const { data: existingPerson } = await supabase.from('people').select('id').eq('auth_user_id', newRecord.id).single();
    if (existingPerson) {
      console.log('User already linked to person:', existingPerson.id);
      return new Response(JSON.stringify({
        success: true,
        message: 'User already linked',
        person_id: existingPerson.id
      }), {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }
    // Handle person linking
    const personIdFromMeta = newRecord.raw_user_meta_data?.person_id;
    const personName = newRecord.raw_user_meta_data?.person_name;
    const authPhone = newRecord.phone;
    let personId = null;
    if (personIdFromMeta) {
      // QR scan user: Link existing person record
      console.log('Linking QR scan user to existing person:', personIdFromMeta);
      const { error: updateError } = await supabase.from('people').update({
        auth_user_id: newRecord.id,
        nickname: personName || 'User',
        verified: true,
        updated_at: new Date().toISOString()
      }).eq('id', personIdFromMeta);
      if (updateError) {
        console.error('Error linking existing person:', updateError);
        throw new Error(`Person linking failed: ${updateError.message}`);
      }
      personId = personIdFromMeta;
      console.log('Successfully linked QR user to person:', personId);
    } else {
      // Direct OTP user: Find or create person
      // TODO: Fix hardcoded North America assumption - this breaks international users
      // Current logic strips ALL country codes then forces +1, corrupting international numbers
      // Should preserve original E.164 format and only add +1 for US/Canada numbers without prefix
      let normalizedPhone = authPhone;
      if (normalizedPhone?.startsWith('+1')) {
        normalizedPhone = normalizedPhone.substring(2);
      } else if (normalizedPhone?.startsWith('+')) {
        normalizedPhone = normalizedPhone.substring(1);
      }
      // Try to find existing person with matching phone (prioritize records with actual data)
      const { data: existingPersonByPhone } = await supabase.from('people').select('id, name, auth_user_id').or(`phone.eq.+1${normalizedPhone},phone.eq.+${normalizedPhone},phone.eq.${normalizedPhone},phone.eq.${authPhone},phone_number.eq.+1${normalizedPhone},phone_number.eq.+${normalizedPhone},phone_number.eq.${normalizedPhone},phone_number.eq.${authPhone}`).not('name', 'is', null).neq('name', '').neq('name', 'User').is('auth_user_id', null).order('created_at', {
        ascending: false
      }).limit(1).single();
      if (existingPersonByPhone) {
        // Check if this person is already linked to a different auth user
        if (existingPersonByPhone.auth_user_id && existingPersonByPhone.auth_user_id !== newRecord.id) {
          console.log('Person already linked to different user, unlinking old user first');
          // Unlink the old auth user first (they'll get handled separately if needed)
          await supabase.from('people').update({
            auth_user_id: null
          }).eq('auth_user_id', existingPersonByPhone.auth_user_id);
        }
        // Link existing person
        console.log('Linking OTP user to existing person by phone:', existingPersonByPhone.id);
        const { error: updateError } = await supabase.from('people').update({
          auth_user_id: newRecord.id,
          verified: true,
          updated_at: new Date().toISOString()
        }).eq('id', existingPersonByPhone.id);
        if (updateError) {
          console.error('Error linking existing person by phone:', updateError);
          throw new Error(`Person linking failed: ${updateError.message}`);
        }
        personId = existingPersonByPhone.id;
        console.log('Successfully linked OTP user to existing person:', personId);
      } else {
        // Create new person
        console.log('Creating new person for OTP user');
        const { data: newPerson, error: createError } = await supabase.from('people').insert({
          phone: `+1${normalizedPhone}`, // CRITICAL BUG: Forces +1 on ALL numbers including international
          name: 'User',
          nickname: 'User',
          auth_user_id: newRecord.id,
          verified: true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }).select('id').single();
        if (createError) {
          console.error('Error creating new person:', createError);
          throw new Error(`Person creation failed: ${createError.message}`);
        }
        personId = newPerson.id;
        console.log('Successfully created new person:', personId);
      }
    }
    return new Response(JSON.stringify({
      success: true,
      message: 'Person linked successfully',
      user_id: newRecord.id,
      person_id: personId
    }), {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });
  } catch (error) {
    console.error('Error in auth webhook:', error);
    return new Response(JSON.stringify({
      success: false,
      error: 'Auth webhook error',
      message: error.message
    }), {
      status: 500,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });
  }
});

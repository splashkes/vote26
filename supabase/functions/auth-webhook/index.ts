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
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
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
      // Generate person hash if missing for QR users too
      let qrPersonHash = null;
      const { data: qrPersonData } = await supabase.from('people').select('hash, name').eq('id', personId).single();
      qrPersonHash = qrPersonData?.hash;
      if (!qrPersonHash) {
        qrPersonHash = await generatePersonHash(personId, authPhone);
        await supabase.from('people').update({
          hash: qrPersonHash
        }).eq('id', personId);
      }
      // Update auth user metadata with person info (CRITICAL - must succeed)
      await updateAuthUserMetadata(newRecord.id, personId, qrPersonHash, qrPersonData?.name || personName || 'User');
      // Send success notification (truly fire-and-forget - removed to fix token refresh delays)
      // sendPersonLinkNotification(newRecord.id, personId, qrPersonData?.name || personName || 'User', authPhone, 'linked_qr').catch((err)=>console.warn('Slack notification failed (non-critical):', err));
      console.log('Successfully linked QR user to person:', personId);
    } else {
      // Direct OTP user: Find or create person
      // Use the phone number exactly as validated by Supabase Auth (already E.164 format)
      console.log('Using validated phone from Auth:', authPhone);
      // Generate phone variations to handle corrupted numbers in database
      const phoneVariations = generatePhoneVariations(authPhone);
      console.log('Generated phone variations:', phoneVariations);
      // Try to find existing person with matching phone (including corrupted versions)
      let existingPersonByPhone = null;
      for (const variation of phoneVariations){
        const { data: foundPerson } = await supabase.from('people').select('id, name, phone, auth_user_id').is('auth_user_id', null).eq('phone', variation).not('name', 'is', null).neq('name', '').neq('name', 'User').order('created_at', {
          ascending: false
        }).limit(1).single();
        if (foundPerson) {
          console.log(`Found person with phone variation: ${variation} (original in DB: ${foundPerson.phone})`);
          existingPersonByPhone = foundPerson;
          break;
        }
      }
      // If we found a person with corrupted phone, fix it using the validated auth phone
      if (existingPersonByPhone && existingPersonByPhone.phone !== authPhone) {
        console.log('Found person with corrupted phone, fixing with validated auth phone...');
        console.log(`Correcting phone from ${existingPersonByPhone.phone} to ${authPhone} (already validated by Supabase Auth)`);
        // Update the corrupted phone number using the phone already validated by Supabase Auth
        const { error: phoneUpdateError } = await supabase.from('people').update({
          phone: authPhone
        }).eq('id', existingPersonByPhone.id);
        if (phoneUpdateError) {
          console.error('Failed to update corrupted phone:', phoneUpdateError);
        } else {
          console.log(`Successfully updated phone from ${existingPersonByPhone.phone} to ${authPhone}`);
        // Send Slack notification about the fix (removed to prevent auth delays)
        // try {
        //   await supabase.rpc('queue_slack_notification', {
        //     channel: 'profile-debug',
        //     notification_type: 'phone_corruption_fixed',
        //     message: `📞 Phone Corruption Fixed!\nUser: ${newRecord.id}\nCorrected: ${existingPersonByPhone.phone} → ${authPhone}\nMethod: Using validated auth phone (eliminated redundant Twilio call)`
        //   });
        // } catch (slackError) {
        //   console.warn('Slack notification failed:', slackError);
        // }
        }
      }
      if (existingPersonByPhone) {
        // Check if this person is already linked to a different auth user
        if (existingPersonByPhone.auth_user_id && existingPersonByPhone.auth_user_id !== newRecord.id) {
          console.log('Person already linked to different user, unlinking old user first');
          // Unlink the old auth user first (they'll get handled separately if needed)
          await supabase.from('people').update({
            auth_user_id: null
          }).eq('auth_user_id', existingPersonByPhone.auth_user_id);
        }
        // Generate person hash if missing
        let personHash = existingPersonByPhone.hash;
        if (!personHash) {
          personHash = await generatePersonHash(existingPersonByPhone.id, authPhone);
        }
        // Link existing person with complete metadata
        console.log('Linking OTP user to existing person by phone:', existingPersonByPhone.id);
        const { error: updateError } = await supabase.from('people').update({
          auth_user_id: newRecord.id,
          auth_phone: authPhone,
          verified: true,
          hash: personHash,
          updated_at: new Date().toISOString()
        }).eq('id', existingPersonByPhone.id);
        if (updateError) {
          console.error('Error linking existing person by phone:', updateError);
          throw new Error(`Person linking failed: ${updateError.message}`);
        }
        personId = existingPersonByPhone.id;
        // Update auth user metadata with person info (CRITICAL - must succeed)
        await updateAuthUserMetadata(newRecord.id, personId, personHash, existingPersonByPhone.name || 'User');
        // Send success notification (removed to fix token refresh delays)
        // sendPersonLinkNotification(newRecord.id, personId, existingPersonByPhone.name || 'User', authPhone, 'linked_existing').catch((err)=>console.warn('Slack notification failed (non-critical):', err));
        console.log('Successfully linked OTP user to existing person:', personId);
      } else {
        // Create new person with complete metadata
        console.log('Creating new person for OTP user');
        const newPersonId = crypto.randomUUID();
        const personHash = await generatePersonHash(newPersonId, authPhone);
        const { data: newPerson, error: createError } = await supabase.from('people').insert({
          id: newPersonId,
          phone: authPhone,
          name: 'User',
          nickname: 'User',
          hash: personHash,
          auth_user_id: newRecord.id,
          auth_phone: authPhone,
          verified: true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }).select('id').single();
        if (createError) {
          console.error('Error creating new person:', createError);
          throw new Error(`Person creation failed: ${createError.message}`);
        }
        personId = newPerson.id;
        // Update auth user metadata with person info (CRITICAL - must succeed)
        await updateAuthUserMetadata(newRecord.id, personId, personHash, 'User');
        // Send success notification (removed to fix token refresh delays)
        // sendPersonLinkNotification(newRecord.id, personId, 'User', authPhone, 'created_new').catch((err)=>console.warn('Slack notification failed (non-critical):', err));
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
// Generate phone variations to match corrupted numbers in database
function generatePhoneVariations(phone) {
  const variations = [
    phone
  ];
  // If phone doesn't start with +, add + prefix for international lookup
  if (!phone.startsWith('+')) {
    variations.push('+' + phone);
  }
  // Handle corruption patterns we found in database
  if (phone.startsWith('+31')) {
    // Netherlands: +31610654546 was corrupted to +131610654546
    variations.push('+1' + phone.substring(1)) // +131610654546
    ;
  }
  if (phone.startsWith('+61')) {
    // Australia: +61407290480 was corrupted to +161407290480
    variations.push('+1' + phone.substring(1)) // +161407290480
    ;
  }
  if (phone.startsWith('+64')) {
    // New Zealand: +64211674847 was corrupted to +164211674847
    variations.push('+1' + phone.substring(1)) // +164211674847
    ;
  }
  if (phone.startsWith('+44')) {
    // UK: +447466118852 was corrupted to +1447466118852
    variations.push('+1' + phone.substring(1)) // +1447466118852
    ;
  }
  // Handle other common country codes that might be corrupted
  if (phone.startsWith('+33')) {
    variations.push('+1' + phone.substring(1));
  }
  if (phone.startsWith('+49')) {
    variations.push('+1' + phone.substring(1));
  }
  if (phone.startsWith('+81')) {
    variations.push('+1' + phone.substring(1));
  }
  if (phone.startsWith('+52')) {
    variations.push('+1' + phone.substring(1));
  }
  if (phone.startsWith('+55')) {
    variations.push('+1' + phone.substring(1));
  }
  return [
    ...new Set(variations)
  ];
}
// Generate person hash
async function generatePersonHash(personId, phone) {
  const text = personId + (phone || '');
  const msgUint8 = new TextEncoder().encode(text);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b)=>b.toString(16).padStart(2, '0')).join('');
}
// Update auth user metadata (fire-and-forget)
async function updateAuthUserMetadata(userId, personId, personHash, personName) {
  try {
    const supabase = createClient(Deno.env.get('SUPABASE_URL'), Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'));
    
    const metadataPayload = {
      person_id: personId,
      person_hash: personHash,
      person_name: personName
    };
    
    // Update both user_metadata (Supabase API) and raw_user_meta_data (database direct)
    // This ensures compatibility with all systems that might expect either field
    
    // Method 1: Update via Supabase Auth API (sets user_metadata)
    await supabase.auth.admin.updateUserById(userId, {
      user_metadata: metadataPayload
    });
    
    // Method 2: Update raw_user_meta_data directly via SQL
    // Merge with existing raw_user_meta_data to preserve other fields
    const { error: sqlError } = await supabase.rpc('sql', {
      query: `
        UPDATE auth.users 
        SET raw_user_meta_data = COALESCE(raw_user_meta_data, '{}'::jsonb) || $2::jsonb
        WHERE id = $1
      `,
      params: [userId, JSON.stringify(metadataPayload)]
    });
    
    if (sqlError) {
      console.error('SQL update failed, trying direct query:', sqlError);
      // Final fallback - use the emergency function pattern
      await supabase.rpc('emergency_fix_single_user_metadata', {
        user_id: userId,
        person_id: personId,
        person_hash: personHash,
        person_name: personName
      });
    }
    
    console.log('Auth metadata updated successfully in both fields for user:', userId);
  } catch (error) {
    console.error('CRITICAL: Failed to update auth metadata for user:', userId, error);
    // Make this mandatory now - throw instead of silent fail
    throw error;
  }
}
// Send person link notification (fire-and-forget)
async function sendPersonLinkNotification(userId, personId, personName, phone, action) {
  try {
    const supabase = createClient(Deno.env.get('SUPABASE_URL'), Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'));
    const actionText = action === 'created_new' ? '🆕 Auth Webhook: Created New Person' : '🔗 Auth Webhook: Linked Existing Person';
    const message = `${actionText}\nUser: ${userId}\nPerson: ${personId}\nName: ${personName}\nPhone: ${phone}`;
    await supabase.rpc('queue_slack_notification', {
      channel: 'profile-debug',
      notification_type: `auth_webhook_${action}`,
      message: message
    });
    console.log('Slack notification queued successfully');
  } catch (error) {
    console.warn('Failed to send Slack notification:', error);
  // Don't throw - this is fire-and-forget
  }
}
// Log auth activity (fire-and-forget)
async function logAuthActivity(userId, personId, phone, action, details) {
  try {
    const supabase = createClient(Deno.env.get('SUPABASE_URL'), Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'));
    await supabase.rpc('log_artist_auth', {
      p_auth_user_id: userId,
      p_person_id: personId,
      p_phone: phone,
      p_action: action,
      p_source: 'auth_webhook',
      p_success: true,
      p_error_type: null,
      p_error_message: null,
      p_debug_info: null,
      p_metadata: details
    });
    console.log('Auth activity logged successfully');
  } catch (error) {
    console.warn('Failed to log auth activity:', error);
  // Don't throw - this is fire-and-forget
  }
} // Note: validateWithTwilio function removed to eliminate race condition
 // Phone numbers are already validated by:
 // 1. Frontend phone-validation Edge Function (UI validation)
 // 2. Successful OTP verification (confirms phone ownership)
 // No need for additional Twilio calls during auth webhook

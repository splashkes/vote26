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
    // Handle person linking - UNIFIED APPROACH for all users
    // No need to distinguish QR vs non-QR users - same process for everyone
    const authPhone = newRecord.phone;
    let personId = null;
    
    console.log('Processing phone confirmation for user - unified approach');
    
    // Use the phone number exactly as validated by Supabase Auth (already E.164 format)
    console.log('Using validated phone from Auth:', authPhone);
    
    // Generate phone variations to handle corrupted numbers in database
    const phoneVariations = generatePhoneVariations(authPhone);
    console.log('Generated phone variations:', phoneVariations);
    
    // Try to find existing person with matching phone (including corrupted versions)
    let existingPersonByPhone = null;
    for (const variation of phoneVariations) {
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
      }
    }
    
    if (existingPersonByPhone) {
      // Check if this person is already linked to a different auth user
      if (existingPersonByPhone.auth_user_id && existingPersonByPhone.auth_user_id !== newRecord.id) {
        console.log('Person already linked to different user, unlinking old user first');
        // Unlink the old auth user first (they'll get handled separately if needed)
        await supabase.from('people').update({
          auth_user_id: null
        }).eq('id', existingPersonByPhone.id);
      }
      
      // Link existing person to new auth user
      console.log('Linking user to existing person by phone:', existingPersonByPhone.id);
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
      
      // Generate person hash if missing
      let personHash = null;
      const { data: personData } = await supabase.from('people').select('hash').eq('id', personId).single();
      personHash = personData?.hash;
      if (!personHash) {
        personHash = await generatePersonHash(personId, authPhone);
        await supabase.from('people').update({
          hash: personHash
        }).eq('id', personId);
      }
      
      // Update auth user metadata with person info (BLOCKING - must succeed)  
      await updateAuthUserMetadata(newRecord.id, personId, personHash, existingPersonByPhone.name || 'User');
      console.log('Successfully linked user to existing person:', personId);
    } else {
      // Create new person with complete metadata
      console.log('Creating new person for user');
      const newPersonId = crypto.randomUUID();
      const personHash = await generatePersonHash(newPersonId, authPhone);
      const { data: newPerson, error: createError } = await supabase.from('people').insert({
        id: newPersonId,
        phone: authPhone,
        name: 'User',
        nickname: 'User',
        hash: personHash,
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
      
      // Update auth user metadata with person info (BLOCKING - must succeed)
      await updateAuthUserMetadata(newRecord.id, personId, personHash, 'User');
      console.log('Successfully created new person:', personId);
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
// Generate phone variations to handle corrupted data
function generatePhoneVariations(phone) {
  const variations = [phone];
  // Handle corruption patterns found in database
  if (phone.startsWith('+31')) {
    variations.push('+1' + phone.substring(1)); // +131610654546
  }
  if (phone.startsWith('+61')) {
    variations.push('+1' + phone.substring(1)); // +161407290480
  }
  if (phone.startsWith('+64')) {
    variations.push('+1' + phone.substring(1)); // +164211674847
  }
  if (phone.startsWith('+44')) {
    variations.push('+1' + phone.substring(1)); // +1447466118852
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
  return [...new Set(variations)];
}
// Generate person hash
async function generatePersonHash(personId, phone) {
  const data = personId + (phone || '');
  const msgUint8 = new TextEncoder().encode(data);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b)=>b.toString(16).padStart(2, '0')).join('');
}
// Update auth user metadata (CRITICAL - must succeed)
async function updateAuthUserMetadata(userId, personId, personHash, personName) {
  try {
    const supabase = createClient(Deno.env.get('SUPABASE_URL'), Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'));
    
    // Use simple, working approach - only set user_metadata via Auth API
    await supabase.auth.admin.updateUserById(userId, {
      user_metadata: {
        person_id: personId,
        person_hash: personHash,
        person_name: personName
      }
    });
    
    console.log('Auth metadata updated successfully for user:', userId);
  } catch (error) {
    console.error('CRITICAL: Failed to update auth metadata for user:', userId, error);
    // This must succeed - throw error to fail the webhook
    throw new Error(`Auth metadata update failed: ${error.message}`);
  }
}
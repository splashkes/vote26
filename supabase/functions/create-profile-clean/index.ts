import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};
serve(async (req)=>{
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: corsHeaders
    });
  }
  try {
    const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');
    // Get auth token and verify user
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('No authorization header');
    }
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      throw new Error('Unauthorized');
    }

    // Extract person data from JWT claims (V2 auth system)
    let personId = null;
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
            throw new Error('Cannot save profile: user authentication is missing. Please sign in again.');
          }
          if (!payload.person_id) {
            throw new Error('Cannot save profile: no person data found in authentication token.');
          }
          personId = payload.person_id;
        } else {
          throw new Error(`Unsupported auth version: ${payload.auth_version || 'unknown'}`);
        }
      }
    } catch (jwtError) {
      console.error('Failed to extract person data from JWT:', jwtError);
      throw new Error('Cannot save profile: user authentication is missing. Please sign in again.');
    }

    if (!personId) {
      throw new Error('Cannot save profile: user authentication is missing. Please sign in again.');
    }

    const { name, bio, city, country, email, website, instagram, facebook, twitter } = await req.json();
    // Validate required fields
    if (!name || !name.trim()) {
      throw new Error('name is required');
    }
    // Clean and validate data
    const cleanedData = {
      person_id: personId,
      name: name.trim(),
      bio: bio?.trim() || null,
      city: city?.trim() || null,
      country: country?.trim() || null,
      email: email?.trim() || null,
      website: website?.trim() || null,
      instagram: instagram?.trim() || null,
      facebook: facebook?.trim() || null,
      twitter: twitter?.trim() || null,
      phone: user.phone || null,
      set_primary_profile_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    // Create the profile
    const { data: newProfile, error: createError } = await supabase.from('artist_profiles').insert(cleanedData).select().single();
    if (createError) {
      throw new Error(`Failed to create profile: ${createError.message}`);
    }
    console.log(`Created profile for ${cleanedData.name} (person ${personId})`);
    return new Response(JSON.stringify({
      success: true,
      profile: newProfile
    }), {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      },
      status: 200
    });
  } catch (error) {
    console.error('Error in create-profile-clean:', error);
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

// Admin Artist Search for Broadcast App
// Date: 2025-10-16
// Purpose: Server-side artist search with phone deduplication for event admin panel

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    console.log('🔍 Admin Artist Search (Broadcast) function called');

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    // Validate authentication (optional - could check admin status)
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization' }),
        { status: 401, headers: corsHeaders }
      );
    }

    const requestBody = await req.json();
    const { query } = requestBody;

    if (!query || query.trim().length === 0) {
      return new Response(
        JSON.stringify({ data: [] }),
        { status: 200, headers: corsHeaders }
      );
    }

    console.log('📋 Search query:', query);

    // Check if query is numeric for entry_id search
    const isNumeric = /^\d+$/.test(query.trim());
    const searchTerm = query.trim();

    // Fetch all matching profiles (server-side filtering)
    const { data: profiles, error: searchError } = await supabase
      .from('artist_profiles')
      .select('id, name, city_text, instagram, entry_id, person_id, phone, set_primary_profile_at, created_at')
      .not('name', 'is', null)
      .is('superseded_by', null)
      .or(isNumeric
        ? `name.ilike.%${searchTerm}%,city_text.ilike.%${searchTerm}%,instagram.ilike.%${searchTerm}%,entry_id.eq.${searchTerm}`
        : `name.ilike.%${searchTerm}%,city_text.ilike.%${searchTerm}%,instagram.ilike.%${searchTerm}%`
      )
      .order('set_primary_profile_at', { ascending: false, nullsLast: true })
      .order('created_at', { ascending: false })
      .limit(50);

    if (searchError) {
      throw searchError;
    }

    // Server-side deduplication by normalized phone number
    const normalizePhone = (phone: string | null) => {
      if (!phone) return null;
      return phone.replace(/[\s\-\(\)\+]/g, '');
    };

    const seenPhones = new Set<string>();
    const deduplicated = (profiles || []).filter((artist: any) => {
      const normalized = normalizePhone(artist.phone);
      if (normalized && seenPhones.has(normalized)) {
        return false;
      }
      if (normalized) {
        seenPhones.add(normalized);
      }
      return true;
    }).slice(0, 20);

    console.log('✅ Search completed:', deduplicated.length, 'unique results from', profiles?.length, 'total');

    return new Response(
      JSON.stringify({ data: deduplicated }),
      { status: 200, headers: corsHeaders }
    );

  } catch (error) {
    console.error('❌ Search error:', error);
    return new Response(
      JSON.stringify({
        error: 'Failed to search artists',
        details: error.message
      }),
      { status: 500, headers: corsHeaders }
    );
  }
});

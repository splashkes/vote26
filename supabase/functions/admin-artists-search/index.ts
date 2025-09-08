// Admin Artists Search Function
// Date: September 8, 2025
// Purpose: Search and filter artists with location support for admin interface

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS'
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    console.log('🔍 Admin Artists Search function called');
    
    // Initialize Supabase client with service role
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    // Validate admin access
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization' }),
        { status: 401, headers: corsHeaders }
      );
    }

    const requestBody = await req.json();
    const { searchTerm = '', limit = 1000, city = null, country = null } = requestBody;

    console.log('📋 Search parameters:', { searchTerm, limit, city, country });

    // Fetch artist profiles with search and location filters
    let profilesQuery = supabase
      .from('artist_profiles')
      .select(`
        id, entry_id, name, email, phone, city, country, city_text,
        studio_location, bio, abhq_bio, instagram, website, specialties,
        created_at, updated_at
      `)
      .not('entry_id', 'is', null)
      .filter('entry_id', 'not.is', null); // Additional filter to ensure entry_id exists

    // Apply search term filter
    if (searchTerm.trim()) {
      const term = searchTerm.trim();
      const numericTerm = parseInt(term);
      
      if (!isNaN(numericTerm)) {
        // If it's a number, search entry_id
        profilesQuery = profilesQuery.eq('entry_id', numericTerm);
      } else {
        // Text search - use or filter properly
        profilesQuery = profilesQuery.or(`name.ilike.%${term}%,email.ilike.%${term}%,phone.ilike.%${term}%`);
      }
    }

    // Apply city filter
    if (city) {
      profilesQuery = profilesQuery.ilike('city', `%${city}%`);
    }

    // Apply country filter with basic normalization
    if (country) {
      if (country === 'US' || country === 'United States') {
        profilesQuery = profilesQuery.or('country.ilike.%US%,country.ilike.%United States%,country.ilike.%USA%');
      } else if (country === 'UK' || country === 'United Kingdom') {
        profilesQuery = profilesQuery.or('country.ilike.%UK%,country.ilike.%United Kingdom%');
      } else {
        profilesQuery = profilesQuery.ilike('country', `%${country}%`);
      }
    }

    const { data: profilesData, error: profilesError } = await profilesQuery
      .order('updated_at', { ascending: false })
      .limit(limit);

    if (profilesError) {
      return new Response(
        JSON.stringify({
          error: 'Failed to fetch artist profiles',
          success: false,
          debug: {
            timestamp: new Date().toISOString(),
            function_name: 'admin-artists-search',
            search_params: { searchTerm, limit, city, country },
            profile_error: {
              message: profilesError.message,
              details: profilesError.details,
              hint: profilesError.hint,
              code: profilesError.code
            },
            query_info: {
              has_search_term: !!searchTerm.trim(),
              has_city_filter: !!city,
              has_country_filter: !!country,
              search_term_numeric: !isNaN(parseInt(searchTerm))
            }
          }
        }),
        { status: 500, headers: corsHeaders }
      );
    }

    console.log('👥 Found profiles:', profilesData?.length || 0);

    // Extract artist numbers for related data queries
    const artistNumbers = profilesData?.map((p: any) => p.entry_id).filter(Boolean) || [];
    
    if (artistNumbers.length === 0) {
      return new Response(
        JSON.stringify({
          profiles: [],
          applications: [],
          invitations: [],
          confirmations: []
        }),
        { status: 200, headers: corsHeaders }
      );
    }

    // Build related data queries in parallel - simplified to avoid circular references
    const [applicationsData, invitationsData, confirmationsData] = await Promise.all([
      // Applications
      supabase
        .from('artist_applications')
        .select('id, artist_number, event_eid, applied_at, entry_date, application_status')
        .in('artist_number', artistNumbers)
        .order('applied_at', { ascending: false }),

      // Invitations
      supabase
        .from('artist_invitations')
        .select('id, artist_number, event_eid, created_at, entry_date, status')
        .in('artist_number', artistNumbers)
        .order('created_at', { ascending: false }),

      // Confirmations
      supabase
        .from('artist_confirmations')
        .select('id, artist_number, event_eid, created_at, entry_date, confirmation_status')
        .in('artist_number', artistNumbers)
        .order('created_at', { ascending: false })
    ]);

    // Check for errors in related queries
    if (applicationsData.error || invitationsData.error || confirmationsData.error) {
      return new Response(
        JSON.stringify({
          error: 'Failed to fetch related artist data',
          success: false,
          debug: {
            timestamp: new Date().toISOString(),
            function_name: 'admin-artists-search',
            search_params: { searchTerm, limit, city, country },
            profiles_found: profilesData?.length || 0,
            artist_numbers: artistNumbers,
            errors: {
              applications: applicationsData.error?.message,
              invitations: invitationsData.error?.message,
              confirmations: confirmationsData.error?.message
            }
          }
        }),
        { status: 500, headers: corsHeaders }
      );
    }

    const response = {
      profiles: profilesData || [],
      applications: applicationsData.data || [],
      invitations: invitationsData.data || [],
      confirmations: confirmationsData.data || []
    };

    console.log('✅ Search completed successfully:', {
      profiles: response.profiles.length,
      applications: response.applications.length,
      invitations: response.invitations.length,
      confirmations: response.confirmations.length
    });

    return new Response(
      JSON.stringify(response),
      { status: 200, headers: corsHeaders }
    );

  } catch (error) {
    return new Response(
      JSON.stringify({ 
        error: 'Failed to search artists',
        success: false,
        debug: {
          timestamp: new Date().toISOString(),
          function_name: 'admin-artists-search',
          search_params: { searchTerm, limit, city, country },
          error_details: {
            message: error.message,
            name: error.name,
            stack: error.stack
          },
          auth_info: {
            has_auth_header: !!authHeader,
            auth_header_length: authHeader ? authHeader.length : 0
          }
        }
      }),
      { status: 500, headers: corsHeaders }
    );
  }
});
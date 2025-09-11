import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS'
};

interface ContentFilters {
  content_type?: string;
  status?: string;
  search?: string;
  date_from?: string;
  date_to?: string;
  has_images?: boolean;
  curator_type?: string;
}

interface ContentUpdate {
  title?: string;
  description?: string;
  status?: string;
  tags?: string[];
  mood_tags?: string[];
  engagement_score?: number;
  trending_score?: number;
  quality_score?: number;
  available_until?: string;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Create Supabase client with service role key
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    
    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error('Missing Supabase configuration');
    }
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    
    // Verify the request is from an authenticated admin using RPC
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({
        success: false,
        error: 'No authorization header'
      }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Create user-scoped client to check admin status
    const userSupabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      {
        global: {
          headers: { Authorization: authHeader }
        }
      }
    );

    // Check if user is admin using RPC function
    const { data: adminData, error: adminError } = await userSupabase
      .rpc('get_current_user_admin_info');

    if (adminError || !adminData || adminData.length === 0) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Access denied: User is not an admin'
      }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const adminUser = adminData[0];

    const url = new URL(req.url);
    const method = req.method;

    // GET /admin-content-library - List content with filters and pagination
    if (method === 'GET') {
      const page = parseInt(url.searchParams.get('page') || '1');
      const limit = parseInt(url.searchParams.get('limit') || '20');
      const offset = (page - 1) * limit;
      const sortBy = url.searchParams.get('sort_by') || 'created_at';
      const sortDirection = url.searchParams.get('sort_direction') || 'desc';

      const filters: ContentFilters = {
        content_type: url.searchParams.get('content_type') || undefined,
        status: url.searchParams.get('status') || undefined,
        search: url.searchParams.get('search') || undefined,
        date_from: url.searchParams.get('date_from') || undefined,
        date_to: url.searchParams.get('date_to') || undefined,
        has_images: url.searchParams.get('has_images') === 'true' ? true : undefined,
        curator_type: url.searchParams.get('curator_type') || undefined
      };

      // Build the select query including cached stats
      let selectFields = `
        *,
        curator:people(name, email),
        cached_total_views,
        cached_avg_dwell_time_ms
      `;

      let query = supabase
        .from('app_curated_content')
        .select(selectFields, { count: 'exact' });

      // Apply filters
      if (filters.content_type) {
        query = query.eq('content_type', filters.content_type);
      }
      if (filters.status) {
        query = query.eq('status', filters.status);
      }
      if (filters.curator_type) {
        query = query.eq('curator_type', filters.curator_type);
      }
      if (filters.search) {
        query = query.or(`title.ilike.%${filters.search}%,description.ilike.%${filters.search}%`);
      }
      if (filters.date_from) {
        query = query.gte('created_at', filters.date_from);
      }
      if (filters.date_to) {
        query = query.lte('created_at', filters.date_to);
      }
      if (filters.has_images === true) {
        query = query.or('image_url.not.is.null,image_urls.not.is.null');
      }

      // Handle database-level sorting for all fields including stats
      const ascending = sortDirection === 'asc';
      let sortColumn = sortBy;
      
      // Map sort fields to actual database columns
      if (sortBy === 'total_views') {
        sortColumn = 'cached_total_views';
      } else if (sortBy === 'avg_dwell_time') {
        sortColumn = 'cached_avg_dwell_time_ms';
      }
      
      // Apply sorting and pagination at database level
      query = query
        .order(sortColumn, { ascending })
        .range(offset, offset + limit - 1);

      const { data: content, error: contentError, count } = await query;

      if (contentError) {
        throw contentError;
      }

      // Add calculated stats fields from cached database columns
      let finalContent = (content || []).map(item => ({
        ...item,
        calculated_total_views: item.cached_total_views || 0,
        calculated_avg_dwell_time: item.cached_avg_dwell_time_ms || 0,
        calculated_total_likes: 0,
        calculated_total_shares: 0,
        calculated_total_saves: 0
      }));

      return new Response(JSON.stringify({
        success: true,
        data: finalContent,
        pagination: {
          page,
          limit,
          total: count || 0,
          total_pages: Math.ceil((count || 0) / limit)
        },
        debug: (() => {
          try {
            return {
              timestamp: new Date().toISOString(),
              function_name: 'admin-content-library',
              content_count: finalContent.length,
              has_content: finalContent.length > 0,
              extracted_uuids: finalContent.map(item => {
                const uuidMatch = item.content_id.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
                return { 
                  content_id: item.content_id, 
                  extracted_uuid: uuidMatch ? uuidMatch[0] : null,
                  has_calculated_views: item.calculated_total_views !== undefined
                };
              }),
              stats_fields_present: finalContent.length > 0 ? {
                first_item_has_calculated_views: finalContent[0].calculated_total_views !== undefined,
                first_item_has_calculated_dwell: finalContent[0].calculated_avg_dwell_time !== undefined
              } : null
            };
          } catch (debugError) {
            return {
              debug_error: debugError.message,
              timestamp: new Date().toISOString(),
              function_name: 'admin-content-library'
            };
          }
        })()
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // POST /admin-content-library - Create new manual content
    if (method === 'POST') {
      const body = await req.json();
      const {
        content_type,
        title,
        description,
        image_url,
        image_urls,
        thumbnail_url,
        thumbnail_urls,
        video_url,
        tags = [],
        mood_tags = [],
        data = {},
        available_until
      } = body;

      if (!content_type || !title) {
        return new Response(JSON.stringify({
          success: false,
          error: 'content_type and title are required'
        }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // Generate unique UUID for content_id (compatible with analytics table)
      const content_id = crypto.randomUUID();

      const { data: newContent, error: createError } = await supabase
        .from('app_curated_content')
        .insert({
          content_id,
          content_type,
          title,
          description,
          image_url,
          image_urls,
          thumbnail_url,
          thumbnail_urls,
          video_url,
          tags,
          mood_tags,
          data,
          status: 'active',
          curator_type: 'manual',
          curator_id: adminUser.user_id,
          available_until,
          engagement_score: 1.0,
          trending_score: 1.0,
          quality_score: 1.0
        })
        .select()
        .single();

      if (createError) {
        throw createError;
      }

      return new Response(JSON.stringify({
        success: true,
        data: newContent
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // PUT /admin-content-library/:id - Update content
    if (method === 'PUT') {
      const pathParts = url.pathname.split('/');
      const contentId = pathParts[pathParts.length - 1];
      
      if (!contentId) {
        return new Response(JSON.stringify({
          success: false,
          error: 'Content ID is required'
        }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      const body = await req.json();
      const updates: ContentUpdate = body;
      
      // Add updated_at timestamp
      const updateData = {
        ...updates,
        updated_at: new Date().toISOString()
      };

      const { data: updatedContent, error: updateError } = await supabase
        .from('app_curated_content')
        .update(updateData)
        .eq('id', contentId)
        .select()
        .single();

      if (updateError) {
        throw updateError;
      }

      return new Response(JSON.stringify({
        success: true,
        data: updatedContent
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // DELETE /admin-content-library/:id - Delete content
    if (method === 'DELETE') {
      const pathParts = url.pathname.split('/');
      const contentId = pathParts[pathParts.length - 1];
      
      if (!contentId) {
        return new Response(JSON.stringify({
          success: false,
          error: 'Content ID is required'
        }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      const { error: deleteError } = await supabase
        .from('app_curated_content')
        .delete()
        .eq('id', contentId);

      if (deleteError) {
        throw deleteError;
      }

      return new Response(JSON.stringify({
        success: true,
        message: 'Content deleted successfully'
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    return new Response(JSON.stringify({
      success: false,
      error: `Method ${method} not allowed`
    }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Error in admin-content-library:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error.message,
      debug: {
        timestamp: new Date().toISOString(),
        function_name: 'admin-content-library'
      }
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
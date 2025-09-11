import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};

interface BulkAction {
  action: 'pin' | 'unpin' | 'hide' | 'activate' | 'delete' | 'update_scores';
  content_ids: string[];
  parameters?: {
    pin_until?: string; // For pin action
    engagement_score?: number; // For update_scores
    trending_score?: number; // For update_scores
    quality_score?: number; // For update_scores
  };
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({
      success: false,
      error: `Method ${req.method} not allowed`
    }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
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

    const body: BulkAction = await req.json();
    const { action, content_ids, parameters = {} } = body;

    if (!action || !content_ids || !Array.isArray(content_ids) || content_ids.length === 0) {
      return new Response(JSON.stringify({
        success: false,
        error: 'action and content_ids array are required'
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    let updateData: any = {
      updated_at: new Date().toISOString()
    };
    let results: any[] = [];

    switch (action) {
      case 'pin':
        // Pin content - set high trending score and optional expiration
        updateData = {
          ...updateData,
          trending_score: 10.0, // High score to appear at top
          status: 'active',
          available_until: parameters.pin_until || null
        };
        break;

      case 'unpin':
        // Unpin content - reset trending score and remove expiration
        updateData = {
          ...updateData,
          trending_score: 1.0, // Reset to normal
          available_until: null
        };
        break;

      case 'hide':
        // Hide content from feed
        updateData = {
          ...updateData,
          status: 'hidden'
        };
        break;

      case 'activate':
        // Activate hidden content
        updateData = {
          ...updateData,
          status: 'active'
        };
        break;

      case 'update_scores':
        // Update engagement, trending, or quality scores
        if (parameters.engagement_score !== undefined) {
          updateData.engagement_score = parameters.engagement_score;
        }
        if (parameters.trending_score !== undefined) {
          updateData.trending_score = parameters.trending_score;
        }
        if (parameters.quality_score !== undefined) {
          updateData.quality_score = parameters.quality_score;
        }
        break;

      case 'delete':
        // Delete content items
        const { data: deletedItems, error: deleteError } = await supabase
          .from('app_curated_content')
          .delete()
          .in('id', content_ids)
          .select();

        if (deleteError) {
          throw deleteError;
        }

        return new Response(JSON.stringify({
          success: true,
          action: 'delete',
          affected_count: deletedItems.length,
          deleted_items: deletedItems
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });

      default:
        return new Response(JSON.stringify({
          success: false,
          error: `Unknown action: ${action}`
        }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }

    // For non-delete actions, update the content
    const { data: updatedItems, error: updateError } = await supabase
      .from('app_curated_content')
      .update(updateData)
      .in('id', content_ids)
      .select();

    if (updateError) {
      throw updateError;
    }

    // Log the action for audit purposes
    const auditLog = {
      action,
      content_ids,
      parameters,
      admin_user_id: adminUser.user_id,
      admin_email: adminUser.email,
      affected_count: updatedItems.length,
      timestamp: new Date().toISOString()
    };

    console.log('Content action performed:', auditLog);

    return new Response(JSON.stringify({
      success: true,
      action,
      affected_count: updatedItems.length,
      updated_items: updatedItems,
      audit_log: auditLog
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Error in admin-content-actions:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error.message,
      debug: {
        timestamp: new Date().toISOString(),
        function_name: 'admin-content-actions'
      }
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
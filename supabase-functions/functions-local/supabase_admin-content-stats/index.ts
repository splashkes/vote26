import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};

interface ContentStats {
  content_id: string;
  total_views: number;
  unique_sessions: number;
  avg_dwell_time_ms: number;
  avg_viewport_percentage: number;
  avg_video_watch_percentage: number;
  total_actions: number;
  swipe_velocity_avg: number;
  exit_actions: Record<string, number>;
  engagement_by_day: Array<{
    date: string;
    views: number;
    avg_dwell: number;
  }>;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'GET') {
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

    const url = new URL(req.url);
    const contentId = url.searchParams.get('content_id');
    const daysBack = parseInt(url.searchParams.get('days_back') || '30');

    // If content_id is provided, get detailed stats for that specific content
    if (contentId) {
      const { data: engagementData, error: engagementError } = await supabase
        .from('app_engagement_events')
        .select('*')
        .eq('content_id', contentId)
        .gte('timestamp', new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000).toISOString());

      if (engagementError) {
        throw engagementError;
      }

      // Calculate statistics
      const totalViews = engagementData.length;
      const uniqueSessions = new Set(engagementData.map(e => e.session_id)).size;
      
      const dwellTimes = engagementData
        .filter(e => e.dwell_time_ms !== null && e.dwell_time_ms > 0)
        .map(e => e.dwell_time_ms);
      const avgDwellTime = dwellTimes.length > 0 
        ? dwellTimes.reduce((a, b) => a + b, 0) / dwellTimes.length 
        : 0;

      const viewportPercentages = engagementData
        .filter(e => e.viewport_percentage !== null)
        .map(e => e.viewport_percentage);
      const avgViewportPercentage = viewportPercentages.length > 0
        ? viewportPercentages.reduce((a, b) => a + b, 0) / viewportPercentages.length
        : 0;

      const videoWatchPercentages = engagementData
        .filter(e => e.video_watch_percentage !== null)
        .map(e => e.video_watch_percentage);
      const avgVideoWatchPercentage = videoWatchPercentages.length > 0
        ? videoWatchPercentages.reduce((a, b) => a + b, 0) / videoWatchPercentages.length
        : 0;

      const totalActions = engagementData
        .filter(e => e.actions)
        .reduce((sum, e) => sum + (Array.isArray(e.actions) ? e.actions.length : 0), 0);

      const swipeVelocities = engagementData
        .filter(e => e.swipe_velocity !== null)
        .map(e => e.swipe_velocity);
      const avgSwipeVelocity = swipeVelocities.length > 0
        ? swipeVelocities.reduce((a, b) => a + b, 0) / swipeVelocities.length
        : 0;

      // Exit action breakdown
      const exitActions: Record<string, number> = {};
      engagementData
        .filter(e => e.exit_action)
        .forEach(e => {
          exitActions[e.exit_action] = (exitActions[e.exit_action] || 0) + 1;
        });

      // Engagement by day
      const engagementByDay: Array<{ date: string; views: number; avg_dwell: number }> = [];
      const dayGroups = engagementData.reduce((groups, event) => {
        const date = new Date(event.timestamp).toISOString().split('T')[0];
        if (!groups[date]) {
          groups[date] = [];
        }
        groups[date].push(event);
        return groups;
      }, {} as Record<string, any[]>);

      Object.entries(dayGroups).forEach(([date, events]) => {
        const dayDwellTimes = events
          .filter(e => e.dwell_time_ms !== null && e.dwell_time_ms > 0)
          .map(e => e.dwell_time_ms);
        const avgDwell = dayDwellTimes.length > 0
          ? dayDwellTimes.reduce((a, b) => a + b, 0) / dayDwellTimes.length
          : 0;

        engagementByDay.push({
          date,
          views: events.length,
          avg_dwell: avgDwell
        });
      });

      engagementByDay.sort((a, b) => a.date.localeCompare(b.date));

      const stats: ContentStats = {
        content_id: contentId,
        total_views: totalViews,
        unique_sessions: uniqueSessions,
        avg_dwell_time_ms: Math.round(avgDwellTime),
        avg_viewport_percentage: Math.round(avgViewportPercentage * 100) / 100,
        avg_video_watch_percentage: Math.round(avgVideoWatchPercentage * 100) / 100,
        total_actions: totalActions,
        swipe_velocity_avg: Math.round(avgSwipeVelocity * 100) / 100,
        exit_actions: exitActions,
        engagement_by_day: engagementByDay
      };

      return new Response(JSON.stringify({
        success: true,
        data: stats
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Otherwise, get summary stats for all content
    const { data: allEngagement, error: allEngagementError } = await supabase
      .from('app_engagement_events')
      .select('content_id, dwell_time_ms, viewport_percentage, timestamp')
      .gte('timestamp', new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000).toISOString());

    if (allEngagementError) {
      throw allEngagementError;
    }

    // Group by content_id and calculate summary stats
    const contentStats: Record<string, {
      views: number;
      avg_dwell_time: number;
      avg_viewport: number;
      last_viewed: string;
    }> = {};

    allEngagement.forEach(event => {
      if (!contentStats[event.content_id]) {
        contentStats[event.content_id] = {
          views: 0,
          avg_dwell_time: 0,
          avg_viewport: 0,
          last_viewed: event.timestamp
        };
      }

      const stats = contentStats[event.content_id];
      stats.views++;
      
      if (event.dwell_time_ms > 0) {
        stats.avg_dwell_time = ((stats.avg_dwell_time * (stats.views - 1)) + event.dwell_time_ms) / stats.views;
      }
      
      if (event.viewport_percentage > 0) {
        stats.avg_viewport = ((stats.avg_viewport * (stats.views - 1)) + event.viewport_percentage) / stats.views;
      }

      if (new Date(event.timestamp) > new Date(stats.last_viewed)) {
        stats.last_viewed = event.timestamp;
      }
    });

    // Convert to array format
    const summaryStats = Object.entries(contentStats).map(([content_id, stats]) => ({
      content_id,
      total_views: stats.views,
      avg_dwell_time_ms: Math.round(stats.avg_dwell_time),
      avg_viewport_percentage: Math.round(stats.avg_viewport * 100) / 100,
      last_viewed: stats.last_viewed
    }));

    // Sort by total views descending
    summaryStats.sort((a, b) => b.total_views - a.total_views);

    return new Response(JSON.stringify({
      success: true,
      data: summaryStats,
      summary: {
        total_content_items: summaryStats.length,
        total_views: summaryStats.reduce((sum, item) => sum + item.total_views, 0),
        avg_dwell_time_overall: Math.round(
          summaryStats.reduce((sum, item) => sum + item.avg_dwell_time_ms, 0) / summaryStats.length
        ),
        date_range_days: daysBack
      }
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Error in admin-content-stats:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error.message,
      debug: {
        timestamp: new Date().toISOString(),
        function_name: 'admin-content-stats'
      }
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
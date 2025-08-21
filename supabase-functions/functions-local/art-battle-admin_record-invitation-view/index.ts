import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Initialize Supabase client with service role key for RLS bypass
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    const { action, ...params } = await req.json()

    if (action === 'record_view') {
      // Record invitation view
      const { invitationId, userId, userType = 'artist', userAgent, ipAddress } = params
      
      if (!invitationId) {
        throw new Error('Invitation ID is required')
      }

      // Get client IP if not provided
      const clientIP = ipAddress || 
                      req.headers.get('x-forwarded-for') || 
                      req.headers.get('x-real-ip') || 
                      'unknown'

      // Insert view record into invitation_views table
      const { data: viewData, error: viewError } = await supabase
        .from('invitation_views')
        .insert({
          invitation_id: invitationId,
          viewer_user_id: userId,
          viewer_type: userType, // 'artist' or 'admin'
          ip_address: clientIP,
          user_agent: userAgent || req.headers.get('user-agent'),
          viewed_at: new Date().toISOString()
        })
        .select()
        .single()

      if (viewError) {
        console.error('Error recording view:', viewError)
        throw viewError
      }

      // Update invitation view counts
      const { error: updateError } = await supabase.rpc('update_invitation_view_counts', {
        invite_id: invitationId
      })

      if (updateError) {
        console.error('Error updating view counts:', updateError)
        // Don't throw - view was recorded successfully
      }

      return new Response(
        JSON.stringify({ 
          success: true, 
          viewId: viewData.id,
          message: 'Invitation view recorded successfully' 
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )

    } else if (action === 'get_invitation_data') {
      // Get invitation data for modal display
      const { invitationId, token } = params
      
      let query = supabase
        .from('artist_invites')
        .select(`
          *,
          artist_profiles(
            id, name, instagram, city, experience_level, profile_image_url,
            artist_sample_works(id, image_url, title)
          ),
          events(id, eid, name, event_start_datetime),
          invitation_views(
            id, viewer_type, viewer_user_id, ip_address, 
            user_agent, viewed_at
          )
        `)

      // Query by ID or token
      if (invitationId) {
        query = query.eq('id', invitationId)
      } else if (token) {
        query = query.eq('invitation_token', token)
      } else {
        throw new Error('Either invitationId or token is required')
      }

      const { data: inviteData, error: inviteError } = await query.single()

      if (inviteError) {
        console.error('Error fetching invitation:', inviteError)
        throw inviteError
      }

      return new Response(
        JSON.stringify({ 
          success: true, 
          invitation: inviteData 
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )

    } else if (action === 'get_view_analytics') {
      // Get view analytics for admin dashboard
      const { invitationId, eventId } = params

      let analytics = {}

      if (invitationId) {
        // Single invitation analytics
        const { data: inviteViews, error } = await supabase
          .from('invitation_views')
          .select('*')
          .eq('invitation_id', invitationId)
          .order('viewed_at', { ascending: false })

        if (error) throw error

        analytics = {
          totalViews: inviteViews.length,
          uniqueViewers: new Set(inviteViews.map(v => v.ip_address)).size,
          artistViews: inviteViews.filter(v => v.viewer_type === 'artist').length,
          adminViews: inviteViews.filter(v => v.viewer_type === 'admin').length,
          firstViewedAt: inviteViews[inviteViews.length - 1]?.viewed_at,
          lastViewedAt: inviteViews[0]?.viewed_at,
          viewHistory: inviteViews
        }
      } else if (eventId) {
        // Event-wide analytics
        const { data, error } = await supabase.rpc('get_invitation_analytics', {
          event_uuid: eventId
        })

        if (error) throw error
        analytics = data[0] || {}
      }

      return new Response(
        JSON.stringify({ 
          success: true, 
          analytics 
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )

    } else {
      throw new Error('Invalid action specified')
    }

  } catch (error) {
    console.error('Error in record-invitation-view function:', error)
    
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error.message || 'An unexpected error occurred' 
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  }
})
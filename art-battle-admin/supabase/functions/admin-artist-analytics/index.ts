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
    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Verify authentication
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      throw new Error('Authorization header required')
    }

    const { action, ...params } = await req.json()

    if (action === 'get_artist_performance') {
      // Get historical performance data for artists
      const { artistIds } = params
      
      if (!artistIds || !Array.isArray(artistIds)) {
        throw new Error('artistIds array is required')
      }

      const performanceData = {}

      for (const artistNumber of artistIds) {
        // Get auction performance - join via artist_number instead of artist_id
        const { data: auctionData } = await supabase
          .from('bids')
          .select(`
            amount,
            art(
              events(id, eid, name),
              final_price,
              artist_number
            )
          `)
          .eq('art.artist_number', artistNumber)

        // Get event participation - need to get artist UUID first from entry_id
        const { data: artistProfile } = await supabase
          .from('artist_profiles')
          .select('id')
          .eq('entry_id', artistNumber)
          .single()

        let participationData = []
        if (artistProfile) {
          const { data } = await supabase
            .from('round_contestants')
            .select(`
              event_id,
              round_number,
              easel_number,
              events(id, eid, name, event_start_datetime)
            `)
            .eq('artist_id', artistProfile.id)
          participationData = data || []
        }

        // Get win data (rounds where they had highest bids)
        let winData = []
        if (artistProfile) {
          const { data } = await supabase
            .rpc('get_artist_wins', { artist_uuid: artistProfile.id })
          winData = data || []
        }

        // Calculate metrics
        const auctionAmounts = auctionData?.map(bid => bid.amount).filter(Boolean) || []
        const finalPrices = auctionData?.map(bid => bid.art?.final_price).filter(Boolean) || []
        const eventsParticipated = new Set(participationData?.map(p => p.event_id)).size
        const totalRounds = participationData?.length || 0
        const wins = winData?.length || 0

        performanceData[artistNumber] = {
          avgAuctionValue: auctionAmounts.length > 0 
            ? auctionAmounts.reduce((sum, amount) => sum + amount, 0) / auctionAmounts.length 
            : 0,
          avgFinalPrice: finalPrices.length > 0
            ? finalPrices.reduce((sum, price) => sum + price, 0) / finalPrices.length
            : 0,
          eventsParticipated,
          totalRounds,
          winRate: totalRounds > 0 ? (wins / totalRounds) * 100 : 0,
          totalWins: wins,
          lastEventDate: participationData?.[0]?.events?.event_start_datetime,
          isNewArtist: eventsParticipated === 0
        }
      }

      return new Response(
        JSON.stringify({ 
          success: true, 
          performanceData 
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )

    } else if (action === 'get_invitation_analytics') {
      // Get invitation analytics for event
      const { eventId } = params
      
      if (!eventId) {
        throw new Error('eventId is required')
      }

      // Get invitation statistics
      const { data: inviteStats } = await supabase
        .from('artist_invites')
        .select(`
          id,
          created_at,
          first_viewed_at,
          last_viewed_at,
          view_count,
          artist_profiles(name)
        `)
        .eq('event_id', eventId)

      // Get confirmation statistics  
      const { data: confirmStats } = await supabase
        .from('artist_confirmations')
        .select('id, created_at, artist_id')
        .eq('event_id', eventId)

      // Calculate metrics
      const totalInvites = inviteStats?.length || 0
      const viewedInvites = inviteStats?.filter(i => i.first_viewed_at).length || 0
      const confirmedInvites = confirmStats?.length || 0
      
      const avgTimeToView = inviteStats?.filter(i => i.first_viewed_at).map(i => {
        const invited = new Date(i.created_at)
        const viewed = new Date(i.first_viewed_at)
        return viewed.getTime() - invited.getTime()
      })

      const avgTimeToConfirm = confirmStats?.map(conf => {
        const invite = inviteStats?.find(i => i.artist_id === conf.artist_id)
        if (!invite) return null
        const invited = new Date(invite.created_at)
        const confirmed = new Date(conf.created_at)
        return confirmed.getTime() - invited.getTime()
      }).filter(Boolean)

      const analytics = {
        totalInvitations: totalInvites,
        viewedInvitations: viewedInvites,
        confirmedInvitations: confirmedInvites,
        viewRate: totalInvites > 0 ? (viewedInvites / totalInvites) * 100 : 0,
        confirmationRate: totalInvites > 0 ? (confirmedInvites / totalInvites) * 100 : 0,
        avgTimeToView: avgTimeToView?.length > 0 
          ? avgTimeToView.reduce((sum, time) => sum + time, 0) / avgTimeToView.length
          : null,
        avgTimeToConfirm: avgTimeToConfirm?.length > 0
          ? avgTimeToConfirm.reduce((sum, time) => sum + time, 0) / avgTimeToConfirm.length  
          : null,
        engagementInsights: {
          multipleViewers: inviteStats?.filter(i => i.view_count > 1).length || 0,
          quickResponders: inviteStats?.filter(i => {
            if (!i.first_viewed_at) return false
            const hoursToView = (new Date(i.first_viewed_at).getTime() - new Date(i.created_at).getTime()) / (1000 * 60 * 60)
            return hoursToView < 24
          }).length || 0
        }
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

    } else if (action === 'get_auto_reminders') {
      // Get suggestions for auto-reminders based on engagement patterns
      const { eventId } = params
      
      if (!eventId) {
        throw new Error('eventId is required')
      }

      const { data: invites } = await supabase
        .from('artist_invites')
        .select(`
          id,
          created_at,
          first_viewed_at,
          last_viewed_at,
          view_count,
          artist_profiles(name, instagram)
        `)
        .eq('event_id', eventId)

      const now = new Date()
      const recommendations = []

      invites?.forEach(invite => {
        const daysSinceInvite = (now.getTime() - new Date(invite.created_at).getTime()) / (1000 * 60 * 60 * 24)
        
        if (!invite.first_viewed_at && daysSinceInvite > 3) {
          recommendations.push({
            type: 'not_viewed',
            priority: 'high',
            inviteId: invite.id,
            artistName: invite.artist_profiles?.name,
            reason: `Invitation sent ${Math.round(daysSinceInvite)} days ago but not viewed`,
            action: 'Send reminder or try different contact method'
          })
        } else if (invite.view_count > 3 && !invite.last_viewed_at) {
          recommendations.push({
            type: 'highly_engaged',
            priority: 'medium', 
            inviteId: invite.id,
            artistName: invite.artist_profiles?.name,
            reason: `Viewed ${invite.view_count} times - likely preparing response`,
            action: 'Follow up to offer assistance or extend deadline'
          })
        } else if (invite.first_viewed_at && daysSinceInvite > 7) {
          recommendations.push({
            type: 'stale_response',
            priority: 'medium',
            inviteId: invite.id,
            artistName: invite.artist_profiles?.name,
            reason: `Viewed but no response for ${Math.round(daysSinceInvite)} days`,
            action: 'Send gentle reminder with deadline'
          })
        }
      })

      return new Response(
        JSON.stringify({ 
          success: true, 
          recommendations: recommendations.sort((a, b) => {
            const priorityOrder = { high: 3, medium: 2, low: 1 }
            return priorityOrder[b.priority] - priorityOrder[a.priority]
          })
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )

    } else {
      throw new Error('Invalid action specified')
    }

  } catch (error) {
    console.error('Error in admin-artist-analytics function:', error)
    
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
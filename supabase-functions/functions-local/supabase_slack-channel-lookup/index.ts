// Slack Channel Lookup Edge Function
// Looks up Slack channel IDs by name and caches them

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface ChannelLookupRequest {
  channel_name: string
  update_cache?: boolean
}

serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Get Slack token from environment
    const slackToken = Deno.env.get('SLACK_BOT_TOKEN')
    if (!slackToken) {
      throw new Error('SLACK_BOT_TOKEN not configured')
    }

    // Get Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Parse request
    const { channel_name, update_cache = true }: ChannelLookupRequest = await req.json()
    
    // Clean channel name (remove # if present)
    const cleanChannelName = channel_name.replace(/^#/, '')
    
    console.log(`Looking up channel: ${cleanChannelName}`)

    // Try Slack conversations.list API to find the channel
    const slackResponse = await fetch('https://slack.com/api/conversations.list', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${slackToken}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    })

    const slackData = await slackResponse.json()
    
    if (!slackData.ok) {
      throw new Error(`Slack API error: ${slackData.error}`)
    }

    // Find the channel by name
    const channel = slackData.channels?.find((ch: any) => 
      ch.name === cleanChannelName || 
      ch.name_normalized === cleanChannelName
    )

    if (!channel) {
      // Try with pagination if not found
      let nextCursor = slackData.response_metadata?.next_cursor
      
      while (nextCursor) {
        const nextResponse = await fetch(`https://slack.com/api/conversations.list?cursor=${nextCursor}`, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${slackToken}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        })
        
        const nextData = await nextResponse.json()
        
        const foundChannel = nextData.channels?.find((ch: any) => 
          ch.name === cleanChannelName || 
          ch.name_normalized === cleanChannelName
        )
        
        if (foundChannel) {
          // Update cache if requested
          if (update_cache) {
            await supabase.rpc('add_slack_channel', {
              p_channel_name: cleanChannelName,
              p_channel_id: foundChannel.id
            })
          }
          
          return new Response(
            JSON.stringify({ 
              success: true, 
              channel_id: foundChannel.id,
              channel_name: foundChannel.name,
              is_private: foundChannel.is_private
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }
        
        nextCursor = nextData.response_metadata?.next_cursor
      }
    }

    if (channel) {
      // Update cache if requested
      if (update_cache) {
        await supabase.rpc('add_slack_channel', {
          p_channel_name: cleanChannelName,
          p_channel_id: channel.id
        })
      }

      return new Response(
        JSON.stringify({ 
          success: true, 
          channel_id: channel.id,
          channel_name: channel.name,
          is_private: channel.is_private || false
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Channel not found
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: `Channel '${cleanChannelName}' not found`,
        searched_name: cleanChannelName
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 404 
      }
    )

  } catch (error) {
    console.error('Error in slack-channel-lookup:', error)
    return new Response(
      JSON.stringify({ 
        error: error.message || 'Internal server error',
        details: error.toString()
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500 
      }
    )
  }
})
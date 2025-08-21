// Slack Webhook Edge Function
// Handles sending notifications to Slack channels

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface SlackMessage {
  channel: string
  text?: string
  blocks?: any[]
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
      console.error('SLACK_BOT_TOKEN not found in environment')
      throw new Error('Slack credentials not configured')
    }

    // Parse request
    const { channel, text, blocks }: SlackMessage = await req.json()

    if (!channel) {
      throw new Error('Channel is required')
    }

    // Prepare Slack API request
    const slackResponse = await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${slackToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        channel: channel,
        text: text ? text.replace(/\\n/g, '\n') : 'Art Battle Notification',
        blocks: blocks,
        unfurl_links: false,
        unfurl_media: false,
      }),
    })

    const slackData = await slackResponse.json()

    if (!slackData.ok) {
      console.error('Slack API error:', slackData)
      throw new Error(`Slack API error: ${slackData.error}`)
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        ts: slackData.ts,
        channel: slackData.channel 
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    )
  } catch (error) {
    console.error('Error in slack-webhook function:', error)
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
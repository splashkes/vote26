// Automated Slack Queue Processing Edge Function
// Processes 20 notifications per execution to respect rate limits

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    console.log('Starting automated Slack queue processing')
    
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Process batch of 20 notifications
    const { data: result, error } = await supabase.rpc('process_slack_queue_batch', {
      batch_size: 20
    })

    if (error) {
      console.error('Error processing Slack queue:', error)
      return new Response(
        JSON.stringify({ 
          error: 'Queue processing failed', 
          details: error.message 
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }, 
          status: 500 
        }
      )
    }

    console.log('Queue processing completed:', result)

    // Get updated queue status
    const { data: status, error: statusError } = await supabase.rpc('get_detailed_slack_queue_status')

    if (statusError) {
      console.error('Error getting queue status:', statusError)
    }

    return new Response(
      JSON.stringify({
        success: true,
        processing_result: result,
        queue_status: status,
        timestamp: new Date().toISOString()
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )

  } catch (error) {
    console.error('Error in process-slack-queue function:', error)
    return new Response(
      JSON.stringify({ 
        error: 'Function error', 
        message: error.message 
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }, 
        status: 500 
      }
    )
  }
})
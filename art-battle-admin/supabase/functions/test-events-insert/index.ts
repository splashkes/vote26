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
    console.log('=== TESTING EVENTS TABLE INSERT ===')
    
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Try to insert minimal event record
    const testEventData = {
      eid: 'AB9999',
      name: 'Test Event',
      description: 'Test description',
      venue: 'Test venue',
      city_id: null,
      country_id: null,
      event_start_datetime: new Date().toISOString(),
      event_end_datetime: new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString(),
      timezone_icann: 'America/Toronto',
      enabled: false,
      show_in_app: false,
      current_round: 0,
      capacity: 200,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }

    console.log('Attempting to insert test event:', testEventData)

    const { data, error } = await supabase
      .from('events')
      .insert(testEventData)
      .select()
      .single()

    if (error) {
      console.error('Database error:', error)
      return new Response(
        JSON.stringify({ 
          success: false,
          error: 'Database insert failed',
          details: error.message,
          code: error.code,
          hint: error.hint
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
      )
    }

    console.log('Insert successful:', data)
    
    // Clean up - delete the test event
    await supabase.from('events').delete().eq('eid', 'AB9999')
    
    return new Response(
      JSON.stringify({ 
        success: true,
        message: 'Events table insert test passed!',
        insertedData: data
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Function error:', error)
    return new Response(
      JSON.stringify({ 
        error: 'Function failed',
        message: error.message,
        stack: error.stack
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    )
  }
})
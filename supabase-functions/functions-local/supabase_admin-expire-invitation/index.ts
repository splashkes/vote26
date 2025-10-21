import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    // Create Supabase client with service role key (bypasses RLS)
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    const { invitation_id } = await req.json()

    if (!invitation_id) {
      return new Response(
        JSON.stringify({ success: false, error: 'invitation_id is required' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      )
    }

    console.log('Expiring invitation:', invitation_id)

    // Update the invitation status to expired
    const { data, error } = await supabase
      .from('artist_invitations')
      .update({
        status: 'expired',
        updated_at: new Date().toISOString()
      })
      .eq('id', invitation_id)
      .select()
      .single()

    if (error) {
      console.error('Error expiring invitation:', error)
      return new Response(
        JSON.stringify({
          success: false,
          error: error.message,
          details: error.details,
          hint: error.hint
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
      )
    }

    console.log('Invitation expired successfully:', data)

    return new Response(
      JSON.stringify({
        success: true,
        data,
        message: 'Invitation expired successfully'
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Unexpected error:', error)
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || 'An unexpected error occurred'
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    )
  }
})

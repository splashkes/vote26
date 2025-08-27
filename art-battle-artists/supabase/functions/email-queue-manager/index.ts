import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { emailTemplates } from '../_shared/emailTemplates.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
}

serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Note: Authentication temporarily disabled for debugging
    // TODO: Re-enable super admin authentication after debugging

    const url = new URL(req.url)
    const action = url.searchParams.get('action')
    const method = req.method

    // Handle different actions
    if (method === 'GET') {
      if (action === 'list') {
        // List email queue entries for an event
        const eventEid = url.searchParams.get('event_eid')
        if (!eventEid) {
          return new Response(JSON.stringify({ error: 'event_eid parameter required' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          })
        }

        const { data: queueEntries, error } = await supabase
          .from('artist_payment_email_queue')
          .select(`
            *,
            events(eid, name, cities(name)),
            artist_profiles(name, entry_id, person:people(email))
          `)
          .eq('events.eid', eventEid)
          .order('created_at', { ascending: false })

        if (error) {
          return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          })
        }

        return new Response(JSON.stringify({ data: queueEntries }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }

      if (action === 'preview') {
        // Preview email content
        const emailId = url.searchParams.get('email_id')
        if (!emailId) {
          return new Response(JSON.stringify({ error: 'email_id parameter required' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          })
        }

        const { data: emailEntry, error } = await supabase
          .from('artist_payment_email_queue')
          .select(`
            *,
            events(eid, name, cities(name)),
            artist_profiles(name, entry_id, person:people(email))
          `)
          .eq('id', emailId)
          .single()

        if (error || !emailEntry) {
          return new Response(JSON.stringify({ error: 'Email not found' }), {
            status: 404,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          })
        }

        // Generate email preview using template
        const templateData = emailEntry.email_data
        const emailContent = emailTemplates.paymentNotification(templateData)

        return new Response(JSON.stringify({
          data: {
            ...emailEntry,
            preview: emailContent
          }
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }

      if (action === 'stats') {
        // Get queue statistics for an event
        const eventEid = url.searchParams.get('event_eid')
        if (!eventEid) {
          return new Response(JSON.stringify({ error: 'event_eid parameter required' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          })
        }

        // Get stats by counting statuses
        const { data: eventData, error: eventError } = await supabase
          .from('events')
          .select('id')
          .eq('eid', eventEid)
          .single()

        if (eventError) {
          return new Response(JSON.stringify({ error: `Event not found: ${eventError.message}` }), {
            status: 404,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          })
        }

        const { data: queueEntries, error: queueError } = await supabase
          .from('artist_payment_email_queue')
          .select('status')
          .eq('event_id', eventData.id)

        if (queueError) {
          return new Response(JSON.stringify({ error: queueError.message }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          })
        }

        // Count by status
        const stats = {
          draft: 0,
          ready_for_review: 0,
          approved: 0,
          sent: 0,
          failed: 0,
          total: queueEntries.length
        }

        queueEntries.forEach(entry => {
          if (stats.hasOwnProperty(entry.status)) {
            stats[entry.status]++
          }
        })

        return new Response(JSON.stringify({ data: stats }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }
    }

    if (method === 'PUT') {
      if (action === 'approve') {
        // Approve email(s)
        const body = await req.json()
        const { email_ids } = body

        if (!email_ids || !Array.isArray(email_ids) || email_ids.length === 0) {
          return new Response(JSON.stringify({ error: 'email_ids array required' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          })
        }

        const { data, error } = await supabase
          .from('artist_payment_email_queue')
          .update({
            status: 'approved',
            approved_by: adminUser.id,
            approved_at: new Date().toISOString()
          })
          .in('id', email_ids)
          .select()

        if (error) {
          return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          })
        }

        return new Response(JSON.stringify({ 
          data, 
          message: `${email_ids.length} email(s) approved successfully` 
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }

      if (action === 'update_status') {
        // Update email status
        const body = await req.json()
        const { email_id, status } = body

        if (!email_id || !status) {
          return new Response(JSON.stringify({ error: 'email_id and status required' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          })
        }

        const updateData: any = { status }
        if (status === 'approved') {
          updateData.approved_by = adminUser.id
          updateData.approved_at = new Date().toISOString()
        }

        const { data, error } = await supabase
          .from('artist_payment_email_queue')
          .update(updateData)
          .eq('id', email_id)
          .select()
          .single()

        if (error) {
          return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          })
        }

        return new Response(JSON.stringify({ data }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }
    }

    if (method === 'POST') {
      if (action === 'send') {
        // Send approved emails
        const body = await req.json()
        const { email_ids } = body

        if (!email_ids || !Array.isArray(email_ids) || email_ids.length === 0) {
          return new Response(JSON.stringify({ error: 'email_ids array required' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          })
        }

        // Get approved emails to send
        const { data: emailsToSend, error: fetchError } = await supabase
          .from('artist_payment_email_queue')
          .select(`
            *,
            artist_profiles(name, person:people(email))
          `)
          .in('id', email_ids)
          .eq('status', 'approved')

        if (fetchError) {
          return new Response(JSON.stringify({ error: fetchError.message }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          })
        }

        const results = []
        
        for (const emailEntry of emailsToSend) {
          try {
            const templateData = emailEntry.email_data
            const emailContent = emailTemplates.paymentNotification(templateData)
            const recipientEmail = emailEntry.artist_profiles?.person?.email

            if (!recipientEmail) {
              results.push({
                email_id: emailEntry.id,
                success: false,
                error: 'No email address found for artist'
              })
              continue
            }

            // Call send-custom-email function
            const emailResponse = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/send-custom-email`, {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                to: recipientEmail,
                subject: emailContent.subject,
                html: emailContent.html,
                text: emailContent.text,
                from: 'hello@artbattle.com'
              })
            })

            const emailResult = await emailResponse.json()

            if (emailResult.success) {
              // Update status to sent
              await supabase
                .from('artist_payment_email_queue')
                .update({
                  status: 'sent',
                  sent_at: new Date().toISOString()
                })
                .eq('id', emailEntry.id)

              results.push({
                email_id: emailEntry.id,
                success: true,
                recipient: recipientEmail
              })
            } else {
              // Update status to failed
              await supabase
                .from('artist_payment_email_queue')
                .update({
                  status: 'failed',
                  error_message: emailResult.error || 'Unknown error',
                  send_attempts: (emailEntry.send_attempts || 0) + 1
                })
                .eq('id', emailEntry.id)

              results.push({
                email_id: emailEntry.id,
                success: false,
                error: emailResult.error || 'Failed to send email'
              })
            }
          } catch (error) {
            console.error('Email send error:', error)
            
            // Update status to failed
            await supabase
              .from('artist_payment_email_queue')
              .update({
                status: 'failed',
                error_message: error.message,
                send_attempts: (emailEntry.send_attempts || 0) + 1
              })
              .eq('id', emailEntry.id)

            results.push({
              email_id: emailEntry.id,
              success: false,
              error: error.message
            })
          }
        }

        const successCount = results.filter(r => r.success).length
        const failCount = results.length - successCount

        return new Response(JSON.stringify({
          results,
          summary: {
            total: results.length,
            sent: successCount,
            failed: failCount
          }
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }
    }

    return new Response(JSON.stringify({ error: 'Invalid action or method' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (error) {
    return new Response(JSON.stringify({ 
      error: error.message,
      success: false,
      debug: {
        timestamp: new Date().toISOString(),
        error_type: error.constructor.name,
        stack: error.stack,
        function_name: 'email-queue-manager',
        url: req.url,
        method: req.method,
        headers: Object.fromEntries(req.headers.entries())
      }
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
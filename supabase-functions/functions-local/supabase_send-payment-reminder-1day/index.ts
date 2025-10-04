// Send 1-Day Payment Reminder
// Sends email to artists 1 day after event if they have no Stripe setup and are owed money
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error('Missing Supabase configuration');
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    // Find events that happened exactly 1 day ago
    const oneDayAgo = new Date();
    oneDayAgo.setDate(oneDayAgo.getDate() - 1);
    oneDayAgo.setHours(0, 0, 0, 0);

    const oneDayAgoEnd = new Date(oneDayAgo);
    oneDayAgoEnd.setHours(23, 59, 59, 999);

    console.log(`Checking for events between ${oneDayAgo.toISOString()} and ${oneDayAgoEnd.toISOString()}`);

    // Get events from 1 day ago
    const { data: events, error: eventsError } = await supabase
      .from('events')
      .select('id, eid, event_name, event_start_datetime, city')
      .gte('event_start_datetime', oneDayAgo.toISOString())
      .lte('event_start_datetime', oneDayAgoEnd.toISOString());

    if (eventsError) throw eventsError;

    if (!events || events.length === 0) {
      return new Response(JSON.stringify({ success: true, message: 'No events found from 1 day ago', sent: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    console.log(`Found ${events.length} events from 1 day ago`);

    let emailsSent = 0;
    const errors = [];
    const MAX_EMAILS = 5; // TESTING: Limit to 5 emails

    for (const event of events) {
      // Get artists from this event who have earnings
      const { data: artworks, error: artError } = await supabase
        .from('art')
        .select(`
          id,
          artist_profile_id,
          artist_profiles!inner(
            id,
            name,
            person_id,
            people!inner(email, phone)
          )
        `)
        .eq('event_id', event.id)
        .eq('status', 'sold');

      if (artError) {
        errors.push(`Event ${event.eid}: ${artError.message}`);
        continue;
      }

      if (!artworks || artworks.length === 0) continue;

      // Group by artist
      const artistsMap = new Map();
      for (const artwork of artworks) {
        const artistId = artwork.artist_profile_id;
        if (!artistsMap.has(artistId)) {
          artistsMap.set(artistId, {
            profile: artwork.artist_profiles,
            paintings: 0
          });
        }
        artistsMap.get(artistId).paintings++;
      }

      // For each artist, check if they have Stripe setup and calculate balance
      for (const [artistId, artistData] of artistsMap) {
        // TESTING: Stop after 5 emails
        if (emailsSent >= MAX_EMAILS) {
          console.log(`Reached limit of ${MAX_EMAILS} emails, stopping`);
          break;
        }

        try {
          // Check if artist has Stripe account
          const { data: stripeCheck } = await supabase
            .from('artist_profiles')
            .select('stripe_recipient_id')
            .eq('id', artistId)
            .single();

          if (stripeCheck?.stripe_recipient_id) {
            console.log(`Artist ${artistId} has Stripe setup, skipping`);
            continue;
          }

          // Calculate amount owed
          const { data: ledger } = await supabase
            .from('artist_account_ledger')
            .select('amount')
            .eq('artist_profile_id', artistId);

          const balance = ledger?.reduce((sum, entry) => sum + (entry.amount || 0), 0) || 0;

          if (balance <= 0) {
            console.log(`Artist ${artistId} has no balance, skipping`);
            continue;
          }

          // Check if email already sent
          const { data: existingEmail } = await supabase
            .from('artist_payment_reminder_emails')
            .select('id')
            .eq('artist_profile_id', artistId)
            .eq('event_id', event.id)
            .eq('email_type', '1_day_no_stripe')
            .eq('success', true)
            .single();

          if (existingEmail) {
            console.log(`Already sent 1-day email to artist ${artistId} for event ${event.eid}`);
            continue;
          }

          // Send email
          const email = artistData.profile.people.email;
          if (!email) {
            console.log(`No email for artist ${artistId}`);
            continue;
          }

          // TESTING: Hard-code recipient to artists@artbattle.com
          const testRecipient = 'artists@artbattle.com';

          const subject = `[TEST] Congrats on your participation in ${event.eid} - ${event.city}`;
          const message = `[TESTING MODE - Would send to: ${email}]\n\nWe owe you some money from the sale of your ${artistData.paintings} painting${artistData.paintings > 1 ? 's' : ''}. Please log in with your phone number to link your bank account for payment https://artb.art/profile - if you log in and don't see an amount owing, please contact us with your phone number and the event date / city you recently participated in and we will get it sorted!\n\nArtist: ${artistData.profile.name}\nAmount owed: $${balance.toFixed(2)}\nEvent: ${event.eid} - ${event.city}`;

          const emailResponse = await fetch(`${supabaseUrl}/functions/v1/send-email`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${supabaseServiceKey}`,
              'apikey': supabaseServiceKey
            },
            body: JSON.stringify({
              to: testRecipient,
              subject,
              text: message,
              html: message.replace(/\n/g, '<br>')
            })
          });

          const emailResult = await emailResponse.json();

          // Log the email send
          await supabase
            .from('artist_payment_reminder_emails')
            .insert({
              artist_profile_id: artistId,
              person_id: artistData.profile.person_id,
              event_id: event.id,
              email_type: '1_day_no_stripe',
              email_address: email,
              success: emailResult.success || false,
              error_message: emailResult.error || null,
              email_data: {
                event_eid: event.eid,
                event_city: event.city,
                event_date: event.event_start_datetime,
                amount_owed: balance,
                paintings_sold: artistData.paintings
              }
            });

          if (emailResult.success) {
            emailsSent++;
            console.log(`Sent 1-day email to ${email} for event ${event.eid}`);
          } else {
            errors.push(`Failed to send to ${email}: ${emailResult.error}`);
          }

        } catch (err) {
          errors.push(`Artist ${artistId}: ${err.message}`);
          console.error(`Error processing artist ${artistId}:`, err);
        }
      }
    }

    return new Response(JSON.stringify({
      success: true,
      events_processed: events.length,
      emails_sent: emailsSent,
      errors: errors.length > 0 ? errors : undefined
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Error:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});

// SMS Promotion System - Streaming Batch RFM Processing
// Date: August 27, 2025
// Purpose: Stream progress updates during RFM batch processing for large audiences

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS'
};

// RFM Cache TTL (30 minutes)
const CACHE_TTL_MINUTES = 30;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Initialize Supabase client with service role
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    // Check if user is super admin
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Authorization required' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''));
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Invalid authorization' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Check admin status using service role client
    const serviceClient = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });
    
    const { data: adminCheck, error: adminError } = await serviceClient
      .from('abhq_admin_users')
      .select('level')
      .eq('user_id', user.id)
      .eq('active', true)
      .single();

    if (adminError || !adminCheck) {
      return new Response(JSON.stringify({ 
        error: 'Admin access required',
        details: adminError?.message 
      }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Parse request body
    const { person_ids = [], force_refresh = false } = await req.json();
    
    // Store the user token for passing to individual RFM calls
    const userToken = authHeader.replace('Bearer ', '');

    if (!Array.isArray(person_ids) || person_ids.length === 0) {
      return new Response(JSON.stringify({ 
        error: 'person_ids array is required and must not be empty' 
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Check which people need RFM updates - do this in batches to handle large datasets
    console.log(`Checking RFM cache for ${person_ids.length} people`);
    const existingScoreMap = new Map();
    const cacheCheckBatchSize = 1000; // Check cache in batches of 1000
    
    for (let i = 0; i < person_ids.length; i += cacheCheckBatchSize) {
      const batch = person_ids.slice(i, i + cacheCheckBatchSize);
      
      const { data: existingScores, error: cacheError } = await serviceClient
        .from('rfm_score_cache')
        .select('person_id, calculated_at')
        .in('person_id', batch);

      if (cacheError) {
        console.error('Error checking RFM cache batch:', cacheError);
        continue; // Skip this batch but continue with others
      }

      if (existingScores) {
        existingScores.forEach(score => {
          existingScoreMap.set(score.person_id, score.calculated_at);
        });
      }
      
      console.log(`Checked cache for batch ${i / cacheCheckBatchSize + 1}, found ${existingScores?.length || 0} existing scores`);
    }
    
    console.log(`Total existing RFM scores found: ${existingScoreMap.size} out of ${person_ids.length} people`);

    // Determine which people need RFM processing
    const needsUpdate = [];
    const currentTime = Date.now();
    let noCacheCount = 0;
    let expiredCount = 0;
    let validCacheCount = 0;
    
    for (const personId of person_ids) {
      if (force_refresh) {
        needsUpdate.push(personId);
      } else {
        const existingTimestamp = existingScoreMap.get(personId);
        if (!existingTimestamp) {
          needsUpdate.push(personId);
          noCacheCount++;
        } else {
          const cacheAge = currentTime - new Date(existingTimestamp).getTime();
          const isExpired = cacheAge > (CACHE_TTL_MINUTES * 60 * 1000);
          if (isExpired) {
            needsUpdate.push(personId);
            expiredCount++;
          } else {
            validCacheCount++;
          }
        }
      }
    }
    
    console.log(`Cache analysis: ${noCacheCount} no cache, ${expiredCount} expired, ${validCacheCount} valid cache, ${needsUpdate.length} total need updates`);

    if (needsUpdate.length === 0) {
      return new Response(JSON.stringify({
        success: true,
        total_requested: person_ids.length,
        needed_updates: 0,
        processed: 0,
        errors: 0,
        message: 'All RFM scores are current'
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Setup Server-Sent Events for streaming progress
    const encoder = new TextEncoder();
    const readable = new ReadableStream({
      start(controller) {
        // Send initial progress update
        const initialData = JSON.stringify({
          type: 'progress',
          total_requested: person_ids.length,
          needed_updates: needsUpdate.length,
          processed: 0,
          errors: 0,
          progress_percent: 0,
          status: 'starting'
        });
        controller.enqueue(encoder.encode(`data: ${initialData}\n\n`));
        
        // Process RFM scores in batches with progress updates
        const batchSize = 50;
        const results = {
          processed: 0,
          errors: 0,
          error_details: []
        };

        const processBatches = async () => {
          try {
            for (let i = 0; i < needsUpdate.length; i += batchSize) {
              const batch = needsUpdate.slice(i, i + batchSize);
              
              // Process batch in parallel
              const batchPromises = batch.map(async (personId) => {
                try {
                  // Call the existing RFM scoring function (using GET with query params and user token)
                  const rfmResponse = await fetch(`${supabaseUrl}/functions/v1/rfm-scoring?person_id=${personId}`, {
                    method: 'GET',
                    headers: {
                      'Authorization': `Bearer ${userToken}`,
                      'Content-Type': 'application/json'
                    }
                  });

                  if (!rfmResponse.ok) {
                    const errorText = await rfmResponse.text();
                    throw new Error(`RFM scoring failed for person ${personId}: ${errorText}`);
                  }

                  const rfmResult = await rfmResponse.json();
                  // GET request returns { success: true, data: rfmScore } format (like the working version)
                  if (rfmResult.success && rfmResult.data) {
                    results.processed++;
                    return { personId, success: true };
                  } else {
                    throw new Error(`RFM scoring returned error for person ${personId}: ${rfmResult.error || 'No data returned'}`);
                  }
                } catch (error) {
                  results.errors++;
                  results.error_details.push({
                    person_id: personId,
                    error: error.message
                  });
                  console.error(`Error processing RFM for person ${personId}:`, error);
                  return { personId, success: false, error: error.message };
                }
              });

              await Promise.allSettled(batchPromises);
              
              // Send progress update after each batch
              const progressPercent = Math.round(((i + batchSize) / needsUpdate.length) * 100);
              const progressData = JSON.stringify({
                type: 'progress',
                total_requested: person_ids.length,
                needed_updates: needsUpdate.length,
                processed: results.processed,
                errors: results.errors,
                progress_percent: Math.min(progressPercent, 100),
                batch_completed: i + batchSize,
                status: i + batchSize >= needsUpdate.length ? 'completed' : 'processing'
              });
              controller.enqueue(encoder.encode(`data: ${progressData}\n\n`));
              
              // Small delay between batches
              if (i + batchSize < needsUpdate.length) {
                await new Promise(resolve => setTimeout(resolve, 100));
              }
            }

            // Send final completion data
            const completionData = JSON.stringify({
              type: 'complete',
              success: true,
              total_requested: person_ids.length,
              needed_updates: needsUpdate.length,
              processed: results.processed,
              errors: results.errors,
              error_details: results.error_details.slice(0, 10),
              completion_rate: needsUpdate.length > 0 ? (results.processed / needsUpdate.length * 100).toFixed(1) : '100.0',
              progress_percent: 100,
              status: 'completed'
            });
            controller.enqueue(encoder.encode(`data: ${completionData}\n\n`));
            controller.close();

          } catch (error) {
            console.error('Error in batch processing:', error);
            const errorData = JSON.stringify({
              type: 'error',
              success: false,
              error: error.message || 'Internal server error',
              processed: results.processed,
              errors: results.errors + 1
            });
            controller.enqueue(encoder.encode(`data: ${errorData}\n\n`));
            controller.close();
          }
        };

        // Start processing asynchronously
        processBatches();
      }
    });

    return new Response(readable, {
      headers: {
        ...corsHeaders,
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive'
      }
    });

  } catch (error) {
    console.error('Error in admin-sms-rfm-batch-stream:', error);
    
    return new Response(JSON.stringify({
      success: false,
      error: error.message || 'Internal server error'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
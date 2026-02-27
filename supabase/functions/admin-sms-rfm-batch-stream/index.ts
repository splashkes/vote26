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

    // Check which people need RFM updates using direct SQL in batches
    console.log(`Checking RFM cache for ${person_ids.length} people using direct SQL`);
    const existingScoreMap = new Map();
    const cacheCheckBatchSize = 1000; // Check in batches to respect row limits

    for (let i = 0; i < person_ids.length; i += cacheCheckBatchSize) {
      const batch = person_ids.slice(i, i + cacheCheckBatchSize);

      const { data: existingScores, error: cacheError } = await serviceClient
        .rpc('check_rfm_cache_batch', { p_person_ids: batch });

      if (cacheError) {
        console.error('Error checking RFM cache batch:', cacheError);
        continue; // Skip this batch but continue with others
      }

      if (existingScores) {
        existingScores.forEach(score => {
          existingScoreMap.set(score.person_id, score.calculated_at);
        });
        console.log(`Batch ${Math.floor(i / cacheCheckBatchSize) + 1}: Found ${existingScores.length} existing scores out of ${batch.length} people`);
      }
    }

    console.log(`Total existing RFM scores found: ${existingScoreMap.size} out of ${person_ids.length} people`);

    // Determine which people need RFM processing (in deterministic order for consistent progress)
    const needsUpdate = [];
    let noCacheCount = 0;
    let validCacheCount = 0;

    for (const personId of person_ids) {
      if (force_refresh) {
        needsUpdate.push(personId);
      } else {
        const existingTimestamp = existingScoreMap.get(personId);
        if (!existingTimestamp) {
          // No cache - needs calculation
          needsUpdate.push(personId);
          noCacheCount++;
        } else {
          // Has cache - use it (don't check expiration unless force_refresh is true)
          validCacheCount++;
        }
      }
    }

    // Sort to ensure consistent ordering across runs
    needsUpdate.sort();

    console.log(`Cache analysis: ${noCacheCount} no cache, ${validCacheCount} valid cache, ${needsUpdate.length} total need updates`);
    console.log(`Will send to frontend: total_requested=${person_ids.length}, needed_updates=${needsUpdate.length}`);

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
        const batchSize = 500; // Large batches - SQL is fast enough to handle this
        const results = {
          processed: 0,
          errors: 0,
          error_details: []
        };

        const processBatches = async () => {
          try {
            for (let i = 0; i < needsUpdate.length; i += batchSize) {
              const batch = needsUpdate.slice(i, i + batchSize);
              
              // Process batch in parallel using direct SQL function
              const batchPromises = batch.map(async (personId) => {
                try {
                  // Use the SQL function directly instead of HTTP calls
                  const { data, error } = await serviceClient
                    .rpc('calculate_rfm_score_for_person', { p_person_id: personId });

                  if (error) {
                    throw new Error(`RFM scoring failed: ${error.message}`);
                  }

                  if (data && data.length > 0) {
                    results.processed++;
                    return { personId, success: true };
                  } else {
                    throw new Error('No RFM data returned');
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
              
              // Send progress update every 5 batches to reduce overhead
              if (i % (batchSize * 5) === 0 || i + batchSize >= needsUpdate.length) {
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
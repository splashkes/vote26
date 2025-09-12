import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Helper function to add CORS headers to all responses
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, GET, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-client-info, apikey',
}

serve(async (req) => {
  // Handle CORS preflight for all origins
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        ...corsHeaders,
        'Access-Control-Max-Age': '86400',
      },
    })
  }

  const url = new URL(req.url)
  const pathParts = url.pathname.split('/').filter(p => p)
  
  // Handle different endpoints:
  // POST /promo-generator -> Generate and upload new material
  // GET /promo-generator/{id} -> Get status of generation
  // GET /promo-generator/check/{event_id}/{template_id}/{variant}[/{artist_id}] -> Check if exists
  
  try {
    if (req.method === 'POST') {
      return await handleGenerate(req)
    } else if (req.method === 'GET') {
      if (pathParts[pathParts.length - 1] === 'promo-generator') {
        // GET /promo-generator -> List materials for event
        const eventId = url.searchParams.get('event_id')
        if (!eventId) {
          return new Response(JSON.stringify({ error: 'event_id required' }), { status: 400 })
        }
        return await handleList(eventId)
      } else if (pathParts[1] === 'check') {
        // GET /promo-generator/check/{event_id}/{template_id}/{variant}[/{artist_id}]
        return await handleCheck(pathParts.slice(2))
      } else {
        // GET /promo-generator/{id}
        return await handleStatus(pathParts[1])
      }
    }
    
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { 
      status: 405,
      headers: { 'Content-Type': 'application/json' }
    })
  } catch (error) {
    console.error('[promo-generator] Error:', error)
    return new Response(JSON.stringify({ 
      error: error.message || 'Internal server error'
    }), {
      status: 500,
      headers: { 
        'Content-Type': 'application/json',
        ...corsHeaders
      }
    })
  }
})

const handleGenerate = async (req: Request) => {
  const body = await req.json()
  const { event_id, artist_id, template_id, template_name, template_kind, variant, spec, png_data, webm_data, cloudflare_id, cloudflare_url } = body
  
  if (!event_id || !template_id || !template_name || !template_kind || !variant) {
    return new Response(JSON.stringify({ 
      error: 'Missing required fields: event_id, template_id, template_name, template_kind, variant' 
    }), { 
      status: 400,
      headers: { 
        'Content-Type': 'application/json',
        ...corsHeaders
      }
    })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  )

  console.log(`[handleGenerate] Starting generation for template ${template_name}, variant ${variant}`)

  // If Cloudflare URL is provided, store it directly
  if (cloudflare_id && cloudflare_url) {
    console.log(`[handleGenerate] Storing Cloudflare material: ${cloudflare_id}`)
    
    const { data: material, error: insertError } = await supabase
      .from('promo_materials')
      .upsert({
        event_id,
        artist_id: artist_id || null,
        template_id,
        template_name,
        template_kind,
        variant,
        status: 'ready',
        png_url: cloudflare_url,
        thumbnail_url: cloudflare_url.replace('/public', '/thumbnail'),
        cf_image_id: cloudflare_id,
        width: spec?.variants?.find(v => v.id === variant)?.w || 1080,
        height: spec?.variants?.find(v => v.id === variant)?.h || 1080,
        generation_metadata: {
          requested_at: new Date().toISOString(),
          user_agent: req.headers.get('user-agent'),
          ip: req.headers.get('x-forwarded-for') || 'unknown',
          cloudflare_upload: true
        }
      })
      .select()
      .single()

    if (insertError) {
      console.error('[handleGenerate] Database error:', insertError)
      return new Response(JSON.stringify({
        error: 'Database error',
        success: false,
        debug: {
          timestamp: new Date().toISOString(),
          function_name: 'promo-generator',
          operation: 'cloudflare_material_insert',
          database_error: {
            message: insertError.message,
            details: insertError.details,
            hint: insertError.hint,
            code: insertError.code
          },
          payload_info: {
            event_id,
            artist_id,
            template_id,
            template_name,
            template_kind,
            variant,
            cloudflare_id,
            cloudflare_url
          }
        }
      }), { 
        status: 500,
        headers: { 
          'Content-Type': 'application/json',
          ...corsHeaders
        }
      })
    }

    console.log(`[handleGenerate] Material stored successfully: ${material.id}`)
    
    return new Response(JSON.stringify({
      id: material.id,
      status: 'ready',
      png_url: cloudflare_url,
      thumbnail_url: cloudflare_url.replace('/public', '/thumbnail'),
      message: 'Material generated and uploaded successfully'
    }), {
      headers: { 
        'Content-Type': 'application/json',
        ...corsHeaders
      }
    })
  }

  // Legacy path: Create promo_materials record
  const { data: material, error: insertError } = await supabase
    .from('promo_materials')
    .insert({
      event_id,
      artist_id: artist_id || null,
      template_id,
      template_name,
      template_kind,
      variant,
      status: png_data ? 'generating' : 'pending',
      generation_metadata: {
        requested_at: new Date().toISOString(),
        user_agent: req.headers.get('user-agent'),
        ip: req.headers.get('x-forwarded-for') || 'unknown'
      }
    })
    .select()
    .single()

  if (insertError) {
    console.error('[handleGenerate] Database error:', insertError)
    return new Response(JSON.stringify({
      error: 'Database error',
      success: false,
      debug: {
        timestamp: new Date().toISOString(),
        function_name: 'promo-generator',
        operation: 'legacy_material_insert',
        database_error: {
          message: insertError.message,
          details: insertError.details,
          hint: insertError.hint,
          code: insertError.code
        },
        payload_info: {
          event_id,
          artist_id,
          template_id,
          template_name,
          template_kind,
          variant,
          has_png_data: !!png_data,
          png_data_length: png_data?.length
        }
      }
    }), { 
      status: 500,
      headers: { 
        'Content-Type': 'application/json',
        ...corsHeaders
      }
    })
  }

  console.log(`[handleGenerate] Created material record: ${material.id}`)

  // If PNG data is provided, upload to Cloudflare Images (legacy path)
  if (png_data) {
    try {
      console.log(`[handleGenerate] Uploading PNG to Cloudflare Images...`)
      
      // Convert data URL to blob
      const base64Data = png_data.split(',')[1]
      const binaryData = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0))
      
      // Get Cloudflare config from database
      const { data: cfConfig, error: cfConfigError } = await supabase.rpc('get_cloudflare_config')
      
      if (cfConfigError || !cfConfig) {
        console.log('Cloudflare not configured, storing data URL in database instead')
        
        // Upsert material record with data URL directly (fallback)
        const { data: newMaterial, error: insertError2 } = await supabase
          .from('promo_materials')
          .upsert({
            event_id,
            artist_id: artist_id || null,
            template_id,
            template_name,
            template_kind,
            variant,
            status: 'ready',
            png_url: png_data, // Store data URL directly
            thumbnail_url: png_data,
            width: spec?.variants?.find(v => v.id === variant)?.w || 1080,
            height: spec?.variants?.find(v => v.id === variant)?.h || 1080,
            file_size_png: binaryData.length,
            generation_metadata: {
              requested_at: new Date().toISOString(),
              user_agent: req.headers.get('user-agent'),
              ip: req.headers.get('x-forwarded-for') || 'unknown',
              fallback_storage: true
            }
          })
          .select()
          .single()
        
        if (insertError2) {
          console.error('[handleGenerate] Failed to create material with data URL:', insertError2)
          return new Response(JSON.stringify({
            error: 'Failed to create material record',
            success: false,
            debug: {
              timestamp: new Date().toISOString(),
              function_name: 'promo-generator',
              operation: 'create_material_fallback',
              database_error: {
                message: insertError2.message,
                details: insertError2.details,
                hint: insertError2.hint,
                code: insertError2.code
              },
              payload_info: {
                event_id,
                artist_id,
                template_id,
                template_name,
                template_kind,
                variant,
                png_data_length: png_data?.length,
                fallback_storage: true
              }
            }
          }), {
            status: 500,
            headers: { 
              'Content-Type': 'application/json',
              ...corsHeaders
            }
          })
        }
        
        return new Response(JSON.stringify({
          id: newMaterial.id,
          status: 'ready',
          png_url: png_data,
          thumbnail_url: png_data,
          message: 'Material generated successfully (stored as data URL)'
        }), {
          headers: { 
            'Content-Type': 'application/json',
            ...corsHeaders
          }
        })
      }
      
      const cfAccountId = cfConfig.account_id
      const cfApiToken = cfConfig.api_token
      
      if (!cfAccountId || !cfApiToken) {
        throw new Error('Cloudflare credentials incomplete')
      }
      
      const formData = new FormData()
      formData.append('file', new Blob([binaryData], { type: 'image/png' }), `${material.id}.png`)
      formData.append('id', material.id)
      formData.append('metadata', JSON.stringify({
        event_id,
        artist_id: artist_id || null,
        template_id,
        variant,
        created_at: new Date().toISOString()
      }))
      
      const cfResponse = await fetch(`https://api.cloudflare.com/client/v4/accounts/${cfAccountId}/images/v1`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${cfApiToken}`
        },
        body: formData
      })
      
      const cfResult = await cfResponse.json()
      
      if (!cfResponse.ok) {
        console.error('[handleGenerate] Cloudflare upload failed:', cfResult)
        throw new Error('Cloudflare upload failed')
      }
      
      console.log(`[handleGenerate] PNG uploaded successfully:`, cfResult.result.id)
      
      // Update database with Cloudflare URLs
      const pngUrl = `https://imagedelivery.net/${cfAccountId}/${cfResult.result.id}/public`
      const thumbnailUrl = `https://imagedelivery.net/${cfAccountId}/${cfResult.result.id}/thumbnail`
      
      const { error: updateError } = await supabase
        .from('promo_materials')
        .update({
          status: 'ready',
          png_url: pngUrl,
          thumbnail_url: thumbnailUrl,
          cf_image_id: cfResult.result.id,
          width: spec.variants?.find(v => v.id === variant)?.w || 1080,
          height: spec.variants?.find(v => v.id === variant)?.h || 1080,
          file_size_png: binaryData.length,
          updated_at: new Date().toISOString()
        })
        .eq('id', material.id)
      
      if (updateError) {
        console.error('[handleGenerate] Failed to update material with CF URLs:', updateError)
        throw new Error('Failed to update material record')
      }
      
      console.log(`[handleGenerate] Material ${material.id} updated with Cloudflare URLs`)
      
      // Return success with CF URLs
      return new Response(JSON.stringify({
        id: material.id,
        status: 'ready',
        png_url: pngUrl,
        thumbnail_url: thumbnailUrl,
        message: 'Material generated and uploaded successfully'
      }), {
        headers: { 
          'Content-Type': 'application/json',
          ...corsHeaders
        }
      })
      
    } catch (error) {
      console.error('[handleGenerate] Upload error:', error)
      
      // Update status to failed
      await supabase
        .from('promo_materials')
        .update({
          status: 'failed',
          generation_metadata: {
            ...material.generation_metadata,
            error: error.message,
            failed_at: new Date().toISOString()
          }
        })
        .eq('id', material.id)
      
      return new Response(JSON.stringify({
        id: material.id,
        status: 'failed',
        error: error.message
      }), {
        status: 500,
        headers: { 
          'Content-Type': 'application/json',
          ...corsHeaders
        }
      })
    }
  }

  // Return immediately with material ID for status checking
  return new Response(JSON.stringify({
    id: material.id,
    status: 'generating',
    message: 'Generation started, check status with GET /{id}'
  }), {
    headers: { 
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    }
  })
}

const handleStatus = async (materialId: string) => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  )

  const { data: material, error } = await supabase
    .from('promo_materials')
    .select('*')
    .eq('id', materialId)
    .single()

  if (error || !material) {
    return new Response(JSON.stringify({ error: 'Material not found' }), { status: 404 })
  }

  return new Response(JSON.stringify(material), {
    headers: { 
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    }
  })
}

const handleCheck = async (pathParts: string[]) => {
  if (pathParts.length < 3) {
    return new Response(JSON.stringify({ error: 'Invalid path' }), { status: 400 })
  }

  const [eventId, templateId, variant, artistId] = pathParts
  
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  )

  let query = supabase
    .from('promo_materials')
    .select('*')
    .eq('event_id', eventId)
    .eq('template_id', templateId)
    .eq('variant', variant)

  if (artistId) {
    query = query.eq('artist_id', artistId)
  } else {
    query = query.is('artist_id', null)
  }

  const { data: materials, error } = await query
    .order('created_at', { ascending: false })
    .limit(1)
  
  const material = materials?.[0] || null

  if (error && error.code !== 'PGRST116') { // PGRST116 = no rows found
    console.error('[handleCheck] Database error:', error)
    return new Response(JSON.stringify({ error: 'Database error' }), { status: 500 })
  }

  return new Response(JSON.stringify({
    exists: !!material,
    material: material || null
  }), {
    headers: { 
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    }
  })
}

const handleList = async (eventId: string) => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  )

  const { data: materials, error } = await supabase
    .from('promo_materials')
    .select('*')
    .eq('event_id', eventId)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('[handleList] Database error:', error)
    return new Response(JSON.stringify({ error: 'Database error' }), { status: 500 })
  }

  return new Response(JSON.stringify({
    materials: materials || [],
    total: materials?.length || 0
  }), {
    headers: { 
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    }
  })
}

// TODO: Implement actual Cloudflare Images upload
// This will require:
// 1. Accept PNG/WebM data from client
// 2. Upload to Cloudflare Images API
// 3. Store CF URLs in database
// 4. Update status to 'ready'
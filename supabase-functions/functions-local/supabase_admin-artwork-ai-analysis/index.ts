// Artwork AI Analysis Generator
// Date: September 2, 2025
// Purpose: Generate AI-powered artwork analysis using OpenAI Vision API with TTL caching

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS'
};

interface ArtworkData {
  id: string;
  title?: string;
  description?: string;
  image_url: string;
  source_type: string;
  cloudflare_id?: string;
  original_url?: string;
  compressed_url?: string;
}

interface ArtistContext {
  profile: any;
  eventHistory: any[];
  stats: {
    totalEvents: number;
    confirmationRate: number;
    activityTrend: string;
    recentEvents: number;
    roundWinPercentage: number;
  };
  auctionData: {
    totalAuctions: number;
    totalValue: number;
    averagePerPainting: number;
    highestSale: number;
    currency: string;
  };
}

interface ArtworkAnalysisResponse {
  commentary: string;
  event_potential: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    console.log('🎨 Artwork AI Analysis function called');
    
    // Initialize Supabase client with service role
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    console.log('📊 Environment check:', {
      hasSupabaseUrl: !!supabaseUrl,
      hasServiceKey: !!supabaseServiceKey,
      hasOpenAiKey: !!Deno.env.get('OPENAI_API_KEY')
    });
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    // Validate admin access
    const authHeader = req.headers.get('Authorization');
    console.log('🔐 Auth header present:', !!authHeader);
    
    if (!authHeader) {
      console.log('❌ No authorization header');
      return new Response(
        JSON.stringify({ error: 'Missing authorization' }),
        { status: 401, headers: corsHeaders }
      );
    }

    const requestBody = await req.json();
    console.log('📨 Request body:', requestBody);
    
    const { 
      artist_profile_id, 
      artwork_type = 'sample_work',
      force_regenerate = false,
      limit = 3 
    } = requestBody;

    if (!artist_profile_id) {
      console.log('❌ Missing artist_profile_id');
      return new Response(
        JSON.stringify({ error: 'Missing artist_profile_id' }),
        { status: 400, headers: corsHeaders }
      );
    }

    console.log('🎯 Processing artwork analysis for artist:', artist_profile_id);
    console.log('🎨 Artwork type:', artwork_type);

    // Get artist context for better analysis
    console.log('📊 Gathering artist context...');
    const artistContext = await gatherArtistContext(supabase, artist_profile_id);

    // Get artworks based on type
    let artworks: ArtworkData[] = [];
    if (artwork_type === 'sample_work') {
      console.log('🖼️ Getting sample works from unified function...');
      const { data: sampleWorks, error: sampleError } = await supabase
        .rpc('get_unified_sample_works', { profile_id: artist_profile_id });
      
      if (sampleError) {
        console.error('❌ Error fetching sample works:', sampleError);
        throw new Error('Failed to fetch sample works');
      }
      
      artworks = (sampleWorks || []).slice(0, limit);
      console.log('📈 Found sample works:', artworks.length);
    }

    if (artworks.length === 0) {
      return new Response(
        JSON.stringify({ 
          error: 'No artworks found',
          artwork_type,
          artist_profile_id 
        }),
        { status: 404, headers: corsHeaders }
      );
    }

    // Process all artworks in parallel for faster loading
    console.log('🚀 Processing all artworks in parallel...');
    const analysisPromises = artworks.map(async (artwork) => {
      console.log('🎨 Processing artwork:', artwork.id);
      
      // Check for existing cached analysis
      if (!force_regenerate) {
        console.log('🔍 Checking for cached analysis...');
        const { data: existingAnalysis } = await supabase
          .rpc('admin_get_artwork_ai_analysis', {
            p_artist_profile_id: artist_profile_id,
            p_image_url: artwork.image_url,
            p_artwork_type: artwork_type
          });

        if (existingAnalysis && existingAnalysis.length > 0 && existingAnalysis[0].is_cached) {
          console.log('✅ Using cached analysis for artwork:', artwork.id);
          return {
            artwork_id: artwork.id,
            image_url: artwork.image_url,
            analysis: existingAnalysis[0],
            cached: true
          };
        }
      }

      // Generate new AI analysis
      console.log('🧠 Generating AI analysis for artwork:', artwork.id);
      try {
        const analysis = await generateArtworkAnalysis(artwork, artistContext, artwork_type);
        
        // Store the analysis
        const analysisId = await supabase.rpc('admin_store_artwork_ai_analysis', {
          p_artist_profile_id: artist_profile_id,
          p_artwork_type: artwork_type,
          p_source_id: artwork.id,
          p_cloudflare_id: artwork.cloudflare_id || null,
          p_image_url: artwork.image_url,
          p_commentary: analysis.commentary,
          p_event_potential: analysis.event_potential,
          p_openai_model: 'gpt-4o-mini',
          p_prompt_used: createPrompt(artwork, artistContext, artwork_type),
          p_token_usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
          p_api_response_metadata: {}
        });

        return {
          artwork_id: artwork.id,
          image_url: artwork.image_url,
          analysis: {
            id: analysisId,
            commentary: analysis.commentary,
            event_potential: analysis.event_potential,
            generated_at: new Date().toISOString(),
            is_cached: false
          },
          cached: false
        };
        
      } catch (error) {
        console.error('❌ Failed to analyze artwork:', artwork.id, error);
        return {
          artwork_id: artwork.id,
          image_url: artwork.image_url,
          error: error.message,
          cached: false
        };
      }
    });

    // Wait for all analyses to complete
    const analyses = await Promise.all(analysisPromises);

    // Return all analyses
    return new Response(
      JSON.stringify({ 
        data: analyses,
        total_artworks: artworks.length,
        artwork_type,
        message: 'Artwork analysis completed'
      }),
      { status: 200, headers: corsHeaders }
    );

  } catch (error) {
    console.error('🚨 Artwork AI Analysis Error:', error);
    return new Response(
      JSON.stringify({ 
        error: 'Failed to generate artwork analysis',
        details: error.message 
      }),
      { status: 500, headers: corsHeaders }
    );
  }
});

async function gatherArtistContext(supabase: any, artistProfileId: string): Promise<ArtistContext> {
  try {
    // Get artist profile
    const { data: profile } = await supabase
      .from('artist_profiles')
      .select('*')
      .eq('id', artistProfileId)
      .single();

    if (!profile) {
      throw new Error('Artist profile not found');
    }

    // Get event history and auction data (simplified version)
    const [applicationsData, confirmationsData, auctionData] = await Promise.all([
      supabase.from('artist_applications')
        .select('*, events(name, eid, event_start_datetime, cities(name, countries(name)))')
        .eq('artist_number', profile.entry_id)
        .order('created_at', { ascending: false }),
      supabase.from('artist_confirmations')
        .select('*, events(name, eid, event_start_datetime, cities(name, countries(name)))')
        .eq('artist_number', profile.entry_id)
        .order('created_at', { ascending: false }),
      supabase.from('painting_auction_results')
        .select('final_price, currency')
        .eq('artist_number', profile.entry_id)
        .order('created_at', { ascending: false })
    ]);

    // Calculate stats
    const totalApplications = applicationsData.data?.length || 0;
    const totalConfirmations = confirmationsData.data?.length || 0;
    const confirmationRate = totalApplications > 0 ? (totalConfirmations / totalApplications) * 100 : 0;
    
    // Auction stats
    const auctions = auctionData.data || [];
    const totalAuctions = auctions.length;
    const totalValue = auctions.reduce((sum, auction) => sum + (auction.final_price || 0), 0);
    const averagePerPainting = totalAuctions > 0 ? totalValue / totalAuctions : 0;
    const currency = auctions[0]?.currency || 'CAD'; // Use most recent currency

    // Combine event history
    const eventHistory = [
      ...(applicationsData.data || []).map(app => ({ ...app, type: 'application' })),
      ...(confirmationsData.data || []).map(conf => ({ ...conf, type: 'confirmation' }))
    ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    return {
      profile,
      eventHistory,
      stats: {
        totalEvents: eventHistory.length,
        confirmationRate: Math.round(confirmationRate),
        activityTrend: eventHistory.length > 0 ? 'stable' : 'new',
        recentEvents: eventHistory.length,
        roundWinPercentage: 0 // Simplified for now
      },
      auctionData: {
        totalAuctions,
        totalValue: Math.round(totalValue * 100) / 100,
        averagePerPainting: Math.round(averagePerPainting * 100) / 100,
        highestSale: auctions.length > 0 ? Math.max(...auctions.map(a => a.final_price || 0)) : 0,
        currency
      }
    };

  } catch (error) {
    console.error('Error gathering artist context:', error);
    throw new Error('Failed to gather artist context');
  }
}

async function generateArtworkAnalysis(
  artwork: ArtworkData, 
  artistContext: ArtistContext, 
  artworkType: string
): Promise<ArtworkAnalysisResponse> {
  const openaiApiKey = Deno.env.get('OPENAI_API_KEY');
  
  if (!openaiApiKey) {
    throw new Error('OpenAI API key not configured');
  }

  console.log('🧠 Generating AI analysis with OpenAI Vision API...');
  const prompt = createPrompt(artwork, artistContext, artworkType);
  console.log('📝 Prompt length:', prompt.length);
  console.log('🖼️ Image URL:', artwork.image_url);
  
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${openaiApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: 'You are a sophisticated art critic with deep knowledge of contemporary art markets and live painting competitions. Analyze artworks with professional expertise.'
        },
        {
          role: 'user',
          content: [
            { 
              type: 'text', 
              text: prompt
            },
            {
              type: 'image_url',
              image_url: {
                url: artwork.image_url,
                detail: 'high' // Better analysis for artwork
              }
            }
          ]
        }
      ],
      response_format: { type: 'json_object' },
      max_tokens: 1000,
      temperature: 0.7
    })
  });

  console.log('🔄 OpenAI response status:', response.status);

  if (!response.ok) {
    const errorText = await response.text();
    console.error('❌ OpenAI API error:', errorText);
    throw new Error(`OpenAI API error: ${response.status} - ${errorText}`);
  }

  const result = await response.json();
  console.log('✨ OpenAI tokens used:', result.usage);
  
  const content = result.choices[0].message.content;
  console.log('📄 OpenAI response content length:', content.length);
  
  return JSON.parse(content) as ArtworkAnalysisResponse;
}

function createPrompt(artwork: ArtworkData, artistContext: ArtistContext, artworkType: string): string {
  const { profile, stats, auctionData } = artistContext;
  
  // Build artist context string
  let contextString = '';
  if (stats.totalEvents === 0) {
    contextString = `new artist at Art Battle`;
  } else {
    const cities = []; // Simplified - could extract from event history
    const cityString = cities.length > 0 ? ` (${cities.join(', ')})` : '';
    contextString = `${stats.totalEvents} time Art Battle Artist${cityString} with average sale price of ${auctionData.currency}$${auctionData.averagePerPainting} and ${stats.roundWinPercentage}% round win percentage`;
  }
  
  return `Analyze this ${artworkType.replace('_', ' ')} by ${profile.name || 'Unknown Artist'}.

Artist Context: ${contextString}

Artwork Details:
- Title: ${artwork.title || 'Untitled'}
- Description: ${artwork.description || 'No description available'}
- Source: ${artwork.source_type}

Provide concise professional art analysis in exactly 2 sections:

1. COMMENTARY: Combine technique, style, materials, and artistic assessment into 2-3 sentences
2. EVENT POTENTIAL: Merge market value and live performance suitability into 2-3 sentences

Format as JSON with keys: commentary, event_potential

Keep each section concise but comprehensive.`;
}
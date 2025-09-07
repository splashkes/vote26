// Artist AI Intelligence Generator
// Date: September 2, 2025
// Purpose: Generate AI-powered insights for artists using OpenAI API with TTL caching

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS'
};

interface ArtistData {
  profile: any;
  eventHistory: any[];
  stats: {
    totalEvents: number;
    confirmationRate: number;
    activityTrend: string;
    recentEvents: number;
    roundWinPercentage: number;
  };
  sampleWorks: any[];
  auctionData: {
    totalAuctions: number;
    totalValue: number;
    averagePerPainting: number;
    highestSale: number;
  };
}

interface AIIntelResponse {
  art_battle_history: string;
  bio_summary: string;
  event_potential: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    console.log('🚀 AI Intel function called');
    
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
    
    const { artist_profile_id, force_regenerate = false } = requestBody;

    if (!artist_profile_id) {
      console.log('❌ Missing artist_profile_id');
      return new Response(
        JSON.stringify({ error: 'Missing artist_profile_id' }),
        { status: 400, headers: corsHeaders }
      );
    }

    console.log('🎯 Processing artist_profile_id:', artist_profile_id);

    // Check for existing cached AI intel
    if (!force_regenerate) {
      console.log('🔍 Checking for cached AI intel...');
      const { data: existingIntel, error: cacheError } = await supabase
        .rpc('admin_get_artist_ai_intel', { p_artist_profile_id: artist_profile_id });

      console.log('📋 Cache check result:', { 
        hasData: !!existingIntel, 
        dataLength: existingIntel?.length || 0,
        error: cacheError?.message 
      });

      if (existingIntel && existingIntel.length > 0 && existingIntel[0].is_cached) {
        console.log('✅ Returning cached data');
        return new Response(
          JSON.stringify({ 
            data: existingIntel[0],
            cached: true,
            message: 'Returning cached AI intelligence'
          }),
          { status: 200, headers: corsHeaders }
        );
      }
    }

    // Gather comprehensive artist data
    console.log('📊 Gathering artist data...');
    const artistData = await gatherArtistData(supabase, artist_profile_id);
    console.log('📈 Artist data gathered:', {
      hasProfile: !!artistData.profile,
      eventHistoryCount: artistData.eventHistory.length,
      statsKeys: Object.keys(artistData.stats),
      sampleWorksCount: artistData.sampleWorks.length
    });

    // Get artwork analysis data to include in artist insights
    console.log('🎨 Getting artwork analysis data...');
    const { data: artworkAnalyses } = await supabase
      .from('art_media_ai_caption')
      .select('commentary, event_potential, image_url')
      .eq('artist_profile_id', artist_profile_id)
      .eq('artwork_type', 'sample_work')
      .gt('expires_at', 'now()');
    
    artistData.artworkAnalyses = artworkAnalyses || [];
    console.log('🖼️ Found artwork analyses:', artistData.artworkAnalyses.length);
    
    if (!artistData.profile) {
      return new Response(
        JSON.stringify({ error: 'Artist profile not found' }),
        { status: 404, headers: corsHeaders }
      );
    }

    // Generate AI insights using OpenAI
    const aiInsights = await generateAIInsights(artistData);
    
    // Store the new AI intel in database  
    const { data: intelId } = await supabase
      .rpc('admin_store_artist_ai_intel', {
        p_artist_profile_id: artist_profile_id,
        p_ai_summary: { art_battle_history: aiInsights.art_battle_history },
        p_participation_insights: { bio_summary: aiInsights.bio_summary },
        p_bio_analysis: { event_potential: aiInsights.event_potential },
        p_recommendations: { auction_stats: artistData.auctionData },
        p_strengths: [],
        p_growth_areas: [],
        p_openai_model: 'gpt-4o-mini',
        p_token_usage: { 
          prompt_tokens: 0, 
          completion_tokens: 0,
          total_tokens: 0 
        }
      });

    // Return the fresh AI intel
    return new Response(
      JSON.stringify({ 
        data: {
          id: intelId,
          art_battle_history: aiInsights.art_battle_history,
          bio_summary: aiInsights.bio_summary,
          event_potential: aiInsights.event_potential,
          auction_stats: artistData.auctionData,
          round_win_percentage: artistData.stats.roundWinPercentage,
          generated_at: new Date().toISOString(),
          is_cached: false
        },
        cached: false,
        message: 'Generated fresh AI intelligence'
      }),
      { status: 200, headers: corsHeaders }
    );

  } catch (error) {
    console.error('AI Intel Error:', error);
    return new Response(
      JSON.stringify({ 
        error: 'Failed to generate AI intelligence',
        details: error.message 
      }),
      { status: 500, headers: corsHeaders }
    );
  }
});

async function gatherArtistData(supabase: any, artistProfileId: string): Promise<ArtistData> {
  try {
    // Get artist profile
    const { data: profile } = await supabase
      .from('artist_profiles')
      .select('*')
      .eq('id', artistProfileId)
      .single();

    // Get event history (applications, invitations, confirmations)
    const [applicationsData, confirmationsData, invitationsData] = await Promise.all([
      supabase.from('artist_applications')
        .select('*, events(name, eid, event_start_datetime, cities(name, countries(name)))')
        .eq('artist_number', profile?.entry_id)
        .order('created_at', { ascending: false }),
      supabase.from('artist_confirmations')
        .select('*, events(name, eid, event_start_datetime, cities(name, countries(name)))')
        .eq('artist_number', profile?.entry_id)
        .order('created_at', { ascending: false }),
      supabase.from('artist_invitations')
        .select('*, events(name, eid, event_start_datetime, cities(name, countries(name)))')
        .eq('artist_number', profile?.entry_id)
        .order('created_at', { ascending: false })
    ]);

    // Get sample works
    const { data: sampleWorks } = await supabase
      .rpc('get_unified_sample_works', { profile_id: artistProfileId });

    // Get auction data (from same source as art-battle-artists activity tab)
    const { data: auctionData } = await supabase
      .from('painting_auction_results')
      .select('final_price, painting_id')
      .eq('artist_number', profile?.entry_id);

    // Get round performance data
    const { data: roundData } = await supabase
      .from('round_results')
      .select('winner, artist_number')
      .eq('artist_number', profile?.entry_id);

    // Combine event history
    const eventHistory = [
      ...(applicationsData.data || []).map(app => ({ ...app, type: 'application' })),
      ...(confirmationsData.data || []).map(conf => ({ ...conf, type: 'confirmation' })),
      ...(invitationsData.data || []).map(inv => ({ ...inv, type: 'invitation' }))
    ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    // Calculate participation stats
    const totalApplications = applicationsData.data?.length || 0;
    const totalConfirmations = confirmationsData.data?.length || 0;
    const confirmationRate = totalApplications > 0 ? (totalConfirmations / totalApplications) * 100 : 0;
    
    // Calculate round win percentage
    const totalRounds = roundData?.length || 0;
    const roundWins = roundData?.filter(round => round.winner === true).length || 0;
    const roundWinPercentage = totalRounds > 0 ? (roundWins / totalRounds) * 100 : 0;
    
    // Calculate auction statistics
    const auctions = auctionData || [];
    const totalAuctions = auctions.length;
    const totalValue = auctions.reduce((sum, auction) => sum + (auction.final_price || 0), 0);
    const averagePerPainting = totalAuctions > 0 ? totalValue / totalAuctions : 0;
    const highestSale = auctions.length > 0 ? Math.max(...auctions.map(a => a.final_price || 0)) : 0;
    
    // Determine activity trend (simplified)
    const recentEvents = eventHistory.filter(event => {
      const eventDate = new Date(event.created_at);
      const sixMonthsAgo = new Date();
      sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
      return eventDate > sixMonthsAgo;
    }).length;

    const activityTrend = recentEvents > 2 ? 'increasing' : recentEvents > 0 ? 'stable' : 'decreasing';

    return {
      profile,
      eventHistory,
      stats: {
        totalEvents: eventHistory.length,
        confirmationRate: Math.round(confirmationRate),
        activityTrend,
        recentEvents,
        roundWinPercentage: Math.round(roundWinPercentage * 100) / 100
      },
      sampleWorks: sampleWorks || [],
      auctionData: {
        totalAuctions,
        totalValue: Math.round(totalValue * 100) / 100,
        averagePerPainting: Math.round(averagePerPainting * 100) / 100,
        highestSale: Math.round(highestSale * 100) / 100
      }
    };

  } catch (error) {
    console.error('Error gathering artist data:', error);
    throw new Error('Failed to gather artist data');
  }
}

async function generateAIInsights(artistData: ArtistData): Promise<AIIntelResponse> {
  const openaiApiKey = Deno.env.get('OPENAI_API_KEY');
  
  if (!openaiApiKey) {
    throw new Error('OpenAI API key not configured');
  }

  console.log('🧠 Generating AI insights with OpenAI...');
  const prompt = createPrompt(artistData);
  console.log('📝 Prompt length:', prompt.length);
  
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
          content: 'You are an expert art event coordinator analyzing artist profiles and participation data. Provide insights that help event organizers make informed decisions about artist engagement and development.'
        },
        {
          role: 'user',
          content: prompt
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
  console.log('📄 OpenAI response content:', content);
  
  try {
    const parsedResponse = JSON.parse(content);
    console.log('🔍 Parsed response structure:', Object.keys(parsedResponse));
    
    // Validate the response has the expected structure
    const validatedResponse: AIIntelResponse = {
      art_battle_history: typeof parsedResponse.art_battle_history === 'string' ? parsedResponse.art_battle_history : 'Analysis unavailable',
      bio_summary: typeof parsedResponse.bio_summary === 'string' ? parsedResponse.bio_summary : 'Analysis unavailable',
      event_potential: typeof parsedResponse.event_potential === 'string' ? parsedResponse.event_potential : 'Analysis unavailable'
    };
    
    console.log('✅ Validated response:', validatedResponse);
    return validatedResponse;
  } catch (parseError) {
    console.error('❌ Failed to parse OpenAI response:', parseError);
    console.log('📝 Raw content:', content);
    throw new Error(`Invalid JSON response from OpenAI: ${parseError.message}`);
  }
}

function createPrompt(artistData: ArtistData): string {
  const { profile, eventHistory, stats, sampleWorks, auctionData, artworkAnalyses } = artistData;
  
  // Build artwork analysis summary (optional - may not exist yet)
  let artworkSummary = '';
  if (artworkAnalyses && artworkAnalyses.length > 0) {
    artworkSummary = `\n\nARTWORK ANALYSIS SUMMARY (${artworkAnalyses.length} works analyzed):
${artworkAnalyses.map((analysis, index) => 
  `Work ${index + 1}: ${analysis.commentary} ${analysis.event_potential}`
).join('\n')}`;
  } else {
    artworkSummary = '\n\nARTWORK ANALYSIS: Not yet available - analysis pending or no sample works.';
  }

  // Determine if there's sufficient data for confident analysis
  const hasMinimalData = stats.totalEvents < 2 && auctionData.totalAuctions === 0;
  const dataConfidenceNote = hasMinimalData ? 
    '\n\nIMPORTANT: Limited participation data - provide technical observations only, avoid speculative judgments.' : 
    '';
  
  return `Perform technical analysis of this Art Battle artist profile with quantitative focus:

PROFILE DATA:
- Name: ${profile.name || 'Unknown'}
- Bio: ${profile.abhq_bio || profile.bio || 'No bio available'}
- Location: ${profile.city_text || profile.city || 'Unknown'}, ${profile.country || ''}
- Specialties: ${profile.specialties || 'Not specified'}
- Digital Presence: ${profile.instagram ? 'Instagram' : 'None'}, ${profile.website ? 'Website' : 'None'}

QUANTITATIVE METRICS:
- Event Participation Rate: ${stats.totalEvents} activities, ${stats.confirmationRate}% confirmation rate
- Performance Trend: ${stats.activityTrend} (${stats.recentEvents} recent activities)
- Competition Success: ${stats.roundWinPercentage}% round win rate
- Market Performance: ${auctionData.totalAuctions} sales, $${auctionData.averagePerPainting} avg, $${auctionData.totalValue} total
- Peak Sale: $${auctionData.highestSale}

TEMPORAL ANALYSIS:
${eventHistory.slice(0, 5).map(event => 
  `${new Date(event.created_at).toLocaleDateString()}: ${event.type} - ${event.events?.name || event.event_eid}`
).join('\n')}

${artworkSummary}

PORTFOLIO: ${sampleWorks.length} documented works${dataConfidenceNote}

Provide technical assessment in JSON format with EXACTLY these 3 string fields:
{
  "art_battle_history": "Technical analysis of participation patterns, frequency, geographic distribution, and temporal trends based on quantifiable data - 2-3 sentences only",
  "bio_summary": "Professional assessment of artistic positioning, bio completeness, and digital presence effectiveness - 2-3 sentences only", 
  "event_potential": "Data-driven evaluation of event value based on confirmed metrics: auction performance, participation reliability, and competitive success rates - 2-3 sentences only"
}

CRITICAL: Return ONLY these 3 string fields. Do not include any nested objects, arrays, or additional fields. Maintain analytical objectivity. If data is insufficient, state limitations explicitly within the string responses.`;
}


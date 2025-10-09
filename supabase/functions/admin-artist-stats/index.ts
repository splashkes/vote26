import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'
import { corsHeaders } from '../_shared/cors.ts'

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    )

    // Verify the request has a valid session
    const authHeader = req.headers.get('Authorization')!
    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser(token)

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }

    // Get artist numbers from request
    const { artistNumbers, eventIds } = await req.json()

    if (!artistNumbers || !Array.isArray(artistNumbers) || artistNumbers.length === 0) {
      return new Response(
        JSON.stringify({ error: 'artistNumbers array is required' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }

    // Convert artist numbers to integers (art.artist_number is integer type)
    const artistNumbersInt = artistNumbers.map(n => parseInt(n, 10)).filter(n => !isNaN(n))

    // Fetch artworks for these artists (optionally filtered by events)
    let artworksQuery = supabaseClient
      .from('art')
      .select('id, artist_number, event_id, round')
      .in('artist_number', artistNumbersInt)

    if (eventIds && Array.isArray(eventIds) && eventIds.length > 0) {
      artworksQuery = artworksQuery.in('event_id', eventIds)
    }

    const { data: artworks, error: artError } = await artworksQuery

    if (artError) throw artError

    // Get art IDs for bid and vote queries
    const artIds = artworks?.map(a => a.id) || []

    // Fetch highest bids for each artwork
    const { data: bids, error: bidsError } = await supabaseClient
      .from('bids')
      .select('art_id, amount, currency_code')
      .in('art_id', artIds)
      .order('amount', { ascending: false })

    if (bidsError) throw bidsError

    // Fetch votes for these artworks
    const { data: votes, error: votesError } = await supabaseClient
      .from('votes')
      .select('art_uuid, vote_factor')
      .in('art_uuid', artIds)

    if (votesError) throw votesError

    // Group bids by art_id and get highest bid
    const artworkSales = new Map()
    bids?.forEach(bid => {
      if (!artworkSales.has(bid.art_id)) {
        artworkSales.set(bid.art_id, {
          highestBid: bid.amount,
          currencyCode: bid.currency_code
        })
      }
    })

    // Count votes per artwork
    const artworkVotes = new Map()
    votes?.forEach(vote => {
      const currentCount = artworkVotes.get(vote.art_uuid) || 0
      artworkVotes.set(vote.art_uuid, currentCount + (vote.vote_factor || 1))
    })

    // Calculate stats per artist
    const artistStats: Record<number, any> = {}

    artistNumbers.forEach(artistNumber => {
      try {
        const artistArtworks = artworks?.filter(a => a.artist_number === artistNumber) || []

        // Get sold artworks (those with bids)
        const soldArtworks = artistArtworks.filter(a => artworkSales.has(a.id))
        const soldCount = soldArtworks.length

        // Calculate total revenue and average price
        let totalRevenue = 0
        const currencies = new Set<string>()

        soldArtworks.forEach(artwork => {
          const sale = artworkSales.get(artwork.id)
          if (sale) {
            totalRevenue += sale.highestBid || 0
            if (sale.currencyCode) {
              currencies.add(sale.currencyCode)
            }
          }
        })

        const avgPrice = soldCount > 0 ? totalRevenue / soldCount : 0
        const currencyCode = currencies.size === 1 ? Array.from(currencies)[0] : null

        // Calculate average votes per round from votes table
        const artworksWithVotes = artistArtworks.filter(a => artworkVotes.has(a.id) && artworkVotes.get(a.id) > 0)
        const totalVotes = artworksWithVotes.reduce((sum, a) => sum + (artworkVotes.get(a.id) || 0), 0)
        const avgVotesPerRound = artworksWithVotes.length > 0 ? totalVotes / artworksWithVotes.length : 0

        artistStats[artistNumber] = {
          totalArtworks: artistArtworks.length,
          soldCount,
          avgPrice: Math.round(avgPrice),
          currencyCode,
          avgVotesPerRound: Math.round(avgVotesPerRound),
          totalVotes
        }
      } catch (err) {
        console.error(`Error processing artist ${artistNumber}:`, err)
        // Return empty stats for this artist
        artistStats[artistNumber] = {
          totalArtworks: 0,
          soldCount: 0,
          avgPrice: 0,
          currencyCode: null,
          avgVotesPerRound: 0,
          totalVotes: 0
        }
      }
    })

    return new Response(
      JSON.stringify({
        success: true,
        data: { stats: artistStats }
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )

  } catch (error) {
    console.error('Error in admin-artist-stats:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )
  }
})

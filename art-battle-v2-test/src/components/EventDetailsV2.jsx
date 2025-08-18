import { useState, useEffect } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { publicDataManager } from '../utils/publicDataManager'
import { useEventDataRefresh } from '../utils/broadcastClient'
import { supabase } from '../lib/supabase'
import PaymentButton from './shared/PaymentButton'

const EventDetailsV2 = () => {
  const { eid } = useParams()
  const navigate = useNavigate()
  const { user, person } = useAuth()
  const [eventData, setEventData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [votingArt, setVotingArt] = useState(null)
  const [biddingArt, setBiddingArt] = useState(null)
  const [bidAmount, setBidAmount] = useState('')

  // Component configuration logging
  useEffect(() => {
    console.log('🚀 [EventDetailsV2] Component mounted with configuration:', {
      eventId: eid,
      version: 'V2',
      cacheStrategy: 'Public cached data with client-side auth',
      baseUrl: 'https://artb.art/live',
      broadcastEnabled: true,
      user: !!user,
      person: !!person
    })
    
    // Log cache manager status on component mount
    publicDataManager.logCacheStatus()
  }, [])

  // CLIENT-SIDE authentication enforcement
  useEffect(() => {
    if (!user) {
      navigate('/login')
      return
    }
    loadEventData()
  }, [user, eid])

  // Optional: Listen for cache invalidation broadcasts
  useEventDataRefresh(eid, async (notification) => {
    console.log('📡 [EventDetailsV2] Cache invalidation broadcast received:', {
      type: notification.type,
      eventId: eid,
      timestamp: new Date().toISOString()
    })
    publicDataManager.invalidateCache(eid)
    console.log('🔄 [EventDetailsV2] Refreshing event data after broadcast...')
    await loadEventData()
  })

  const loadEventData = async () => {
    if (!eid) return
    
    try {
      setLoading(true)
      setError(null)
      
      console.log('🎨 [EventDetailsV2] Loading event data for:', eid)
      const data = await publicDataManager.fetchEventData(eid)
      setEventData(data)
      console.log('✅ [EventDetailsV2] Event data loaded successfully:', {
        eventId: eid,
        artCount: data?.event?.art?.length || 0,
        hasVotes: !!data?.votes,
        hasBids: !!data?.bids
      })
      
    } catch (err) {
      console.error('❌ [EventDetailsV2] Failed to load event data:', err)
      setError('Failed to load event data. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  // SHARED write operations - same endpoints as V1
  const handleVote = async (artId) => {
    if (!person) {
      alert('Please complete your profile to vote')
      return
    }

    setVotingArt(artId)
    
    try {
      const { data, error } = await supabase.rpc('cast_vote_secure', { 
        p_art_id: artId 
      })
      
      if (error) throw error
      
      if (data?.success) {
        console.log('🗳️  [EventDetailsV2] Vote successful - invalidating cache and refreshing data')
        // Trigger cache refresh after successful vote
        publicDataManager.invalidateCache(eid)
        console.log('🔄 [EventDetailsV2] Cache invalidated, refreshing event data...')
        await loadEventData()
        console.log('✅ [EventDetailsV2] Event data refreshed after vote')
        alert('Vote cast successfully!')
      } else {
        alert(data?.message || 'Failed to cast vote')
      }
    } catch (error) {
      console.error('Vote error:', error)
      alert('Failed to cast vote: ' + error.message)
    } finally {
      setVotingArt(null)
    }
  }

  const handleBid = async (artId, amount) => {
    if (!person) {
      alert('Please complete your profile to bid')
      return
    }

    setBiddingArt(artId)
    
    try {
      const { data, error } = await supabase.rpc('place_bid_secure', { 
        p_art_id: artId, 
        p_amount: parseFloat(amount)
      })
      
      if (error) throw error
      
      if (data?.success) {
        console.log('💰 [EventDetailsV2] Bid successful - invalidating cache and refreshing data')
        // Trigger cache refresh after successful bid
        publicDataManager.invalidateCache(eid)
        console.log('🔄 [EventDetailsV2] Cache invalidated, refreshing event data...')
        await loadEventData()
        console.log('✅ [EventDetailsV2] Event data refreshed after bid')
        alert('Bid placed successfully!')
        setBidAmount('')
      } else {
        alert(data?.message || 'Failed to place bid')
      }
    } catch (error) {
      console.error('Bid error:', error)
      alert('Failed to place bid: ' + error.message)
    } finally {
      setBiddingArt(null)
    }
  }

  const getCurrentBid = (artId) => {
    const bid = eventData?.current_bids?.find(b => b.art_id === artId)
    return bid?.current_bid || 0
  }

  const getVoteCount = (artId) => {
    const voteSummary = eventData?.vote_summary?.find(v => v.art_id === artId)
    return voteSummary?.total_votes || 0
  }

  if (loading) {
    return (
      <div className="container">
        <div className="loading">Loading event data...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="container">
        <div className="error">
          {error}
          <button onClick={loadEventData} className="retry-button">
            Try Again
          </button>
        </div>
      </div>
    )
  }

  if (!eventData) {
    return (
      <div className="container">
        <div className="error">Event not found</div>
        <Link to="/" className="back-link">← Back to Events</Link>
      </div>
    )
  }

  const { event, artworks } = eventData

  return (
    <div className="container">
      <header className="event-header">
        <Link to="/" className="back-link">← Back to Events</Link>
        
        <div className="event-info">
          <h1>{event.name}</h1>
          {event.venue && <div className="venue">📍 {event.venue}</div>}
          {event.event_start_datetime && (
            <div className="date">
              📅 {new Date(event.event_start_datetime).toLocaleDateString('en-US', {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
              })}
            </div>
          )}
        </div>
        
        <div className="cache-badge">V2 Cached</div>
      </header>

      <div className="artworks-grid">
        {artworks?.map(artwork => (
          <div key={artwork.id} className="artwork-card">
            <div className="artwork-header">
              <h3>Easel {artwork.easel}</h3>
              <span className="artwork-status">{artwork.status}</span>
            </div>

            {artwork.artist_profiles && (
              <div className="artist-info">
                <h4>{artwork.artist_profiles.name}</h4>
                {artwork.artist_profiles.bio && (
                  <p className="artist-bio">{artwork.artist_profiles.bio}</p>
                )}
                {artwork.artist_profiles.instagram && (
                  <div className="artist-social">
                    📷 @{artwork.artist_profiles.instagram}
                  </div>
                )}
              </div>
            )}

            <div className="artwork-stats">
              <div className="votes">
                👍 {getVoteCount(artwork.id)} votes
              </div>
              <div className="current-bid">
                💰 ${getCurrentBid(artwork.id)}
              </div>
            </div>

            <div className="artwork-actions">
              <button
                onClick={() => handleVote(artwork.id)}
                disabled={votingArt === artwork.id}
                className="vote-button"
              >
                {votingArt === artwork.id ? 'Voting...' : 'Vote'}
              </button>

              <div className="bid-section">
                <input
                  type="number"
                  placeholder="Bid amount"
                  value={artwork.id === biddingArt ? bidAmount : ''}
                  onChange={(e) => {
                    if (biddingArt === artwork.id) {
                      setBidAmount(e.target.value)
                    }
                  }}
                  onFocus={() => setBiddingArt(artwork.id)}
                  className="bid-input"
                  min={getCurrentBid(artwork.id) + 5}
                  step="5"
                />
                <button
                  onClick={() => handleBid(artwork.id, bidAmount)}
                  disabled={!bidAmount || biddingArt !== artwork.id}
                  className="bid-button"
                >
                  Bid
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {(!artworks || artworks.length === 0) && (
        <div className="no-artworks">
          <h2>No artworks yet</h2>
          <p>Artworks will appear here when artists start painting!</p>
        </div>
      )}

      <PaymentButton />

      <footer className="event-footer">
        <div className="cache-info">
          <small>
            V2 System • Last updated: {eventData.generated_at ? 
              new Date(eventData.generated_at).toLocaleTimeString() : 'Unknown'} •
            <button onClick={loadEventData} className="refresh-button">
              Refresh Data
            </button>
          </small>
        </div>
      </footer>
    </div>
  )
}

export default EventDetailsV2
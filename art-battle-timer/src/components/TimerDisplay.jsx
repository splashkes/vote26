import { useState, useEffect, useRef } from 'react'
import { useParams } from 'react-router-dom'
import { fetchTimerData } from '../lib/supabase'
import { Card, Text, Progress, Flex, Box, Badge } from '@radix-ui/themes'

export default function TimerDisplay() {
  const { eid } = useParams()
  const [timerData, setTimerData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [currentTime, setCurrentTime] = useState(Date.now())
  const [currentRoundIndex, setCurrentRoundIndex] = useState(0)

  const refreshData = async () => {
    try {
      const data = await fetchTimerData(eid)
      setTimerData(data)
      setError(null)
    } catch (error) {
      console.error('Failed to refresh timer data:', error)
      setError(error.message)
    }
  }

  useEffect(() => {
    if (!eid) return

    // Initial load
    const loadData = async () => {
      setLoading(true)
      await refreshData()
      setLoading(false)
    }
    loadData()

    // Refresh every 5 seconds
    const dataInterval = setInterval(refreshData, 5000)

    // Update current time every second for countdown
    const timeInterval = setInterval(() => {
      setCurrentTime(Date.now())
    }, 1000)

    return () => {
      clearInterval(dataInterval)
      clearInterval(timeInterval)
    }
  }, [eid])

  // Rotation effect for upcoming rounds display
  useEffect(() => {
    // Reset index when rounds data changes
    setCurrentRoundIndex(0)

    if (timerData?.upcoming_rounds && timerData.upcoming_rounds.length > 1 && !timerData.has_active_timers) {
      const rotationInterval = setInterval(() => {
        setCurrentRoundIndex(prev => (prev + 1) % timerData.upcoming_rounds.length)
      }, 15000) // 15 seconds

      return () => clearInterval(rotationInterval)
    }
  }, [timerData?.upcoming_rounds, timerData?.has_active_timers])

  const formatTime = (timeMs) => {
    if (timeMs <= 0) return "00:00"
    
    const totalSeconds = Math.floor(timeMs / 1000)
    const minutes = Math.floor(totalSeconds / 60)
    const seconds = totalSeconds % 60
    
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
  }

  const calculateProgress = (closingTime) => {
    if (!closingTime) return 0
    
    const now = currentTime
    const endTime = new Date(closingTime).getTime()
    const twentyMinutesInMs = 20 * 60 * 1000
    const startTime = endTime - twentyMinutesInMs
    
    if (now <= startTime) return 0
    if (now >= endTime) return 100
    
    const elapsed = now - startTime
    const total = endTime - startTime
    return (elapsed / total) * 100
  }

  const getTimerColor = (timeRemaining) => {
    const minutes = Math.floor(timeRemaining / (1000 * 60))
    if (minutes >= 15) return 'green'
    if (minutes >= 4) return 'yellow' 
    if (minutes >= 1) return 'red'
    return 'red'
  }

  const formatTimeAgo = (pastTime) => {
    const now = currentTime
    const diffMs = now - pastTime
    const diffMinutes = Math.floor(diffMs / (1000 * 60))
    const diffHours = Math.floor(diffMinutes / 60)
    const diffDays = Math.floor(diffHours / 24)

    if (diffDays > 0) return `ended ${diffDays}d ago`
    if (diffHours > 0) return `ended ${diffHours}h ago`
    if (diffMinutes > 0) return `ended ${diffMinutes}m ago`
    return 'just ended'
  }

  const formatEventDate = (dateTime) => {
    if (!dateTime) return ''
    const date = new Date(dateTime)
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    })
  }

  const formatEventDateTime = (dateTime) => {
    if (!dateTime) return ''
    const date = new Date(dateTime)
    const dateStr = date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    })
    const timeStr = date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    })
    return `${dateStr} • ${timeStr}`
  }

  // Auto-scaling font system for artist names
  const [autoFontSize, setAutoFontSize] = useState(4) // rem

  // Get all artist names for font scaling
  const allArtistNames = timerData?.upcoming_rounds?.length >= 2 &&
                        timerData.upcoming_rounds[0]?.artist_names &&
                        timerData.upcoming_rounds[1]?.artist_names
    ? [
        ...timerData.upcoming_rounds[0].artist_names.map(a => a.name || 'ARTIST'),
        ...timerData.upcoming_rounds[1].artist_names.map(a => a.name || 'ARTIST')
      ]
    : []

  useEffect(() => {
    if (!allArtistNames || allArtistNames.length === 0) return

    const containerWidth = typeof window !== 'undefined' ? window.innerWidth : 1200

    // Find the longest name
    const longestName = allArtistNames.reduce((longest, name) =>
      name.length > longest.length ? name : longest, '')

    // Create temporary element to measure text
    const measureElement = document.createElement('div')
    measureElement.style.position = 'absolute'
    measureElement.style.visibility = 'hidden'
    measureElement.style.whiteSpace = 'nowrap'
    measureElement.style.fontFamily = 'inherit'
    measureElement.style.fontWeight = '900'
    measureElement.style.letterSpacing = '0.01em'
    measureElement.textContent = longestName.toUpperCase()
    document.body.appendChild(measureElement)

    // Binary search for optimal font size
    let minSize = 1
    let maxSize = 8
    let optimalSize = minSize

    while (minSize <= maxSize) {
      const testSize = (minSize + maxSize) / 2
      measureElement.style.fontSize = `${testSize}rem`

      const textWidth = measureElement.offsetWidth
      const availableWidth = containerWidth * 0.45 // Account for padding and column width

      if (textWidth <= availableWidth) {
        optimalSize = testSize
        minSize = testSize + 0.1
      } else {
        maxSize = testSize - 0.1
      }
    }

    document.body.removeChild(measureElement)
    setAutoFontSize(Math.max(1.5, Math.min(6, optimalSize))) // Clamp between 1.5rem and 6rem
  }, [allArtistNames, timerData])

  const formatDateTime = (timestamp) => {
    const date = new Date(timestamp)
    return date.toLocaleTimeString('en-US', { 
      hour: '2-digit', 
      minute: '2-digit',
      hour12: false 
    })
  }

  if (loading) {
    return (
      <div className="timer-loading">
        <Text size="8">Loading Timer Data...</Text>
      </div>
    )
  }

  if (error) {
    return (
      <div className="timer-error">
        <Text size="6" color="red">Error: {error}</Text>
        <Text size="4">Please check the event ID and try again</Text>
      </div>
    )
  }

  if (!timerData || (!timerData.has_active_timers && !timerData.auction_times && (!timerData.all_rounds || timerData.all_rounds.length === 0))) {
    return (
      <div className="timer-waiting">
        {/* Art Battle Logo */}
        <img 
          src="https://imagedelivery.net/IGZfH_Pl-6S6csykNnXNJw/0ce25113-c21e-4435-1dc0-6020d15fa300/public" 
          alt="Art Battle Logo" 
          className="art-battle-logo-waiting"
        />
        
        {timerData?.event && (
          <div className="event-info">
            <Text size="4" color="gray">{timerData.event.eid}</Text>
            <Text size="5">{timerData.event.city}</Text>
            <Text size="4">{timerData.event.venue}</Text>
          </div>
        )}
        <div className="waiting-message">
          <Text size="5">Waiting for Active Timers</Text>
          <Text size="3" color="gray">Timers will appear when auctions end within 30 minutes</Text>
        </div>
      </div>
    )
  }

  // Check if auction is active (has items with actual times and not all timers expired)
  const hasActiveAuction = timerData.auction_times &&
    timerData.auction_times.has_active_items &&
    !timerData.auction_times.all_timers_expired &&
    (timerData.auction_times.earliest || timerData.auction_times.latest)

  // If we have historical rounds OR upcoming rounds but no active timers AND no active auction, show appropriate display
  if (!timerData.has_active_timers && !hasActiveAuction &&
      ((timerData.all_rounds && timerData.all_rounds.length > 0) ||
       (timerData.upcoming_rounds && timerData.upcoming_rounds.length > 0))) {
    // Check if there are upcoming rounds
    const hasUpcomingRounds = timerData.upcoming_rounds && timerData.upcoming_rounds.length > 0
    const safeIndex = hasUpcomingRounds ? Math.min(currentRoundIndex, timerData.upcoming_rounds.length - 1) : 0
    const nextRound = hasUpcomingRounds ? timerData.upcoming_rounds[safeIndex] : null
    return (
      <div className="timer-waiting">
        {/* Always show Art Battle Logo for dual rounds or single round */}
        <img
          src="https://imagedelivery.net/IGZfH_Pl-6S6csykNnXNJw/0ce25113-c21e-4435-1dc0-6020d15fa300/public"
          alt="Art Battle Logo"
          className="art-battle-logo-waiting"
        />

        {/* Show event info for dual rounds */}
        {hasUpcomingRounds && timerData.upcoming_rounds.length >= 2 && timerData?.event && (
          <div className="event-info-one-line">
            <Text size="6" weight="bold" color="white">
              {timerData.event.city} • {timerData.event.eid} • {formatEventDateTime(timerData.event.event_start)}
            </Text>
          </div>
        )}

        {/* Show round header for single upcoming round only */}
        {hasUpcomingRounds && timerData.upcoming_rounds.length === 1 && (
          <div className="round-header">
            <Text size="8" weight="bold" color="amber">ROUND {nextRound.round} - UP NEXT:</Text>
          </div>
        )}

        {hasUpcomingRounds ? null : (
          // No upcoming rounds - show champion if available, otherwise event info
          timerData?.champion?.has_champion ? (
            <div className="champion-display">
              <Text size="6" weight="bold" color="gold" className="champion-title">
                CHAMPION
              </Text>
              <Text size="9" weight="bold" color="white" className="champion-name">
                {timerData.champion.champion_name.toUpperCase()}
              </Text>
            </div>
          ) : (
            timerData?.event && (
              <div className="event-info-large">
                <Text size="8" weight="bold" color="white">{timerData.event.eid}</Text>
                <Text size="7" weight="medium" color="amber">{timerData.event.city}</Text>
                <Text size="6" color="gray">{timerData.event.venue}</Text>
                <Text size="4" color="gray">{formatEventDate(timerData.event.event_start)}</Text>
              </div>
            )
          )
        )}

        {/* Round History Display - show completed rounds */}
        {timerData.all_rounds && timerData.all_rounds.length > 0 && (
          <div className="round-history">
            <div className="history-grid">
              {timerData.all_rounds.map(round => (
                <div key={round.round} className="history-item">
                  <Text size="2" weight="bold" color="amber">
                    Round {round.round}
                  </Text>
                  <Text size="1" color="gray">
                    {formatDateTime(round.start_time)} - {formatDateTime(round.closing_time)}
                  </Text>
                  <Text size="1" color="gray">
                    {round.is_past ?
                      formatTimeAgo(new Date(round.closing_time).getTime()) :
                      'in progress'
                    }
                  </Text>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Artist Names Display */}
        {hasUpcomingRounds && (() => {
          // Collect all artist names for auto-scaling

          return (
            <>
              {/* Dual Round Layout - Side by Side */}
              {timerData.upcoming_rounds.length >= 2 &&
               timerData.upcoming_rounds[0]?.artist_names &&
               timerData.upcoming_rounds[1]?.artist_names ? (
                <div className="dual-rounds-container">
                  <div className="round-column round-left">
                    <div className="round-title">
                      <Text size="5" weight="bold" color="amber">ROUND 1</Text>
                    </div>
                    <div className="artists-column">
                      {timerData.upcoming_rounds[0].artist_names.map((artist, index) => (
                        <div key={artist.easel || index} className="artist-dual-item">
                          <Text
                            weight="bold"
                            color="white"
                            className="artist-dual-name"
                            style={{ fontSize: `${autoFontSize}rem` }}
                          >
                            {artist.name?.toUpperCase() || 'ARTIST'}
                          </Text>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="round-column round-right">
                    <div className="round-title">
                      <Text size="5" weight="bold" color="amber">ROUND 2</Text>
                    </div>
                    <div className="artists-column">
                      {timerData.upcoming_rounds[1].artist_names.map((artist, index) => (
                        <div key={artist.easel || index} className="artist-dual-item">
                          <Text
                            weight="bold"
                            color="white"
                            className="artist-dual-name"
                            style={{ fontSize: `${autoFontSize}rem` }}
                          >
                            {artist.name?.toUpperCase() || 'ARTIST'}
                          </Text>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
              /* Single Round Layout - Original */
              nextRound.artist_names && (
                <div className="upcoming-artists-large">
                  <div className="artists-large-grid">
                    {nextRound.artist_names.map((artist, index) => (
                      <div key={artist.easel} className="artist-large-item">
                        <Text size="9" weight="bold" color="white" className="artist-name-large">
                          {artist.name.toUpperCase()}
                        </Text>
                      </div>
                    ))}
                  </div>
                </div>
              )
            )}
            </>
          )
        })()}

        {/* Event Info for Champion Display */}
        {timerData?.champion?.has_champion && timerData?.event && (
          <div className="event-info-one-line">
            <Text size="6" weight="bold" color="white">
              {timerData.event.city} • {timerData.event.eid} • {formatEventDate(timerData.event.event_start)}
            </Text>
          </div>
        )}

        {/* Round History Display */}
        <div className="round-history">
          <div className="history-grid">
            {timerData.all_rounds.map(round => (
              <div key={round.round} className="history-item">
                <Text size="2" weight="bold" color="amber">
                  Round {round.round}
                </Text>
                <Text size="1" color="gray">
                  {formatDateTime(round.start_time)} - {formatDateTime(round.closing_time)}
                </Text>
                <Text size="1" color="gray">
                  {round.is_past ? 
                    formatTimeAgo(new Date(round.closing_time).getTime()) : 
                    'in progress'
                  }
                </Text>
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  const { event, active_round, auction_times } = timerData

  // If no active round but we have auction times AND no upcoming rounds, show auction-only display
  if (!active_round && auction_times && (!timerData.upcoming_rounds || timerData.upcoming_rounds.length === 0)) {
    const earliestAuctionTime = new Date(auction_times.earliest).getTime()
    const timeRemaining = earliestAuctionTime - currentTime
    const timerColor = getTimerColor(timeRemaining)
    const auctionClosed = auction_times.auction_closed

    return (
      <div className="timer-container">
        {/* Small event info header */}
        <div className="event-header">
          <Flex justify="between" align="center" height="100%">
            <div>
              <Text size="3" color="gray">{event.eid} • {event.city} • {event.venue} • {formatEventDate(event.event_start)}</Text>
            </div>
            <div>
              <Badge variant="soft" color={auctionClosed ? "red" : "amber"}>
                {auctionClosed ? "Auction Closed" : `Auction Timer • ${auction_times.count} Artworks`}
              </Badge>
            </div>
          </Flex>
        </div>

        {/* Main countdown display */}
        <div className="countdown-display">
          {/* Art Battle Logo */}
          <img 
            src="https://imagedelivery.net/IGZfH_Pl-6S6csykNnXNJw/0ce25113-c21e-4435-1dc0-6020d15fa300/public" 
            alt="Art Battle Logo" 
            className="art-battle-logo-main"
          />
          
          {/* Auction Timer Label */}
          <div className="round-display">
            <Text size="8" weight="bold" className="round-text">
              {auctionClosed ? "AUCTION CLOSED" : "AUCTION TIMER"}
            </Text>
          </div>
          
          {!auctionClosed && (
            <>
              <div className="countdown-timer">
                <Text size="9" weight="bold" className={`timer-text timer-${timerColor}`}>
                  {formatTime(timeRemaining)}
                </Text>
              </div>
              
              <div className="progress-container">
                <Progress 
                  value={calculateProgress(auction_times.earliest)} 
                  className="countdown-progress"
                  color="amber"
                  size="3"
                />
              </div>

              <div className="timer-label">
                <Text size="5" color="gray">
                  Auction Closes In
                </Text>
              </div>
            </>
          )}

          {/* Round History Display */}
          {timerData.all_rounds && timerData.all_rounds.length > 0 && (
            <div className="round-history">
              <div className="history-grid">
                {timerData.all_rounds.map(round => (
                  <div key={round.round} className="history-item">
                    <Text size="2" weight="bold" color="amber">
                      Round {round.round}
                    </Text>
                    <Text size="1" color="gray">
                      {formatDateTime(round.start_time)} - {formatDateTime(round.closing_time)}
                    </Text>
                    <Text size="1" color="gray">
                      {round.is_past ? 
                        formatTimeAgo(new Date(round.closing_time).getTime()) : 
                        'in progress'
                      }
                    </Text>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    )
  }

  if (!active_round) {
    return (
      <div className="timer-waiting">
        {/* Art Battle Logo */}
        <img 
          src="https://imagedelivery.net/IGZfH_Pl-6S6csykNnXNJw/0ce25113-c21e-4435-1dc0-6020d15fa300/public" 
          alt="Art Battle Logo" 
          className="art-battle-logo-waiting"
        />
        
        <div className="event-info">
          <Text size="4" color="gray">{event.eid}</Text>
          <Text size="5">{event.city}</Text>
          <Text size="4">{event.venue}</Text>
        </div>
        <div className="waiting-message">
          <Text size="5">No Active Timers</Text>
        </div>
      </div>
    )
  }

  const closingTime = new Date(active_round.closing_time).getTime()
  const timeRemaining = closingTime - currentTime
  const isGracePeriod = active_round.is_grace_period || timeRemaining <= 0
  const displayTime = isGracePeriod ? 0 : timeRemaining
  const progress = isGracePeriod ? 100 : calculateProgress(active_round.closing_time)
  const timerColor = isGracePeriod ? 'red' : getTimerColor(timeRemaining)

  return (
    <div className="timer-container">
      {/* Small event info header */}
      <div className="event-header">
        <Flex justify="between" align="center" height="100%">
          <div>
            <Text size="3" color="gray">{event.eid} • {event.city} • {event.venue}</Text>
          </div>
          <div>
            <Badge variant="soft" color="crimson">
              Round {active_round.round} • {active_round.artists} Artists
            </Badge>
          </div>
        </Flex>
      </div>

      {/* Main countdown display */}
      <div className="countdown-display">
        {/* Art Battle Logo */}
        <img 
          src="https://imagedelivery.net/IGZfH_Pl-6S6csykNnXNJw/0ce25113-c21e-4435-1dc0-6020d15fa300/public" 
          alt="Art Battle Logo" 
          className="art-battle-logo-main"
        />
        
        {/* Large Round Number */}
        <div className="round-display">
          <Text size="8" weight="bold" className="round-text">
            ROUND {active_round.round}
          </Text>
        </div>
        
        <div className="countdown-timer">
          <Text size="9" weight="bold" className={`timer-text timer-${timerColor}`}>
            {formatTime(displayTime)}
          </Text>
        </div>
        
        <div className="progress-container">
          <Progress 
            value={progress} 
            className="countdown-progress"
            color="crimson"
            size="3"
          />
        </div>


        {/* Auction Timer Display */}
        {timerData.auction_times && (
          <div className="auction-timer">
            {timerData.auction_times.auction_closed ? (
              <Text size="6" weight="bold" color="red" className="auction-closed">
                AUCTION CLOSED
              </Text>
            ) : timerData.auction_times.earliest && timerData.auction_times.latest ? (
              <>
                <Text size="5" weight="bold" color="amber">
                  {timerData.auction_times.total_bids} BIDS
                </Text>
                <Text size="4" weight="medium" color="gray">
                  {timerData.auction_times.same_time ?
                    formatTime(new Date(timerData.auction_times.earliest).getTime() - currentTime) :
                    `Earliest ${formatTime(new Date(timerData.auction_times.earliest).getTime() - currentTime)} • Latest ${formatTime(new Date(timerData.auction_times.latest).getTime() - currentTime)}`
                  }
                </Text>
              </>
            ) : (
              <Text size="6" weight="bold" color="green">
                AUCTION OPEN
              </Text>
            )}
          </div>
        )}

        {/* Round History Display */}
        {timerData.all_rounds && timerData.all_rounds.length > 0 && (
          <div className="round-history">
            <div className="history-grid">
              {timerData.all_rounds.map(round => (
                <div key={round.round} className="history-item">
                  <Text size="2" weight="bold" color="amber">
                    Round {round.round}
                  </Text>
                  <Text size="1" color="gray">
                    {formatDateTime(round.start_time)} - {formatDateTime(round.closing_time)}
                  </Text>
                  <Text size="1" color="gray">
                    {round.is_past ? 
                      formatTimeAgo(new Date(round.closing_time).getTime()) : 
                      'in progress'
                    }
                  </Text>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

    </div>
  )
}
import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { fetchTimerData } from '../lib/supabase'
import { Card, Text, Progress, Flex, Box, Badge } from '@radix-ui/themes'

export default function TimerDisplay() {
  const { eid } = useParams()
  const [timerData, setTimerData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [currentTime, setCurrentTime] = useState(Date.now())

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

  // If we have historical rounds but no active timers, show history-only display
  if (!timerData.has_active_timers && timerData.all_rounds && timerData.all_rounds.length > 0) {
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
          <Text size="5">Event Complete</Text>
          <Text size="3" color="gray">All rounds have finished</Text>
        </div>

        {/* Round History Display */}
        <div className="round-history">
          <Text size="3" weight="medium" color="gray" className="history-title">
            Round History
          </Text>
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

  // If no active round but we have auction times, show auction-only display
  if (!active_round && auction_times) {
    const earliestAuctionTime = new Date(auction_times.earliest).getTime()
    const timeRemaining = earliestAuctionTime - currentTime
    const timerColor = getTimerColor(timeRemaining)
    const auctionClosed = earliestAuctionTime < currentTime

    return (
      <div className="timer-container">
        {/* Small event info header */}
        <div className="event-header">
          <Flex justify="between" align="center" height="100%">
            <div>
              <Text size="3" color="gray">{event.eid} • {event.city} • {event.venue}</Text>
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
              <Text size="3" weight="medium" color="gray" className="history-title">
                Round History
              </Text>
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
  const progress = calculateProgress(active_round.closing_time)
  const timerColor = getTimerColor(timeRemaining)

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
            {formatTime(timeRemaining)}
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

        <div className="timer-label">
          <Text size="5" color="gray">
            {timeRemaining > 0 ? 'Time Remaining' : 'Auction Ended'}
          </Text>
        </div>

        {/* Auction Timer Display */}
        {timerData.auction_times && (
          <div className="auction-timer">
            {new Date(timerData.auction_times.earliest).getTime() < currentTime ? (
              <Text size="6" weight="bold" color="red" className="auction-closed">
                AUCTION CLOSED
              </Text>
            ) : (
              <>
                <Text size="5" weight="bold" color="amber">
                  Auction Timer
                </Text>
                <Text size="4" weight="medium" color="gray">
                  {timerData.auction_times.same_time ? 
                    formatTime(new Date(timerData.auction_times.earliest).getTime() - currentTime) : 
                    `Earliest ${formatTime(new Date(timerData.auction_times.earliest).getTime() - currentTime)} • Latest ${formatTime(new Date(timerData.auction_times.latest).getTime() - currentTime)}`
                  }
                </Text>
              </>
            )}
          </div>
        )}

        {/* Round History Display */}
        {timerData.all_rounds && timerData.all_rounds.length > 0 && (
          <div className="round-history">
            <Text size="3" weight="medium" color="gray" className="history-title">
              Round History
            </Text>
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
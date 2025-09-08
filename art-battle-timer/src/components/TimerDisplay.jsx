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
    const thirtyMinutesInMs = 30 * 60 * 1000
    const startTime = endTime - thirtyMinutesInMs
    
    if (now <= startTime) return 0
    if (now >= endTime) return 100
    
    const elapsed = now - startTime
    const total = endTime - startTime
    return (elapsed / total) * 100
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

  if (!timerData || !timerData.has_active_timers) {
    return (
      <div className="timer-waiting">
        {timerData?.event && (
          <div className="event-info">
            <Text size="4" color="gray">{timerData.event.eid}</Text>
            <Text size="6">{timerData.event.city}</Text>
            <Text size="5">{timerData.event.venue}</Text>
            <Text size="4" color="gray">Round {timerData.event.current_round}</Text>
          </div>
        )}
        <div className="waiting-message">
          <Text size="8">Waiting for Active Timers</Text>
          <Text size="5" color="gray">Timers will appear when auctions end within 30 minutes</Text>
        </div>
      </div>
    )
  }

  const { event, active_round } = timerData

  if (!active_round) {
    return (
      <div className="timer-waiting">
        <div className="event-info">
          <Text size="4" color="gray">{event.eid}</Text>
          <Text size="6">{event.city}</Text>
          <Text size="5">{event.venue}</Text>
          <Text size="4" color="gray">Round {event.current_round}</Text>
        </div>
        <div className="waiting-message">
          <Text size="8">No Active Timers</Text>
        </div>
      </div>
    )
  }

  const closingTime = new Date(active_round.closing_time).getTime()
  const timeRemaining = closingTime - currentTime
  const progress = calculateProgress(active_round.closing_time)

  return (
    <div className="timer-container">
      {/* Small event info header */}
      <div className="event-header">
        <Flex justify="between" align="center">
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
        <div className="countdown-timer">
          <Text size="9" weight="bold" className="timer-text">
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
      </div>

      {/* Contestants in active round */}
      <div className="artworks-grid">
        {active_round.contestants.map((contestant, index) => {
          return (
            <Card key={`${active_round.round}-${contestant.easel}`} className="artwork-card">
              <Flex direction="column" gap="2">
                <Flex justify="between" align="center">
                  <Text size="3" weight="bold">Round {active_round.round}</Text>
                  <Text size="2" color="gray">Easel {contestant.easel}</Text>
                </Flex>
                <Text size="2">{contestant.artist_name}</Text>
                <Flex justify="between" align="center">
                  <Text size="2" color={timeRemaining > 0 ? "gray" : "red"}>
                    {formatTime(timeRemaining)}
                  </Text>
                  <Text size="2" color="crimson">
                    Round Timer
                  </Text>
                </Flex>
              </Flex>
            </Card>
          )
        })}
      </div>
    </div>
  )
}
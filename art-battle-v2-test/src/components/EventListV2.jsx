import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { publicDataManager } from '../utils/publicDataManager'

const EventListV2 = () => {
  const { user } = useAuth()
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    loadEvents()
  }, [])

  const loadEvents = async () => {
    try {
      setLoading(true)
      setError(null)
      
      const data = await publicDataManager.fetchEventsList()
      setEvents(data.events || [])
      
    } catch (err) {
      console.error('Failed to load events:', err)
      setError('Failed to load events. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const formatEventDate = (dateString) => {
    if (!dateString) return 'Date TBD'
    
    const date = new Date(dateString)
    return date.toLocaleDateString('en-US', {
      weekday: 'short',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  if (loading) {
    return (
      <div className="container">
        <div className="loading">Loading events...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="container">
        <div className="error">
          {error}
          <button onClick={loadEvents} className="retry-button">
            Try Again
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="container">
      <header className="app-header">
        <h1>Art Battle Events (V2)</h1>
        {!user && (
          <Link to="/login" className="login-link">
            Login to Vote
          </Link>
        )}
        {user && (
          <div className="user-info">
            Logged in as {user.phone}
          </div>
        )}
      </header>

      <div className="events-grid">
        {events.map(event => (
          <Link 
            key={event.eid} 
            to={`/event/${event.eid}`}
            className="event-card"
          >
            <div className="event-header">
              <h3>{event.name}</h3>
              <span className="event-id">{event.eid}</span>
            </div>
            
            {event.venue && (
              <div className="event-venue">
                📍 {event.venue}
              </div>
            )}
            
            <div className="event-date">
              📅 {formatEventDate(event.event_start_datetime)}
            </div>
            
            {event.description && (
              <div className="event-description">
                {event.description}
              </div>
            )}
          </Link>
        ))}
      </div>

      {events.length === 0 && (
        <div className="no-events">
          <h2>No events available</h2>
          <p>Check back soon for upcoming Art Battle events!</p>
        </div>
      )}

      <footer className="cache-info">
        <small>
          V2 Cached System • Ultra-fast loading • 
          <button onClick={loadEvents} className="refresh-button">
            Refresh
          </button>
        </small>
      </footer>
    </div>
  )
}

export default EventListV2
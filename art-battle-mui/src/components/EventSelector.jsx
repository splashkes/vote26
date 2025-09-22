import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Card,
  CardContent,
  Typography,
  TextField,
  Button,
  Box,
  Alert,
  Chip,
  Grid,
  Paper,
} from '@mui/material'
import { Analytics, Event, LocationOn, Schedule } from '@mui/icons-material'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  'https://xsqdkubgyqwpyvfltnrf.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhzcWRrdWJneXF3cHl2Zmx0bnJmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MjIzNjk5NzAsImV4cCI6MjAzNzk0NTk3MH0.W-VpeeSvK5c4U4VXCsW8ZRBF9Qhq4WCjpNJhjQAfFjM'
)

function EventSelector() {
  const [eventInput, setEventInput] = useState('')
  const [recentEvents, setRecentEvents] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const navigate = useNavigate()

  useEffect(() => {
    fetchRecentEvents()
  }, [])

  const fetchRecentEvents = async () => {
    try {
      const { data, error } = await supabase
        .from('events')
        .select('id, eid, name, venue, event_start_datetime, enabled')
        .order('event_start_datetime', { ascending: false })
        .limit(12)

      if (error) throw error
      setRecentEvents(data || [])
    } catch (err) {
      setError('Failed to load recent events')
      console.error('Error fetching events:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleEventSubmit = (e) => {
    e.preventDefault()
    if (eventInput.trim()) {
      // Handle both event ID (UUID) and EID (AB3048) formats
      const input = eventInput.trim()
      if (input.length === 36 && input.includes('-')) {
        // Looks like a UUID
        navigate(`/${input}`)
      } else {
        // Use EID directly for navigation
        navigate(`/${input}`)
      }
    }
  }

  const handleEventSelect = (event) => {
    // Navigate using EID instead of UUID for cleaner URLs
    navigate(`/${event.eid}`)
  }

  const getEventStatus = (event) => {
    if (!event.enabled) return { label: 'Disabled', color: 'default' }

    const now = new Date()
    const startTime = new Date(event.event_start_datetime)
    const endTime = new Date(startTime.getTime() + 4 * 60 * 60 * 1000) // Assume 4hr duration

    if (now < startTime) return { label: 'Upcoming', color: 'info' }
    if (now >= startTime && now <= endTime) return { label: 'Live', color: 'success' }
    return { label: 'Completed', color: 'default' }
  }

  const formatDateTime = (dateString) => {
    if (!dateString) return 'TBD'
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  return (
    <Box>
      <Paper elevation={0} sx={{ p: 4, mb: 4, background: 'linear-gradient(135deg, #1976d2 0%, #42a5f5 100%)', color: 'white' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
          <Analytics sx={{ mr: 2, fontSize: 32 }} />
          <Typography variant="h4" component="h1">
            Art Battle Analytics Dashboard
          </Typography>
        </Box>
        <Typography variant="subtitle1" sx={{ opacity: 0.9 }}>
          Real-time analytics for Art Battle events - track guest engagement, voting patterns, and auction activity
        </Typography>
      </Paper>

      <Grid container spacing={4}>
        <Grid item xs={12} md={4}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Access Event Analytics
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                Enter an Event ID (e.g., AB3048) or Event UUID to view analytics
              </Typography>

              <Box component="form" onSubmit={handleEventSubmit}>
                <TextField
                  fullWidth
                  label="Event ID or UUID"
                  value={eventInput}
                  onChange={(e) => setEventInput(e.target.value)}
                  placeholder="AB3048 or full UUID"
                  sx={{ mb: 2 }}
                />
                <Button
                  type="submit"
                  variant="contained"
                  fullWidth
                  startIcon={<Analytics />}
                >
                  View Analytics
                </Button>
              </Box>

              {error && (
                <Alert severity="error" sx={{ mt: 2 }}>
                  {error}
                </Alert>
              )}
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={8}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Recent Events
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                Click any event to view its analytics dashboard
              </Typography>

              {loading ? (
                <Typography>Loading recent events...</Typography>
              ) : (
                <Grid container spacing={2}>
                  {recentEvents.map((event) => {
                    const status = getEventStatus(event)
                    return (
                      <Grid item xs={12} sm={6} key={event.id}>
                        <Paper
                          elevation={1}
                          sx={{
                            p: 2,
                            cursor: 'pointer',
                            transition: 'all 0.2s',
                            '&:hover': {
                              elevation: 4,
                              transform: 'translateY(-2px)',
                            },
                          }}
                          onClick={() => handleEventSelect(event)}
                        >
                          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1 }}>
                            <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                              {event.eid}
                            </Typography>
                            <Chip
                              label={status.label}
                              color={status.color}
                              size="small"
                            />
                          </Box>

                          <Typography variant="body2" sx={{ mb: 1, fontWeight: 500 }}>
                            {event.name}
                          </Typography>

                          <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                            <LocationOn sx={{ fontSize: 16, mr: 0.5, color: 'text.secondary' }} />
                            <Typography variant="caption" color="text.secondary">
                              {event.venue || 'Venue TBD'}
                            </Typography>
                          </Box>

                          <Box sx={{ display: 'flex', alignItems: 'center' }}>
                            <Schedule sx={{ fontSize: 16, mr: 0.5, color: 'text.secondary' }} />
                            <Typography variant="caption" color="text.secondary">
                              {formatDateTime(event.event_start_datetime)}
                            </Typography>
                          </Box>
                        </Paper>
                      </Grid>
                    )
                  })}
                </Grid>
              )}
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  )
}

export default EventSelector
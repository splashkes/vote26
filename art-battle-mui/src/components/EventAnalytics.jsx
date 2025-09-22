import React, { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  Card,
  CardContent,
  Typography,
  Box,
  Grid,
  Chip,
  Alert,
  Button,
  Paper,
  Divider,
  Skeleton,
} from '@mui/material'
import {
  ArrowBack,
  People,
  QrCodeScanner,
  HowToVote,
  Gavel,
  TrendingUp,
  Refresh,
} from '@mui/icons-material'
import { LineChart } from '@mui/x-charts/LineChart'
import { PieChart } from '@mui/x-charts/PieChart'
import { BarChart } from '@mui/x-charts/BarChart'

function EventAnalytics() {
  const { eventId } = useParams()
  const navigate = useNavigate()
  const [analytics, setAnalytics] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [lastUpdate, setLastUpdate] = useState(null)

  useEffect(() => {
    fetchAnalytics()
  }, [eventId])

  useEffect(() => {
    // Only auto-refresh if event is LIVE
    let interval = null
    if (analytics && getEventStatus().label === 'Live') {
      interval = setInterval(fetchAnalytics, 10000) // 10 seconds for live events only
    }

    return () => {
      if (interval) clearInterval(interval)
    }
  }, [analytics?.event_info?.status])

  const fetchAnalytics = async () => {
    try {
      setError('')
      const response = await fetch(
        `https://xsqdkubgyqwpyvfltnrf.supabase.co/functions/v1/public-analytics/${eventId}`,
        {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
        }
      )

      if (response.status === 404) {
        setError('Event not found. Please check the Event ID and try again.')
        return
      }

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }

      const data = await response.json()
      setAnalytics(data)
      setLastUpdate(new Date())
    } catch (err) {
      setError(`Failed to load analytics: ${err.message}`)
      console.error('Error fetching analytics:', err)
    } finally {
      setLoading(false)
    }
  }

  const getEventStatus = () => {
    if (!analytics?.event_info) return { label: 'Unknown', color: 'default' }

    const now = new Date()
    const startTime = analytics.event_info.event_start ? new Date(analytics.event_info.event_start) : null
    const endTime = analytics.event_info.event_end ? new Date(analytics.event_info.event_end) : null

    if (!startTime) return { label: 'Scheduled', color: 'info' }
    if (now < startTime) return { label: 'Upcoming', color: 'info' }
    if (endTime && now > endTime) return { label: 'Completed', color: 'default' }
    return { label: 'Live', color: 'success' }
  }

  const prepareTimeSeriesData = () => {
    if (!analytics?.time_series || analytics.time_series.length === 0) {
      return { timeData: [], series: [] }
    }

    // Convert time_bucket to Date objects for proper time scale
    const timeData = analytics.time_series.map(point => new Date(point.time_bucket))

    const series = [
      {
        data: analytics.time_series.map(point => point.qr_scans_cumulative),
        label: 'QR Scans',
        color: '#90caf9',
        curve: 'linear',
        showMark: false,
        yAxisKey: 'left',
      },
      {
        data: analytics.time_series.map(point => point.votes_cumulative),
        label: 'Votes',
        color: '#ff9800',
        curve: 'linear',
        showMark: false,
        yAxisKey: 'left',
      },
      {
        data: analytics.time_series.map(point => point.bids_cumulative),
        label: 'Bids',
        color: '#f44336',
        curve: 'linear',
        showMark: false,
        yAxisKey: 'left',
      },
      {
        data: analytics.time_series.map(point => point.auction_value_cumulative),
        label: 'Auction Value',
        color: '#4caf50',
        curve: 'linear',
        showMark: false,
        yAxisKey: 'right',
      },
    ]

    return { timeData, series }
  }

  const valueFormatter = (date) => {
    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    })
  }

  const prepareGuestCompositionData = () => {
    if (!analytics?.guest_composition_comparisons) return []

    // Color scheme: QR scans in blue shades, Online in yellow shades
    const colorMap = {
      'QR Scan (New)': '#1976d2',      // darker blue
      'QR Scan (Return)': '#42a5f5',   // lighter blue
      'Online (New)': '#f57c00',       // darker yellow/orange
      'Online (Return)': '#ffb74d',    // lighter yellow/orange
    }

    // Prepare data for stacked bar chart
    return [
      {
        name: 'Current Event',
        'QR Scan (New)': analytics.guest_composition_comparisons.find(c => c.guest_category === 'QR Scan (New)')?.current_pct || 0,
        'QR Scan (Return)': analytics.guest_composition_comparisons.find(c => c.guest_category === 'QR Scan (Return)')?.current_pct || 0,
        'Online (New)': analytics.guest_composition_comparisons.find(c => c.guest_category === 'Online (New)')?.current_pct || 0,
        'Online (Return)': analytics.guest_composition_comparisons.find(c => c.guest_category === 'Online (Return)')?.current_pct || 0,
      },
      {
        name: 'City Average',
        'QR Scan (New)': analytics.guest_composition_comparisons.find(c => c.guest_category === 'QR Scan (New)')?.city_avg_pct || 0,
        'QR Scan (Return)': analytics.guest_composition_comparisons.find(c => c.guest_category === 'QR Scan (Return)')?.city_avg_pct || 0,
        'Online (New)': analytics.guest_composition_comparisons.find(c => c.guest_category === 'Online (New)')?.city_avg_pct || 0,
        'Online (Return)': analytics.guest_composition_comparisons.find(c => c.guest_category === 'Online (Return)')?.city_avg_pct || 0,
      },
      {
        name: 'Global Average',
        'QR Scan (New)': analytics.guest_composition_comparisons.find(c => c.guest_category === 'QR Scan (New)')?.global_avg_pct || 0,
        'QR Scan (Return)': analytics.guest_composition_comparisons.find(c => c.guest_category === 'QR Scan (Return)')?.global_avg_pct || 0,
        'Online (New)': analytics.guest_composition_comparisons.find(c => c.guest_category === 'Online (New)')?.global_avg_pct || 0,
        'Online (Return)': analytics.guest_composition_comparisons.find(c => c.guest_category === 'Online (Return)')?.global_avg_pct || 0,
      }
    ]
  }

  const prepareEngagementData = () => {
    if (!analytics?.guest_composition) return []

    return analytics.guest_composition.map(item => ({
      category: item.guest_category.replace('QR Scan', 'In-Person'),
      'Vote Rate': item.vote_rate,
      'Bid Rate': item.bid_rate,
    }))
  }

  if (loading && !analytics) {
    return (
      <Box>
        <Box sx={{ display: 'flex', alignItems: 'center', mb: 3 }}>
          <Button
            startIcon={<ArrowBack />}
            onClick={() => navigate('/')}
            sx={{ mr: 2 }}
          >
            Back
          </Button>
          <Skeleton variant="text" width={300} height={40} />
        </Box>
        <Grid container spacing={3}>
          {[1, 2, 3, 4].map(i => (
            <Grid item xs={12} sm={6} md={3} key={i}>
              <Skeleton variant="rectangular" height={120} />
            </Grid>
          ))}
        </Grid>
      </Box>
    )
  }

  if (error) {
    return (
      <Box>
        <Button
          startIcon={<ArrowBack />}
          onClick={() => navigate('/')}
          sx={{ mb: 3 }}
        >
          Back to Event Selector
        </Button>
        <Alert severity="error" action={
          <Button color="inherit" size="small" onClick={fetchAnalytics}>
            Retry
          </Button>
        }>
          {error}
        </Alert>
      </Box>
    )
  }

  const status = getEventStatus()
  const { timeData, series: timeSeriesSeries } = prepareTimeSeriesData()
  const guestCompositionData = prepareGuestCompositionData()
  const engagementData = prepareEngagementData()

  return (
    <Box>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center' }}>
          <Button
            startIcon={<ArrowBack />}
            onClick={() => navigate('/')}
            sx={{ mr: 2 }}
          >
            Back
          </Button>
          <Box>
            <Typography variant="h4" component="h1">
              {analytics.event_info.name}
            </Typography>
            <Typography variant="subtitle1" color="text.secondary">
              {analytics.event_info.eid} • {analytics.event_info.venue}
            </Typography>
          </Box>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <Chip
            label={status.label}
            color={status.color}
            variant={status.color === 'success' ? 'filled' : 'outlined'}
          />
          <Button
            startIcon={<Refresh />}
            onClick={fetchAnalytics}
            variant="outlined"
            size="small"
          >
            Refresh
          </Button>
        </Box>
      </Box>

      {/* Last Update */}
      {lastUpdate && (
        <Typography variant="caption" color="text.secondary" sx={{ mb: 3, display: 'block' }}>
          Last updated: {lastUpdate.toLocaleTimeString()}
        </Typography>
      )}

      {/* Summary Cards */}
      <Grid container spacing={3} sx={{ mb: 4 }}>
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent sx={{ textAlign: 'center' }}>
              <People sx={{ fontSize: 40, color: 'primary.main', mb: 1 }} />
              <Typography variant="h4" sx={{ fontWeight: 600 }}>
                {analytics.summary.total_participants}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Total Participants
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent sx={{ textAlign: 'center' }}>
              <QrCodeScanner sx={{ fontSize: 40, color: 'success.main', mb: 1 }} />
              <Typography variant="h4" sx={{ fontWeight: 600 }}>
                {analytics.summary.total_qr_scans}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Unique QR Scanners
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent sx={{ textAlign: 'center' }}>
              <HowToVote sx={{ fontSize: 40, color: 'warning.main', mb: 1 }} />
              <Typography variant="h4" sx={{ fontWeight: 600 }}>
                {analytics.summary.total_votes}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Votes Cast
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent sx={{ textAlign: 'center' }}>
              <Gavel sx={{ fontSize: 40, color: 'error.main', mb: 1 }} />
              <Typography variant="h4" sx={{ fontWeight: 600 }}>
                {analytics.summary.total_bids} / ${analytics.summary.total_bid_amount?.toLocaleString() || '0'}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Auction Bids / Total
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Charts Row */}
      <Grid container spacing={3} sx={{ mb: 4 }}>
        {/* Time Series Chart */}
        <Grid item xs={12} lg={8}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Activity Timeline
              </Typography>
              <Box sx={{ height: 400, mt: 2 }}>
                {timeData.length > 0 ? (
                  <LineChart
                    xAxis={[
                      {
                        data: timeData,
                        scaleType: 'time',
                        valueFormatter,
                        tickMinStep: 3600 * 1000 * 0.25, // min step: 15 minutes
                      }
                    ]}
                    yAxis={[
                      {
                        id: 'left',
                        scaleType: 'linear',
                      },
                      {
                        id: 'right',
                        scaleType: 'linear',
                        position: 'right',
                        valueFormatter: (value) => `$${value}`,
                      },
                    ]}
                    series={timeSeriesSeries}
                    height={360}
                    margin={{ left: 60, right: 80, top: 20, bottom: 60 }}
                    grid={{ horizontal: true, vertical: true }}
                    sx={{
                      '& .MuiLineElement-root': {
                        strokeWidth: 3,
                      },
                      '& .MuiMarkElement-root': {
                        scale: '1.2',
                      },
                    }}
                  />
                ) : (
                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'text.secondary' }}>
                    <TrendingUp sx={{ mr: 1 }} />
                    <Typography>Activity data will appear as the event progresses</Typography>
                  </Box>
                )}
              </Box>
            </CardContent>
          </Card>
        </Grid>

        {/* Guest Composition Stacked Bar Chart */}
        <Grid item xs={12} lg={4}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Guest Composition Comparison
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                Current vs City Average vs Global Average
              </Typography>
              <Box sx={{ height: 350, mt: 2 }}>
                {guestCompositionData.length > 0 ? (
                  <BarChart
                    dataset={guestCompositionData}
                    xAxis={[{ scaleType: 'band', dataKey: 'name' }]}
                    yAxis={[{ max: 100 }]}
                    series={[
                      { dataKey: 'QR Scan (New)', label: 'QR Scan (New)', color: '#1976d2', stack: 'composition' },
                      { dataKey: 'QR Scan (Return)', label: 'QR Scan (Return)', color: '#42a5f5', stack: 'composition' },
                      { dataKey: 'Online (New)', label: 'Online (New)', color: '#f57c00', stack: 'composition' },
                      { dataKey: 'Online (Return)', label: 'Online (Return)', color: '#ffb74d', stack: 'composition' },
                    ]}
                    height={300}
                    margin={{ left: 50, right: 20, top: 40, bottom: 80 }}
                    slotProps={{
                      legend: {
                        direction: 'column',
                        position: { vertical: 'bottom', horizontal: 'middle' },
                        padding: 0,
                      },
                    }}
                  />
                ) : (
                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'text.secondary' }}>
                    <People sx={{ mr: 1 }} />
                    <Typography>No participant data yet</Typography>
                  </Box>
                )}
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Engagement Rates and Recent Activity */}
      <Grid container spacing={3}>
        {/* Engagement Rates */}
        <Grid item xs={12} md={8}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Engagement Rates by Guest Type
              </Typography>
              <Box sx={{ height: 300, mt: 2 }}>
                {engagementData.length > 0 && (engagementData.some(d => d['Vote Rate'] > 0 || d['Bid Rate'] > 0)) ? (
                  <BarChart
                    xAxis={[{ scaleType: 'band', dataKey: 'category' }]}
                    series={[
                      { dataKey: 'Vote Rate', label: 'Vote Rate (%)', color: '#ff9800' },
                      { dataKey: 'Bid Rate', label: 'Bid Rate (%)', color: '#f44336' },
                    ]}
                    dataset={engagementData}
                    height={260}
                    margin={{ left: 60, right: 50, top: 20, bottom: 60 }}
                  />
                ) : (
                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'text.secondary' }}>
                    <TrendingUp sx={{ mr: 1 }} />
                    <Typography>Engagement data will appear when voting/bidding begins</Typography>
                  </Box>
                )}
              </Box>
            </CardContent>
          </Card>
        </Grid>

        {/* Recent Activity */}
        <Grid item xs={12} md={4}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Recent Activity
              </Typography>

              <Box sx={{ mt: 2 }}>
                <Paper elevation={0} sx={{
                  p: 3,
                  mb: 2,
                  background: 'linear-gradient(135deg, rgba(144, 202, 249, 0.1) 0%, rgba(244, 143, 177, 0.1) 100%)',
                  border: '1px solid rgba(144, 202, 249, 0.2)',
                  borderRadius: 2,
                }}>
                  <Typography variant="subtitle2" color="primary.main" gutterBottom sx={{ fontWeight: 600 }}>
                    Last 10 Minutes
                  </Typography>
                  <Grid container spacing={2}>
                    <Grid item xs={4}>
                      <Box sx={{ textAlign: 'center' }}>
                        <Typography variant="h6" sx={{ fontWeight: 600 }}>
                          {analytics.recent_activity.last_10_minutes.qr_scans}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          QR Scans
                        </Typography>
                      </Box>
                    </Grid>
                    <Grid item xs={4}>
                      <Box sx={{ textAlign: 'center' }}>
                        <Typography variant="h6" sx={{ fontWeight: 600 }}>
                          {analytics.recent_activity.last_10_minutes.votes}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          Votes
                        </Typography>
                      </Box>
                    </Grid>
                    <Grid item xs={4}>
                      <Box sx={{ textAlign: 'center' }}>
                        <Typography variant="h6" sx={{ fontWeight: 600 }}>
                          {analytics.recent_activity.last_10_minutes.bids}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          Bids
                        </Typography>
                      </Box>
                    </Grid>
                  </Grid>
                </Paper>

                <Paper elevation={0} sx={{
                  p: 3,
                  background: 'linear-gradient(135deg, rgba(255, 152, 0, 0.1) 0%, rgba(244, 67, 54, 0.1) 100%)',
                  border: '1px solid rgba(255, 152, 0, 0.2)',
                  borderRadius: 2,
                }}>
                  <Typography variant="subtitle2" color="warning.main" gutterBottom sx={{ fontWeight: 600 }}>
                    Last Hour
                  </Typography>
                  <Grid container spacing={2}>
                    <Grid item xs={4}>
                      <Box sx={{ textAlign: 'center' }}>
                        <Typography variant="h6" sx={{ fontWeight: 600 }}>
                          {analytics.recent_activity.last_hour.qr_scans}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          QR Scans
                        </Typography>
                      </Box>
                    </Grid>
                    <Grid item xs={4}>
                      <Box sx={{ textAlign: 'center' }}>
                        <Typography variant="h6" sx={{ fontWeight: 600 }}>
                          {analytics.recent_activity.last_hour.votes}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          Votes
                        </Typography>
                      </Box>
                    </Grid>
                    <Grid item xs={4}>
                      <Box sx={{ textAlign: 'center' }}>
                        <Typography variant="h6" sx={{ fontWeight: 600 }}>
                          {analytics.recent_activity.last_hour.bids}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          Bids
                        </Typography>
                      </Box>
                    </Grid>
                  </Grid>
                </Paper>
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  )
}

export default EventAnalytics
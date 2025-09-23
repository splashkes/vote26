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
  PersonAdd,
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

    // Get latest values for legend labels
    const latestPoint = analytics.time_series[analytics.time_series.length - 1]
    const latestQR = latestPoint?.qr_scans_cumulative || 0
    const latestVotes = latestPoint?.votes_cumulative || 0
    const latestBids = latestPoint?.bids_cumulative || 0
    // Use summary value for auction since it's more current than timeline
    const latestValue = analytics.summary.total_bid_amount || 0

    const series = [
      {
        data: analytics.time_series.map(point => point.qr_scans_cumulative),
        label: `QR Scans (${latestQR})`,
        color: '#1976d2', // Blue to match QR scanner icon
        curve: 'linear',
        showMark: false,
        yAxisId: 'leftAxisId',
      },
      {
        data: analytics.time_series.map(point => point.votes_cumulative),
        label: `Votes (${latestVotes})`,
        color: '#f57c00', // Orange/yellow to match vote icon
        curve: 'linear',
        showMark: false,
        yAxisId: 'leftAxisId',
      },
      {
        data: analytics.time_series.map(point => point.bids_cumulative),
        label: `Bids (${latestBids})`,
        color: '#d32f2f', // Red to match bid icon
        curve: 'linear',
        showMark: false,
        yAxisId: 'leftAxisId',
      },
      {
        data: analytics.time_series.map(point => point.auction_value_cumulative),
        label: `Auction Value ($${Math.round(latestValue)})`,
        color: '#388e3c', // Green for auction value
        curve: 'linear',
        showMark: false,
        yAxisId: 'rightAxisId',
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

  return (
    <Box sx={{ p: { xs: 1, sm: 2 }, maxWidth: '100vw', overflow: 'hidden' }}>
      {/* Header */}
      <Box sx={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        mb: { xs: 1.5, sm: 2 },
        flexDirection: { xs: 'column', sm: 'row' },
        gap: { xs: 1, sm: 0 }
      }}>
        <Box sx={{ display: 'flex', alignItems: 'center', width: { xs: '100%', sm: 'auto' } }}>
          <Button
            startIcon={<ArrowBack />}
            onClick={() => navigate('/')}
            sx={{ mr: { xs: 1, sm: 2 } }}
            size="small"
          >
            Back
          </Button>
          <Box sx={{ flex: 1 }}>
            <Typography variant={{ xs: 'h5', sm: 'h4' }} component="h1" sx={{ fontSize: { xs: '1.5rem', sm: '2rem' } }}>
              {analytics.event_info.name}
            </Typography>
            <Typography variant="subtitle1" color="text.secondary" sx={{ fontSize: { xs: '0.875rem', sm: '1rem' } }}>
              {analytics.event_info.eid} • {analytics.event_info.venue}
            </Typography>
          </Box>
        </Box>
        <Box sx={{
          display: 'flex',
          alignItems: 'center',
          gap: { xs: 1, sm: 2 },
          width: { xs: '100%', sm: 'auto' },
          justifyContent: { xs: 'space-between', sm: 'flex-end' }
        }}>
          <Chip
            label={status.label}
            color={status.color}
            variant={status.color === 'success' ? 'filled' : 'outlined'}
            size="small"
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
        <Typography variant="caption" color="text.secondary" sx={{ mb: { xs: 1, sm: 2 }, display: 'block' }}>
          Last updated: {lastUpdate.toLocaleTimeString()}
        </Typography>
      )}

      {/* Summary Cards */}
      <Grid container spacing={{ xs: 1, sm: 2, md: 3 }} sx={{ mb: { xs: 2, sm: 3 } }}>
        <Grid item xs={6} sm={6} md={2}>
          <Card>
            <CardContent sx={{ textAlign: 'center', p: { xs: 1.5, sm: 2 } }}>
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

        <Grid item xs={6} sm={6} md={2}>
          <Card>
            <CardContent sx={{ textAlign: 'center', p: { xs: 1.5, sm: 2 } }}>
              <QrCodeScanner sx={{ fontSize: 40, color: '#1976d2', mb: 1 }} />
              <Typography variant="h4" sx={{ fontWeight: 600 }}>
                {analytics.summary.total_qr_scans}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Unique QR Scanners
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={6} sm={6} md={2}>
          <Card>
            <CardContent sx={{ textAlign: 'center', p: { xs: 1.5, sm: 2 } }}>
              <HowToVote sx={{ fontSize: 40, color: '#f57c00', mb: 1 }} />
              <Typography variant="h4" sx={{ fontWeight: 600 }}>
                {analytics.summary.total_votes}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Votes Cast
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={6} sm={6} md={2}>
          <Card>
            <CardContent sx={{ textAlign: 'center', p: { xs: 1.5, sm: 2 } }}>
              <Gavel sx={{ fontSize: 40, color: '#d32f2f', mb: 1 }} />
              <Typography variant="h4" sx={{ fontWeight: 600 }}>
                {analytics.summary.total_bids}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Auction Bids
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={6} sm={6} md={2}>
          <Card>
            <CardContent sx={{ textAlign: 'center', p: { xs: 1.5, sm: 2 } }}>
              <TrendingUp sx={{ fontSize: 40, color: '#388e3c', mb: 1 }} />
              <Typography variant="h4" sx={{ fontWeight: 600 }}>
                ${analytics.summary.total_bid_amount?.toLocaleString() || '0'}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Auction Value
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={6} sm={6} md={2}>
          <Card>
            <CardContent sx={{ textAlign: 'center', p: { xs: 1.5, sm: 2 } }}>
              <PersonAdd sx={{ fontSize: 40, color: '#7b1fa2', mb: 1 }} />
              <Typography variant="h4" sx={{ fontWeight: 600 }}>
                {Math.round(analytics.summary.new_guest_percentage || 0)}%
              </Typography>
              <Typography variant="body2" color="text.secondary">
                New Guests
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Charts Row */}
      <Grid container spacing={{ xs: 1, sm: 2, md: 3 }} sx={{ mb: { xs: 2, sm: 3 } }}>
        {/* Time Series Chart */}
        <Grid item xs={12} lg={8}>
          <Card>
            <CardContent sx={{ p: { xs: 1.5, sm: 2 } }}>
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
                        id: 'leftAxisId',
                        scaleType: 'linear',
                        position: 'left',
                        min: 0
                      },
                      {
                        id: 'rightAxisId',
                        scaleType: 'linear',
                        position: 'right',
                        min: 0,
                        valueFormatter: (value) => `$${Math.round(value)}`
                      }
                    ]}
                    series={timeSeriesSeries}
                    height={360}
                    margin={{ left: 50, right: 90, top: 40, bottom: 40 }}
                    grid={{ horizontal: true, vertical: true }}
                    slotProps={{
                      legend: {
                        direction: 'row',
                        position: { vertical: 'top', horizontal: 'middle' },
                        padding: 0,
                        labelStyle: { fontSize: 12 },
                        itemMarkWidth: 10,
                        itemMarkHeight: 10,
                        markGap: 6,
                        itemGap: 12,
                      },
                    }}
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
            <CardContent sx={{ p: { xs: 1.5, sm: 2 } }}>
              <Typography variant="h6" gutterBottom>
                Guest Composition Comparison
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: { xs: 1, sm: 2 } }}>
                Current vs City Average vs Global Average
              </Typography>
              <Box sx={{ height: 420, mt: 2 }}>
                {guestCompositionData.length > 0 ? (
                  <BarChart
                    dataset={guestCompositionData}
                    xAxis={[{ scaleType: 'band', dataKey: 'name' }]}
                    yAxis={[{ max: 100 }]}
                    series={[
                      {
                        dataKey: 'QR Scan (New)',
                        label: 'QR Scan (New)',
                        color: '#1976d2',
                        stack: 'composition'
                      },
                      {
                        dataKey: 'QR Scan (Return)',
                        label: 'QR Scan (Return)',
                        color: '#42a5f5',
                        stack: 'composition'
                      },
                      {
                        dataKey: 'Online (New)',
                        label: 'Online (New)',
                        color: '#f57c00',
                        stack: 'composition'
                      },
                      {
                        dataKey: 'Online (Return)',
                        label: 'Online (Return)',
                        color: '#ffb74d',
                        stack: 'composition'
                      },
                    ]}
                    height={380}
                    margin={{ left: 50, right: 20, top: 40, bottom: 60 }}
                    slotProps={{
                      legend: {
                        direction: 'row',
                        position: { vertical: 'top', horizontal: 'middle' },
                        padding: 0,
                        labelStyle: { fontSize: 10 },
                        itemMarkWidth: 8,
                        itemMarkHeight: 8,
                        markGap: 4,
                        itemGap: 8,
                      },
                      barLabel: {
                        style: {
                          fontSize: '11px',
                          fontWeight: 'bold',
                          fill: 'white',
                          textAnchor: 'middle',
                        },
                        formatter: (value, context) => {
                          return value >= 5 ? `${Math.round(value * 10) / 10}%` : '';
                        },
                      },
                    }}
                    barLabel="value"
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

    </Box>
  )
}

export default EventAnalytics
import { useState, useEffect } from 'react';
import {
  Box,
  Card,
  Flex,
  Heading,
  Text,
  Spinner,
  Grid
} from '@radix-ui/themes';
import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer
} from 'recharts';
import { supabase } from '../lib/supabase';

const CityActivityCharts = ({ cityId, cityName, events }) => {
  const [loading, setLoading] = useState(true);
  const [chartData, setChartData] = useState([]);
  const [summary, setSummary] = useState(null);

  useEffect(() => {
    if (cityId && events && events.length > 0) {
      fetchActivityData();
    }
  }, [cityId, events]);

  const fetchActivityData = async () => {
    try {
      setLoading(true);
      // Filter out disabled events
      const enabledEvents = events.filter(e => e.enabled && e.show_in_app);
      const eventIds = enabledEvents.map(e => e.id);

      console.log('Total events:', events.length, 'Enabled events:', enabledEvents.length);

      // Call the edge function for server-side aggregation
      const { data, error } = await supabase.functions.invoke('admin-city-analytics', {
        body: {
          cityId,
          eventIds
        }
      });

      if (error) {
        console.error('Edge function error:', error);
        throw error;
      }

      if (!data || !data.eventData) {
        console.warn('No event data returned from edge function');
        setChartData([]);
        return;
      }

      // Log debug info to troubleshoot revenue data
      if (data.debug) {
        console.log('=== Edge Function Debug Info ===');
        console.log('Mode:', data.debug.note || 'Standard query');
        console.log('Total events returned:', data.debug.totalEventsReturned);
        console.log('Events with ticket revenue:', data.debug.eventsWithTicketRevenue);
        console.log('Events with auction revenue:', data.debug.eventsWithAuctionRevenue);

        if (data.debug.aggregatedDataCounts) {
          console.log('--- SQL Aggregation Query Results (No Limits!) ---');
          console.log('Art pieces found:', data.debug.aggregatedDataCounts.artPiecesFound);
          console.log('Vote count records (events with votes):', data.debug.aggregatedDataCounts.voteCountRecords);
          console.log('Bid count records (events with bids):', data.debug.aggregatedDataCounts.bidCountRecords);
          console.log('QR scan count records:', data.debug.aggregatedDataCounts.qrScanCountRecords);
          console.log('Registration count records:', data.debug.aggregatedDataCounts.registrationCountRecords);
        }

        if (data.debug.aggregatedCounts) {
          console.log('--- Final Aggregated Totals ---');
          console.log('Total votes aggregated:', data.debug.aggregatedCounts.totalVotesAggregated);
          console.log('Total bids aggregated:', data.debug.aggregatedCounts.totalBidsAggregated);
          console.log('Events with votes:', data.debug.aggregatedCounts.eventsWithVotes);
          console.log('Events with bids:', data.debug.aggregatedCounts.eventsWithBids);
        }

        console.log('--- Top Vote Events ---');
        console.log(data.debug.topVoteEvents);
        console.log('--- Sample Events ---');
        console.log(data.debug.sampleEvents);
      }

      setChartData(data.eventData);
      setSummary(data.summary);

    } catch (err) {
      console.error('Error fetching activity data:', err);
      console.error('Error details:', {
        message: err.message,
        stack: err.stack,
        cityId,
        eventCount: events?.length
      });
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <Box p="4">
          <Flex align="center" justify="center" style={{ height: '200px' }}>
            <Spinner size="3" />
            <Text ml="2">Loading activity data...</Text>
          </Flex>
        </Box>
      </Card>
    );
  }

  if (chartData.length === 0) {
    return (
      <Card>
        <Box p="4">
          <Heading size="4" mb="2">Activity Overview</Heading>
          <Text color="gray">No activity data available for this city</Text>
        </Box>
      </Card>
    );
  }

  // Prepare data with proportional time-based spacing
  // Create a sparse array with proper time-based positioning
  const preparedData = [];

  if (chartData.length > 0) {
    const firstDate = new Date(chartData[0].eventDate).getTime();
    const lastDate = new Date(chartData[chartData.length - 1].eventDate).getTime();
    const totalTimeSpan = lastDate - firstDate;

    // Target width: aim for about 40 pixels per event on average as base, then scale by time
    const desiredTotalWidth = chartData.length * 40;

    chartData.forEach((event, eventIdx) => {
      const eventDate = new Date(event.eventDate).getTime();
      const timeFromStart = eventDate - firstDate;

      // Calculate position proportional to time
      // If totalTimeSpan is 0 (all events same day), just space evenly
      let position;
      if (totalTimeSpan === 0) {
        position = eventIdx;
      } else {
        // Scale position based on time ratio
        position = Math.round((timeFromStart / totalTimeSpan) * (desiredTotalWidth / 40));
      }

      // Fill gaps with empty placeholder events if needed
      while (preparedData.length < position) {
        preparedData.push(null); // Placeholder for spacing
      }

      const showYear = eventIdx === 0 || chartData[eventIdx - 1]?.year !== event.year;

      preparedData.push({
        ...event,
        dateTimestamp: eventDate,
        index: preparedData.length,
        trend: (event.votes || 0) + (event.bids || 0),
        showYear,
        isRealEvent: true,
        // Ensure all numeric fields are numbers not undefined
        ticketRevenue: event.ticketRevenue || 0,
        auctionRevenue: event.auctionRevenue || 0,
        registrations: event.registrations || 0,
        votes: event.votes || 0,
        bids: event.bids || 0,
        qrScans: event.qrScans || 0
      });
    });
  }

  // Debug: log first data point and check for all metrics
  if (preparedData.length > 0) {
    const realEvents = preparedData.filter(e => e !== null && e.isRealEvent);
    console.log('=== CHART DATA DEBUG ===');
    console.log('Total data points (with spacing):', preparedData.length);
    console.log('Real events:', realEvents.length);
    console.log('First real event data:', realEvents[0]);
    console.log('Events with votes > 0:', realEvents.filter(e => e.votes > 0).length);
    console.log('Events with bids > 0:', realEvents.filter(e => e.bids > 0).length);
    console.log('Events with auction revenue > 0:', realEvents.filter(e => e.auctionRevenue > 0).length);
    console.log('Events with ticket revenue > 0:', realEvents.filter(e => e.ticketRevenue > 0).length);
    console.log('Sample events with data:', realEvents.slice(0, 3).map(e => ({
      eid: e.eid,
      votes: e.votes,
      bids: e.bids,
      auctionRevenue: e.auctionRevenue,
      ticketRevenue: e.ticketRevenue,
      trend: e.trend
    })));
  }

  // Custom X-axis tick that shows EID and year markers
  const CustomXAxisTick = ({ x, y, payload }) => {
    // For categorical axis, payload.value is the index
    const dataPoint = preparedData[payload.value];
    // Only show ticks for real events, not placeholder spacing
    if (!dataPoint || !dataPoint.isRealEvent) return null;

    return (
      <g transform={`translate(${x},${y})`}>
        {/* EID label */}
        <text
          x={0}
          y={0}
          dy={16}
          textAnchor="middle"
          fill="#888"
          fontSize="11"
        >
          {dataPoint.eid}
        </text>
        {/* Year marker */}
        {dataPoint.showYear && (
          <text
            x={0}
            y={0}
            dy={32}
            textAnchor="middle"
            fill="#fff"
            fontSize="13"
            fontWeight="bold"
          >
            {dataPoint.year}
          </text>
        )}
      </g>
    );
  };

  // Custom tooltip
  const CustomTooltip = ({ active, payload }) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      // Skip tooltips for placeholder spacing entries
      if (!data || !data.isRealEvent) return null;
      // Find the matching event to get the name
      const matchingEvent = events.find(e => e.id === data.eventId);
      return (
        <div style={{
          backgroundColor: '#222',
          border: '1px solid #444',
          borderRadius: '4px',
          padding: '12px'
        }}>
          <p style={{ margin: 0, fontWeight: 'bold', marginBottom: '8px', color: '#fff' }}>
            {data.eid}
          </p>
          {matchingEvent?.name && (
            <p style={{ margin: '2px 0', fontSize: '12px', color: '#fff' }}>
              {matchingEvent.name}
            </p>
          )}
          <p style={{ margin: '2px 0', fontSize: '11px', color: '#888' }}>
            {data.eventDateLabel}
          </p>
          <div style={{ borderTop: '1px solid #444', marginTop: '8px', paddingTop: '8px' }}>
            <p style={{ margin: '4px 0', color: '#ffd93d' }}>
              Ticket Revenue: ${(data.ticketRevenue || 0).toLocaleString()}
            </p>
            <p style={{ margin: '4px 0', color: '#4ecdc4' }}>
              Auction Revenue: ${(data.auctionRevenue || 0).toLocaleString()}
            </p>
            <p style={{ margin: '4px 0', fontWeight: 'bold', color: '#fff' }}>
              Total Revenue: ${(data.totalRevenue || 0).toLocaleString()}
            </p>
          </div>
          <div style={{ borderTop: '1px solid #444', marginTop: '8px', paddingTop: '8px' }}>
            <p style={{ margin: '4px 0', color: '#9b59b6' }}>
              Registrations: {data.registrations || 0}
            </p>
            <p style={{ margin: '4px 0', color: '#3498db' }}>
              QR Scans: {data.qrScans || 0}
            </p>
            <p style={{ margin: '4px 0', color: '#e74c3c' }}>
              Votes: {data.votes || 0}
            </p>
            <p style={{ margin: '4px 0', color: '#f39c12' }}>
              Bids: {data.bids || 0}
            </p>
            <p style={{ margin: '4px 0', fontWeight: 'bold', color: '#fff', borderTop: '1px solid #444', paddingTop: '4px' }}>
              Trend (Votes + Bids): {data.trend || 0}
            </p>
          </div>
        </div>
      );
    }
    return null;
  };

  return (
    <Card>
      <Box p="4">
        <Heading size="5" mb="4">
          {cityName} - Event Timeline & Metrics
        </Heading>

        {/* Main Timeline Chart */}
        <Box mb="4">
          <ResponsiveContainer width="100%" height={500}>
            <ComposedChart
              data={preparedData}
              margin={{ top: 20, right: 30, left: 20, bottom: 50 }}
              barCategoryGap="20%"
              barGap={2}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#333" />
              <XAxis
                dataKey="index"
                type="category"
                tick={<CustomXAxisTick />}
                height={60}
              />
              <YAxis
                yAxisId="left"
                stroke="#888"
                tickFormatter={(value) => `$${(value / 1000).toFixed(0)}k`}
              />
              <YAxis
                yAxisId="right"
                orientation="right"
                stroke="#888"
              />
              <Tooltip content={<CustomTooltip />} />

              {/* Revenue Bars */}
              <Bar
                yAxisId="left"
                dataKey="ticketRevenue"
                fill="#ffd93d"
                name="Ticket Revenue"
              />
              <Bar
                yAxisId="left"
                dataKey="auctionRevenue"
                fill="#4ecdc4"
                name="Auction Revenue"
              />

              {/* Audience Metrics Bars (on right axis) */}
              <Bar
                yAxisId="right"
                dataKey="registrations"
                fill="#9b59b6"
                name="Registrations"
              />
              <Bar
                yAxisId="right"
                dataKey="votes"
                fill="#e74c3c"
                name="Votes"
              />
              <Bar
                yAxisId="right"
                dataKey="bids"
                fill="#f39c12"
                name="Bids"
              />
              <Bar
                yAxisId="right"
                dataKey="qrScans"
                fill="#3498db"
                name="QR Scans"
              />

              {/* Trend Line - Votes + Bids */}
              <Line
                yAxisId="right"
                type="monotone"
                dataKey="trend"
                stroke="#fff"
                strokeWidth={3}
                dot={{ fill: '#fff', r: 4 }}
                name="Trend (Votes+Bids)"
                connectNulls={true}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </Box>

        {/* Summary Stats */}
        {summary && (
          <Grid columns={{ initial: '2', sm: '3', md: '6' }} gap="3" mt="4">
            <Card variant="surface">
              <Box p="3">
                <Text size="1" color="gray" style={{ display: 'block' }}>Total Revenue</Text>
                <Text size="4" weight="bold" style={{ display: 'block' }}>
                  ${summary.totalRevenue.toLocaleString()}
                </Text>
                <Text size="1" color="gray" style={{ display: 'block', marginTop: '2px' }}>
                  Ticket: ${summary.totalTicketRevenue.toLocaleString()}
                </Text>
                <Text size="1" color="gray" style={{ display: 'block' }}>
                  Auction: ${summary.totalAuctionRevenue.toLocaleString()}
                </Text>
              </Box>
            </Card>
            <Card variant="surface">
              <Box p="3">
                <Text size="1" color="gray" style={{ display: 'block' }}>Total Registrations</Text>
                <Text size="4" weight="bold" style={{ display: 'block' }}>
                  {summary.totalRegistrations.toLocaleString()}
                </Text>
              </Box>
            </Card>
            <Card variant="surface">
              <Box p="3">
                <Text size="1" color="gray" style={{ display: 'block' }}>Total QR Scans</Text>
                <Text size="4" weight="bold" style={{ display: 'block' }}>
                  {summary.totalQrScans.toLocaleString()}
                </Text>
              </Box>
            </Card>
            <Card variant="surface">
              <Box p="3">
                <Text size="1" color="gray" style={{ display: 'block' }}>Total Votes</Text>
                <Text size="4" weight="bold" style={{ display: 'block' }}>
                  {summary.totalVotes.toLocaleString()}
                </Text>
              </Box>
            </Card>
            <Card variant="surface">
              <Box p="3">
                <Text size="1" color="gray" style={{ display: 'block' }}>Total Bids</Text>
                <Text size="4" weight="bold" style={{ display: 'block' }}>
                  {summary.totalBids.toLocaleString()}
                </Text>
              </Box>
            </Card>
            <Card variant="surface">
              <Box p="3">
                <Text size="1" color="gray" style={{ display: 'block' }}>Total Events</Text>
                <Text size="4" weight="bold" style={{ display: 'block' }}>
                  {summary.totalEvents}
                </Text>
              </Box>
            </Card>
          </Grid>
        )}
      </Box>
    </Card>
  );
};

export default CityActivityCharts;

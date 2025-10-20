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
        console.log('Total events returned:', data.debug.totalEventsReturned);
        console.log('Events with ticket revenue:', data.debug.eventsWithTicketRevenue);
        console.log('Events with auction revenue:', data.debug.eventsWithAuctionRevenue);
        console.log('EIDs queried for ticket revenue:', data.debug.eidsQueried);
        console.log('EIDs queried count:', data.debug.eidsQueriedCount);
        console.log('Ticket query error:', data.debug.ticketQueryError);
        console.log('Ticket sales data returned:', data.debug.ticketSalesDataReturned);
        console.log('Ticket revenue EIDs found:', data.debug.ticketRevenueEidsFound);
        console.log('Sample ticket revenue:', data.debug.sampleTicketRevenue);
        console.log('Sample events:', data.debug.sampleEvents);
        console.log('Art pieces found:', data.debug.artPiecesFound);
        console.log('Votes found:', data.debug.votesFound);
        console.log('Bids found:', data.debug.bidsFound);
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

  // Prepare data with date timestamps and trend calculation
  const preparedData = chartData.map((event, index) => {
    const showYear = index === 0 || chartData[index - 1]?.year !== event.year;
    const prepared = {
      ...event,
      dateTimestamp: new Date(event.eventDate).getTime(),
      trend: (event.votes || 0) + (event.bids || 0),
      showYear,
      // Ensure all numeric fields are numbers not undefined
      ticketRevenue: event.ticketRevenue || 0,
      auctionRevenue: event.auctionRevenue || 0,
      registrations: event.registrations || 0,
      votes: event.votes || 0,
      bids: event.bids || 0,
      qrScans: event.qrScans || 0
    };
    return prepared;
  });

  // Debug: log first data point and check for all metrics
  if (preparedData.length > 0) {
    console.log('=== CHART DATA DEBUG ===');
    console.log('First event data:', preparedData[0]);
    console.log('Total events in chart:', preparedData.length);
    console.log('Events with votes > 0:', preparedData.filter(e => e.votes > 0).length);
    console.log('Events with bids > 0:', preparedData.filter(e => e.bids > 0).length);
    console.log('Events with auction revenue > 0:', preparedData.filter(e => e.auctionRevenue > 0).length);
    console.log('Events with ticket revenue > 0:', preparedData.filter(e => e.ticketRevenue > 0).length);
    console.log('Sample events with data:', preparedData.slice(0, 3).map(e => ({
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
    // Find the data point by timestamp
    const dataPoint = preparedData.find(d => d.dateTimestamp === payload.value);
    if (!dataPoint) return null;

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
                dataKey="dateTimestamp"
                type="number"
                domain={['dataMin', 'dataMax']}
                scale="time"
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
              <Legend
                wrapperStyle={{ paddingTop: '20px' }}
                iconType="square"
              />

              {/* Revenue Bars - with fixed width for time axis */}
              <Bar
                yAxisId="left"
                dataKey="ticketRevenue"
                fill="#ffd93d"
                name="Ticket Revenue"
                barSize={80}
                minPointSize={5}
              />
              <Bar
                yAxisId="left"
                dataKey="auctionRevenue"
                fill="#4ecdc4"
                name="Auction Revenue"
                barSize={80}
                minPointSize={5}
              />

              {/* Audience Metrics Bars (on right axis) */}
              <Bar
                yAxisId="right"
                dataKey="registrations"
                fill="#9b59b6"
                name="Registrations"
                barSize={80}
                minPointSize={5}
              />
              <Bar
                yAxisId="right"
                dataKey="votes"
                fill="#e74c3c"
                name="Votes"
                barSize={80}
                minPointSize={5}
              />
              <Bar
                yAxisId="right"
                dataKey="bids"
                fill="#f39c12"
                name="Bids"
                barSize={80}
                minPointSize={5}
              />
              <Bar
                yAxisId="right"
                dataKey="qrScans"
                fill="#3498db"
                name="QR Scans"
                barSize={80}
                minPointSize={5}
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

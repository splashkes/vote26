import { useState, useEffect } from 'react';
import {
  Box,
  Heading,
  Card,
  Flex,
  Text,
  Badge,
  Grid,
  Button,
  TextField,
  Select,
  Spinner
} from '@radix-ui/themes';
import { MagnifyingGlassIcon, CalendarIcon, PersonIcon } from '@radix-ui/react-icons';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { DebugField } from './DebugComponents';
import { debugObject } from '../lib/debugHelpers';

const EventDashboard = () => {
  const { adminEvents, user } = useAuth();
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchEvents();
  }, [user]);

  const fetchEvents = async () => {
    try {
      setLoading(true);
      setError(null);

      // If user has specific admin events, filter by those
      const adminEventIds = adminEvents.map(ae => ae.event_id);
      
      let query = supabase
        .from('events')
        .select(`
          id,
          eid,
          name,
          description,
          venue,
          event_start_datetime,
          event_end_datetime,
          enabled,
          show_in_app,
          current_round,
          timezone_icann,
          cities(name, country_id),
          countries(name, code)
        `)
        .order('event_start_datetime', { ascending: false });

      // Filter to admin events if user doesn't have super access
      if (adminEventIds.length > 0) {
        query = query.in('id', adminEventIds);
      }

      const { data, error: fetchError } = await query;

      if (fetchError) {
        console.error('Error fetching events:', fetchError);
        setError(fetchError.message);
        return;
      }

      debugObject(data?.[0], 'Sample Event Data');
      setEvents(data || []);
    } catch (err) {
      console.error('Error in fetchEvents:', err);
      setError('Failed to load events');
    } finally {
      setLoading(false);
    }
  };

  const getEventStatus = (event) => {
    if (!event.enabled) return 'disabled';
    
    const now = new Date();
    const startTime = new Date(event.event_start_datetime);
    const endTime = new Date(event.event_end_datetime);
    
    if (now < startTime) return 'upcoming';
    if (now > endTime) return 'completed';
    return 'active';
  };

  const getStatusBadge = (status) => {
    const statusConfig = {
      active: { color: 'green', label: 'Active' },
      upcoming: { color: 'blue', label: 'Upcoming' },
      completed: { color: 'gray', label: 'Completed' },
      disabled: { color: 'red', label: 'Disabled' }
    };
    
    const config = statusConfig[status] || statusConfig.disabled;
    return <Badge color={config.color}>{config.label}</Badge>;
  };

  const filteredEvents = events.filter(event => {
    const matchesSearch = !searchTerm || 
      event.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      event.eid?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      event.venue?.toLowerCase().includes(searchTerm.toLowerCase());
      
    const matchesStatus = statusFilter === 'all' || getEventStatus(event) === statusFilter;
    
    return matchesSearch && matchesStatus;
  });

  if (loading) {
    return (
      <Box p="4">
        <Flex align="center" justify="center" style={{ height: '200px' }}>
          <Spinner size="3" />
        </Flex>
      </Box>
    );
  }

  return (
    <Box p="4">
      <Flex direction="column" gap="4">
        {/* Header */}
        <Flex justify="between" align="center">
          <Box>
            <Heading size="6" mb="1">Event Dashboard</Heading>
            <Text color="gray" size="2">
              Manage and monitor Art Battle events
            </Text>
          </Box>
          <Button>
            Create Event
          </Button>
        </Flex>

        {/* Filters */}
        <Card>
          <Box p="3">
            <Flex gap="3" align="end">
              <Box style={{ flexGrow: 1, maxWidth: '300px' }}>
                <TextField.Root
                  placeholder="Search events..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                >
                  <TextField.Slot>
                    <MagnifyingGlassIcon height="16" width="16" />
                  </TextField.Slot>
                </TextField.Root>
              </Box>
              
              <Box style={{ minWidth: '120px' }}>
                <Select.Root value={statusFilter} onValueChange={setStatusFilter}>
                  <Select.Trigger placeholder="All Status" />
                  <Select.Content>
                    <Select.Item value="all">All Status</Select.Item>
                    <Select.Item value="active">Active</Select.Item>
                    <Select.Item value="upcoming">Upcoming</Select.Item>
                    <Select.Item value="completed">Completed</Select.Item>
                    <Select.Item value="disabled">Disabled</Select.Item>
                  </Select.Content>
                </Select.Root>
              </Box>
            </Flex>
          </Box>
        </Card>

        {/* Error Display */}
        {error && (
          <Card>
            <Box p="3">
              <Text color="red">Error: {error}</Text>
            </Box>
          </Card>
        )}

        {/* Events Grid */}
        <Grid columns={{ initial: '1', sm: '2', lg: '3' }} gap="4">
          {filteredEvents.map((event) => {
            const status = getEventStatus(event);
            const startDate = event.event_start_datetime 
              ? new Date(event.event_start_datetime).toLocaleDateString()
              : null;
            
            return (
              <Card key={event.id} style={{ cursor: 'pointer' }}>
                <Box p="4">
                  <Flex direction="column" gap="3">
                    {/* Event Header */}
                    <Flex justify="between" align="start">
                      <Box>
                        <Text size="3" weight="bold" mb="1" style={{ display: 'block' }}>
                          <DebugField 
                            value={event.name} 
                            fieldName="event.name"
                            fallback="Unnamed Event"
                          />
                        </Text>
                        <Text size="2" color="gray">
                          <DebugField 
                            value={event.eid} 
                            fieldName="event.eid"
                            fallback="No EID"
                          />
                        </Text>
                      </Box>
                      {getStatusBadge(status)}
                    </Flex>

                    {/* Event Details */}
                    <Flex direction="column" gap="2">
                      <Flex align="center" gap="2">
                        <CalendarIcon size={14} />
                        <Text size="2">
                          <DebugField 
                            value={startDate} 
                            fieldName="event.event_start_datetime"
                            fallback="No date set"
                          />
                        </Text>
                      </Flex>
                      
                      <Flex align="center" gap="2">
                        <PersonIcon size={14} />
                        <Text size="2">
                          <DebugField 
                            value={event.venue} 
                            fieldName="event.venue"
                            fallback="No venue set"
                          />
                        </Text>
                      </Flex>

                      <Text size="2" color="gray">
                        Round: <DebugField 
                          value={event.current_round} 
                          fieldName="event.current_round"
                          fallback="0"
                        />
                      </Text>
                    </Flex>

                    {/* Location */}
                    <Text size="2" color="gray">
                      <DebugField 
                        value={event.cities?.name} 
                        fieldName="cities.name"
                        fallback="Unknown city"
                      />
                      {event.countries?.name && (
                        <>
                          , <DebugField 
                            value={event.countries.name} 
                            fieldName="countries.name"
                          />
                        </>
                      )}
                    </Text>
                  </Flex>
                </Box>
              </Card>
            );
          })}
        </Grid>

        {/* Empty State */}
        {!loading && filteredEvents.length === 0 && (
          <Card>
            <Box p="6" style={{ textAlign: 'center' }}>
              <Text size="3" color="gray">
                {events.length === 0 
                  ? "No events found. You may need admin permissions."
                  : "No events match your search criteria."
                }
              </Text>
            </Box>
          </Card>
        )}
      </Flex>
    </Box>
  );
};

export default EventDashboard;
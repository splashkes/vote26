import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Box,
  Heading,
  Card,
  Flex,
  Text,
  Badge,
  Grid,
  Button,
  Spinner
} from '@radix-ui/themes';
import { ArrowLeftIcon, CalendarIcon } from '@radix-ui/react-icons';
import { supabase } from '../lib/supabase';
import ArtistWorkflow from './ArtistWorkflow';
import { getCountryFlag } from '../lib/countryFlags';

const CityDetail = () => {
  const { cityId } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [cityInfo, setCityInfo] = useState(null);
  const [events, setEvents] = useState([]);
  const [upcomingEvents, setUpcomingEvents] = useState([]);
  const [pastEvents, setPastEvents] = useState([]);

  useEffect(() => {
    if (cityId) {
      fetchCityData();
    }
  }, [cityId]);

  const fetchCityData = async () => {
    try {
      setLoading(true);

      // Fetch city info
      const { data: city, error: cityError } = await supabase
        .from('cities')
        .select('id, name, country_id, countries(name, code)')
        .eq('id', cityId)
        .single();

      if (cityError) throw cityError;
      setCityInfo(city);

      // Fetch events for this city (from 2018 onwards)
      const startDate = new Date('2018-01-01');

      const { data: eventsData, error: eventsError } = await supabase
        .from('events')
        .select(`
          id,
          eid,
          name,
          event_start_datetime,
          event_end_datetime,
          enabled,
          show_in_app,
          venue,
          eventbrite_id
        `)
        .eq('city_id', cityId)
        .gte('event_start_datetime', startDate.toISOString())
        .order('event_start_datetime', { ascending: false });

      if (eventsError) throw eventsError;

      setEvents(eventsData || []);

      // Split into upcoming and past
      const now = new Date();
      const upcoming = eventsData.filter(e => new Date(e.event_start_datetime) >= now);
      const past = eventsData.filter(e => new Date(e.event_start_datetime) < now);

      setUpcomingEvents(upcoming);
      setPastEvents(past);
    } catch (err) {
      console.error('Error fetching city data:', err);
    } finally {
      setLoading(false);
    }
  };

  const getEventStatus = (event) => {
    if (!event.enabled || !event.show_in_app) return 'disabled';

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

  if (loading) {
    return (
      <Box p="4">
        <Flex align="center" justify="center" style={{ height: '200px' }}>
          <Spinner size="3" />
        </Flex>
      </Box>
    );
  }

  if (!cityInfo) {
    return (
      <Box p="4">
        <Card>
          <Box p="6" style={{ textAlign: 'center' }}>
            <Text size="3" color="gray">City not found</Text>
          </Box>
        </Card>
      </Box>
    );
  }

  return (
    <Box p="4">
      <Flex direction="column" gap="4">
        {/* Header */}
        <Flex justify="between" align="center">
          <Flex align="center" gap="3">
            <Button
              variant="ghost"
              onClick={() => navigate('/events')}
            >
              <ArrowLeftIcon />
              Back
            </Button>
            <Box>
              <Heading size="6" mb="1">
                {getCountryFlag(cityInfo.countries?.code)} {cityInfo.name}
              </Heading>
              <Text color="gray" size="2">
                {cityInfo.countries?.name} ({cityInfo.countries?.code})
              </Text>
            </Box>
          </Flex>
          <Flex gap="2">
            <Badge color="blue" size="2">
              {upcomingEvents.length} Upcoming
            </Badge>
            <Badge color="green" size="2">
              {pastEvents.length} Past
            </Badge>
          </Flex>
        </Flex>

        {/* Upcoming Events */}
        {upcomingEvents.length > 0 && (
          <Box>
            <Heading size="4" mb="3">
              Upcoming Events
            </Heading>
            <Grid columns={{ initial: '1', sm: '2', lg: '3' }} gap="4">
              {upcomingEvents.map((event) => {
                const status = getEventStatus(event);
                const startDate = event.event_start_datetime
                  ? new Date(event.event_start_datetime).toLocaleDateString()
                  : null;

                return (
                  <Card
                    key={event.id}
                    style={{ cursor: 'pointer' }}
                    onClick={() => navigate(`/events/${event.id}`)}
                  >
                    <Box p="4">
                      <Flex direction="column" gap="3">
                        <Flex justify="between" align="start">
                          <Box>
                            <Text size="3" weight="bold" mb="1" style={{ display: 'block' }}>
                              {event.eid}
                            </Text>
                            <Text size="2" color="gray">
                              {event.name || 'Unnamed Event'}
                            </Text>
                          </Box>
                          {getStatusBadge(status)}
                        </Flex>

                        <Flex direction="column" gap="2">
                          <Flex align="center" gap="2">
                            <CalendarIcon size={14} />
                            <Text size="2">{startDate}</Text>
                          </Flex>

                          {event.venue && (
                            <Text size="2" color="gray">
                              {event.venue}
                            </Text>
                          )}
                        </Flex>

                        <Flex align="center" gap="2" mt="1">
                          <Badge
                            color={event.eventbrite_id && event.eventbrite_id.trim() !== '' ? 'green' : 'red'}
                            size="1"
                          >
                            EB
                          </Badge>
                        </Flex>
                      </Flex>
                    </Box>
                  </Card>
                );
              })}
            </Grid>
          </Box>
        )}

        {/* Past Events */}
        {pastEvents.length > 0 && (
          <Box>
            <Heading size="4" mb="3">
              Past Events (Since 2018)
            </Heading>
            <Grid columns={{ initial: '1', sm: '2', lg: '3' }} gap="4">
              {pastEvents.map((event) => {
                const status = getEventStatus(event);
                const startDate = event.event_start_datetime
                  ? new Date(event.event_start_datetime).toLocaleDateString()
                  : null;

                return (
                  <Card
                    key={event.id}
                    style={{ cursor: 'pointer' }}
                    onClick={() => navigate(`/events/${event.id}`)}
                  >
                    <Box p="4">
                      <Flex direction="column" gap="3">
                        <Flex justify="between" align="start">
                          <Box>
                            <Text size="3" weight="bold" mb="1" style={{ display: 'block' }}>
                              {event.eid}
                            </Text>
                            <Text size="2" color="gray">
                              {event.name || 'Unnamed Event'}
                            </Text>
                          </Box>
                          {getStatusBadge(status)}
                        </Flex>

                        <Flex direction="column" gap="2">
                          <Flex align="center" gap="2">
                            <CalendarIcon size={14} />
                            <Text size="2">{startDate}</Text>
                          </Flex>

                          {event.venue && (
                            <Text size="2" color="gray">
                              {event.venue}
                            </Text>
                          )}
                        </Flex>

                        <Flex align="center" gap="2" mt="1">
                          <Badge
                            color={event.eventbrite_id && event.eventbrite_id.trim() !== '' ? 'green' : 'red'}
                            size="1"
                          >
                            EB
                          </Badge>
                        </Flex>
                      </Flex>
                    </Box>
                  </Card>
                );
              })}
            </Grid>
          </Box>
        )}

        {/* Artist Workflow - All events from this city */}
        {events.length > 0 && (
          <ArtistWorkflow
            eventIds={events.map(e => e.id)}
            eventEids={events.map(e => e.eid)}
            title={`Artist Management - ${cityInfo.name}`}
            showEventInfo={true}
            upcomingEvents={upcomingEvents}
          />
        )}

        {/* Empty State */}
        {events.length === 0 && (
          <Card>
            <Box p="6" style={{ textAlign: 'center' }}>
              <Text size="3" color="gray" mb="2" style={{ display: 'block' }}>
                No events found since 2018
              </Text>
            </Box>
          </Card>
        )}
      </Flex>
    </Box>
  );
};

export default CityDetail;

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
  Spinner,
  SegmentedControl
} from '@radix-ui/themes';
import { ArrowLeftIcon, CalendarIcon, StarFilledIcon } from '@radix-ui/react-icons';
import { supabase } from '../lib/supabase';
import ArtistWorkflow from './ArtistWorkflow';
import CityActivityCharts from './CityActivityCharts';
import ArtistDetailModal from './ArtistDetailModal';
import { getCountryFlag } from '../lib/countryFlags';

const CityDetail = () => {
  const { cityId } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [cityInfo, setCityInfo] = useState(null);
  const [events, setEvents] = useState([]);
  const [upcomingEvents, setUpcomingEvents] = useState([]);
  const [pastEvents, setPastEvents] = useState([]);
  const [eventWinners, setEventWinners] = useState({});
  const [viewMode, setViewMode] = useState(() => {
    return localStorage.getItem('cityDetailViewMode') || 'normal';
  });
  const [selectedArtist, setSelectedArtist] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  useEffect(() => {
    if (cityId) {
      fetchCityData();
    }
  }, [cityId]);

  useEffect(() => {
    localStorage.setItem('cityDetailViewMode', viewMode);
  }, [viewMode]);

  useEffect(() => {
    // Fetch winners when switching to normal/extended from minimal
    if (viewMode !== 'minimal' && cityId && Object.keys(eventWinners).length === 0 && pastEvents.length > 0) {
      fetchEventWinners();
    }
  }, [viewMode, cityId, eventWinners, pastEvents.length]);

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

      // Fetch winners data for past events (for normal/extended views)
      if (viewMode !== 'minimal') {
        fetchEventWinners();
      }
    } catch (err) {
      console.error('Error fetching city data:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchEventWinners = async () => {
    try {
      const { data, error } = await supabase
        .rpc('get_city_event_winners', { p_city_id: cityId });

      if (error) throw error;

      // Convert array to map for easy lookup by event_id
      const winnersMap = {};
      (data || []).forEach(item => {
        winnersMap[item.event_id] = {
          champion_name: item.champion_name,
          champion_id: item.champion_id,
          champion_entry_id: item.champion_entry_id,
          rounds: item.rounds_data || []
        };
      });

      setEventWinners(winnersMap);
    } catch (err) {
      console.error('Error fetching event winners:', err);
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

  const renderArtistLink = (artistName, artistId, entryId) => {
    return (
      <Flex align="center" gap="1">
        <Text size="2">{artistName}</Text>
        {entryId && (
          <Badge
            color="blue"
            size="1"
            style={{ cursor: 'pointer' }}
            onClick={(e) => {
              e.stopPropagation();
              // Open artist detail modal
              setSelectedArtist({
                artist_profile_id: artistId,
                artist_name: artistName,
                entry_id: entryId
              });
              setIsModalOpen(true);
            }}
          >
            #{entryId}
          </Badge>
        )}
      </Flex>
    );
  };

  const renderEventCard = (event, winners, mode) => {
    const status = getEventStatus(event);
    const startDate = event.event_start_datetime
      ? new Date(event.event_start_datetime).toLocaleDateString()
      : null;
    const fullDate = event.event_start_datetime
      ? new Date(event.event_start_datetime).toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'long',
          day: 'numeric'
        })
      : null;

    // Minimal View
    if (mode === 'minimal') {
      return (
        <Card
          key={event.id}
          style={{ cursor: 'pointer' }}
          onClick={() => navigate(`/events/${event.id}`)}
        >
          <Box p="4">
            <Text size="3" weight="bold" mb="1" style={{ display: 'block' }}>
              {event.eid}
            </Text>
            <Text size="2" color="gray" mb="2" style={{ display: 'block' }}>
              {event.name || 'Unnamed Event'}
            </Text>
            <Flex align="center" gap="2">
              <CalendarIcon size={14} />
              <Text size="2">{startDate}</Text>
            </Flex>
          </Box>
        </Card>
      );
    }

    // Normal View
    if (mode === 'normal') {
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

                {winners?.champion_name && (
                  <Flex align="center" gap="2">
                    <StarFilledIcon color="gold" size={14} />
                    {renderArtistLink(winners.champion_name, winners.champion_id, winners.champion_entry_id)}
                  </Flex>
                )}

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
    }

    // Extended View
    if (mode === 'extended') {
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

              <Flex align="center" gap="2">
                <CalendarIcon size={14} />
                <Text size="2">{fullDate}</Text>
              </Flex>

              {winners?.champion_name && (
                <Box>
                  <Flex align="center" gap="2" mb="3">
                    <StarFilledIcon color="gold" size={16} />
                    <Text size="3" weight="bold">Champion: </Text>
                    {renderArtistLink(winners.champion_name, winners.champion_id, winners.champion_entry_id)}
                  </Flex>

                  {winners.rounds && winners.rounds.length > 0 && (
                    <Flex direction="column" gap="2">
                      {winners.rounds.slice().reverse().map((round) => (
                        <Box key={round.round_number}>
                          <Text size="2" weight="medium" mb="1" style={{ display: 'block' }}>
                            Round {round.round_number}{round.round_number === Math.max(...winners.rounds.map(r => r.round_number)) ? ' (Finals)' : ''}:
                          </Text>
                          <Box pl="3">
                            {round.winners && round.winners.map((winner, idx) => (
                              <Flex key={idx} align="center" gap="1" mb="1">
                                <Text size="2" color="gray">•</Text>
                                {renderArtistLink(winner.name, winner.id, winner.entry_id)}
                              </Flex>
                            ))}
                          </Box>
                        </Box>
                      ))}
                    </Flex>
                  )}
                </Box>
              )}

              <Flex direction="column" gap="2" mt="2">
                {event.venue && (
                  <Text size="2" color="gray">
                    📍 {event.venue}
                  </Text>
                )}
                <Flex align="center" gap="2">
                  <Badge
                    color={event.eventbrite_id && event.eventbrite_id.trim() !== '' ? 'green' : 'red'}
                    size="1"
                  >
                    EB
                  </Badge>
                </Flex>
              </Flex>
            </Flex>
          </Box>
        </Card>
      );
    }
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

        {/* Activity Charts */}
        {events.length > 0 && (
          <CityActivityCharts
            cityId={cityId}
            cityName={cityInfo.name}
            events={events}
          />
        )}

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
            <Flex justify="between" align="center" mb="3">
              <Heading size="4">
                Past Events (Since 2018)
              </Heading>
              <SegmentedControl.Root value={viewMode} onValueChange={setViewMode}>
                <SegmentedControl.Item value="minimal">Minimal</SegmentedControl.Item>
                <SegmentedControl.Item value="normal">Normal</SegmentedControl.Item>
                <SegmentedControl.Item value="extended">Extended</SegmentedControl.Item>
              </SegmentedControl.Root>
            </Flex>
            <Grid columns={{ initial: '1', sm: '2', lg: '3' }} gap="4">
              {pastEvents.map((event) => {
                const winners = eventWinners[event.id];
                return renderEventCard(event, winners, viewMode);
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

      {/* Artist Detail Modal */}
      <ArtistDetailModal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setSelectedArtist(null);
        }}
        artist={selectedArtist}
        showApplicationSpecifics={false}
        upcomingEvents={upcomingEvents}
      />
    </Box>
  );
};

export default CityDetail;

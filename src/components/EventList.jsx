import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Container,
  Heading,
  Card,
  Flex,
  Text,
  Button,
  Badge,
  ScrollArea,
  Separator,
  Skeleton,
} from '@radix-ui/themes';
import { ChevronDownIcon, ChevronUpIcon } from '@radix-ui/react-icons';
import { supabase } from '../lib/supabase';

const EventList = () => {
  const [events, setEvents] = useState({ active: [], recent: [], future: [] });
  const [loading, setLoading] = useState(true);
  const [expandedEvent, setExpandedEvent] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    fetchEvents();
  }, []);

  const fetchEvents = async () => {
    try {
      const now = new Date();
      const twelveHoursAgo = new Date(now.getTime() - 12 * 60 * 60 * 1000);
      const eighteenHoursFromNow = new Date(now.getTime() + 18 * 60 * 60 * 1000);
      const tenDaysAgo = new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000);
      const twoMonthsFromNow = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000);

      // Fetch all events within our time range
      const { data, error } = await supabase
        .from('events')
        .select(`
          id,
          eid,
          name,
          event_start_datetime,
          event_end_datetime,
          venue,
          location,
          cities (name, state, country),
          enable_auction,
          vote_by_link
        `)
        .gte('event_start_datetime', tenDaysAgo.toISOString())
        .lte('event_start_datetime', twoMonthsFromNow.toISOString())
        .eq('enabled', true)
        .eq('show_in_app', true)
        .order('event_start_datetime', { ascending: true });

      if (error) throw error;

      // Categorize events
      const categorized = {
        active: [],
        recent: [],
        future: [],
      };

      data.forEach((event) => {
        const eventStart = new Date(event.event_start_datetime);
        
        if (eventStart >= twelveHoursAgo && eventStart <= eighteenHoursFromNow) {
          categorized.active.push(event);
        } else if (eventStart < twelveHoursAgo && eventStart >= tenDaysAgo) {
          categorized.recent.push(event);
        } else if (eventStart > eighteenHoursFromNow) {
          categorized.future.push(event);
        }
      });

      setEvents(categorized);
    } catch (error) {
      console.error('Error fetching events:', error);
    } finally {
      setLoading(false);
    }
  };

  const toggleEventExpanded = (eventId) => {
    setExpandedEvent(expandedEvent === eventId ? null : eventId);
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      timeZoneName: 'short',
    });
  };

  const EventCard = ({ event, category }) => {
    const isExpanded = expandedEvent === event.id;
    const isActive = category === 'active';
    const isPast = category === 'recent';

    return (
      <Card
        size="2"
        style={{
          marginBottom: '12px',
          backgroundColor: isActive ? 'var(--accent-2)' : undefined,
          opacity: isPast ? 0.8 : 1,
        }}
      >
        <Box
          onClick={() => toggleEventExpanded(event.id)}
          style={{ cursor: 'pointer' }}
        >
          <Flex justify="between" align="center">
            <Box style={{ flex: 1 }}>
              <Flex align="center" gap="2" mb="1">
                <Text size="3" weight="bold">
                  {event.name}
                </Text>
                {isActive && (
                  <Badge color="red" variant="solid">
                    LIVE
                  </Badge>
                )}
              </Flex>
              <Text size="2" color="gray">
                {formatDate(event.event_start_datetime)}
              </Text>
              <Text size="2" color="gray">
                {event.venue || event.location}
              </Text>
              {event.cities && (
                <Text size="2" color="gray">
                  {event.cities.name}, {event.cities.state || event.cities.country}
                </Text>
              )}
            </Box>
            <Box>
              {isExpanded ? <ChevronUpIcon /> : <ChevronDownIcon />}
            </Box>
          </Flex>
        </Box>

        {isExpanded && (
          <>
            <Separator size="4" my="3" />
            <Box>
              <Flex direction="column" gap="2">
                <Text size="2">
                  <strong>Event ID:</strong> {event.eid}
                </Text>
                {event.enable_auction && (
                  <Badge color="green" variant="soft">
                    Auction Enabled
                  </Badge>
                )}
                {event.vote_by_link && (
                  <Badge color="blue" variant="soft">
                    Link Voting
                  </Badge>
                )}
              </Flex>
              <Button
                size="3"
                variant="solid"
                style={{ width: '100%', marginTop: '16px' }}
                onClick={(e) => {
                  e.stopPropagation();
                  navigate(`/event/${event.id}`);
                }}
              >
                Open Event
              </Button>
            </Box>
          </>
        )}
      </Card>
    );
  };

  return (
    <Container size="1" style={{ padding: '0', maxWidth: '480px' }}>
      <Box
        style={{
          position: 'sticky',
          top: 0,
          backgroundColor: 'var(--color-background)',
          zIndex: 10,
          borderBottom: '1px solid var(--gray-4)',
          padding: '16px',
        }}
      >
        <Heading size="7" align="center" style={{ color: 'var(--accent-9)' }}>
          ART BATTLE VOTE
        </Heading>
      </Box>

      <ScrollArea style={{ height: 'calc(100vh - 80px)' }}>
        <Box p="4">
          {loading ? (
            <Flex direction="column" gap="3">
              <Skeleton height="100px" />
              <Skeleton height="100px" />
              <Skeleton height="100px" />
            </Flex>
          ) : (
            <>
              {/* Active Events */}
              {events.active.length > 0 && (
                <Box mb="5">
                  <Heading size="4" mb="3" color="red">
                    Active Events
                  </Heading>
                  {events.active.map((event) => (
                    <EventCard key={event.id} event={event} category="active" />
                  ))}
                </Box>
              )}

              {/* Recent Events */}
              {events.recent.length > 0 && (
                <Box mb="5">
                  <Heading size="4" mb="3" color="gray">
                    Recent Events
                  </Heading>
                  {events.recent.map((event) => (
                    <EventCard key={event.id} event={event} category="recent" />
                  ))}
                </Box>
              )}

              {/* Future Events */}
              {events.future.length > 0 && (
                <Box mb="5">
                  <Heading size="4" mb="3">
                    Upcoming Events
                  </Heading>
                  {events.future.map((event) => (
                    <EventCard key={event.id} event={event} category="future" />
                  ))}
                </Box>
              )}

              {/* No events message */}
              {events.active.length === 0 &&
                events.recent.length === 0 &&
                events.future.length === 0 && (
                  <Text size="3" color="gray" align="center">
                    No events found
                  </Text>
                )}
            </>
          )}
        </Box>
      </ScrollArea>
    </Container>
  );
};

export default EventList;
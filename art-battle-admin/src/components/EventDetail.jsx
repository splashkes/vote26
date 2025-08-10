import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import {
  Box,
  Heading,
  Card,
  Flex,
  Text,
  Badge,
  Tabs,
  Button,
  Spinner
} from '@radix-ui/themes';
import { supabase } from '../lib/supabase';
import { DebugField, DebugObjectViewer } from './DebugComponents';
import { debugObject } from '../lib/debugHelpers';

const EventDetail = () => {
  const { eventId } = useParams();
  const [event, setEvent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (eventId) {
      fetchEventDetail();
    }
  }, [eventId]);

  const fetchEventDetail = async () => {
    try {
      setLoading(true);
      setError(null);

      const { data, error: fetchError } = await supabase
        .from('events')
        .select(`
          *,
          cities(id, name, country_id),
          countries(id, name, code),
          event_admins(id, level, email),
          rounds(
            id,
            round_number,
            round_contestants(
              id, 
              easel_number,
              artist_profiles(id, name, instagram)
            )
          )
        `)
        .eq('id', eventId)
        .single();

      if (fetchError) {
        console.error('Error fetching event detail:', fetchError);
        setError(fetchError.message);
        return;
      }

      debugObject(data, 'Event Detail Data');
      setEvent(data);
    } catch (err) {
      console.error('Error in fetchEventDetail:', err);
      setError('Failed to load event details');
    } finally {
      setLoading(false);
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

  if (error) {
    return (
      <Box p="4">
        <Card>
          <Box p="4">
            <Text color="red">Error: {error}</Text>
          </Box>
        </Card>
      </Box>
    );
  }

  if (!event) {
    return (
      <Box p="4">
        <Card>
          <Box p="4">
            <Text>Event not found</Text>
          </Box>
        </Card>
      </Box>
    );
  }

  const getEventStatus = () => {
    if (!event.enabled) return { color: 'red', label: 'Disabled' };
    
    const now = new Date();
    const startTime = new Date(event.event_start_datetime);
    const endTime = new Date(event.event_end_datetime);
    
    if (now < startTime) return { color: 'blue', label: 'Upcoming' };
    if (now > endTime) return { color: 'gray', label: 'Completed' };
    return { color: 'green', label: 'Active' };
  };

  const status = getEventStatus();

  return (
    <Box p="4">
      <Flex direction="column" gap="4">
        {/* Header */}
        <Flex justify="between" align="start">
          <Box>
            <Flex align="center" gap="3" mb="2">
              <Heading size="6">
                <DebugField 
                  value={event.name} 
                  fieldName="event.name"
                  fallback="Unnamed Event"
                />
              </Heading>
              <Badge color={status.color}>{status.label}</Badge>
            </Flex>
            <Text color="gray" size="2">
              <DebugField 
                value={event.eid} 
                fieldName="event.eid"
                fallback="No EID"
              />
              {' • '}
              <DebugField 
                value={event.venue} 
                fieldName="event.venue"
                fallback="No venue"
              />
            </Text>
          </Box>
          <Button>
            Edit Event
          </Button>
        </Flex>

        {/* Event Info Cards */}
        <div className="card-grid card-grid-3">
          <Card>
            <Box p="3">
              <Text size="2" weight="medium" mb="2" style={{ display: 'block' }}>
                Basic Info
              </Text>
              <Flex direction="column" gap="2">
                <Text size="2">
                  <strong>EID:</strong> <DebugField value={event.eid} fieldName="event.eid" />
                </Text>
                <Text size="2">
                  <strong>Venue:</strong> <DebugField value={event.venue} fieldName="event.venue" />
                </Text>
                <Text size="2">
                  <strong>Current Round:</strong> <DebugField value={event.current_round} fieldName="event.current_round" />
                </Text>
                <Text size="2">
                  <strong>Enabled:</strong> {event.enabled ? 'Yes' : 'No'}
                </Text>
              </Flex>
            </Box>
          </Card>

          <Card>
            <Box p="3">
              <Text size="2" weight="medium" mb="2" style={{ display: 'block' }}>
                Date & Time
              </Text>
              <Flex direction="column" gap="2">
                <Text size="2">
                  <strong>Start:</strong>{' '}
                  <DebugField 
                    value={event.event_start_datetime ? new Date(event.event_start_datetime).toLocaleString() : null} 
                    fieldName="event.event_start_datetime" 
                  />
                </Text>
                <Text size="2">
                  <strong>End:</strong>{' '}
                  <DebugField 
                    value={event.event_end_datetime ? new Date(event.event_end_datetime).toLocaleString() : null} 
                    fieldName="event.event_end_datetime" 
                  />
                </Text>
                <Text size="2">
                  <strong>Timezone:</strong>{' '}
                  <DebugField 
                    value={event.timezone_icann} 
                    fieldName="event.timezone_icann" 
                  />
                </Text>
              </Flex>
            </Box>
          </Card>

          <Card>
            <Box p="3">
              <Text size="2" weight="medium" mb="2" style={{ display: 'block' }}>
                Location
              </Text>
              <Flex direction="column" gap="2">
                <Text size="2">
                  <strong>City:</strong>{' '}
                  <DebugField 
                    value={event.cities?.name} 
                    fieldName="cities.name" 
                  />
                </Text>
                <Text size="2">
                  <strong>Country:</strong>{' '}
                  <DebugField 
                    value={event.countries?.name} 
                    fieldName="countries.name" 
                  />
                </Text>
              </Flex>
            </Box>
          </Card>
        </div>

        {/* Tabs for different sections */}
        <Card>
          <Tabs.Root defaultValue="contestants">
            <Tabs.List>
              <Tabs.Trigger value="contestants">Contestants</Tabs.Trigger>
              <Tabs.Trigger value="admins">Admins</Tabs.Trigger>
              <Tabs.Trigger value="settings">Settings</Tabs.Trigger>
              <Tabs.Trigger value="debug">Debug</Tabs.Trigger>
            </Tabs.List>

            <Box p="3">
              <Tabs.Content value="contestants">
                <Text size="3" weight="medium" mb="3" style={{ display: 'block' }}>
                  Round Contestants
                </Text>
                {event.rounds?.length > 0 ? (
                  <div className="card-grid card-grid-2">
                    {event.rounds.map((round) => 
                      round.round_contestants?.map((contestant) => (
                        <Card key={contestant.id}>
                          <Box p="3">
                            <Text size="2" weight="medium" mb="2" style={{ display: 'block' }}>
                              Round {round.round_number} - Easel {contestant.easel_number}
                            </Text>
                            <Text size="2">
                              Artist: <DebugField 
                                value={contestant.artist_profiles?.name} 
                                fieldName="artist_profiles.name" 
                              />
                            </Text>
                          </Box>
                        </Card>
                      )) || []
                    )}
                  </div>
                ) : (
                  <Text color="gray">No contestants assigned yet</Text>
                )}
              </Tabs.Content>

              <Tabs.Content value="admins">
                <Text size="3" weight="medium" mb="3" style={{ display: 'block' }}>
                  Event Admins
                </Text>
                {event.event_admins?.length > 0 ? (
                  <Flex direction="column" gap="2">
                    {event.event_admins.map((admin) => (
                      <Card key={admin.id}>
                        <Box p="3">
                          <Flex justify="between" align="center">
                            <Text size="2">
                              <DebugField 
                                value={admin.email} 
                                fieldName="admin.email" 
                              />
                            </Text>
                            <Badge>
                              <DebugField 
                                value={admin.level} 
                                fieldName="admin.level" 
                              />
                            </Badge>
                          </Flex>
                        </Box>
                      </Card>
                    ))}
                  </Flex>
                ) : (
                  <Text color="gray">No admins assigned</Text>
                )}
              </Tabs.Content>

              <Tabs.Content value="settings">
                <Text size="3" weight="medium" mb="3" style={{ display: 'block' }}>
                  Event Settings
                </Text>
                <Flex direction="column" gap="3">
                  <Text size="2">
                    <strong>Show in App:</strong> {event.show_in_app ? 'Yes' : 'No'}
                  </Text>
                  <Text size="2">
                    <strong>Enable Auction:</strong> {event.enable_auction ? 'Yes' : 'No'}
                  </Text>
                  <Text size="2">
                    <strong>Vote by Link:</strong> {event.vote_by_link ? 'Yes' : 'No'}
                  </Text>
                  <Text size="2">
                    <strong>Email Registration:</strong> {event.email_registration ? 'Yes' : 'No'}
                  </Text>
                </Flex>
              </Tabs.Content>

              <Tabs.Content value="debug">
                <DebugObjectViewer obj={event} label="Full Event Object" />
              </Tabs.Content>
            </Box>
          </Tabs.Root>
        </Card>
      </Flex>
    </Box>
  );
};

export default EventDetail;
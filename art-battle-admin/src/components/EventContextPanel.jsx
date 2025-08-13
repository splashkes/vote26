import { useState, useEffect, useMemo } from 'react';
import {
  Box,
  Flex,
  Text,
  Card,
  Badge,
  Button,
  Separator,
  Progress,
  ScrollArea
} from '@radix-ui/themes';
import {
  CalendarIcon,
  PersonIcon,
  ImageIcon,
  TimerIcon,
  BarChartIcon,
  GearIcon,
  ExternalLinkIcon,
  HeartFilledIcon,
  CheckCircledIcon,
  CrossCircledIcon,
  ExclamationTriangleIcon
} from '@radix-ui/react-icons';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { DebugField } from './DebugComponents';

const EventContextPanel = ({ selectedEventId }) => {
  const { user, hasEventAccess } = useAuth();
  const [eventDetails, setEventDetails] = useState(null);
  const [eventStats, setEventStats] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Load detailed event data
  useEffect(() => {
    if (!selectedEventId) {
      setEventDetails(null);
      setEventStats(null);
      return;
    }

    loadEventDetails();
  }, [selectedEventId]);

  const loadEventDetails = async () => {
    try {
      setLoading(true);
      setError(null);

      // Load basic event details
      const { data: event, error: eventError } = await supabase
        .from('events')
        .select(`
          *,
          cities(name, country_id),
          countries(name, code)
        `)
        .eq('id', selectedEventId)
        .single();

      if (eventError) throw eventError;

      setEventDetails(event);

      // Load event statistics (placeholder queries - implement based on your schema)
      // This would typically load registration counts, artist counts, artwork counts, etc.
      const stats = {
        registrations: 0,
        artists: 0,
        artworks: 0,
        votes: 0,
        // These would come from actual database queries
      };

      setEventStats(stats);

    } catch (err) {
      console.error('Error loading event details:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Calculate event status and progress
  const eventAnalysis = useMemo(() => {
    if (!eventDetails) return null;

    const now = new Date();
    const startTime = new Date(eventDetails.event_start_datetime);
    const endTime = new Date(eventDetails.event_end_datetime);
    
    let status = 'draft';
    let progress = 0;
    let timeUntilStart = null;
    let duration = null;

    if (eventDetails.enabled) {
      if (now < startTime) {
        status = 'upcoming';
        timeUntilStart = Math.ceil((startTime - now) / (1000 * 60 * 60 * 24));
      } else if (now > endTime) {
        status = 'completed';
        progress = 100;
      } else {
        status = 'live';
        const totalDuration = endTime - startTime;
        const elapsed = now - startTime;
        progress = Math.min(100, Math.max(0, (elapsed / totalDuration) * 100));
      }
    }

    if (startTime && endTime) {
      duration = Math.round((endTime - startTime) / (1000 * 60 * 60)); // hours
    }

    return {
      status,
      progress,
      timeUntilStart,
      duration,
      startTime,
      endTime
    };
  }, [eventDetails]);

  // Get status configuration
  const getStatusConfig = (status) => {
    const configs = {
      live: { 
        color: 'green', 
        label: 'Live Event', 
        icon: CheckCircledIcon,
        description: 'Event is currently active'
      },
      upcoming: { 
        color: 'blue', 
        label: 'Upcoming', 
        icon: TimerIcon,
        description: 'Event scheduled for future'
      },
      completed: { 
        color: 'gray', 
        label: 'Completed', 
        icon: CheckCircledIcon,
        description: 'Event has ended'
      },
      draft: { 
        color: 'orange', 
        label: 'Draft', 
        icon: ExclamationTriangleIcon,
        description: 'Event in preparation'
      }
    };
    
    return configs[status] || configs.draft;
  };

  // Quick actions based on user permissions and event status
  const getQuickActions = () => {
    if (!eventDetails || !hasEventAccess) return [];

    const actions = [];
    const status = eventAnalysis?.status;

    // Always available actions
    actions.push({
      label: 'Edit Event',
      icon: GearIcon,
      action: () => console.log('Navigate to edit'),
      variant: 'soft'
    });

    // Status-specific actions
    if (status === 'upcoming' || status === 'draft') {
      actions.push({
        label: 'Manage Artists',
        icon: PersonIcon,
        action: () => console.log('Navigate to artists'),
        variant: 'soft'
      });
    }

    if (status === 'live') {
      actions.push({
        label: 'Live Monitor',
        icon: BarChartIcon,
        action: () => console.log('Navigate to live monitor'),
        variant: 'solid',
        color: 'green'
      });
    }

    if (status === 'completed') {
      actions.push({
        label: 'View Results',
        icon: BarChartIcon,
        action: () => console.log('Navigate to results'),
        variant: 'soft'
      });
    }

    return actions;
  };

  if (!selectedEventId) {
    return (
      <Box p="4">
        <Flex direction="column" align="center" justify="center" style={{ height: '200px' }}>
          <Text size="3" color="gray" mb="2">No Event Selected</Text>
          <Text size="2" color="gray" style={{ textAlign: 'center' }}>
            Search for and select an event to view details and quick actions
          </Text>
        </Flex>
      </Box>
    );
  }

  if (loading) {
    return (
      <Box p="4">
        <Flex direction="column" gap="3">
          <Text size="3" weight="bold">Loading Event Details...</Text>
          <Box style={{ height: '200px' }} />
        </Flex>
      </Box>
    );
  }

  if (error) {
    return (
      <Box p="4">
        <Card style={{ borderColor: 'var(--red-6)' }}>
          <Box p="3">
            <Flex align="center" gap="2" mb="2">
              <ExclamationTriangleIcon color="var(--red-9)" />
              <Text size="2" color="red" weight="medium">Error Loading Event</Text>
            </Flex>
            <Text size="1" color="gray">{error}</Text>
            <Button size="1" variant="soft" mt="2" onClick={loadEventDetails}>
              Retry
            </Button>
          </Box>
        </Card>
      </Box>
    );
  }

  if (!eventDetails) {
    return (
      <Box p="4">
        <Text size="2" color="gray">Event not found or access denied</Text>
      </Box>
    );
  }

  const statusConfig = getStatusConfig(eventAnalysis?.status);
  const quickActions = getQuickActions();
  const StatusIcon = statusConfig.icon;

  return (
    <ScrollArea style={{ height: '100%' }}>
      <Box p="4">
        <Flex direction="column" gap="4">
          {/* Event Header */}
          <Box>
            <Flex align="center" gap="2" mb="2">
              <StatusIcon color={`var(--${statusConfig.color}-9)`} />
              <Badge color={statusConfig.color} size="1">
                {statusConfig.label}
              </Badge>
            </Flex>
            
            <Text size="4" weight="bold" mb="1" style={{ display: 'block' }}>
              <DebugField 
                value={eventDetails.name} 
                fieldName="event.name"
                fallback="Unnamed Event"
              />
            </Text>
            
            <Text size="2" color="gray">
              <DebugField 
                value={eventDetails.eid} 
                fieldName="event.eid"
                fallback="No EID"
              />
            </Text>
            
            <Text size="1" color="gray" mt="1">
              {statusConfig.description}
            </Text>
          </Box>

          <Separator />

          {/* Event Progress */}
          {eventAnalysis?.status === 'live' && (
            <Box>
              <Flex justify="between" align="center" mb="2">
                <Text size="2" weight="medium">Event Progress</Text>
                <Text size="1" color="gray">{Math.round(eventAnalysis.progress)}%</Text>
              </Flex>
              <Progress value={eventAnalysis.progress} color="green" />
            </Box>
          )}

          {/* Key Details */}
          <Card>
            <Box p="3">
              <Text size="2" weight="medium" mb="3" style={{ display: 'block' }}>
                Event Details
              </Text>
              
              <Flex direction="column" gap="3">
                <Flex align="center" gap="2">
                  <CalendarIcon size={14} />
                  <Box>
                    <Text size="1" color="gray" style={{ display: 'block' }}>Start Date</Text>
                    <Text size="2">
                      {eventDetails.event_start_datetime 
                        ? new Date(eventDetails.event_start_datetime).toLocaleString()
                        : 'Not set'
                      }
                    </Text>
                  </Box>
                </Flex>

                <Flex align="center" gap="2">
                  <PersonIcon size={14} />
                  <Box>
                    <Text size="1" color="gray" style={{ display: 'block' }}>Venue</Text>
                    <Text size="2">
                      <DebugField 
                        value={eventDetails.venue} 
                        fieldName="event.venue"
                        fallback="No venue set"
                      />
                    </Text>
                  </Box>
                </Flex>

                <Flex align="center" gap="2">
                  <ImageIcon size={14} />
                  <Box>
                    <Text size="1" color="gray" style={{ display: 'block' }}>Current Round</Text>
                    <Text size="2">
                      Round {eventDetails.current_round || 0}
                    </Text>
                  </Box>
                </Flex>

                {eventAnalysis?.timeUntilStart && (
                  <Flex align="center" gap="2">
                    <TimerIcon size={14} />
                    <Box>
                      <Text size="1" color="gray" style={{ display: 'block' }}>Time Until Start</Text>
                      <Text size="2">
                        {eventAnalysis.timeUntilStart} day{eventAnalysis.timeUntilStart !== 1 ? 's' : ''}
                      </Text>
                    </Box>
                  </Flex>
                )}
              </Flex>
            </Box>
          </Card>

          {/* Event Statistics */}
          {eventStats && (
            <Card>
              <Box p="3">
                <Text size="2" weight="medium" mb="3" style={{ display: 'block' }}>
                  Event Statistics
                </Text>
                <Flex direction="column" gap="2">
                  <Flex justify="between">
                    <Text size="1" color="gray">Registrations</Text>
                    <Text size="2" weight="medium">{eventStats.registrations}</Text>
                  </Flex>
                  <Flex justify="between">
                    <Text size="1" color="gray">Artists</Text>
                    <Text size="2" weight="medium">{eventStats.artists}</Text>
                  </Flex>
                  <Flex justify="between">
                    <Text size="1" color="gray">Artworks</Text>
                    <Text size="2" weight="medium">{eventStats.artworks}</Text>
                  </Flex>
                  <Flex justify="between">
                    <Text size="1" color="gray">Total Votes</Text>
                    <Text size="2" weight="medium">{eventStats.votes}</Text>
                  </Flex>
                </Flex>
              </Box>
            </Card>
          )}

          {/* Quick Actions */}
          {quickActions.length > 0 && (
            <>
              <Separator />
              <Box>
                <Text size="2" weight="medium" mb="3" style={{ display: 'block' }}>
                  Quick Actions
                </Text>
                <Flex direction="column" gap="2">
                  {quickActions.map((action, index) => {
                    const ActionIcon = action.icon;
                    return (
                      <Button
                        key={index}
                        variant={action.variant || 'soft'}
                        color={action.color}
                        size="2"
                        onClick={action.action}
                        style={{ justifyContent: 'flex-start' }}
                      >
                        <ActionIcon height="16" width="16" />
                        {action.label}
                      </Button>
                    );
                  })}
                </Flex>
              </Box>
            </>
          )}

          {/* Location Info */}
          {(eventDetails.cities || eventDetails.countries) && (
            <Card>
              <Box p="3">
                <Text size="2" weight="medium" mb="2" style={{ display: 'block' }}>
                  Location
                </Text>
                <Text size="2">
                  {eventDetails.cities?.name && (
                    <DebugField 
                      value={eventDetails.cities.name} 
                      fieldName="cities.name"
                    />
                  )}
                  {eventDetails.countries?.name && (
                    <>
                      {eventDetails.cities?.name && ', '}
                      <DebugField 
                        value={eventDetails.countries.name} 
                        fieldName="countries.name"
                      />
                    </>
                  )}
                </Text>
              </Box>
            </Card>
          )}
        </Flex>
      </Box>
    </ScrollArea>
  );
};

export default EventContextPanel;
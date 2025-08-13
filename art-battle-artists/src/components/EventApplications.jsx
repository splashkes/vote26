import { useState, useEffect } from 'react';
import {
  Box,
  Heading,
  Card,
  Flex,
  Text,
  Button,
  Badge,
  Skeleton,
  Callout,
  IconButton,
  Grid,
} from '@radix-ui/themes';
import { 
  CalendarIcon, 
  PersonIcon, 
  CheckCircledIcon, 
  CrossCircledIcon,
  Cross2Icon,
  PlusIcon,
  InfoCircledIcon
} from '@radix-ui/react-icons';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import AuthModal from './AuthModal';

const EventApplications = () => {
  const [events, setEvents] = useState([]);
  const [applications, setApplications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [applying, setApplying] = useState({});
  const [removing, setRemoving] = useState({});
  const [error, setError] = useState('');
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [artistProfileId, setArtistProfileId] = useState(null);
  
  const { user, person, loading: authLoading } = useAuth();

  useEffect(() => {
    if (!authLoading && user && person) {
      fetchArtistProfile();
    } else if (!authLoading && !user) {
      setLoading(false);
    }
  }, [user, person, authLoading]);

  useEffect(() => {
    if (artistProfileId) {
      fetchEvents();
      fetchApplications();
    }
  }, [artistProfileId]);

  const fetchArtistProfile = async () => {
    try {
      // Use the new primary profile system
      const { data: primaryCheck, error: primaryError } = await supabase
        .rpc('has_primary_profile', { target_person_id: person.id });

      if (primaryError) {
        throw primaryError;
      }

      if (!primaryCheck || primaryCheck.length === 0) {
        setError('No primary profile found. Please set up your profile first.');
        setLoading(false);
        return;
      }

      const result = primaryCheck[0];
      if (!result.has_primary || !result.profile_id) {
        setError('No primary profile found. Please set up your profile first.');
        setLoading(false);
        return;
      }

      setArtistProfileId(result.profile_id);
    } catch (err) {
      setError('Failed to load artist profile: ' + err.message);
    }
  };

  const fetchEvents = async () => {
    try {
      const now = new Date();
      
      // Get upcoming events (from now onwards)
      const { data, error } = await supabase
        .from('events')
        .select(`
          id,
          eid,
          name,
          event_start_datetime,
          event_end_datetime,
          venue,
          city:cities(name),
          description
        `)
        .eq('enabled', true)
        .eq('show_in_app', true)
        .gte('event_start_datetime', now.toISOString())
        .order('event_start_datetime', { ascending: true });

      if (error) throw error;
      
      setEvents(data || []);
    } catch (err) {
      setError('Failed to load events: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchApplications = async () => {
    if (!artistProfileId) return;

    try {
      const { data, error } = await supabase
        .from('artist_applications')
        .select('*')
        .eq('artist_profile_id', artistProfileId);

      if (error) throw error;
      
      setApplications(data || []);
    } catch (err) {
      console.error('Failed to load applications:', err.message);
    }
  };

  const handleApply = async (eventId) => {
    if (!artistProfileId) {
      setError('Please complete your artist profile first.');
      return;
    }

    setApplying(prev => ({ ...prev, [eventId]: true }));
    setError('');

    try {
      const { error } = await supabase
        .from('artist_applications')
        .insert({
          artist_profile_id: artistProfileId,
          event_id: eventId,
          application_status: 'pending',
          metadata: {
            applied_via: 'artist_portal',
            applied_at: new Date().toISOString()
          }
        });

      if (error) throw error;

      await fetchApplications();
    } catch (err) {
      if (err.code === '23505') {
        setError('You have already applied to this event.');
      } else {
        setError('Failed to apply: ' + err.message);
      }
    } finally {
      setApplying(prev => ({ ...prev, [eventId]: false }));
    }
  };

  const handleRemoveApplication = async (eventId) => {
    if (!artistProfileId) return;

    setRemoving(prev => ({ ...prev, [eventId]: true }));
    setError('');

    try {
      const { error } = await supabase
        .from('artist_applications')
        .delete()
        .eq('artist_profile_id', artistProfileId)
        .eq('event_id', eventId);

      if (error) throw error;

      await fetchApplications();
    } catch (err) {
      setError('Failed to remove application: ' + err.message);
    } finally {
      setRemoving(prev => ({ ...prev, [eventId]: false }));
    }
  };

  const handleAcceptInvitation = async (eventId) => {
    if (!artistProfileId) return;

    setApplying(prev => ({ ...prev, [eventId]: true }));
    setError('');

    try {
      const { error } = await supabase
        .from('artist_applications')
        .update({
          application_status: 'accepted',
          metadata: {
            ...applications.find(app => app.event_id === eventId)?.metadata,
            accepted_invitation_at: new Date().toISOString()
          }
        })
        .eq('artist_profile_id', artistProfileId)
        .eq('event_id', eventId);

      if (error) throw error;

      await fetchApplications();
    } catch (err) {
      setError('Failed to accept invitation: ' + err.message);
    } finally {
      setApplying(prev => ({ ...prev, [eventId]: false }));
    }
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    });
  };

  const getApplicationForEvent = (eventId) => {
    return applications.find(app => app.event_id === eventId);
  };

  const getStatusBadge = (status) => {
    const statusConfig = {
      invited: { color: 'crimson', text: 'INVITED' },
      pending: { color: 'yellow', text: 'Pending' },
      accepted: { color: 'green', text: 'Accepted' },
      rejected: { color: 'red', text: 'Rejected' },
      withdrawn: { color: 'gray', text: 'Withdrawn' }
    };

    const config = statusConfig[status] || statusConfig.pending;
    return (
      <Badge color={config.color} variant="solid">
        {config.text}
      </Badge>
    );
  };

  if (authLoading || loading) {
    return (
      <Box>
        <Heading size="6" mb="4">Apply to Events</Heading>
        <Flex direction="column" gap="4">
          {[1, 2, 3].map((i) => (
            <Card key={i} size="3">
              <Skeleton height="60px" />
            </Card>
          ))}
        </Flex>
      </Box>
    );
  }

  if (!user) {
    return (
      <>
        <Card size="3">
          <Flex direction="column" gap="4" align="center">
            <PersonIcon width="48" height="48" />
            <Heading size="6">Event Applications</Heading>
            <Text size="3" color="gray" align="center">
              Sign in to apply for upcoming Art Battle events
            </Text>
            <Button size="3" onClick={() => setShowAuthModal(true)}>
              Sign In / Sign Up
            </Button>
          </Flex>
        </Card>
        <AuthModal 
          open={showAuthModal} 
          onOpenChange={setShowAuthModal}
        />
      </>
    );
  }

  return (
    <Box>
      <Flex direction="column" gap="2" mb="6">
        <Heading size="6">Apply to Events</Heading>
        <Text size="3" color="gray">
          Browse upcoming Art Battle events and submit your applications
        </Text>
      </Flex>

      {error && (
        <Callout.Root color="red" mb="4">
          <Callout.Icon>
            <InfoCircledIcon />
          </Callout.Icon>
          <Callout.Text>{error}</Callout.Text>
        </Callout.Root>
      )}

      <Flex direction="column" gap="4">
        {events.length === 0 ? (
          <Card size="3">
            <Flex direction="column" align="center" gap="3" py="6">
              <CalendarIcon width="48" height="48" />
              <Text size="3" color="gray">
                No upcoming events available
              </Text>
            </Flex>
          </Card>
        ) : (
          events.map((event) => {
            const application = getApplicationForEvent(event.id);
            const hasApplied = !!application;
            const isApplying = applying[event.id];
            const isRemoving = removing[event.id];

            return (
              <Card key={event.id} size="3">
                <Flex direction="column" gap="3">
                  <Flex justify="between" align="start">
                    <Box style={{ flex: 1 }}>
                      <Flex align="center" gap="2" mb="2">
                        <Text size="5" weight="bold">
                          {event.name}
                        </Text>
                        {hasApplied && getStatusBadge(application.application_status)}
                      </Flex>
                      
                      <Flex direction="column" gap="1" mb="3">
                        <Text size="3" color="gray">
                          📅 {formatDate(event.event_start_datetime)}
                        </Text>
                        {event.venue && (
                          <Text size="3" color="gray">
                            📍 {event.venue}
                            {event.city?.name && ` • ${event.city.name}`}
                          </Text>
                        )}
                      </Flex>

                      {event.description && (
                        <Text size="2" color="gray" style={{ 
                          display: '-webkit-box',
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: 'vertical',
                          overflow: 'hidden'
                        }}>
                          {event.description}
                        </Text>
                      )}
                    </Box>

                    <Flex gap="2" align="center">
                      {!hasApplied && (
                        <Button
                          size="2"
                          variant="solid"
                          color="crimson"
                          disabled={isApplying || !artistProfileId}
                          loading={isApplying}
                          onClick={() => handleApply(event.id)}
                        >
                          <PlusIcon width="16" height="16" />
                          Apply
                        </Button>
                      )}
                    </Flex>
                  </Flex>

                  {hasApplied && application.application_status === 'pending' && (
                    <Flex align="center" gap="2">
                      <Callout.Root color="blue" size="1">
                        <Callout.Icon>
                          <InfoCircledIcon />
                        </Callout.Icon>
                        <Callout.Text>
                          Application Submitted {application.applied_at && `• ${new Date(application.applied_at).toLocaleDateString()}`}
                        </Callout.Text>
                      </Callout.Root>
                      <IconButton
                        size="1"
                        color="red"
                        variant="soft"
                        disabled={isRemoving}
                        onClick={() => handleRemoveApplication(event.id)}
                      >
                        <Cross2Icon width="12" height="12" />
                      </IconButton>
                    </Flex>
                  )}

                  {hasApplied && application.application_status === 'accepted' && (
                    <Callout.Root color="green" size="1">
                      <Callout.Icon>
                        <CheckCircledIcon />
                      </Callout.Icon>
                      <Callout.Text>
                        Congratulations! Your application has been accepted.
                      </Callout.Text>
                    </Callout.Root>
                  )}

                  {hasApplied && application.application_status === 'invited' && (
                    <Flex direction="column" gap="3">
                      <Callout.Root color="crimson" size="1">
                        <Callout.Icon>
                          <CheckCircledIcon />
                        </Callout.Icon>
                        <Callout.Text>
                          🎉 Congratulations! You have been invited to participate in this event.
                        </Callout.Text>
                      </Callout.Root>
                      <Button
                        size="3"
                        variant="solid"
                        color="crimson"
                        disabled={isApplying}
                        loading={isApplying}
                        onClick={() => handleAcceptInvitation(event.id)}
                        style={{ 
                          fontSize: '14px',
                          fontWeight: 'bold',
                          textTransform: 'uppercase'
                        }}
                      >
                        <CheckCircledIcon width="16" height="16" />
                        Click to Accept and Confirm Attendance
                      </Button>
                    </Flex>
                  )}

                  {hasApplied && application.application_status === 'rejected' && (
                    <Callout.Root color="red" size="1">
                      <Callout.Icon>
                        <CrossCircledIcon />
                      </Callout.Icon>
                      <Callout.Text>
                        Your application was not selected for this event.
                      </Callout.Text>
                    </Callout.Root>
                  )}
                </Flex>
              </Card>
            );
          })
        )}
      </Flex>
    </Box>
  );
};

export default EventApplications;
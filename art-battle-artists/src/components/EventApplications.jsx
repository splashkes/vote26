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
  Dialog,
  TextArea,
  Separator,
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
import InvitationAcceptanceModal from './InvitationAcceptanceModal';

const EventApplications = () => {
  const [events, setEvents] = useState([]);
  const [applications, setApplications] = useState([]);
  const [invitations, setInvitations] = useState([]);
  const [confirmations, setConfirmations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [applying, setApplying] = useState({});
  const [removing, setRemoving] = useState({});
  const [error, setError] = useState('');
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [artistProfileId, setArtistProfileId] = useState(null);
  const [artistProfile, setArtistProfile] = useState(null);
  
  // Modal states
  const [showApplicationModal, setShowApplicationModal] = useState(false);
  const [showInvitationModal, setShowInvitationModal] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [selectedInvitation, setSelectedInvitation] = useState(null);
  const [applicationMessage, setApplicationMessage] = useState('');
  
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
      fetchArtistData();
      fetchAllEvents();
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

      // Also fetch the full artist profile data
      const { data: profileData, error: profileError } = await supabase
        .from('artist_profiles')
        .select('*')
        .eq('id', result.profile_id)
        .single();

      if (profileError) {
        throw profileError;
      }

      setArtistProfile(profileData);
    } catch (err) {
      setError('Failed to load artist profile: ' + err.message);
    }
  };

  // Fetch artist-specific data (applications, invitations, confirmations) from edge function
  // This ensures consistent filtering logic for future events and non-withdrawn items
  const fetchArtistData = async () => {
    if (!artistProfileId) return;

    try {
      const { data, error } = await supabase.functions.invoke('get-artist-profile-data', {
        body: { artist_profile_id: artistProfileId }
      });

      if (error) throw error;
      if (!data.success) throw new Error(data.error || 'Failed to load artist data');

      // Set data from edge function (already filtered for future events)
      setApplications(data.data.applications || []);
      setInvitations(data.data.invitations || []);
      setConfirmations(data.data.confirmations || []);
    } catch (err) {
      console.error('Failed to load artist data:', err.message);
      setError('Failed to load your event data: ' + err.message);
    }
  };

  // Fetch ALL future events for browsing/applying
  const fetchAllEvents = async () => {
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
          description,
          applications_open
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

  const handleApply = (eventId) => {
    if (!artistProfileId) {
      setError('Please complete your artist profile first.');
      return;
    }

    const event = events.find(e => e.id === eventId);
    setSelectedEvent(event);
    setApplicationMessage('');
    setShowApplicationModal(true);
  };

  const submitApplication = async () => {
    if (!selectedEvent || !artistProfileId) return;

    setApplying(prev => ({ ...prev, [selectedEvent.id]: true }));
    setError('');

    try {
      // Use edge function to submit application (ensures triggers fire)
      const { data, error } = await supabase.functions.invoke('submit-application', {
        body: {
          artist_profile_id: artistProfileId,
          event_id: selectedEvent.id,
          application_message: applicationMessage || null
        }
      });

      if (error) throw error;
      if (!data.success) throw new Error(data.error || 'Failed to submit application');

      await fetchArtistData();
      setShowApplicationModal(false);
      setSelectedEvent(null);
      setApplicationMessage('');
    } catch (err) {
      if (err.code === '23505') {
        setError('You have already applied to this event.');
      } else {
        setError('Failed to apply: ' + err.message);
      }
    } finally {
      setApplying(prev => ({ ...prev, [selectedEvent.id]: false }));
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

      await fetchArtistData();
    } catch (err) {
      setError('Failed to remove application: ' + err.message);
    } finally {
      setRemoving(prev => ({ ...prev, [eventId]: false }));
    }
  };

  const handleAcceptInvitation = (eventId) => {
    const event = events.find(e => e.id === eventId);
    const invitation = invitations.find(inv => inv.event_eid === event?.eid);

    if (!invitation) {
      setError('Invitation not found for this event');
      return;
    }

    // Check if applications are still open for this event
    if (!event.applications_open) {
      setError('Applications for this event are now closed. You cannot accept this invitation.');
      return;
    }

    // Check if already confirmed for this event
    const alreadyConfirmed = confirmations.find(conf => conf.event_eid === event?.eid);
    if (alreadyConfirmed) {
      setError('You have already accepted an invitation for this event!');
      return;
    }

    setSelectedEvent(event);
    setSelectedInvitation(invitation);
    setShowInvitationModal(true);
  };

  const acceptInvitation = async (submissionData) => {
    if (!submissionData) return;

    setApplying(prev => ({ ...prev, [selectedEvent.id]: true }));
    setError('');

    try {
      // Double-check if already confirmed (in case of race condition)
      const alreadyConfirmed = confirmations.find(conf => conf.event_eid === selectedEvent?.eid);
      if (alreadyConfirmed) {
        throw new Error('You have already accepted an invitation for this event!');
      }
      // COMMENTED OUT: Old direct database approach - replaced with Edge Function
      // This direct database insert was causing RLS policy violations and bypassing
      // proper email sending logic. Use accept-invitation Edge Function instead.
      /*
      // Update artist profile with pronouns
      if (submissionData.profileUpdates) {
        const { error: profileUpdateError } = await supabase
          .from('artist_profiles')
          .update(submissionData.profileUpdates)
          .eq('id', submissionData.artistProfileId);

        if (profileUpdateError) throw profileUpdateError;
      }

      // Create comprehensive confirmation entry
      const { error: confirmError } = await supabase
        .from('artist_confirmations')
        .insert({
          artist_profile_id: submissionData.artistProfileId,
          event_eid: submissionData.eventEid,
          artist_number: submissionData.artistNumber,
          confirmation_status: 'confirmed',
          entry_date: new Date().toISOString(),
          form_19_entry_id: null, // Explicitly set to null since this should not be used
          
          // Enhanced confirmation data
          legal_name: submissionData.confirmationData.legalName,
          social_promotion_consent: submissionData.confirmationData.socialPromotionConsent,
          social_usernames: submissionData.confirmationData.socialUsernames,
          message_to_organizers: submissionData.confirmationData.messageToOrganizers,
          public_message: submissionData.confirmationData.publicMessage,
          payment_method: submissionData.confirmationData.paymentMethod,
          payment_details: submissionData.confirmationData.paymentDetails,
          legal_agreements: submissionData.confirmationData.legalAgreements,
          promotion_artwork_url: submissionData.confirmationData.promotionArtworkUrl,
          
          metadata: {
            accepted_invitation_at: new Date().toISOString(),
            original_invitation_id: selectedInvitation?.id,
            accepted_via: 'artist_portal_enhanced'
          }
        });

      if (confirmError) throw confirmError;

      // Update the invitation with accepted_at timestamp to hide it from UI
      try {
        const { error: invitationUpdateError } = await supabase
          .from('artist_invitations')
          .update({
            accepted_at: new Date().toISOString()
          })
          .eq('id', selectedInvitation.id);

        if (invitationUpdateError) {
          console.warn('Failed to update invitation accepted_at:', invitationUpdateError.message);
          // Continue anyway - the confirmation is created, which is the important part
        }
      } catch (invitationError) {
        console.warn('Error updating invitation:', invitationError.message);
      }
      */

      // Call accept-invitation Edge Function
      // This uses service role (bypasses RLS), sends emails, and handles all validation
      const { data, error } = await supabase.functions.invoke('accept-invitation', {
        body: {
          submissionData,
          invitationId: selectedInvitation.id
        }
      });

      if (error) {
        throw new Error(error.message || 'Failed to call accept-invitation function');
      }

      if (!data.success) {
        throw new Error(data.error || 'Unknown error from accept-invitation function');
      }

      await fetchArtistData();

      setShowInvitationModal(false);
      setSelectedEvent(null);
      setSelectedInvitation(null);
    } catch (err) {
      setError('Failed to accept invitation: ' + err.message);
    } finally {
      setApplying(prev => ({ ...prev, [selectedEvent.id]: false }));
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

  const formatDateTime = (dateString) => {
    const date = new Date(dateString);
    const dateStr = date.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    });
    const timeStr = date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
    return `${dateStr} at ${timeStr}`;
  };

  const getApplicationForEvent = (eventId) => {
    return applications.find(app => app.event_id === eventId);
  };

  const getInvitationForEvent = (eventId, eventEid) => {
    return invitations.find(inv => inv.event_eid === eventEid);
  };

  const getConfirmationForEvent = (eventId, eventEid) => {
    return confirmations.find(conf => conf.event_eid === eventEid);
  };

  const getEventStatus = (event) => {
    const application = getApplicationForEvent(event.id);
    const invitation = getInvitationForEvent(event.id, event.eid);
    const confirmation = getConfirmationForEvent(event.id, event.eid);

    if (confirmation) {
      return { type: 'confirmed', data: confirmation };
    }
    if (invitation && invitation.status === 'pending') {
      return { type: 'invited', data: invitation };
    }
    if (application) {
      return { type: 'applied', data: application };
    }
    return { type: 'none', data: null };
  };

  const getStatusBadge = (status) => {
    const statusConfig = {
      invited: { color: 'crimson', text: 'INVITED' },
      pending: { color: 'yellow', text: 'Pending' },
      accepted: { color: 'green', text: 'Accepted' },
      rejected: { color: 'red', text: 'Rejected' },
      withdrawn: { color: 'gray', text: 'Withdrawn' },
      confirmed: { color: 'green', text: 'CONFIRMED' }
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

  // Handle case where user is signed in but has no artist profile
  if (user && !artistProfileId && !loading) {
    return (
      <Box>
        <Flex direction="column" gap="2" mb="6">
          <Heading size="6">Apply to Events</Heading>
          <Text size="3" color="gray">
            Complete your artist profile to start applying to events
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

        <Card size="3">
          <Flex direction="column" gap="4" align="center" py="6">
            <PersonIcon width="48" height="48" />
            <Heading size="5">Complete Your Artist Profile</Heading>
            <Text size="3" color="gray" align="center">
              You need to create an artist profile before you can apply to Art Battle events
            </Text>
            <Button 
              size="3" 
              color="crimson"
              onClick={() => window.location.hash = '#/profile'}
            >
              <PlusIcon width="16" height="16" />
              Create Artist Profile
            </Button>
          </Flex>
        </Card>
      </Box>
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

      {/* Confirmed Events Section */}
      {confirmations.length > 0 && (
        <Box mb="6">
          <Flex direction="column" gap="2" mb="4">
            <Heading size="5">My Confirmed Events</Heading>
            <Text size="3" color="gray">
              Events you are confirmed to participate in
            </Text>
          </Flex>

          <Flex direction="column" gap="4">
            {confirmations.map((confirmation) => {
              // Event data is already embedded in confirmation from edge function
              const event = confirmation.event;

              if (!event) return null;

              return (
                <Card key={confirmation.id} size="3" style={{ border: '2px solid var(--green-9)' }}>
                  <Flex direction="column" gap="3">
                    <Flex justify="between" align="start">
                      <Box style={{ flex: 1 }}>
                        <Flex align="center" gap="2" mb="2">
                          <Text size="5" weight="bold">
                            {event.name}
                          </Text>
                          <Badge color="green" variant="solid">
                            CONFIRMED
                          </Badge>
                        </Flex>

                        <Flex direction="column" gap="1" mb="3">
                          <Text size="3" color="gray">
                            📅 {formatDateTime(event.event_start_datetime)}
                          </Text>
                          {event.venue && (
                            <Text size="3" color="gray">
                              📍 {event.venue}
                              {event.city && ` • ${event.city}`}
                            </Text>
                          )}
                        </Flex>
                      </Box>
                    </Flex>

                    <Callout.Root color="green" size="1">
                      <Callout.Icon>
                        <CheckCircledIcon />
                      </Callout.Icon>
                      <Callout.Text>
                        ✅ You are confirmed for this event! Artist #{confirmation.artist_number}
                      </Callout.Text>
                    </Callout.Root>
                  </Flex>
                </Card>
              );
            })}
          </Flex>
        </Box>
      )}

      <Box>
        <Flex direction="column" gap="2" mb="4">
          <Heading size="5">Available Events</Heading>
          <Text size="3" color="gray">
            Browse and apply to upcoming events
          </Text>
        </Flex>
        
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
            const eventStatus = getEventStatus(event);
            const hasApplied = eventStatus.type === 'applied';
            const hasInvitation = eventStatus.type === 'invited';
            const hasConfirmation = eventStatus.type === 'confirmed';
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
                        {hasApplied && getStatusBadge(eventStatus.data.application_status)}
                        {hasInvitation && getStatusBadge('invited')}
                        {hasConfirmation && getStatusBadge('confirmed')}
                      </Flex>
                      
                      <Flex direction="column" gap="1" mb="3">
                        <Text size="3" color="gray">
                          📅 {formatDateTime(event.event_start_datetime)}
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
                      {eventStatus.type === 'none' && (
                        event.applications_open ? (
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
                        ) : (
                          <Badge color="gray" variant="soft" size="2">
                            Applications Closed
                          </Badge>
                        )
                      )}
                    </Flex>
                  </Flex>

                  {hasApplied && eventStatus.data.application_status === 'pending' && (
                    <Flex align="center" gap="2">
                      <Callout.Root color="blue" size="1">
                        <Callout.Icon>
                          <InfoCircledIcon />
                        </Callout.Icon>
                        <Callout.Text>
                          Application Submitted {eventStatus.data.applied_at && `• ${new Date(eventStatus.data.applied_at).toLocaleDateString()}`}
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

                  {hasApplied && eventStatus.data.application_status === 'accepted' && (
                    <Callout.Root color="green" size="1">
                      <Callout.Icon>
                        <CheckCircledIcon />
                      </Callout.Icon>
                      <Callout.Text>
                        Congratulations! Your application has been accepted.
                      </Callout.Text>
                    </Callout.Root>
                  )}

                  {hasInvitation && (
                    <Flex direction="column" gap="3">
                      <Callout.Root color="crimson" size="1">
                        <Callout.Icon>
                          <CheckCircledIcon />
                        </Callout.Icon>
                        <Callout.Text>
                          🎉 Congratulations! You have been invited to participate in this event.
                        </Callout.Text>
                      </Callout.Root>
                      {event.applications_open ? (
                        <Button
                          size="3"
                          variant="solid"
                          color="crimson"
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
                      ) : (
                        <Callout.Root color="gray" size="1">
                          <Callout.Icon>
                            <CrossCircledIcon />
                          </Callout.Icon>
                          <Callout.Text>
                            Applications for this event are now closed. You cannot accept this invitation at this time.
                          </Callout.Text>
                        </Callout.Root>
                      )}
                    </Flex>
                  )}

                  {hasApplied && eventStatus.data.application_status === 'rejected' && (
                    <Callout.Root color="red" size="1">
                      <Callout.Icon>
                        <CrossCircledIcon />
                      </Callout.Icon>
                      <Callout.Text>
                        Your application was not selected for this event.
                      </Callout.Text>
                    </Callout.Root>
                  )}

                  {hasConfirmation && (
                    <Callout.Root color="green" size="1">
                      <Callout.Icon>
                        <CheckCircledIcon />
                      </Callout.Icon>
                      <Callout.Text>
                        ✅ CONFIRMED! You are registered to participate in this event.
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

      {/* Application Modal */}
      <Dialog.Root open={showApplicationModal} onOpenChange={setShowApplicationModal}>
        <Dialog.Content style={{ maxWidth: 500 }}>
          <Dialog.Title>Apply to {selectedEvent?.name}</Dialog.Title>
          <Dialog.Description size="2" mb="4">
            Submit your application with an optional message to the event producer.
          </Dialog.Description>

          {selectedEvent && (
            <Box mb="4">
              <Card size="2" style={{ backgroundColor: 'var(--gray-2)' }}>
                <Flex direction="column" gap="2">
                  <Text size="3" weight="bold">{selectedEvent.name}</Text>
                  <Text size="2" color="gray">
                    📅 {formatDateTime(selectedEvent.event_start_datetime)}
                  </Text>
                  {selectedEvent.venue && (
                    <Text size="2" color="gray">
                      📍 {selectedEvent.venue}
                      {selectedEvent.city?.name && ` • ${selectedEvent.city.name}`}
                    </Text>
                  )}
                </Flex>
              </Card>
            </Box>
          )}

          <Flex direction="column" gap="3">
            <Text size="2" weight="medium">
              Message to Producer (Optional)
            </Text>
            <TextArea
              placeholder="Tell the producer why you'd like to participate in this event, your experience, or any other relevant information..."
              value={applicationMessage}
              onChange={(e) => setApplicationMessage(e.target.value)}
              rows={4}
              style={{ resize: 'vertical', minHeight: '100px' }}
            />
            <Text size="1" color="gray">
              This message will be sent to the event producer along with your application.
            </Text>
          </Flex>

          <Flex gap="3" mt="4" justify="end">
            <Dialog.Close>
              <Button variant="soft" color="gray">
                Cancel
              </Button>
            </Dialog.Close>
            <Button
              onClick={submitApplication}
              disabled={applying[selectedEvent?.id]}
              loading={applying[selectedEvent?.id]}
            >
              Submit Application
            </Button>
          </Flex>
        </Dialog.Content>
      </Dialog.Root>

      {/* Comprehensive Invitation Acceptance Modal */}
      <InvitationAcceptanceModal
        open={showInvitationModal}
        onOpenChange={setShowInvitationModal}
        event={selectedEvent}
        invitation={selectedInvitation}
        artistProfile={artistProfile}
        onAccept={acceptInvitation}
        loading={applying[selectedEvent?.id]}
      />
    </Box>
  );
};

export default EventApplications;
import { useState, useEffect } from 'react';
import {
  Dialog,
  Box,
  Flex,
  Text,
  Button,
  Card,
  Heading,
  Grid,
  ScrollArea,
  Spinner,
  Badge,
  TextArea,
  Select
} from '@radix-ui/themes';
import {
  PersonIcon,
  Cross2Icon
} from '@radix-ui/react-icons';
import { supabase } from '../lib/supabase';

const ArtistDetailModal = ({
  isOpen,
  onClose,
  artist,
  showApplicationSpecifics = false,
  upcomingEvents = [],
  onInviteSent
}) => {
  const [sampleWorks, setSampleWorks] = useState([]);
  const [sampleWorksLoading, setSampleWorksLoading] = useState(false);
  const [artistEventHistory, setArtistEventHistory] = useState([]);
  const [eventHistoryLoading, setEventHistoryLoading] = useState(false);
  const [editingBio, setEditingBio] = useState(false);
  const [bioText, setBioText] = useState('');
  const [bioSaving, setBioSaving] = useState(false);
  const [fullArtistProfile, setFullArtistProfile] = useState(null);
  const [profileLoading, setProfileLoading] = useState(false);

  // Invitation states
  const [allEvents, setAllEvents] = useState([]);
  const [inviteModalOpen, setInviteModalOpen] = useState(false);
  const [selectedEventForInvite, setSelectedEventForInvite] = useState('');
  const [inviteMessage, setInviteMessage] = useState('');
  const [inviteLoading, setInviteLoading] = useState(false);

  // Load sample works, event history, and full profile when modal opens
  useEffect(() => {
    if (isOpen && artist?.artist_profile_id) {
      loadFullArtistProfile();
      loadSampleWorks();
      loadArtistEventHistory();
      loadAllEvents();
    }
  }, [isOpen, artist?.artist_profile_id]);

  const loadFullArtistProfile = async () => {
    try {
      setProfileLoading(true);
      const { data, error } = await supabase
        .from('artist_profiles')
        .select('*')
        .eq('id', artist.artist_profile_id)
        .single();

      if (error) throw error;
      setFullArtistProfile(data);
    } catch (err) {
      console.error('Failed to load full artist profile:', err);
      setFullArtistProfile(null);
    } finally {
      setProfileLoading(false);
    }
  };

  const loadSampleWorks = async () => {
    try {
      setSampleWorksLoading(true);
      console.log('🎨 Loading sample works for artist_profile_id:', artist.artist_profile_id);

      const { data, error } = await supabase
        .rpc('get_unified_sample_works', {
          profile_id: artist.artist_profile_id
        });

      console.log('🎨 Sample works result:', { data, error, count: data?.length });

      if (error) throw error;
      setSampleWorks(data || []);
    } catch (err) {
      console.error('Failed to load sample works:', err);
      setSampleWorks([]);
    } finally {
      setSampleWorksLoading(false);
    }
  };

  const loadArtistEventHistory = async () => {
    setEventHistoryLoading(true);
    try {
      const artistNumber = artist?.artist_number || artist?.artist_profiles?.entry_id;
      if (!artistNumber) {
        console.error('No artist number available for event history');
        setArtistEventHistory([]);
        return;
      }

      // Load all data for this artist
      const [applicationsData, confirmationsData, invitationsData] = await Promise.all([
        supabase.from('artist_applications').select('*').eq('artist_number', artistNumber),
        supabase.from('artist_confirmations').select('*').eq('artist_number', artistNumber),
        supabase.from('artist_invitations').select('*').eq('artist_number', artistNumber)
      ]);

      if (applicationsData.error) console.error('Error fetching applications:', applicationsData.error);
      if (confirmationsData.error) console.error('Error fetching confirmations:', confirmationsData.error);
      if (invitationsData.error) console.error('Error fetching invitations:', invitationsData.error);

      // Group all data by event_eid
      const eventMap = new Map();

      // Process applications
      (applicationsData.data || []).forEach(app => {
        if (app.event_eid) {
          if (!eventMap.has(app.event_eid)) {
            eventMap.set(app.event_eid, { event_eid: app.event_eid });
          }
          const event = eventMap.get(app.event_eid);
          event.application = app;
          event.applied_date = app.applied_at || app.entry_date;
        }
      });

      // Process invitations
      (invitationsData.data || []).forEach(inv => {
        if (inv.event_eid) {
          if (!eventMap.has(inv.event_eid)) {
            eventMap.set(inv.event_eid, { event_eid: inv.event_eid });
          }
          const event = eventMap.get(inv.event_eid);
          event.invitation = inv;
          event.invited_date = inv.entry_date || inv.created_at;
        }
      });

      // Process confirmations
      (confirmationsData.data || []).forEach(conf => {
        if (conf.event_eid) {
          if (!eventMap.has(conf.event_eid)) {
            eventMap.set(conf.event_eid, { event_eid: conf.event_eid });
          }
          const event = eventMap.get(conf.event_eid);
          event.confirmation = conf;
          event.confirmed_date = conf.created_at || conf.entry_date;
        }
      });

      // Get event details for each event
      const eventsWithDetails = await Promise.all(
        Array.from(eventMap.values()).map(async (eventHistory) => {
          const { data: eventData } = await supabase
            .from('events')
            .select('id, eid, name, event_start_datetime, venue, cities(name, countries(name))')
            .eq('eid', eventHistory.event_eid)
            .single();
          
          return {
            ...eventHistory,
            event_details: eventData,
            // Sort by most recent activity
            last_activity: Math.max(
              new Date(eventHistory.applied_date || 0).getTime(),
              new Date(eventHistory.invited_date || 0).getTime(),
              new Date(eventHistory.confirmed_date || 0).getTime()
            )
          };
        })
      );

      // Sort by most recent activity
      eventsWithDetails.sort((a, b) => b.last_activity - a.last_activity);
      
      setArtistEventHistory(eventsWithDetails);
    } catch (error) {
      console.error('Error loading artist event history:', error);
      setArtistEventHistory([]);
    } finally {
      setEventHistoryLoading(false);
    }
  };

  const saveBio = async () => {
    if (!artist?.artist_profile_id) {
      console.error('No artist profile ID available for bio save');
      return;
    }

    setBioSaving(true);
    try {
      const { error } = await supabase
        .from('artist_profiles')
        .update({ abhq_bio: bioText.trim() || null })
        .eq('id', artist.artist_profile_id);

      if (error) throw error;
      
      // Update the full artist profile state
      if (fullArtistProfile) {
        setFullArtistProfile({ ...fullArtistProfile, abhq_bio: bioText.trim() || null });
      }
      
      setEditingBio(false);
    } catch (error) {
      console.error('Error saving bio:', error);
    } finally {
      setBioSaving(false);
    }
  };

  const cancelBioEdit = () => {
    setBioText(fullArtistProfile?.abhq_bio || '');
    setEditingBio(false);
  };

  const startBioEdit = () => {
    setBioText(fullArtistProfile?.abhq_bio || '');
    setEditingBio(true);
  };


  const loadAllEvents = async () => {
    try {
      const { data, error } = await supabase
        .from('events')
        .select('id, name, eid, event_start_datetime, cities(name, countries(name))')
        .order('event_start_datetime', { ascending: false})
        .limit(50);

      if (!error && data) {
        setAllEvents(data);
      }
    } catch (error) {
      console.error('Error fetching events:', error);
    }
  };

  const handleInviteArtist = () => {
    setInviteMessage(`Hi ${artistProfile?.name || 'there'},

You're invited to participate in our upcoming Art Battle event!

We'd love to have you showcase your artistic talents in this exciting live painting competition.

Please let us know if you're interested in participating.

Best regards,
Art Battle Team`);
    setInviteModalOpen(true);
  };

  const sendInvitation = async () => {
    if (!selectedEventForInvite || !artistProfile?.email) {
      alert('Please select an event and ensure the artist has an email address.');
      return;
    }

    setInviteLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      const selectedEvent = allEvents.find(e => e.id === selectedEventForInvite);
      const response = await fetch(`https://xsqdkubgyqwpyvfltnrf.supabase.co/functions/v1/admin-send-invitation`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
          'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhzcWRrdWJneXF3cHl2Zmx0bnJmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTM0MjE2OTYsImV4cCI6MjA2ODk5NzY5Nn0.hY8v8IDZQTcdAFa_OvQNFd1CyvabGcOZZMn_J6c4c2U'
        },
        body: JSON.stringify({
          artist_number: (artist.artist_number || artistProfile?.entry_id).toString(),
          event_eid: selectedEvent?.eid,
          message_from_producer: inviteMessage,
          artist_profile_id: artist.artist_profile_id
        })
      });

      if (response.ok) {
        alert('Invitation sent successfully!');
        setInviteModalOpen(false);
        setSelectedEventForInvite('');
        setInviteMessage('');
        if (onInviteSent) onInviteSent();
        // Reload event history to show the new invitation
        loadArtistEventHistory();
      } else {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to send invitation');
      }
    } catch (error) {
      console.error('Error sending invitation:', error);
      alert(`Error sending invitation: ${error.message}`);
    } finally {
      setInviteLoading(false);
    }
  };

  if (!artist) return null;

  // Use fullArtistProfile if available, otherwise fallback to limited data
  const artistProfile = fullArtistProfile || artist.artist_profiles || artist;

  return (
    <Dialog.Root open={isOpen} onOpenChange={onClose}>
      <Dialog.Content style={{ maxWidth: 800, maxHeight: '90vh' }}>
        <Dialog.Title>
          <Flex align="center" justify="between" gap="3">
            <Flex align="center" gap="3">
              <PersonIcon size={24} />
              <Box>
                <Text size="5" weight="bold">
                  {profileLoading ? 'Loading...' : (artistProfile?.name || artist?.artist_name || 'Unknown Artist')}
                </Text>
                <Text size="2" color="gray" mt="1">
                  Artist Details
                </Text>
              </Box>
            </Flex>
            <Dialog.Close>
              <Button variant="ghost" size="1">
                <Cross2Icon />
              </Button>
            </Dialog.Close>
          </Flex>
        </Dialog.Title>

        <ScrollArea style={{ height: '70vh' }}>
          <Box p="4">
            <Flex direction="column" gap="4">
              {/* Artist Profile */}
              <Card>
                <Box p="4">
                  <Heading size="4" mb="3">Artist Profile</Heading>
                  {profileLoading ? (
                    <Box style={{ textAlign: 'center', padding: '2rem' }}>
                      <Spinner size="2" />
                      <Text size="2" color="gray" style={{ display: 'block', marginTop: '1rem' }}>
                        Loading artist profile...
                      </Text>
                    </Box>
                  ) : (
                    <Box>
                      <Flex direction="column" gap="2">
                        <Text size="2">
                          <strong>Name:</strong> {artistProfile?.name || artist?.artist_name || 'Unknown'}
                        </Text>
                        <Text size="2">
                          <strong>Artist #:</strong> {artist?.artist_number || artistProfile?.entry_id || 'Unknown'}
                        </Text>
                        {artistProfile?.email && (
                          <Text size="2">
                            <strong>Email:</strong> {artistProfile.email}
                          </Text>
                        )}
                        {artistProfile?.phone && (
                          <Text size="2">
                            <strong>Phone:</strong> {artistProfile.phone}
                          </Text>
                        )}
                        {(artistProfile?.city_text || artistProfile?.city || artistProfile?.country) && (
                          <Text size="2">
                            <strong>Location:</strong> {[artistProfile?.city_text || artistProfile?.city, artistProfile?.country].filter(Boolean).join(', ')}
                          </Text>
                        )}
                        {artistProfile?.studio_location && (
                          <Text size="2">
                            <strong>Studio:</strong> {artistProfile.studio_location}
                          </Text>
                        )}
                        {artistProfile?.pronouns && (
                          <Text size="2">
                            <strong>Pronouns:</strong> {artistProfile.pronouns}
                          </Text>
                        )}
                        {artistProfile?.specialties && (
                          <Text size="2">
                            <strong>Specialties:</strong> {Array.isArray(artistProfile.specialties) ? artistProfile.specialties.join(', ') : artistProfile.specialties}
                          </Text>
                        )}
                        {artistProfile?.instagram && (
                          <Text size="2">
                            <strong>Instagram:</strong> <a href={`https://instagram.com/${artistProfile.instagram.replace('@', '')}`} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--blue-11)' }}>@{artistProfile.instagram.replace('@', '')}</a>
                          </Text>
                        )}
                        {artistProfile?.website && (
                          <Text size="2">
                            <strong>Website:</strong> <a href={artistProfile.website.startsWith('http') ? artistProfile.website : `https://${artistProfile.website}`} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--blue-11)' }}>{artistProfile.website}</a>
                          </Text>
                        )}
                        {artistProfile?.facebook && (
                          <Text size="2">
                            <strong>Facebook:</strong> <a href={`https://facebook.com/${artistProfile.facebook}`} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--blue-11)' }}>{artistProfile.facebook}</a>
                          </Text>
                        )}
                        {artistProfile?.twitter && (
                          <Text size="2">
                            <strong>Twitter:</strong> <a href={`https://twitter.com/${artistProfile.twitter}`} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--blue-11)' }}>@{artistProfile.twitter}</a>
                          </Text>
                        )}
                      </Flex>
                      
                      {/* Original Bio Section */}
                      {artistProfile?.bio && (
                        <Box mt="3">
                          <Text size="2" weight="medium" mb="2" style={{ display: 'block' }}>
                            <strong>Bio:</strong>
                          </Text>
                          <Box p="3" style={{ backgroundColor: 'var(--gray-2)', borderRadius: '6px' }}>
                            <Text size="2" style={{ lineHeight: '1.5', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                              {artistProfile.bio}
                            </Text>
                          </Box>
                        </Box>
                      )}

                      {/* ABHQ Bio Section */}
                      <Box mt="3">
                        <Flex justify="between" align="center" mb="2">
                          <Text size="2" weight="medium">
                            <strong>ABHQ Bio:</strong>
                          </Text>
                          {!editingBio && (
                            <Button 
                              size="1" 
                              variant="soft"
                              onClick={startBioEdit}
                            >
                              Edit
                            </Button>
                          )}
                        </Flex>
                        
                        {editingBio ? (
                          <Box>
                            <TextArea
                              value={bioText}
                              onChange={(e) => setBioText(e.target.value)}
                              placeholder="Enter ABHQ bio..."
                              rows={6}
                              style={{ width: '100%', marginBottom: '8px' }}
                            />
                            <Flex gap="2">
                              <Button 
                                size="1" 
                                onClick={saveBio}
                                loading={bioSaving}
                                disabled={bioSaving}
                              >
                                Save
                              </Button>
                              <Button 
                                size="1" 
                                variant="soft" 
                                onClick={cancelBioEdit}
                                disabled={bioSaving}
                              >
                                Cancel
                              </Button>
                            </Flex>
                          </Box>
                        ) : (
                          <>
                            {artistProfile?.abhq_bio ? (
                              <Box p="3" style={{ backgroundColor: 'var(--green-2)', borderRadius: '6px' }}>
                                <Text size="2" style={{ lineHeight: '1.5', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                                  {artistProfile.abhq_bio}
                                </Text>
                              </Box>
                            ) : (
                              <Box p="3" style={{ backgroundColor: 'var(--red-2)', borderRadius: '6px' }}>
                                <Text size="2" color="red">
                                  No ABHQ bio available
                                </Text>
                              </Box>
                            )}
                          </>
                        )}
                      </Box>

                      {/* Action Buttons */}
                      <Box mt="4" pt="3" style={{ borderTop: '1px solid var(--gray-6)' }}>
                        <Flex gap="2">
                          {artistProfile?.email && (
                            <Button
                              variant="solid"
                              color="blue"
                              size="2"
                              onClick={handleInviteArtist}
                            >
                              Invite to Event
                            </Button>
                          )}
                          {!artistProfile?.email && (
                            <Text size="2" color="gray">
                              No email address available for invitations
                            </Text>
                          )}
                        </Flex>
                      </Box>
                    </Box>
                  )}
                </Box>
              </Card>

              {/* Current Event Info */}
              {artist?.event_eid && (
                <Card>
                  <Box p="4">
                    <Heading size="4" mb="3">Current Event</Heading>
                    <Flex direction="column" gap="2">
                      <Text size="2">
                        <strong>Event:</strong> {artist.event_eid}
                      </Text>
                      {artist.event_name && (
                        <Text size="2">
                          <strong>Name:</strong> {artist.event_name}
                        </Text>
                      )}
                      {artist.city_name && (
                        <Text size="2">
                          <strong>Location:</strong> {artist.city_name} - {artist.event_date}
                        </Text>
                      )}
                      <Flex gap="2" align="center" mt="2">
                        <Badge color={artist.has_bio ? 'green' : 'orange'} size="2">
                          {artist.has_bio ? 'Has Bio' : 'Missing Bio'}
                        </Badge>
                        <Badge color={artist.has_promo_image ? 'green' : 'orange'} size="2">
                          {artist.has_promo_image ? 'Has Promo Image' : 'Missing Promo Image'}
                        </Badge>
                      </Flex>
                    </Flex>
                  </Box>
                </Card>
              )}

              {/* Event History */}
              <Card>
                <Box p="4">
                  <Heading size="4" mb="3">Event History</Heading>
                  {eventHistoryLoading ? (
                    <Box style={{ textAlign: 'center', padding: '2rem' }}>
                      <Spinner size="2" />
                      <Text size="2" color="gray" style={{ display: 'block', marginTop: '1rem' }}>
                        Loading event history...
                      </Text>
                    </Box>
                  ) : artistEventHistory.length > 0 ? (
                    <Flex direction="column" gap="3">
                      {artistEventHistory.map((eventHistory) => (
                        <Card key={eventHistory.event_eid} style={{ backgroundColor: 'var(--gray-2)' }}>
                          <Box p="3">
                            {/* Event Header */}
                            <Flex justify="between" align="start" mb="3">
                              <Flex direction="column">
                                <Text size="3" weight="bold">
                                  {eventHistory.event_details?.name || eventHistory.event_eid}
                                </Text>
                                <Text size="2" color="gray">
                                  {eventHistory.event_eid} • {eventHistory.event_details?.cities?.name && eventHistory.event_details.cities.countries?.name ? 
                                    `${eventHistory.event_details.cities.name}, ${eventHistory.event_details.cities.countries.name}` : 
                                    eventHistory.event_details?.venue || 'Location TBD'
                                  }
                                </Text>
                                {eventHistory.event_details?.event_start_datetime && (
                                  <Text size="2" color="gray">
                                    Event Date: {new Date(eventHistory.event_details.event_start_datetime).toLocaleDateString()}
                                  </Text>
                                )}
                              </Flex>
                            </Flex>
                            
                            {/* Timeline */}
                            <Flex direction="column" gap="2">
                              {eventHistory.applied_date && (
                                <Flex align="center" gap="3">
                                  <Badge color="blue" size="1">Applied</Badge>
                                  <Text size="2">
                                    {new Date(eventHistory.applied_date).toLocaleDateString()}
                                  </Text>
                                </Flex>
                              )}
                              
                              {eventHistory.invited_date && (
                                <Flex align="center" gap="3">
                                  <Badge color="orange" size="1">Invited</Badge>
                                  <Text size="2">
                                    {new Date(eventHistory.invited_date).toLocaleDateString()}
                                  </Text>
                                </Flex>
                              )}
                              
                              {eventHistory.confirmed_date && (
                                <Flex align="center" gap="3">
                                  <Badge color="green" size="1">Confirmed</Badge>
                                  <Text size="2">
                                    {new Date(eventHistory.confirmed_date).toLocaleDateString()}
                                  </Text>
                                </Flex>
                              )}
                            </Flex>

                            {/* Additional Details - Hide invitation messages */}
                            {(eventHistory.application?.message_to_producer || eventHistory.confirmation?.message_to_organizers) && (
                              <Box mt="3">
                                {eventHistory.application?.message_to_producer && (
                                  <Box mb="2">
                                    <Text size="2" weight="medium">Application Message:</Text>
                                    <Box p="2" style={{ backgroundColor: 'var(--blue-3)', borderRadius: '4px', marginTop: '4px' }}>
                                      <Text size="2" style={{ whiteSpace: 'pre-wrap' }}>
                                        {eventHistory.application.message_to_producer}
                                      </Text>
                                    </Box>
                                  </Box>
                                )}
                                {eventHistory.confirmation?.message_to_organizers && (
                                  <Box>
                                    <Text size="2" weight="medium">Confirmation Message:</Text>
                                    <Box p="2" style={{ backgroundColor: 'var(--green-3)', borderRadius: '4px', marginTop: '4px' }}>
                                      <Text size="2" style={{ whiteSpace: 'pre-wrap' }}>
                                        {eventHistory.confirmation.message_to_organizers}
                                      </Text>
                                    </Box>
                                  </Box>
                                )}
                              </Box>
                            )}
                          </Box>
                        </Card>
                      ))}
                    </Flex>
                  ) : (
                    <Text size="2" color="gray">No event history found</Text>
                  )}
                </Box>
              </Card>

              {/* Sample Works */}
              <Card>
                <Box p="4">
                  <Heading size="4" mb="3">Sample Works</Heading>
                  {sampleWorksLoading ? (
                    <Box style={{ textAlign: 'center', padding: '2rem' }}>
                      <Spinner size="2" />
                      <Text size="2" color="gray" style={{ display: 'block', marginTop: '1rem' }}>
                        Loading sample works...
                      </Text>
                    </Box>
                  ) : sampleWorks.length > 0 ? (
                    <Grid columns={{ initial: '2', sm: '3', lg: '4' }} gap="3">
                      {sampleWorks.map((work) => (
                        <Box
                          key={work.id || work.sample_work_id}
                          style={{
                            width: '100%',
                            height: 120,
                            backgroundColor: 'var(--gray-4)',
                            borderRadius: '6px',
                            backgroundImage: work.image_url ? `url(${work.image_url})` : 'none',
                            backgroundSize: 'cover',
                            backgroundPosition: 'center',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            cursor: 'pointer',
                            transition: 'transform 0.2s ease',
                            border: '1px solid var(--gray-6)'
                          }}
                          onMouseEnter={(e) => e.target.style.transform = 'scale(1.05)'}
                          onMouseLeave={(e) => e.target.style.transform = 'scale(1)'}
                        >
                          {!work.image_url && (
                            <Text size="1" color="gray">No Image</Text>
                          )}
                        </Box>
                      ))}
                    </Grid>
                  ) : (
                    <Box style={{ textAlign: 'center', padding: '2rem' }}>
                      <Text size="2" color="gray">
                        No sample works available for this artist.
                      </Text>
                    </Box>
                  )}
                </Box>
              </Card>

              {/* Application-specific content */}
              {showApplicationSpecifics && artist?.motivation && (
                <Card>
                  <Box p="4">
                    <Heading size="4" mb="3">Application Details</Heading>
                    <Flex direction="column" gap="3">
                      {artist.created_at && (
                        <Text size="2">
                          <strong>Applied:</strong> {new Date(artist.created_at).toLocaleString()}
                        </Text>
                      )}
                      <Box>
                        <Text size="2" weight="medium" mb="2" style={{ display: 'block' }}>
                          Artist's Motivation:
                        </Text>
                        <Box p="3" style={{ backgroundColor: 'var(--gray-2)', borderRadius: '6px' }}>
                          <Text size="2" style={{ lineHeight: '1.5' }}>
                            {artist.motivation}
                          </Text>
                        </Box>
                      </Box>
                    </Flex>
                  </Box>
                </Card>
              )}
            </Flex>
          </Box>
        </ScrollArea>
      </Dialog.Content>

      {/* Separate Invite Modal */}
      <Dialog.Root open={inviteModalOpen} onOpenChange={setInviteModalOpen}>
        <Dialog.Content style={{ maxWidth: 600 }}>
          <Dialog.Title>
            <Flex align="center" justify="between">
              <Text size="5" weight="bold">
                Invite Artist to Event
              </Text>
              <Dialog.Close>
                <Button variant="ghost" size="1">
                  <Cross2Icon />
                </Button>
              </Dialog.Close>
            </Flex>
          </Dialog.Title>

          <Box p="4">
            <Flex direction="column" gap="4">
              {/* Artist Info */}
              <Box>
                <Text size="3" weight="medium" mb="2" style={{ display: 'block' }}>
                  Inviting: {artistProfile?.name || 'Unknown Artist'}
                </Text>
                <Text size="2" color="gray">
                  Email: {artistProfile?.email}
                </Text>
                <Text size="2" color="gray">
                  Artist #: {artist?.artist_number || artistProfile?.entry_id || 'Unknown'}
                </Text>
              </Box>

              {/* Event Selector */}
              <Box>
                <Text size="2" weight="medium" mb="2" style={{ display: 'block' }}>
                  Select Event
                </Text>
                <Select.Root value={selectedEventForInvite} onValueChange={setSelectedEventForInvite}>
                  <Select.Trigger style={{ width: '100%' }} placeholder="Choose an event..." />
                  <Select.Content>
                    {allEvents.map((event) => (
                      <Select.Item key={event.id} value={event.id}>
                        {event.name || event.eid} - {event.cities?.name ? `${event.cities.name}, ${event.cities.countries?.name}` : 'Location TBD'}
                        {event.event_start_datetime && (
                          <Text size="1" color="gray" style={{ display: 'block' }}>
                            {new Date(event.event_start_datetime).toLocaleDateString()}
                          </Text>
                        )}
                      </Select.Item>
                    ))}
                  </Select.Content>
                </Select.Root>
              </Box>

              {/* Message */}
              <Box>
                <Text size="2" weight="medium" mb="2" style={{ display: 'block' }}>
                  Invitation Message
                </Text>
                <TextArea
                  value={inviteMessage}
                  onChange={(e) => setInviteMessage(e.target.value)}
                  placeholder="Enter your invitation message..."
                  rows={8}
                  style={{ width: '100%' }}
                />
              </Box>

              {/* Action Buttons */}
              <Flex justify="end" gap="2">
                <Button
                  variant="soft"
                  color="gray"
                  onClick={() => setInviteModalOpen(false)}
                  disabled={inviteLoading}
                >
                  Cancel
                </Button>
                <Button
                  variant="solid"
                  color="blue"
                  onClick={sendInvitation}
                  disabled={inviteLoading || !selectedEventForInvite || !inviteMessage.trim()}
                >
                  {inviteLoading ? <Spinner size="1" /> : 'Send Invitation'}
                </Button>
              </Flex>
            </Flex>
          </Box>
        </Dialog.Content>
      </Dialog.Root>
    </Dialog.Root>
  );
};

export default ArtistDetailModal;
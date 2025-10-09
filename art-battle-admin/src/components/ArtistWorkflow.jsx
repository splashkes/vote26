import { useState, useEffect } from 'react';
import {
  Box,
  Card,
  Flex,
  Text,
  Badge,
  Grid,
  Button,
  Spinner
} from '@radix-ui/themes';
import { ReloadIcon } from '@radix-ui/react-icons';
import { supabase } from '../lib/supabase';
import { useNavigate } from 'react-router-dom';

const ArtistWorkflow = ({ eventIds = [], eventEids = [], title = "Artist Management Workflow", showEventInfo = false }) => {
  const navigate = useNavigate();
  const [artistApplications, setArtistApplications] = useState([]);
  const [artistInvites, setArtistInvites] = useState([]);
  const [artistConfirmations, setArtistConfirmations] = useState([]);
  const [artistsLoading, setArtistsLoading] = useState(false);
  const [showAllArtists, setShowAllArtists] = useState(false);
  const [artistStats, setArtistStats] = useState({});

  useEffect(() => {
    if ((eventIds && eventIds.length > 0) || (eventEids && eventEids.length > 0)) {
      fetchArtistData();
    }
  }, [eventIds, eventEids, showEventInfo]);

  const fetchArtistData = async () => {
    if ((!eventIds || eventIds.length === 0) && (!eventEids || eventEids.length === 0)) return;

    try {
      setArtistsLoading(true);

      // Fetch applications for all events (uses event_id UUID)
      const { data: applications, error: appError } = await supabase
        .from('artist_applications')
        .select('id, artist_number, event_id, updated_at')
        .in('event_id', eventIds)
        .order('updated_at', { ascending: false });

      if (appError) throw appError;

      // Fetch invitations for all events (uses event_eid text)
      const { data: invitations, error: invError } = await supabase
        .from('artist_invitations')
        .select('id, artist_number, event_eid, created_at, accepted_at')
        .in('event_eid', eventEids)
        .order('created_at', { ascending: false });

      if (invError) throw invError;

      // Fetch confirmations for all events (uses event_eid text)
      const { data: confirmations, error: confError} = await supabase
        .from('artist_confirmations')
        .select('id, artist_number, event_eid, created_at')
        .in('event_eid', eventEids)
        .order('created_at', { ascending: false});

      if (confError) throw confError;

      // Get all unique artist numbers
      const allArtistNumbers = new Set();
      [...(applications || []), ...(invitations || []), ...(confirmations || [])].forEach(item => {
        if (item.artist_number) {
          allArtistNumbers.add(item.artist_number);
        }
      });

      // Fetch artist profiles and stats using Edge Functions
      let artistProfiles = {};
      let artistStatsData = {};

      if (allArtistNumbers.size > 0) {
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
          try {
            // Fetch profiles
            const profilesResponse = await fetch(`https://xsqdkubgyqwpyvfltnrf.supabase.co/functions/v1/admin-artist-profiles`, {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${session.access_token}`,
                'Content-Type': 'application/json',
                'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhzcWRrdWJneXF3cHl2Zmx0bnJmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTM0MjE2OTYsImV4cCI6MjA2ODk5NzY5Nn0.hY8v8IDZQTcdAFa_OvQNFd1CyvabGcOZZMn_J6c4c2U'
              },
              body: JSON.stringify({ artistNumbers: Array.from(allArtistNumbers) })
            });

            if (profilesResponse.ok) {
              const { data } = await profilesResponse.json();
              artistProfiles = data.profiles || {};
            }

            // Fetch artist stats (only if showEventInfo is true)
            // Note: We fetch stats across ALL events, not filtered by eventIds, to show the artist's full history
            if (showEventInfo) {
              // Convert artist numbers to integers (art.artist_number is integer type)
              const artistNumbersArray = Array.from(allArtistNumbers).map(n => parseInt(n, 10)).filter(n => !isNaN(n));

              const statsResponse = await fetch(`https://xsqdkubgyqwpyvfltnrf.supabase.co/functions/v1/admin-artist-stats`, {
                method: 'POST',
                headers: {
                  'Authorization': `Bearer ${session.access_token}`,
                  'Content-Type': 'application/json',
                  'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhzcWRrdWJneXF3cHl2Zmx0bnJmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTM0MjE2OTYsImV4cCI6MjA2ODk5NzY5Nn0.hY8v8IDZQTcdAFa_OvQNFd1CyvabGcOZZMn_J6c4c2U'
                },
                body: JSON.stringify({
                  artistNumbers: artistNumbersArray
                  // No eventIds filter - we want to show total stats across all their events
                })
              });

              if (statsResponse.ok) {
                const { data } = await statsResponse.json();
                artistStatsData = data.stats || {};
                console.log('Artist stats loaded:', artistStatsData);
              }
            }
          } catch (err) {
            console.error('Error fetching artist data:', err);
          }
        }
      }

      setArtistStats(artistStatsData);

      // Merge profile data and normalize timestamp field
      const mergeProfiles = (items, timestampField = 'created_at') => {
        return items?.map(item => ({
          ...item,
          created_at: item[timestampField] || item.created_at, // Normalize to created_at for display
          artist_profiles: artistProfiles[item.artist_number] || { name: `Artist #${item.artist_number}` }
        })) || [];
      };

      setArtistApplications(mergeProfiles(applications, 'updated_at'));
      setArtistInvites(mergeProfiles(invitations, 'created_at'));
      setArtistConfirmations(mergeProfiles(confirmations, 'created_at'));
    } catch (err) {
      console.error('Error fetching artist data:', err);
    } finally {
      setArtistsLoading(false);
    }
  };


  const getFilteredApplications = () => {
    if (showAllArtists) {
      return artistApplications;
    }

    // Hide applications where artist is already invited or confirmed
    const invitedNumbers = new Set(artistInvites.map(inv => inv.artist_number));
    const confirmedNumbers = new Set(artistConfirmations.map(conf => conf.artist_number));

    return artistApplications.filter(app =>
      !invitedNumbers.has(app.artist_number) && !confirmedNumbers.has(app.artist_number)
    );
  };

  const getFilteredInvitations = () => {
    if (showAllArtists) {
      return artistInvites;
    }

    // Hide invitations where artist is already confirmed
    const confirmedNumbers = new Set(artistConfirmations.map(conf => conf.artist_number));

    return artistInvites.filter(inv => !confirmedNumbers.has(inv.artist_number));
  };

  const getFilteredConfirmations = () => {
    return artistConfirmations;
  };

  const getInvitationStatus = (invite) => {
    if (invite.accepted_at) {
      return { color: 'green', label: 'Accepted' };
    }
    return { color: 'orange', label: 'Pending' };
  };

  const formatDateForDisplay = (dateString) => {
    if (!dateString) return { timeAgo: 'Unknown', fullDate: '', isRecent: false };

    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now - date;
    const diffHours = diffMs / (1000 * 60 * 60);
    const diffDays = diffMs / (1000 * 60 * 60 * 24);

    let timeAgo;
    if (diffHours < 1) {
      timeAgo = 'Just now';
    } else if (diffHours < 24) {
      timeAgo = `${Math.floor(diffHours)}h ago`;
    } else if (diffDays < 7) {
      timeAgo = `${Math.floor(diffDays)}d ago`;
    } else {
      timeAgo = date.toLocaleDateString();
    }

    const isRecent = diffHours <= 36;

    return {
      timeAgo,
      fullDate: date.toLocaleString(),
      isRecent
    };
  };

  const getRecentActivityColor = (isRecent) => {
    return isRecent ? 'var(--orange-9)' : 'var(--gray-6)';
  };

  const getCurrencySymbol = (currencyCode) => {
    const symbols = {
      'USD': '$',
      'CAD': 'CA$',
      'EUR': '€',
      'GBP': '£',
      'AUD': 'A$',
      'NZD': 'NZ$',
      'THB': '฿',
      'MXN': 'MX$'
    };
    return symbols[currencyCode] || currencyCode;
  };

  const handleArtistCardClick = (artist, type) => {
    // Navigate to artist profile or show artist details
    if (artist.artist_profiles?.entry_id) {
      navigate(`/artist/${artist.artist_profiles.entry_id}`);
    }
  };

  return (
    <Card>
      <Box p="4">
        <Flex direction="column" gap="4">
          <Flex justify="between" align="center">
            <Box>
              <Text size="4" weight="bold" mb="1" style={{ display: 'block' }}>
                {title}
              </Text>
              <Text size="2" color="gray">
                Manage applications, invitations, and confirmations across {Math.max(eventIds.length, eventEids.length)} event{Math.max(eventIds.length, eventEids.length) !== 1 ? 's' : ''}
              </Text>
            </Box>
            <Flex align="center" gap="4">
              <Button
                variant="outline"
                size="2"
                onClick={() => fetchArtistData()}
                disabled={artistsLoading}
              >
                <ReloadIcon />
                {artistsLoading ? 'Refreshing...' : 'Refresh'}
              </Button>
              <Badge color="blue" size="2">
                {getFilteredApplications().length} Applied
              </Badge>
              <Badge color="orange" size="2">
                {getFilteredInvitations().length} Invited
              </Badge>
              <Badge color="green" size="2">
                {getFilteredConfirmations().length} Confirmed
              </Badge>
              <Button
                variant={showAllArtists ? "solid" : "outline"}
                color="gray"
                size="1"
                onClick={() => setShowAllArtists(!showAllArtists)}
              >
                {showAllArtists ? "Hide Duplicates" : "Show All"}
              </Button>
            </Flex>
          </Flex>

          {artistsLoading ? (
            <Box style={{ textAlign: 'center', padding: '2rem' }}>
              <Spinner size="3" />
              <Text size="2" color="gray" style={{ display: 'block', marginTop: '1rem' }}>
                Loading artist data...
              </Text>
            </Box>
          ) : (
            <Grid columns={{ initial: "1", md: "3" }} gap="4">
              {/* APPLIED Column */}
              <Card>
                <Box p="4">
                  <Flex justify="between" align="center" mb="3">
                    <Text size="3" weight="bold">Applied</Text>
                    <Badge color="blue">{getFilteredApplications().length}</Badge>
                  </Flex>

                  <Flex direction="column" gap="3">
                    {getFilteredApplications().map((application) => (
                      <Card
                        key={application.id}
                        style={{
                          cursor: 'pointer',
                          border: '1px solid var(--blue-6)',
                          transition: 'all 0.2s ease'
                        }}
                        onClick={() => handleArtistCardClick(application, 'application')}
                      >
                        <Box p="3">
                          <Flex direction="column" gap="2">
                            <Flex align="center" gap="2">
                              <Text size="2" weight="bold">
                                {application.artist_profiles?.name || 'Unknown Artist'}
                              </Text>
                              {(() => {
                                const dateInfo = formatDateForDisplay(application.created_at);
                                return dateInfo.isRecent && (
                                  <Box
                                    style={{
                                      width: '8px',
                                      height: '8px',
                                      borderRadius: '50%',
                                      backgroundColor: getRecentActivityColor(true),
                                      flexShrink: 0
                                    }}
                                    title="Recent activity (last 36 hours)"
                                  />
                                );
                              })()}
                            </Flex>
                            <Flex justify="between" align="center" gap="2">
                              <Text size="1" color="gray">
                                #{application.artist_number}
                              </Text>
                              <Text size="1" color="gray" title={formatDateForDisplay(application.created_at).fullDate}>
                                {formatDateForDisplay(application.created_at).timeAgo}
                              </Text>
                            </Flex>
                            {showEventInfo && application.artist_number && artistStats[application.artist_number] && artistStats[application.artist_number].totalArtworks > 0 && (
                              <Box
                                mt="2"
                                pt="2"
                                style={{ borderTop: '1px solid var(--gray-6)' }}
                              >
                                <Text size="1" color="gray" style={{ display: 'block', marginBottom: '4px' }}>
                                  <strong>{artistStats[application.artist_number].soldCount}</strong> works sold across all events • Avg: {artistStats[application.artist_number].currencyCode ? getCurrencySymbol(artistStats[application.artist_number].currencyCode) : '$'}{artistStats[application.artist_number].avgPrice}
                                </Text>
                                <Text size="1" color="gray">
                                  Avg: <strong>{artistStats[application.artist_number].avgVotesPerRound}</strong> votes per round
                                </Text>
                              </Box>
                            )}
                          </Flex>
                        </Box>
                      </Card>
                    ))}

                    {getFilteredApplications().length === 0 && (
                      <Text size="2" color="gray" style={{ textAlign: 'center', padding: '2rem' }}>
                        {showAllArtists ? 'No applications received yet' : 'No new applications (all artists are invited or confirmed)'}
                      </Text>
                    )}
                  </Flex>
                </Box>
              </Card>

              {/* INVITED Column */}
              <Card>
                <Box p="4">
                  <Flex justify="between" align="center" mb="3">
                    <Text size="3" weight="bold">Invited</Text>
                    <Badge color="orange">{getFilteredInvitations().length}</Badge>
                  </Flex>

                  <Flex direction="column" gap="3">
                    {getFilteredInvitations().map((invite) => {
                      const status = getInvitationStatus(invite);
                      return (
                        <Card
                          key={invite.id}
                          style={{
                            cursor: 'pointer',
                            border: `1px solid var(--${status.color}-6)`,
                            transition: 'all 0.2s ease'
                          }}
                          onClick={() => handleArtistCardClick(invite, 'invitation')}
                        >
                          <Box p="3">
                            <Flex direction="column" gap="2">
                              <Flex align="center" gap="2">
                                <Text size="2" weight="bold">
                                  {invite.artist_profiles?.name || 'Unknown Artist'}
                                </Text>
                                {(() => {
                                  const dateInfo = formatDateForDisplay(invite.created_at);
                                  return dateInfo.isRecent && (
                                    <Box
                                      style={{
                                        width: '8px',
                                        height: '8px',
                                        borderRadius: '50%',
                                        backgroundColor: getRecentActivityColor(true),
                                        flexShrink: 0
                                      }}
                                      title="Recent activity (last 36 hours)"
                                    />
                                  );
                                })()}
                              </Flex>
                              <Flex justify="between" align="center" gap="2">
                                <Text size="1" color="gray">
                                  #{invite.artist_number}
                                </Text>
                                <Text size="1" color="gray" title={formatDateForDisplay(invite.created_at).fullDate}>
                                  {formatDateForDisplay(invite.created_at).timeAgo}
                                </Text>
                              </Flex>
                              {showEventInfo && invite.artist_number && artistStats[invite.artist_number] && artistStats[invite.artist_number].totalArtworks > 0 && (
                                <Box
                                  mt="2"
                                  pt="2"
                                  style={{ borderTop: '1px solid var(--gray-6)' }}
                                >
                                  <Text size="1" color="gray" style={{ display: 'block', marginBottom: '4px' }}>
                                    <strong>{artistStats[invite.artist_number].soldCount}</strong> works sold across all events • Avg: {artistStats[invite.artist_number].currencyCode ? getCurrencySymbol(artistStats[invite.artist_number].currencyCode) : '$'}{artistStats[invite.artist_number].avgPrice}
                                  </Text>
                                  <Text size="1" color="gray">
                                    Avg: <strong>{artistStats[invite.artist_number].avgVotesPerRound}</strong> votes per round
                                  </Text>
                                </Box>
                              )}
                            </Flex>
                          </Box>
                        </Card>
                      );
                    })}

                    {getFilteredInvitations().length === 0 && (
                      <Text size="2" color="gray" style={{ textAlign: 'center', padding: '2rem' }}>
                        {showAllArtists ? 'No invitations sent yet' : 'No pending invitations (all are confirmed)'}
                      </Text>
                    )}
                  </Flex>
                </Box>
              </Card>

              {/* CONFIRMED Column */}
              <Card>
                <Box p="4">
                  <Flex justify="between" align="center" mb="3">
                    <Text size="3" weight="bold">Confirmed</Text>
                    <Badge color="green">{getFilteredConfirmations().length}</Badge>
                  </Flex>

                  <Flex direction="column" gap="3">
                    {getFilteredConfirmations().map((confirmation) => (
                      <Card
                        key={confirmation.id}
                        style={{
                          cursor: 'pointer',
                          border: '1px solid var(--green-6)',
                          transition: 'all 0.2s ease'
                        }}
                        onClick={() => handleArtistCardClick(confirmation, 'confirmation')}
                      >
                        <Box p="3">
                          <Flex direction="column" gap="2">
                            <Flex align="center" gap="2">
                              <Text size="2" weight="bold">
                                {confirmation.artist_profiles?.name || 'Unknown Artist'}
                              </Text>
                              {(() => {
                                const dateInfo = formatDateForDisplay(confirmation.created_at);
                                return dateInfo.isRecent && (
                                  <Box
                                    style={{
                                      width: '8px',
                                      height: '8px',
                                      borderRadius: '50%',
                                      backgroundColor: getRecentActivityColor(true),
                                      flexShrink: 0
                                    }}
                                    title="Recent activity (last 36 hours)"
                                  />
                                );
                              })()}
                            </Flex>
                            <Flex justify="between" align="center" gap="2">
                              <Text size="1" color="gray">
                                #{confirmation.artist_number}
                              </Text>
                              <Text size="1" color="gray" title={formatDateForDisplay(confirmation.created_at).fullDate}>
                                {formatDateForDisplay(confirmation.created_at).timeAgo}
                              </Text>
                            </Flex>
                            {showEventInfo && confirmation.artist_number && artistStats[confirmation.artist_number] && artistStats[confirmation.artist_number].totalArtworks > 0 && (
                              <Box
                                mt="2"
                                pt="2"
                                style={{ borderTop: '1px solid var(--gray-6)' }}
                              >
                                <Text size="1" color="gray" style={{ display: 'block', marginBottom: '4px' }}>
                                  <strong>{artistStats[confirmation.artist_number].soldCount}</strong> works sold across all events • Avg: {artistStats[confirmation.artist_number].currencyCode ? getCurrencySymbol(artistStats[confirmation.artist_number].currencyCode) : '$'}{artistStats[confirmation.artist_number].avgPrice}
                                </Text>
                                <Text size="1" color="gray">
                                  Avg: <strong>{artistStats[confirmation.artist_number].avgVotesPerRound}</strong> votes per round
                                </Text>
                              </Box>
                            )}
                          </Flex>
                        </Box>
                      </Card>
                    ))}

                    {getFilteredConfirmations().length === 0 && (
                      <Text size="2" color="gray" style={{ textAlign: 'center', padding: '2rem' }}>
                        No confirmations received yet
                      </Text>
                    )}
                  </Flex>
                </Box>
              </Card>
            </Grid>
          )}
        </Flex>
      </Box>
    </Card>
  );
};

export default ArtistWorkflow;

import { useState, useEffect } from 'react';
import {
  Heading,
  Text,
  Card,
  Flex,
  Button,
  Badge,
  Box,
  Grid,
  Callout,
  Skeleton,
} from '@radix-ui/themes';
import { 
  PersonIcon, 
  InfoCircledIcon, 
  CheckCircledIcon,
  CrossCircledIcon,
  CalendarIcon,
  ImageIcon
} from '@radix-ui/react-icons';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { getArtworkImageUrls } from '../lib/imageHelpers';
import AuthModal from './AuthModal';

const Home = ({ onNavigateToTab }) => {
  const { user, person, loading: authLoading } = useAuth();
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [profile, setProfile] = useState(null);
  const [sampleWorks, setSampleWorks] = useState([]);
  const [applications, setApplications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [accepting, setAccepting] = useState({});

  useEffect(() => {
    if (!authLoading && user && person) {
      loadData();
    } else if (!authLoading && !user) {
      setLoading(false);
    }
  }, [user, person, authLoading]);

  const loadData = async () => {
    console.log('Home: Starting loadData, person:', person);
    try {
      // Load artist profile
      const { data: profileData, error: profileError } = await supabase
        .from('artist_profiles')
        .select('*')
        .eq('person_id', person.id)
        .single();

      console.log('Home: Profile query result:', { profileData, profileError });

      if (profileError && profileError.code !== 'PGRST116') {
        throw profileError;
      }

      if (profileData) {
        setProfile(profileData);

        // Load sample works
        const { data: worksData, error: worksError } = await supabase
          .from('artist_sample_works')
          .select(`
            *,
            media_file:media_files(*)
          `)
          .eq('artist_profile_id', profileData.id)
          .order('display_order', { ascending: true })
          .limit(6);

        console.log('Home: Sample works query result:', { worksData, worksError });
        if (worksError) throw worksError;
        setSampleWorks(worksData || []);

        // Load applications with event details
        const { data: appsData, error: appsError } = await supabase
          .from('artist_applications')
          .select(`
            *,
            event:events(
              id,
              name,
              event_start_datetime,
              venue,
              city:cities(name)
            )
          `)
          .eq('artist_profile_id', profileData.id)
          .order('applied_at', { ascending: false })
          .limit(5);

        console.log('Home: Applications query result:', { appsData, appsError });
        if (appsError) throw appsError;
        setApplications(appsData || []);
      } else {
        console.log('Home: No profile data found');
        setProfile(null);
      }
    } catch (err) {
      console.error('Home: Error in loadData:', err);
      setError('Failed to load data: ' + err.message);
    } finally {
      setLoading(false);
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
      <Badge color={config.color} variant="solid" size="1">
        {config.text}
      </Badge>
    );
  };

  const handleAcceptInvitation = async (eventId) => {
    setAccepting(prev => ({ ...prev, [eventId]: true }));
    setError('');

    try {
      const application = applications.find(app => app.event_id === eventId);
      
      const { error } = await supabase
        .from('artist_applications')
        .update({
          application_status: 'accepted',
          metadata: {
            ...application?.metadata,
            accepted_invitation_at: new Date().toISOString()
          }
        })
        .eq('id', application.id);

      if (error) throw error;

      // Reload data to show updated status
      await loadData();
    } catch (err) {
      setError('Failed to accept invitation: ' + err.message);
    } finally {
      setAccepting(prev => ({ ...prev, [eventId]: false }));
    }
  };

  if (authLoading || loading) {
    return (
      <Box>
        <Heading size="6" mb="4">Home</Heading>
        <Flex direction="column" gap="4">
          {[1, 2, 3].map((i) => (
            <Card key={i} size="3">
              <Skeleton height="80px" />
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
            <Heading size="6">Welcome to Art Battle Artists</Heading>
            <Text size="3" color="gray" align="center">
              Sign in to create your artist profile and apply to events
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

  if (!profile) {
    return (
      <Flex direction="column" gap="4">
        <Heading size="6">Welcome!</Heading>
        
        <Card size="3">
          <Flex direction="column" gap="4" align="center" py="6">
            <PersonIcon width="48" height="48" />
            <Text size="4" weight="bold">Complete Your Artist Profile</Text>
            <Text size="3" color="gray" align="center">
              Create your professional artist profile to start applying to Art Battle events
            </Text>
            <Button size="3" onClick={() => onNavigateToTab('profile')}>
              Create Profile
            </Button>
          </Flex>
        </Card>
      </Flex>
    );
  }

  return (
    <Flex direction="column" gap="6">
      <Flex direction="column" gap="2">
        <Heading size="6">Welcome back, {profile.name || 'Artist'}!</Heading>
        <Text size="3" color="gray">
          Your artist dashboard overview
        </Text>
      </Flex>

      {error && (
        <Callout.Root color="red">
          <Callout.Icon>
            <InfoCircledIcon />
          </Callout.Icon>
          <Callout.Text>{error}</Callout.Text>
        </Callout.Root>
      )}

      <Grid columns="1" gap="6">
        {/* Recent Applications */}
        <Card size="3">
          <Flex direction="column" gap="4">
            <Flex justify="between" align="center">
              <Heading size="5">Recent Applications</Heading>
              <Button size="2" variant="soft" onClick={() => onNavigateToTab('events')}>
                View All Events
              </Button>
            </Flex>
            
            {applications.length === 0 ? (
              <Flex direction="column" align="center" gap="3" py="4">
                <CalendarIcon width="32" height="32" />
                <Text size="2" color="gray">No applications yet</Text>
                <Button size="2" onClick={() => onNavigateToTab('events')}>
                  Browse Events
                </Button>
              </Flex>
            ) : (
              <Flex direction="column" gap="3">
                {applications.map((application) => (
                  <Flex key={application.id} direction="column" gap="2" p="3" 
                        style={{ backgroundColor: 'var(--gray-2)', borderRadius: '8px' }}>
                    <Flex justify="between" align="center">
                      <Flex direction="column" gap="1">
                        <Text size="3" weight="medium">
                          {application.event?.name}
                        </Text>
                        <Text size="2" color="gray">
                          {application.event?.event_start_datetime && 
                            formatDate(application.event.event_start_datetime)}
                          {application.event?.venue && ` • ${application.event.venue}`}
                          {application.event?.city?.name && ` • ${application.event.city.name}`}
                        </Text>
                      </Flex>
                      
                      <Flex align="center" gap="2">
                        {getStatusBadge(application.application_status)}
                      </Flex>
                    </Flex>
                    
                    {application.application_status === 'invited' && (
                      <Button
                        size="2"
                        variant="solid"
                        color="crimson"
                        disabled={accepting[application.event_id]}
                        loading={accepting[application.event_id]}
                        onClick={() => handleAcceptInvitation(application.event_id)}
                        style={{ 
                          fontSize: '12px',
                          fontWeight: 'bold',
                          textTransform: 'uppercase'
                        }}
                      >
                        <CheckCircledIcon width="14" height="14" />
                        Click to Accept and Confirm Attendance
                      </Button>
                    )}
                  </Flex>
                ))}
              </Flex>
            )}
          </Flex>
        </Card>

        {/* Profile Summary */}
        <Card size="3">
          <Flex direction="column" gap="4">
            <Flex justify="between" align="center">
              <Heading size="5">Profile Summary</Heading>
              <Button size="2" variant="soft" onClick={() => onNavigateToTab('profile')}>
                Edit Profile
              </Button>
            </Flex>
            
            <Grid columns={{ initial: '1', md: '2' }} gap="4">
              {/* Left Column - Profile Info */}
              <Flex direction="column" gap="3">
                <Flex direction="column" gap="2">
                  <Text size="5" weight="bold" style={{ color: 'var(--crimson-11)' }}>
                    {profile.name}
                  </Text>
                  
                  <Flex direction="column" gap="1">
                    {profile.city && profile.country && (
                      <Flex align="center" gap="2">
                        <Text size="2" color="gray">📍</Text>
                        <Text size="3" weight="medium">{profile.city}, {profile.country}</Text>
                      </Flex>
                    )}
                    {(profile.website || profile.instagram || profile.facebook) && (
                      <Flex align="center" gap="2">
                        <Text size="2" color="gray">🌐</Text>
                        <Text size="3">
                          {profile.website && 'Website'}
                          {profile.instagram && (profile.website ? ' • Instagram' : 'Instagram')}
                          {profile.facebook && ((profile.website || profile.instagram) ? ' • Facebook' : 'Facebook')}
                        </Text>
                      </Flex>
                    )}
                  </Flex>
                </Flex>

                {profile.bio && (
                  <Box>
                    <Text size="2" weight="medium" color="gray" mb="1" display="block">About</Text>
                    <Text size="3" style={{ 
                      display: '-webkit-box',
                      WebkitLineClamp: 4,
                      WebkitBoxOrient: 'vertical',
                      overflow: 'hidden',
                      lineHeight: '1.4'
                    }}>
                      {profile.bio}
                    </Text>
                  </Box>
                )}

              </Flex>

              {/* Right Column - Sample Works */}
              {sampleWorks.length > 0 && (
                <Box>
                  <Text size="2" weight="medium" color="gray" mb="3" display="block">Sample Works</Text>
                  <Grid columns="3" gap="2">
                    {sampleWorks.slice(0, 9).map((work) => {
                      const imageUrls = getArtworkImageUrls(null, work.media_file);
                      return (
                        <Box 
                          key={work.id} 
                          style={{ 
                            position: 'relative', 
                            aspectRatio: '1',
                            overflow: 'hidden',
                            borderRadius: '6px',
                            border: '2px solid var(--gray-6)',
                            transition: 'all 0.2s ease'
                          }}
                          className="sample-work-thumb"
                        >
                          <img
                            src={imageUrls.compressed || imageUrls.original}
                            alt={work.title || "Sample work"}
                            style={{
                              width: '100%',
                              height: '100%',
                              objectFit: 'cover',
                              transition: 'transform 0.2s ease'
                            }}
                            onMouseEnter={(e) => {
                              e.target.style.transform = 'scale(1.05)';
                              e.target.parentElement.style.borderColor = 'var(--crimson-8)';
                            }}
                            onMouseLeave={(e) => {
                              e.target.style.transform = 'scale(1)';
                              e.target.parentElement.style.borderColor = 'var(--gray-6)';
                            }}
                          />
                          {work.title && (
                            <Box
                              style={{
                                position: 'absolute',
                                bottom: '0',
                                left: '0',
                                right: '0',
                                background: 'linear-gradient(transparent, rgba(0,0,0,0.7))',
                                color: 'white',
                                padding: '8px 4px 4px',
                                fontSize: '10px',
                                fontWeight: '500',
                                opacity: '0',
                                transition: 'opacity 0.2s ease'
                              }}
                              className="work-title-overlay"
                            >
                              {work.title}
                            </Box>
                          )}
                        </Box>
                      );
                    })}
                  </Grid>
                  {sampleWorks.length > 9 && (
                    <Text size="1" color="gray" mt="2" display="block" align="center">
                      +{sampleWorks.length - 9} more works
                    </Text>
                  )}
                </Box>
              )}

              {/* Empty state for sample works */}
              {sampleWorks.length === 0 && (
                <Box>
                  <Text size="2" weight="medium" color="gray" mb="3" display="block">Sample Works</Text>
                  <Flex 
                    direction="column" 
                    align="center" 
                    justify="center" 
                    gap="2" 
                    style={{ 
                      height: '120px',
                      backgroundColor: 'var(--gray-3)',
                      borderRadius: '8px',
                      border: '1px dashed var(--gray-7)'
                    }}
                  >
                    <ImageIcon width="24" height="24" color="var(--gray-9)" />
                    <Text size="2" color="gray" align="center">
                      No sample works yet
                    </Text>
                    <Button 
                      size="1" 
                      variant="soft" 
                      onClick={() => onNavigateToTab('profile')}
                    >
                      Add Works
                    </Button>
                  </Flex>
                </Box>
              )}
            </Grid>
          </Flex>
        </Card>
      </Grid>
    </Flex>
  );
};

export default Home;
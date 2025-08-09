import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  Container,
  Heading,
  Text,
  Card,
  Flex,
  Badge,
  Separator,
  Box,
  Button,
  Grid,
  Avatar,
} from '@radix-ui/themes';
import { 
  PersonIcon, 
  GlobeIcon, 
  InstagramLogoIcon,
  TwitterLogoIcon,
  EnvelopeClosedIcon,
  MobileIcon,
  HomeIcon,
  CalendarIcon
} from '@radix-ui/react-icons';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { getArtworkImageUrls } from '../lib/imageHelpers';

const ProfileView = () => {
  const { id } = useParams();
  const { user, person } = useAuth();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [isOwnProfile, setIsOwnProfile] = useState(false);
  const [sampleWorks, setSampleWorks] = useState([]);

  useEffect(() => {
    fetchProfile();
    fetchSampleWorks();
  }, [id]);

  useEffect(() => {
    if (profile && person && profile.person_id === person.id) {
      setIsOwnProfile(true);
    }
  }, [profile, person]);

  const fetchProfile = async () => {
    try {
      const { data, error } = await supabase
        .from('artist_profiles')
        .select('*')
        .eq('id', id)
        .single();

      if (error) throw error;

      setProfile(data);
    } catch (err) {
      setError('Profile not found or failed to load');
    } finally {
      setLoading(false);
    }
  };

  const fetchSampleWorks = async () => {
    try {
      const { data, error } = await supabase
        .from('artist_sample_works')
        .select(`
          *,
          media_file:media_files(*)
        `)
        .eq('artist_profile_id', id)
        .order('display_order', { ascending: true });

      if (error) throw error;

      setSampleWorks(data || []);
    } catch (err) {
      console.error('Failed to load sample works:', err.message);
      // Don't show error for sample works, just silently fail
    }
  };

  const formatSocialLink = (platform, value) => {
    if (!value) return null;
    
    switch (platform) {
      case 'instagram':
        const igHandle = value.startsWith('@') ? value.slice(1) : value;
        return `https://instagram.com/${igHandle}`;
      case 'twitter':
        const twHandle = value.startsWith('@') ? value.slice(1) : value;
        return `https://twitter.com/${twHandle}`;
      case 'facebook':
        return value.startsWith('http') ? value : `https://facebook.com/${value}`;
      case 'website':
        return value.startsWith('http') ? value : `https://${value}`;
      default:
        return value;
    }
  };

  const SocialLink = ({ platform, value, icon: Icon, label }) => {
    if (!value) return null;
    
    const href = formatSocialLink(platform, value);
    
    return (
      <Flex align="center" gap="2">
        <Icon width="16" height="16" color="gray" />
        <Text size="2">
          <a href={href} target="_blank" rel="noopener noreferrer" 
             style={{ color: 'var(--accent-11)', textDecoration: 'none' }}>
            {label || value}
          </a>
        </Text>
      </Flex>
    );
  };

  if (loading) {
    return (
      <Container size="2" style={{ padding: '2rem' }}>
        <Flex direction="column" gap="4" align="center">
          <Text>Loading profile...</Text>
        </Flex>
      </Container>
    );
  }

  if (error || !profile) {
    return (
      <Container size="2" style={{ padding: '2rem' }}>
        <Card size="3">
          <Flex direction="column" gap="4" align="center">
            <PersonIcon width="48" height="48" color="gray" />
            <Heading size="6" color="gray">Profile Not Found</Heading>
            <Text size="3" color="gray" align="center">
              {error || 'The requested artist profile could not be found.'}
            </Text>
            <Button asChild>
              <Link to="/">Browse Artists</Link>
            </Button>
          </Flex>
        </Card>
      </Container>
    );
  }

  return (
    <Container size="3" style={{ padding: '2rem' }}>
      <Flex direction="column" gap="6">
        {/* Header */}
        <Flex justify="between" align="start">
          <Flex direction="column" gap="1">
            <Heading size="7">{profile.name || 'Artist Profile'}</Heading>
            {profile.city && profile.country && (
              <Flex align="center" gap="1">
                <HomeIcon width="14" height="14" color="gray" />
                <Text size="3" color="gray">
                  {profile.city}, {profile.country}
                </Text>
              </Flex>
            )}
          </Flex>
          
          {isOwnProfile && (
            <Button asChild>
              <Link to="/edit">Edit Profile</Link>
            </Button>
          )}
        </Flex>

        <Grid columns={{ initial: '1', md: '2' }} gap="6">
          {/* Main Info */}
          <Flex direction="column" gap="6">
            {/* Bio */}
            {profile.bio && (
              <Card size="3">
                <Flex direction="column" gap="3">
                  <Heading size="4">About</Heading>
                  <Text style={{ whiteSpace: 'pre-wrap', lineHeight: '1.6' }}>
                    {profile.bio}
                  </Text>
                </Flex>
              </Card>
            )}

            {/* Specialties */}
            {profile.specialties && profile.specialties.length > 0 && (
              <Card size="3">
                <Flex direction="column" gap="3">
                  <Heading size="4">Specialties</Heading>
                  <Flex wrap="wrap" gap="2">
                    {profile.specialties.map((specialty, index) => (
                      <Badge key={index} color="crimson" size="2">
                        {specialty}
                      </Badge>
                    ))}
                  </Flex>
                </Flex>
              </Card>
            )}
          </Flex>

          {/* Sidebar Info */}
          <Flex direction="column" gap="6">
            {/* Experience & Location */}
            <Card size="3">
              <Flex direction="column" gap="4">
                <Heading size="4">Details</Heading>
                
                {profile.years_experience && (
                  <Flex align="center" gap="2">
                    <CalendarIcon width="16" height="16" color="gray" />
                    <Text size="2">
                      {profile.years_experience} years of experience
                    </Text>
                  </Flex>
                )}
                
                {profile.studio_location && (
                  <Flex align="center" gap="2">
                    <HomeIcon width="16" height="16" color="gray" />
                    <Text size="2">Studio: {profile.studio_location}</Text>
                  </Flex>
                )}

                {profile.created_at && (
                  <Flex align="center" gap="2">
                    <CalendarIcon width="16" height="16" color="gray" />
                    <Text size="2" color="gray">
                      Member since {new Date(profile.created_at).getFullYear()}
                    </Text>
                  </Flex>
                )}
              </Flex>
            </Card>

            {/* Contact & Social */}
            <Card size="3">
              <Flex direction="column" gap="4">
                <Heading size="4">Connect</Heading>
                
                <Flex direction="column" gap="3">
                  <SocialLink 
                    platform="website" 
                    value={profile.website} 
                    icon={GlobeIcon}
                    label="Website"
                  />
                  
                  <SocialLink 
                    platform="instagram" 
                    value={profile.instagram} 
                    icon={InstagramLogoIcon}
                    label={`@${profile.instagram?.replace('@', '')}`}
                  />
                  
                  <SocialLink 
                    platform="twitter" 
                    value={profile.twitter} 
                    icon={TwitterLogoIcon}
                    label={`@${profile.twitter?.replace('@', '')}`}
                  />

                  {profile.email && (
                    <Flex align="center" gap="2">
                      <EnvelopeClosedIcon width="16" height="16" color="gray" />
                      <Text size="2">
                        <a href={`mailto:${profile.email}`} 
                           style={{ color: 'var(--accent-11)', textDecoration: 'none' }}>
                          {profile.email}
                        </a>
                      </Text>
                    </Flex>
                  )}
                </Flex>
              </Flex>
            </Card>
          </Flex>
        </Grid>

        {/* Sample Works Gallery */}
        {sampleWorks.length > 0 && (
          <Flex direction="column" gap="4">
            <Heading size="6">Sample Works</Heading>
            <Grid columns={{ initial: '2', sm: '3', md: '4' }} gap="4">
              {sampleWorks.map((work) => {
                const imageUrls = getArtworkImageUrls(null, work.media_file);
                return (
                  <Card key={work.id} size="1">
                    <Box style={{ position: 'relative', aspectRatio: '1', overflow: 'hidden', borderRadius: '8px' }}>
                      <img
                        src={imageUrls.compressed || imageUrls.original}
                        alt="Sample work"
                        style={{
                          width: '100%',
                          height: '100%',
                          objectFit: 'cover'
                        }}
                      />
                    </Box>
                  </Card>
                );
              })}
            </Grid>
          </Flex>
        )}

        <Separator size="4" />

        {/* Footer */}
        <Flex justify="center">
          <Text size="2" color="gray">
            Art Battle Artist Profile
          </Text>
        </Flex>
      </Flex>
    </Container>
  );
};

export default ProfileView;
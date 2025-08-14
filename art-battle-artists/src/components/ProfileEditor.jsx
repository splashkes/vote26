import { useState, useEffect, useRef } from 'react';
import {
  Heading,
  Text,
  Card,
  Flex,
  TextField,
  TextArea,
  Button,
  Badge,
  Separator,
  Box,
  Callout,
  Grid,
  Select,
} from '@radix-ui/themes';
import { PersonIcon, InfoCircledIcon, CheckIcon } from '@radix-ui/react-icons';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import AuthModal from './AuthModal';
import SampleWorksUpload from './SampleWorksUpload';

const ProfileEditor = () => {
  const { user, person, loading } = useAuth();
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [profiles, setProfiles] = useState([]);
  const [selectedProfile, setSelectedProfile] = useState(null);
  const [profile, setProfile] = useState({
    name: '',
    bio: '',
    website: '',
    instagram: '',
    facebook: '',
    twitter: '',
    city: '',
    country: '',
    email: '',
    phone: '',
  });
  const [profileLoading, setProfileLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [countries, setCountries] = useState([]);
  const [saveMessage, setSaveMessage] = useState('');
  const [error, setError] = useState('');
  const [artistProfileId, setArtistProfileId] = useState(null);
  const [isCreatingNew, setIsCreatingNew] = useState(false);
  const isEditingRef = useRef(false);

  // E.164 phone number formatting and parsing
  const parseAndFormatPhone = (input) => {
    // Remove all non-digits
    const digits = input.replace(/\D/g, '');
    
    // Handle empty input
    if (!digits) return '';
    
    // Handle various input patterns
    if (digits.length <= 3) {
      // Too short to determine format, just show what they typed
      return digits;
    } else if (digits.length === 10) {
      // US/Canada format without country code
      return `+1 ${digits.slice(0,3)} ${digits.slice(3,6)} ${digits.slice(6)}`;
    } else if (digits.length === 11 && digits.startsWith('1')) {
      // US/Canada format with 1 prefix
      return `+1 ${digits.slice(1,4)} ${digits.slice(4,7)} ${digits.slice(7)}`;
    } else if (digits.length >= 7 && digits.length <= 15) {
      // International format - try to format nicely
      if (digits.length <= 10) {
        return `+${digits}`;
      } else {
        // Format with spaces for readability
        return `+${digits.slice(0, Math.min(3, digits.length))} ${digits.slice(Math.min(3, digits.length))}`;
      }
    }
    
    // Fallback for edge cases
    return `+${digits}`;
  };

  const formatPhoneForSaving = (displayValue) => {
    // Convert display format back to pure E.164 for database storage
    const digits = displayValue.replace(/\D/g, '');
    if (!digits) return '';
    
    if (digits.length === 10) {
      return `+1${digits}`;
    } else if (digits.length === 11 && digits.startsWith('1')) {
      return `+${digits}`;
    } else if (digits.length >= 7 && digits.length <= 15) {
      return `+${digits}`;
    }
    
    return displayValue;
  };

  const validatePhoneE164 = (phone) => {
    if (!phone) return true; // Empty is OK
    // Accept both display format and E.164 format for validation
    const cleanedPhone = formatPhoneForSaving(phone);
    const e164Regex = /^\+[1-9]\d{1,14}$/;
    return e164Regex.test(cleanedPhone);
  };

  useEffect(() => {
    if (!loading && user && person) {
      fetchProfiles();
    } else if (!loading && !user) {
      setProfileLoading(false);
    }
  }, [user, person, loading]);

  useEffect(() => {
    fetchCountries();
  }, []);

  const fetchCountries = async () => {
    try {
      const { data, error } = await supabase
        .from('countries')
        .select('name, code')
        .order('name');

      if (error) throw error;
      setCountries(data || []);
    } catch (error) {
      console.error('Error fetching countries:', error);
      // Fallback to a basic list if database fetch fails
      setCountries([
        { name: 'Canada', code: 'CA' },
        { name: 'United States', code: 'US' },
        { name: 'United Kingdom', code: 'GB' },
      ]);
    }
  };

  const fetchProfiles = async () => {
    if (isEditingRef.current) {
      return;
    }

    try {
      const { data: profilesData, error: profilesError } = await supabase
        .from('artist_profiles')
        .select('*')
        .eq('person_id', person.id)
        .order('created_at', { ascending: true });

      if (profilesError) {
        throw profilesError;
      }

      if (profilesData && profilesData.length > 0) {
        setProfiles(profilesData);
        // Auto-select first profile if none selected
        const currentProfile = selectedProfile || profilesData[0];
        setSelectedProfile(currentProfile);
        loadProfileData(currentProfile);
      } else {
        setProfiles([]);
        setSelectedProfile(null);
        // Set up for new profile creation
        setIsCreatingNew(true);
        setProfile({
          name: person.name || '',
          bio: '',
          website: '',
          instagram: '',
          facebook: '',
          twitter: '',
          city: '',
          country: '',
          email: user.email || '',
          phone: parseAndFormatPhone(user.phone || ''),
        });
      }
    } catch (err) {
      setError('Failed to load profiles: ' + err.message);
    } finally {
      setProfileLoading(false);
    }
  };

  const loadProfileData = (profileData) => {
    setArtistProfileId(profileData.id);
    setIsCreatingNew(false);
    setProfile({
      name: profileData.name || '',
      bio: profileData.bio || '',
      website: profileData.website || '',
      instagram: profileData.instagram || '',
      facebook: profileData.facebook || '',
      twitter: profileData.twitter || '',
      city: profileData.city || profileData.city_text || '',
      country: profileData.country || '',
      email: profileData.email || '',
      phone: parseAndFormatPhone(profileData.phone || user.phone || ''),
    });
  };

  const handleProfileSelect = (profileData) => {
    setSelectedProfile(profileData);
    loadProfileData(profileData);
    setSaveMessage('');
    setError('');
  };

  const handleCreateNew = () => {
    setSelectedProfile(null);
    setArtistProfileId(null);
    setIsCreatingNew(true);
    setProfile({
      name: '',
      bio: '',
      website: '',
      instagram: '',
      facebook: '',
      twitter: '',
      city: '',
      country: '',
      email: user.email || '',
      phone: parseAndFormatPhone(user.phone || ''),
    });
    setSaveMessage('');
    setError('');
  };

  const handleSave = async () => {
    if (!user || !person) return;

    setSaving(true);
    setError('');

    try {
      // Validate phone number if provided
      if (profile.phone && !validatePhoneE164(profile.phone)) {
        setError('Please enter a valid phone number in international format (e.g., +1 234 567 8900)');
        return;
      }

      const profileData = {
        person_id: person.id,
        name: profile.name,
        bio: profile.bio,
        website: profile.website,
        instagram: profile.instagram,
        facebook: profile.facebook,
        twitter: profile.twitter,
        city: profile.city,
        city_text: profile.city,
        country: profile.country,
        email: profile.email,
        phone: formatPhoneForSaving(profile.phone),
        updated_at: new Date().toISOString(),
      };

      let data, error;
      
      if (artistProfileId) {
        // Update existing profile
        const result = await supabase
          .from('artist_profiles')
          .update(profileData)
          .eq('id', artistProfileId)
          .select();
        
        if (result.error) {
          error = result.error;
        } else {
          data = result.data?.[0]; // Take first row if multiple returned
        }
      } else {
        // Check if profile already exists for this person
        const { data: existingProfile } = await supabase
          .from('artist_profiles')
          .select('id')
          .eq('person_id', person.id)
          .limit(1);
        
        if (existingProfile && existingProfile.length > 0) {
          // Update existing profile instead
          const result = await supabase
            .from('artist_profiles')
            .update(profileData)
            .eq('person_id', person.id)
            .select();
          
          if (result.error) {
            error = result.error;
          } else {
            data = result.data?.[0];
          }
        } else {
          // Insert new profile
          const result = await supabase
            .from('artist_profiles')
            .insert(profileData)
            .select();
          
          if (result.error) {
            error = result.error;
          } else {
            data = result.data?.[0];
          }
        }
      }

      if (error) throw error;

      if (data) {
        if (!artistProfileId) {
          setArtistProfileId(data.id);
          setSelectedProfile(data);
          setIsCreatingNew(false);
        }
        
        // Refresh the profiles list to show updated data
        await fetchProfiles();
      }

      setSaveMessage('Profile saved successfully!');
      setTimeout(() => setSaveMessage(''), 3000);
    } catch (err) {
      setError('Failed to save profile: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleInputChange = (field, value) => {
    isEditingRef.current = true;
    
    // Special handling for phone number
    if (field === 'phone') {
      value = parseAndFormatPhone(value);
    }
    
    setProfile(prev => ({ ...prev, [field]: value }));
    if (saveMessage) setSaveMessage('');
    if (error) setError('');
  };

  const handleInputBlur = () => {
    setTimeout(() => {
      isEditingRef.current = false;
    }, 100);
  };

  if (loading || profileLoading) {
    return (
      <Flex direction="column" gap="4" align="center">
        <Text>Loading...</Text>
      </Flex>
    );
  }

  if (!user) {
    return (
      <>
        <Card size="3">
          <Flex direction="column" gap="4" align="center">
            <PersonIcon width="48" height="48" />
            <Heading size="6">Artist Profile Management</Heading>
            <Text size="3" color="gray" align="center">
              Sign in to create and manage your artist profile
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
    <Flex direction="column" gap="6">
      <Flex direction="column" gap="4">
        <Heading size="6">
          Artist Profile
        </Heading>
        <Text size="3" color="gray">
          Create and manage your professional artist profile
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

      {saveMessage && (
        <Callout.Root color="green">
          <Callout.Icon>
            <CheckIcon />
          </Callout.Icon>
          <Callout.Text>{saveMessage}</Callout.Text>
        </Callout.Root>
      )}

      <Grid columns="1" gap="6">
        <Card size="3">
          <Flex direction="column" gap="4">
            <Heading size="5">Basic Information</Heading>
            
            <Flex direction="column" gap="2">
              <Text size="2" weight="medium">Name *</Text>
              <TextField.Root
                placeholder="Your full name"
                value={profile.name}
                onChange={(e) => handleInputChange('name', e.target.value)}
              />
            </Flex>

            <Flex direction="column" gap="2">
              <Text size="2" weight="medium">Bio</Text>
              <TextArea
                placeholder="Tell us about yourself, your artistic journey, and what inspires you..."
                value={profile.bio}
                onChange={(e) => handleInputChange('bio', e.target.value)}
                onBlur={handleInputBlur}
                rows={4}
              />
            </Flex>

          </Flex>
        </Card>

        <Card size="3">
          <Flex direction="column" gap="4">
            <Heading size="5">Location</Heading>
            
            <Flex gap="3">
              <Flex direction="column" gap="2" style={{ flex: 1 }}>
                <Text size="2" weight="medium">City</Text>
                <TextField.Root
                  placeholder="Your city"
                  value={profile.city}
                  onChange={(e) => handleInputChange('city', e.target.value)}
                />
              </Flex>
              <Flex direction="column" gap="2" style={{ flex: 1 }}>
                <Text size="2" weight="medium">Country</Text>
                <Select.Root
                  value={profile.country}
                  onValueChange={(value) => handleInputChange('country', value)}
                >
                  <Select.Trigger placeholder="Select your country" />
                  <Select.Content>
                    {countries.map((country) => (
                      <Select.Item key={country.code} value={country.code}>
                        {country.name}
                      </Select.Item>
                    ))}
                  </Select.Content>
                </Select.Root>
              </Flex>
            </Flex>
          </Flex>
        </Card>

        <Card size="3">
          <Flex direction="column" gap="4">
            <Heading size="5">Contact Information</Heading>
            
            <Flex gap="3">
              <Flex direction="column" gap="2" style={{ flex: 1 }}>
                <Text size="2" weight="medium">Email</Text>
                <TextField.Root
                  type="email"
                  placeholder="your@email.com"
                  value={profile.email}
                  onChange={(e) => handleInputChange('email', e.target.value)}
                />
              </Flex>
              <Flex direction="column" gap="2" style={{ flex: 1 }}>
                <Text size="2" weight="medium">Phone</Text>
                <TextField.Root
                  type="tel"
                  placeholder="+1 234 567 8900"
                  value={profile.phone}
                  onChange={(e) => handleInputChange('phone', e.target.value)}
                  style={{
                    borderColor: profile.phone && !validatePhoneE164(profile.phone) ? 'var(--red-8)' : undefined
                  }}
                />
                {profile.phone && !validatePhoneE164(profile.phone) && (
                  <Text size="1" color="red">
                    Please enter a valid phone number (e.g., +1 234 567 8900)
                  </Text>
                )}
              </Flex>
            </Flex>
          </Flex>
        </Card>

        <Card size="3">
          <Flex direction="column" gap="4">
            <Heading size="5">Online Presence</Heading>
            
            <Flex direction="column" gap="2">
              <Text size="2" weight="medium">Website</Text>
              <TextField.Root
                placeholder="https://yourwebsite.com"
                value={profile.website}
                onChange={(e) => handleInputChange('website', e.target.value)}
              />
            </Flex>

            <Flex gap="3">
              <Flex direction="column" gap="2" style={{ flex: 1 }}>
                <Text size="2" weight="medium">Instagram</Text>
                <TextField.Root
                  placeholder="@yourusername"
                  value={profile.instagram}
                  onChange={(e) => handleInputChange('instagram', e.target.value)}
                />
              </Flex>
              <Flex direction="column" gap="2" style={{ flex: 1 }}>
                <Text size="2" weight="medium">Facebook</Text>
                <TextField.Root
                  placeholder="facebook.com/yourpage"
                  value={profile.facebook}
                  onChange={(e) => handleInputChange('facebook', e.target.value)}
                />
              </Flex>
            </Flex>

            <Flex direction="column" gap="2">
              <Text size="2" weight="medium">Twitter/X</Text>
              <TextField.Root
                placeholder="@yourusername"
                value={profile.twitter}
                onChange={(e) => handleInputChange('twitter', e.target.value)}
              />
            </Flex>
          </Flex>
        </Card>


        {artistProfileId && (
          <SampleWorksUpload 
            artistProfileId={artistProfileId}
            onWorksChange={(works) => {
              console.log('Sample works updated:', works.length);
            }}
          />
        )}
      </Grid>

      <Separator size="4" />

      <Flex justify="end" gap="3">
        <Button 
          size="3" 
          onClick={handleSave} 
          disabled={saving}
          loading={saving}
        >
          {saving ? 'Saving...' : (isCreatingNew ? 'Create Profile' : 'Update Profile')}
        </Button>
      </Flex>
    </Flex>
  );
};

export default ProfileEditor;
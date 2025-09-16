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
import ProfileForm from './ProfileForm';

const ProfileEditor = ({ onProfileSuccess }) => {
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
    if (!loading && user) {
      // Load profiles for authenticated users regardless of person state
      // The backend functions and ProfileForm will handle person creation/linking
      fetchProfiles();
    } else if (!loading && !user) {
      setProfileLoading(false);
    }
  }, [user, loading]); // Initial load without person dependency

  // Separate effect to refetch when person data becomes available
  useEffect(() => {
    if (!loading && user && person && !isEditingRef.current) {
      console.log('ProfileEditor: Person data now available, refetching profiles');
      fetchProfiles();
    }
  }, [person]); // Only re-run when person changes from null to data

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
      // If person is not available yet, set up for new profile creation
      if (!person) {
        console.log('ProfileEditor: Person data not available yet, setting up for new profile creation');
        setProfiles([]);
        setSelectedProfile(null);
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
        setProfileLoading(false);
        return;
      }

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

      {/* ===== SAMPLE WORKS UPLOAD (MOVED TO TOP FOR VISIBILITY) ===== */}
      {artistProfileId && (
        <SampleWorksUpload 
          artistProfileId={artistProfileId}
          onWorksChange={(works) => {
            console.log('Sample works updated:', works.length);
          }}
        />
      )}
      
      {/* ===== PROFILE FORM ===== */}
      <ProfileForm 
        existingProfile={selectedProfile}
        onSuccess={(profile) => {
          setSelectedProfile(profile);
          setArtistProfileId(profile.id);
          setIsCreatingNew(false);
          
          // Trigger refresh of other tabs
          if (onProfileSuccess) {
            onProfileSuccess(profile);
          }
          setSaveMessage('');
          setError('');
          // Refresh profiles list
          fetchProfiles();
        }}
      />
    </Flex>
  );
};

export default ProfileEditor;
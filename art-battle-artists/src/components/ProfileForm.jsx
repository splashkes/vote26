import { useState, useEffect } from 'react';
import {
  Text,
  Card,
  Flex,
  TextField,
  TextArea,
  Button,
  Callout,
  Select,
  Box,
} from '@radix-ui/themes';
import { InfoCircledIcon, CheckIcon } from '@radix-ui/react-icons';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';

const ProfileForm = ({ existingProfile = null, onSuccess }) => {
  const { user, person, refreshAuth } = useAuth();
  const [formData, setFormData] = useState({
    name: '',
    bio: '',
    city: '',
    country: '',
    email: '',
    website: '',
    instagram: '',
    facebook: '',
    twitter: '',
  });
  
  const [countries, setCountries] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [validationErrors, setValidationErrors] = useState({});

  const isEditing = !!existingProfile;

  // Load countries first
  useEffect(() => {
    fetchCountries();
  }, []);

  // Load existing profile data AFTER countries are loaded
  useEffect(() => {
    // Only set form data once we have countries loaded (or it's a new profile)
    if (existingProfile && countries.length > 0) {
      setFormData({
        name: existingProfile.name || '',
        bio: existingProfile.bio || '',
        city: existingProfile.city || '',
        country: existingProfile.country || '',
        email: existingProfile.email || user?.email || '',
        website: existingProfile.website || '',
        instagram: existingProfile.instagram || '',
        facebook: existingProfile.facebook || '',
        twitter: existingProfile.twitter || '',
      });
    } else if (!existingProfile) {
      // New profile - pre-fill email from auth
      setFormData(prev => ({
        ...prev,
        email: user?.email || '',
      }));
    }
  }, [existingProfile, user, countries]);

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
      // Fallback list
      setCountries([
        { name: 'Canada', code: 'CA' },
        { name: 'United States', code: 'US' },
        { name: 'United Kingdom', code: 'GB' },
        { name: 'Australia', code: 'AU' },
      ]);
    }
  };

  const autoFixWebsiteUrl = (url) => {
    if (!url || !url.trim()) return url;
    
    const trimmed = url.trim();
    
    // If it already starts with http:// or https://, leave it as is
    if (/^https?:\/\//.test(trimmed)) {
      return trimmed;
    }
    
    // Auto-add https:// to common domains or any URL without protocol
    return `https://${trimmed}`;
  };

  const handleChange = (field, value) => {
    // Auto-fix website URLs when user enters them
    if (field === 'website' && value) {
      value = autoFixWebsiteUrl(value);
    }
    
    setFormData(prev => ({ ...prev, [field]: value }));
    
    // Clear validation error when user starts typing
    if (validationErrors[field]) {
      setValidationErrors(prev => ({ ...prev, [field]: null }));
    }
    
    // Clear success/error messages
    if (error) setError('');
    if (success) setSuccess('');
  };

  const validateForm = () => {
    const errors = {};

    // Required fields
    if (!formData.name.trim()) {
      errors.name = 'Name is required';
    }

    // Email is required
    if (!formData.email || !formData.email.trim()) {
      errors.email = 'Email is required';
    } else {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(formData.email.trim())) {
        errors.email = 'Please enter a valid email address';
      }
    }

    // Website validation (if provided) - now more lenient since we auto-fix URLs
    if (formData.website && formData.website.trim()) {
      const websiteValue = formData.website.trim();
      // Basic validation to ensure it's a reasonable URL format
      const validUrlRegex = /^https?:\/\/[^\s/$.?#].[^\s]*$/;
      if (!validUrlRegex.test(websiteValue)) {
        errors.website = 'Please enter a valid website URL';
      }
    }

    // Instagram validation (if provided)
    if (formData.instagram && formData.instagram.trim()) {
      const instagramValue = formData.instagram.trim();
      if (instagramValue.includes('@') && !instagramValue.startsWith('@')) {
        errors.instagram = 'Instagram handle should start with @ or just be the username';
      }
    }

    // Twitter validation (if provided)
    if (formData.twitter && formData.twitter.trim()) {
      const twitterValue = formData.twitter.trim();
      if (twitterValue.includes('@') && !twitterValue.startsWith('@')) {
        errors.twitter = 'Twitter handle should start with @ or just be the username';
      }
    }

    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!validateForm()) {
      setError('Please fix the errors below');
      return;
    }

    setLoading(true);
    setError('');
    setSuccess('');

    try {
      const functionName = isEditing ? 'update-profile-clean' : 'create-profile-clean';
      
      // Validation for editing mode
      if (isEditing && !existingProfile?.id) {
        throw new Error('Cannot update profile: profile ID is missing. Please refresh and try again.');
      }
      
      // No need to validate person.id - it will be read from JWT claims in the edge function
      
      const payload = isEditing 
        ? {
            profile_id: existingProfile.id,
            ...formData,
          }
        : {
            ...formData,
          };

      const { data, error: funcError } = await supabase.functions.invoke(functionName, {
        body: payload
      });

      if (funcError || !data?.success) {
        throw new Error(data?.error || funcError?.message || 'Operation failed');
      }

      setSuccess(isEditing ? 'Profile updated successfully!' : 'Profile created successfully!');
      
      // Clear any lingering validation errors on success
      setValidationErrors({});
      
      // Scroll to very top to show success message and sample works
      // Try multiple scroll methods for better browser compatibility
      setTimeout(() => {
        window.scrollTo({ top: 0, behavior: 'smooth' });
        document.documentElement.scrollTop = 0;
        document.body.scrollTop = 0;
        // Also try scrolling any potential scroll containers
        const scrollContainers = document.querySelectorAll('[data-scroll-container], .scroll-container, main, .main-content');
        scrollContainers.forEach(container => {
          if (container.scrollTo) {
            container.scrollTo({ top: 0, behavior: 'smooth' });
          } else {
            container.scrollTop = 0;
          }
        });
      }, 100);
      
      // For new profile creation, refresh auth to get updated JWT claims
      if (!isEditing && refreshAuth) {
        console.log('🔄 Refreshing auth after new profile creation...');
        await refreshAuth();
      }
      
      // Call success callback with the new/updated profile
      if (onSuccess) {
        onSuccess(data.profile);
      }

    } catch (err) {
      console.error('Profile operation error:', err);
      setError(err.message || 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card size="3">
      <form onSubmit={handleSubmit}>
        <Flex direction="column" gap="6">
          <Text size="5" weight="bold">
            {isEditing ? 'Edit Your Profile' : 'Create Your Artist Profile'}
          </Text>

          {error && (
            <Callout.Root color="red">
              <Callout.Icon><InfoCircledIcon /></Callout.Icon>
              <Callout.Text>{error}</Callout.Text>
            </Callout.Root>
          )}

          {success && (
            <Callout.Root color="green">
              <Callout.Icon><CheckIcon /></Callout.Icon>
              <Callout.Text>{success}</Callout.Text>
            </Callout.Root>
          )}

          {/* Basic Information */}
          <Card size="2" style={{ backgroundColor: 'var(--gray-2)' }}>
            <Flex direction="column" gap="4">
              <Text size="4" weight="medium">Basic Information</Text>
              
              <Flex direction="column" gap="2">
                <Text size="2" weight="medium">Full Name *</Text>
                <TextField.Root
                  placeholder="Enter your full name"
                  value={formData.name}
                  onChange={(e) => handleChange('name', e.target.value)}
                  tabIndex={1}
                  style={{
                    borderColor: validationErrors.name ? 'var(--red-8)' : undefined
                  }}
                />
                {validationErrors.name && (
                  <Text size="1" color="red">{validationErrors.name}</Text>
                )}
                <Text size="1" color="gray">
                  This name will be shown for public voting if selected
                </Text>
              </Flex>

              <Flex direction="column" gap="2">
                <Text size="2" weight="medium">Bio</Text>
                <TextArea
                  placeholder="Tell us about yourself, your artistic journey, and what inspires you..."
                  value={formData.bio}
                  onChange={(e) => handleChange('bio', e.target.value)}
                  rows={4}
                  tabIndex={2}
                />
                <Text size="1" color="gray">
                  Share your story, artistic style, experience, or anything you'd like people to know about you.
                </Text>
              </Flex>
            </Flex>
          </Card>

          {/* Location */}
          <Card size="2" style={{ backgroundColor: 'var(--gray-2)' }}>
            <Flex direction="column" gap="4">
              <Text size="4" weight="medium">Location</Text>
              
              <Flex gap="3">
                <Flex direction="column" gap="2" style={{ flex: 1 }}>
                  <Text size="2" weight="medium">Country</Text>
                  <Select.Root
                    value={countries.length > 0 ? (formData.country || undefined) : undefined}
                    onValueChange={(value) => handleChange('country', value)}
                  >
                    <Select.Trigger
                      placeholder={countries.length === 0 ? "Loading countries..." : "Select country"}
                      tabIndex={3}
                    />
                    <Select.Content position="popper" sideOffset={5}>
                      {countries.map((country) => (
                        <Select.Item key={country.code} value={country.code}>
                          {country.name} ({country.code})
                        </Select.Item>
                      ))}
                    </Select.Content>
                  </Select.Root>
                </Flex>
                
                <Flex direction="column" gap="2" style={{ flex: 1 }}>
                  <Text size="2" weight="medium">City</Text>
                  <TextField.Root
                    placeholder="Your city"
                    value={formData.city}
                    onChange={(e) => handleChange('city', e.target.value)}
                    tabIndex={4}
                  />
                </Flex>
              </Flex>
            </Flex>
          </Card>

          {/* Contact Information */}
          <Card size="2" style={{ backgroundColor: 'var(--gray-2)' }}>
            <Flex direction="column" gap="4">
              <Text size="4" weight="medium">Contact Information</Text>
              
              <Flex direction="column" gap="2">
                <Text size="2" weight="medium">Email *</Text>
                <TextField.Root
                  type="email"
                  placeholder="your@email.com"
                  value={formData.email}
                  onChange={(e) => handleChange('email', e.target.value)}
                  tabIndex={5}
                  style={{
                    borderColor: validationErrors.email ? 'var(--red-8)' : undefined
                  }}
                />
                {validationErrors.email && (
                  <Text size="1" color="red">{validationErrors.email}</Text>
                )}
              </Flex>
            </Flex>
          </Card>

          {/* Online Presence */}
          <Card size="2" style={{ backgroundColor: 'var(--gray-2)' }}>
            <Flex direction="column" gap="4">
              <Text size="4" weight="medium">Online Presence</Text>
              
              <Flex direction="column" gap="2">
                <Text size="2" weight="medium">Website</Text>
                <TextField.Root
                  placeholder="https://yourwebsite.com"
                  value={formData.website}
                  onChange={(e) => handleChange('website', e.target.value)}
                  style={{
                    borderColor: validationErrors.website ? 'var(--red-8)' : undefined
                  }}
                />
                {validationErrors.website && (
                  <Text size="1" color="red">{validationErrors.website}</Text>
                )}
              </Flex>

              <Flex gap="3">
                <Flex direction="column" gap="2" style={{ flex: 1 }}>
                  <Text size="2" weight="medium">Instagram</Text>
                  <TextField.Root
                    placeholder="@yourusername"
                    value={formData.instagram}
                    onChange={(e) => handleChange('instagram', e.target.value)}
                    style={{
                      borderColor: validationErrors.instagram ? 'var(--red-8)' : undefined
                    }}
                  />
                  {validationErrors.instagram && (
                    <Text size="1" color="red">{validationErrors.instagram}</Text>
                  )}
                </Flex>
                
                <Flex direction="column" gap="2" style={{ flex: 1 }}>
                  <Text size="2" weight="medium">Facebook</Text>
                  <TextField.Root
                    placeholder="facebook.com/yourpage"
                    value={formData.facebook}
                    onChange={(e) => handleChange('facebook', e.target.value)}
                  />
                </Flex>
              </Flex>

              <Flex direction="column" gap="2">
                <Text size="2" weight="medium">Twitter/X</Text>
                <TextField.Root
                  placeholder="@yourusername"
                  value={formData.twitter}
                  onChange={(e) => handleChange('twitter', e.target.value)}
                  style={{
                    borderColor: validationErrors.twitter ? 'var(--red-8)' : undefined
                  }}
                />
                {validationErrors.twitter && (
                  <Text size="1" color="red">{validationErrors.twitter}</Text>
                )}
              </Flex>
            </Flex>
          </Card>

          <Flex justify="end" gap="3">
            <Button 
              type="submit"
              size="3" 
              disabled={loading}
              loading={loading}
            >
              {loading 
                ? (isEditing ? 'Updating...' : 'Creating...') 
                : (isEditing ? 'Update Profile' : 'Create Profile')
              }
            </Button>
          </Flex>
        </Flex>
      </form>
    </Card>
  );
};

export default ProfileForm;
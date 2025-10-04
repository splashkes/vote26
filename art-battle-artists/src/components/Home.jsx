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
  Dialog,
  TextArea,
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
import AuthModal from './AuthModal';
import InvitationAcceptanceModal from './InvitationAcceptanceModal';
import PaymentStatusBanner from './PaymentStatusBanner';
import ServerNotes from './ServerNotes';


const Home = ({ onNavigateToTab, onProfilePickerChange }) => {
  const { user, person, loading: authLoading } = useAuth();
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [profiles, setProfiles] = useState([]);
  const [selectedProfile, setSelectedProfile] = useState(null);
  const [candidateProfiles, setCandidateProfiles] = useState([]);
  const [showProfilePicker, setShowProfilePicker] = useState(false);
  const [showCreateNewProfile, setShowCreateNewProfile] = useState(false);
  const [applications, setApplications] = useState([]);
  const [invitations, setInvitations] = useState([]);
  const [confirmations, setConfirmations] = useState([]);
  const [hasRecentActivity, setHasRecentActivity] = useState(false);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [selectedConfirmation, setSelectedConfirmation] = useState(null);
  const [cancelReason, setCancelReason] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [accepting, setAccepting] = useState({});
  const [showInvitationModal, setShowInvitationModal] = useState(false);
  const [selectedInvitation, setSelectedInvitation] = useState(null);

  useEffect(() => {
    if (!authLoading && user) {
      // Load data for authenticated users regardless of person state
      // The backend functions will handle person creation/linking
      loadData();
    } else if (!authLoading && !user) {
      setLoading(false);
    }
  }, [user, authLoading]); // Removed person dependency

  // Notify parent when profile picker state changes
  useEffect(() => {
    if (onProfilePickerChange) {
      onProfilePickerChange(showProfilePicker);
    }
  }, [showProfilePicker, onProfilePickerChange]);

  const loadData = async () => {
    console.log('Home: Starting loadData, person:', person);
    try {
      // Use secure profile lookup that handles all cases server-side
      await handleProfileLookup();
    } catch (err) {
      console.error('Home: Error in loadData:', err);
      setError('Failed to load data: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleProfileLookup = async () => {
    try {
      console.log('Home: Getting authoritative profile for authenticated user');
      
      // Call the secure edge function that handles all the logic server-side
      const { data, error } = await supabase.functions.invoke('artist-get-my-profile');

      console.log('Home: Secure profile lookup result:', { data, error });

      if (error) {
        console.error('Secure profile lookup failed:', error);
        setError(`Failed to get your profile: ${error.message || error}`);
        setProfiles([]);
        setSelectedProfile(null);
        return;
      }

      if (data.profile) {
        // Authoritative profile found - set it directly (no user selection needed)
        console.log('Home: Authoritative profile found:', data.profile.name, 'ID:', data.profile.id);
        setProfiles([data.profile]);
        setSelectedProfile(data.profile);
        setCandidateProfiles([]);
        setShowProfilePicker(false);
        setShowCreateNewProfile(false);
        onProfilePickerChange(false);
        
        await loadProfileData(data.profile);
      } else if (data.needsSelection && data.candidateProfiles?.length > 0) {
        // Multiple candidate profiles found - user needs to select
        console.log('Home: Multiple candidate profiles found - showing picker');
        const detailedCandidates = data.candidateProfiles;
        
        // Debug: log profile candidates
        detailedCandidates.forEach((candidate, index) => {
          console.log(`Candidate ${index + 1}:`, {
            name: candidate.name,
            email: candidate.email,
            phone: candidate.phone,
            match_type: candidate.match_type,
            bio: candidate.bio,
            city: candidate.city,
            instagram: candidate.instagram,
            sampleWorksCount: candidate.sampleWorks?.length || 0,
            artworkCount: candidate.artworkCount || 0,
            outstandingBalance: candidate.outstandingBalance || 0
          });
        });

        // Auto-selection logic (same as before but now with server-provided data)
        let autoSelectedProfile = null;
        
        // Rule 1: If only one profile, auto-select it
        if (detailedCandidates.length === 1) {
          autoSelectedProfile = detailedCandidates[0];
          console.log('Home: Auto-selecting single profile:', autoSelectedProfile.name);
        }
        // Rule 2: If only one profile has paintings, auto-select it
        else {
          const profilesWithPaintings = detailedCandidates.filter(p => (p.artworkCount || 0) > 0);
          if (profilesWithPaintings.length === 1) {
            autoSelectedProfile = profilesWithPaintings[0];
            console.log('Home: Auto-selecting profile with paintings:', autoSelectedProfile.name, `(${autoSelectedProfile.artworkCount} paintings)`);
          }
        }

        if (autoSelectedProfile) {
          // Auto-select the profile and set it as primary
          await handleProfileSelect(autoSelectedProfile);
          return; // Skip showing the picker
        }

        // Show picker for user selection
        setCandidateProfiles(detailedCandidates);
        setShowProfilePicker(true);
        setProfiles([]);
        setSelectedProfile(null);
        onProfilePickerChange(true);
      } else if (data.needsSetup) {
        // No profile exists - redirect to create new profile
        console.log('Home: No profile found for user - redirecting to create profile');
        setProfiles([]);
        setSelectedProfile(null);
        setCandidateProfiles([]);
        setShowProfilePicker(false);
        setShowCreateNewProfile(false);
        
        // Notify parent that profile picker is hidden
        onProfilePickerChange(false);
        
        // Navigate directly to profile tab where ProfileForm will handle creation
        onNavigateToTab('profile');
      } else {
        setError('Unable to determine profile status');
      }
    } catch (err) {
      console.error('Home: Error in secure profile lookup:', err);
      setError('Failed to get your profile: ' + err.message);
    }
  };

  const loadProfileData = async (profile) => {
    if (!profile) return;
    
    try {
      // Load all profile data through single edge function
      const { data: profileDataResponse, error: profileDataError } = await supabase.functions.invoke(
        'get-artist-profile-data',
        {
          body: { artist_profile_id: profile.id }
        }
      );

      if (profileDataError) {
        throw new Error('Failed to load profile data: ' + profileDataError.message);
      }

      if (!profileDataResponse || !profileDataResponse.success) {
        throw new Error('Failed to load profile data: ' + (profileDataResponse?.error || 'Unknown error'));
      }

      const profileData = profileDataResponse.data;

      // Set all the state from the comprehensive response
      setApplications(profileData.applications);
      setInvitations(profileData.invitations);
      setConfirmations(profileData.confirmations);
      setHasRecentActivity(profileData.hasRecentActivity);

      console.log('DEBUG: Profile data loaded:', {
        applications: profileData.stats.future_applications + '/' + profileData.stats.total_applications,
        invitations: profileData.stats.future_invitations + '/' + profileData.stats.total_invitations,
        confirmations: profileData.stats.future_confirmations + '/' + profileData.stats.total_confirmations,
        hasRecentActivity: profileData.hasRecentActivity
      });
    } catch (err) {
      console.error('Home: Error in loadProfileData:', err);
      setError('Failed to load profile data: ' + err.message);
    }
  };

  const handleCandidateSelect = async (candidate) => {
    console.log('Home: Selected candidate profile:', candidate);
    
    try {
      // Use edge function to set this profile as primary (bypasses RLS)
      const { data: result, error: setPrimaryError } = await supabase.functions
        .invoke('set-primary-profile', {
          body: { 
            profile_id: candidate.id, 
            target_person_id: person.id 
          }
        });

      console.log('Home: Set profile as primary result:', { result, setPrimaryError });

      if (setPrimaryError || !result?.success) {
        throw new Error(result?.message || setPrimaryError?.message || 'Failed to set profile as primary');
      }

      // Load the updated profile
      const { data: updatedProfile, error: profileError } = await supabase
        .from('artist_profiles')
        .select('*')
        .eq('id', candidate.id)
        .single();

      if (profileError) {
        throw new Error(`Failed to load updated profile: ${profileError.message}`);
      }

      console.log('Home: Profile set as primary successfully:', updatedProfile.name);
      
      // Reload data to properly check for primary profile and hide picker
      await loadData();
      
    } catch (err) {
      console.error('Home: Error handling candidate selection:', err);
      setError('Failed to process profile selection: ' + err.message);
    }
  };

  const handleSkipProfileSelection = () => {
    console.log('Home: User skipped profile selection');
    setShowProfilePicker(false);
    setCandidateProfiles([]);
    setShowCreateNewProfile(false);
    setProfiles([]);
    setSelectedProfile(null);
  };

  const handleCreateNewProfile = () => {
    console.log('Home: Navigating to profile creation form');
    
    // Clear any existing profile state
    setProfiles([]);
    setSelectedProfile(null);
    setCandidateProfiles([]);
    setShowProfilePicker(false);
    setShowCreateNewProfile(false);
    
    // Notify parent that profile picker is hidden
    onProfilePickerChange(false);
    
    // Navigate directly to profile tab where ProfileForm will handle creation
    onNavigateToTab('profile');
  };

  const handleProfileSelect = async (profile) => {
    setSelectedProfile(profile);
    setLoading(true);
    await loadProfileData(profile);
    setLoading(false);
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

  const handleAcceptInvitation = (invitationId) => {
    // Check if already confirmed for this event
    const invitation = invitations.find(inv => inv.id === invitationId);
    if (!invitation) {
      setError('Invitation not found');
      return;
    }

    // Check if already confirmed for this event
    const alreadyConfirmed = confirmations.find(conf => conf.event_eid === invitation.event_eid);
    if (alreadyConfirmed) {
      setError('You have already accepted an invitation for this event!');
      return;
    }

    // Show the comprehensive invitation acceptance modal
    setSelectedInvitation(invitation);
    setShowInvitationModal(true);
  };

  const processInvitationAcceptance = async (submissionData) => {
    if (!submissionData || !selectedInvitation) return;

    setAccepting(prev => ({ ...prev, [selectedInvitation.id]: true }));
    setError('');

    try {
      console.log('Attempting to accept invitation:', {
        submissionData: submissionData,
        invitationId: selectedInvitation.id,
        eventEid: submissionData.eventEid
      });

      const { data, error } = await supabase.functions.invoke('accept-invitation', {
        body: {
          submissionData: submissionData,
          invitationId: selectedInvitation.id
        }
      });

      console.log('Accept invitation response:', { data, error });

      if (error) {
        // Try to get the actual error message from the response body
        let errorMessage = error.message;
        let debugInfo = null;
        
        if (error.context && error.context.text) {
          try {
            const responseText = await error.context.text();
            console.log('Raw accept invitation response:', responseText);
            const parsed = JSON.parse(responseText);
            errorMessage = parsed.error || parsed.message || errorMessage;
            debugInfo = parsed.debug;
            
            if (debugInfo) {
              console.log('Accept invitation debug info:', debugInfo);
            }
          } catch (e) {
            console.log('Could not parse error response:', e);
          }
        }
        throw new Error(errorMessage);
      }

      if (!data.success) {
        throw new Error(data.error || 'Failed to accept invitation');
      }

      // Reload data to show updated status
      if (selectedProfile) {
        await loadProfileData(selectedProfile);
      }

      // Close the modal
      setShowInvitationModal(false);
      setSelectedInvitation(null);
      
      // Show success message
      setError(''); // Clear any previous errors
      console.log('Invitation successfully accepted');
      
      // Reload data to refresh invitations and confirmations
      await loadData();

    } catch (err) {
      // Handle specific "already confirmed" error more gracefully
      // Check for the error in multiple possible locations/formats
      const errorText = err.message || err.error || JSON.stringify(err);
      const isAlreadyConfirmedError = errorText.includes('already accepted an invitation for this event') || 
                                      errorText.includes('already confirmed') ||
                                      errorText.includes('already accepted');
      
      if (isAlreadyConfirmedError) {
        // Get event name for positive message
        const eventName = selectedInvitation?.event?.name || selectedInvitation?.event?.eid || 'this event';
        setError(`✅ Great news! You're already confirmed for ${eventName}! Check your confirmed events below to see all the details.`);
        
        // Close modal and reload data to show proper state
        setTimeout(async () => {
          setShowInvitationModal(false);
          setSelectedInvitation(null);
          setError(''); // Clear the message after showing it briefly
          await loadData(); // Reload to ensure UI shows correct confirmed events
        }, 3000); // Show positive message for 3 seconds
      } else {
        setError('Failed to accept invitation: ' + err.message);
      }
    } finally {
      setAccepting(prev => ({ ...prev, [selectedInvitation.id]: false }));
    }
  };

  // Handle cancel confirmation modal
  const handleCancelConfirmation = (confirmation) => {
    setSelectedConfirmation(confirmation);
    setShowCancelModal(true);
    setCancelReason('');
  };

  // Submit cancellation
  const handleCancelSubmit = async () => {
    try {
      setLoading(true);

      console.log('Attempting to cancel confirmation:', {
        selectedConfirmation: selectedConfirmation,
        confirmation_id: selectedConfirmation?.id,
        reason: cancelReason
      });

      // Check auth session before making the call
      const { data: { session } } = await supabase.auth.getSession();
      console.log('Auth session for edge function call:', { 
        hasSession: !!session, 
        accessToken: session?.access_token ? 'present' : 'missing',
        user: session?.user?.id 
      });

      const { data, error } = await supabase.functions.invoke('cancel-confirmation', {
        body: {
          confirmation_id: selectedConfirmation.id,
          reason: cancelReason
        }
      });

      console.log('Cancel confirmation response:', { data, error });

      if (error) {
        // Try to get the actual error message from the response body
        let errorMessage = error.message;
        let debugInfo = null;
        
        if (error.context && error.context.text) {
          try {
            const responseText = await error.context.text();
            console.log('Raw edge function response:', responseText);
            const parsed = JSON.parse(responseText);
            errorMessage = parsed.error || parsed.message || errorMessage;
            debugInfo = parsed.debug;
            
            if (debugInfo) {
              console.log('Edge function debug info:', debugInfo);
            }
          } catch (e) {
            console.log('Could not parse error response:', e);
          }
        }
        throw new Error(errorMessage);
      }

      if (!data.success) {
        throw new Error(data.error || 'Failed to cancel confirmation');
      }

      // Reload data to show updated status
      if (selectedProfile) {
        await loadProfileData(selectedProfile);
      }

      // Close modal
      setShowCancelModal(false);
      setSelectedConfirmation(null);
      setCancelReason('');
      
      // Show success message
      setError(''); // Clear any previous errors
      console.log('Confirmation successfully cancelled');

    } catch (err) {
      setError('Failed to cancel confirmation: ' + err.message);
    } finally {
      setLoading(false);
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

  // Show profile picker if we found candidate profiles or need to create new profile
  if (showProfilePicker && (candidateProfiles.length > 0 || showCreateNewProfile)) {
    return (
      <Flex direction="column" gap="6">

        <Flex direction="column" gap="2">
          <Heading size="6">Select Your Artist Profile</Heading>
          <Text size="3" color="gray">
            We found <Text weight="bold" style={{ display: 'inline' }}>{candidateProfiles.length} potential profile{candidateProfiles.length > 1 ? 's' : ''}</Text> associated with your phone number. 
            Please select the one you want to use, or skip below to create a new profile. You can edit your profile after selection.
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

        <Grid columns="1" gap="4">
          {candidateProfiles.map((candidate, index) => {
            const works = candidate.sampleWorks || [];
            
            return (
              <Card key={index} size="3">
                <Flex direction="column" gap="4" p="4">
                  {/* Header with name and select button */}
                  <Flex justify="between" align="start">
                    <Flex align="center" gap="2">
                      <Text size="5" weight="bold" style={{ color: 'var(--crimson-11)' }}>
                        {candidate.name || 'Unnamed Profile'}
                      </Text>
                      {/* Phone match badge removed - cache refresh fix */}
                      {(candidate.artworkCount || 0) > 0 && (
                        <Badge color="green" variant="soft" size="1">
                          {candidate.artworkCount} paintings
                        </Badge>
                      )}
                      {(candidate.outstandingBalance || 0) > 0 && (
                        <Badge color="orange" variant="solid" size="2">
                          💰 ${candidate.outstandingBalance.toFixed(2)} owed
                        </Badge>
                      )}
                    </Flex>
                    
                    <Button
                      size="2"
                      variant="solid"
                      color={(candidate.outstandingBalance || 0) > 0 ? "green" : "crimson"}
                      onClick={() => handleCandidateSelect(candidate)}
                    >
                      {(candidate.outstandingBalance || 0) > 0
                        ? `Get My $${candidate.outstandingBalance.toFixed(2)}`
                        : "Use This Profile"
                      }
                    </Button>
                  </Flex>

                  {/* Profile details in a grid layout */}
                  <Grid columns={{ initial: '1', md: '2' }} gap="4">
                    {/* Left column - Profile info */}
                    <Flex direction="column" gap="3">
                      {/* Contact info */}
                      <Flex direction="column" gap="2">
                        {candidate.email && (
                          <Flex align="center" gap="2">
                            <Text size="2" color="gray">📧</Text>
                            <Text size="3">{candidate.email}</Text>
                          </Flex>
                        )}
                        
                        {candidate.phone && (
                          <Flex align="center" gap="2">
                            <Text size="2" color="gray">📱</Text>
                            <Text size="3">{candidate.phone}</Text>
                          </Flex>
                        )}
                        
                        {candidate.city && (
                          <Flex align="center" gap="2">
                            <Text size="2" color="gray">📍</Text>
                            <Text size="3">{candidate.city}</Text>
                          </Flex>
                        )}
                      </Flex>

                      {/* Bio */}
                      {candidate.bio && (
                        <Flex direction="column" gap="1">
                          <Text size="2" color="gray" weight="medium">Bio</Text>
                          <Text size="2" style={{ 
                            lineHeight: '1.4', 
                            wordWrap: 'break-word',
                            whiteSpace: 'normal',
                            maxWidth: '100%'
                          }}>
                            {candidate.bio.length > 500 ? `${candidate.bio.substring(0, 500)}...` : candidate.bio}
                          </Text>
                        </Flex>
                      )}

                      {/* Social links */}
                      <Flex direction="column" gap="1">
                        {candidate.instagram && (
                          <Flex align="center" gap="2">
                            <Text size="2" color="gray">📷</Text>
                            <Text size="2">{candidate.instagram}</Text>
                          </Flex>
                        )}
                        {candidate.website && (
                          <Flex align="center" gap="2">
                            <Text size="2" color="gray">🌐</Text>
                            <Text size="2">{candidate.website}</Text>
                          </Flex>
                        )}
                      </Flex>
                    </Flex>

                    {/* Right column - Sample works */}
                    {works.length > 0 && (
                      <Box>
                        <Text size="2" weight="medium" color="gray" mb="3" display="block">
                          Sample Works ({works.length})
                        </Text>
                        <Grid columns="3" gap="2">
                          {/* Existing sample works from profiles */}
                          {works.slice(0, 6).map((work, workIdx) => {
                            
                            return (
                              <Box 
                                key={work.id || workIdx} 
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
                                {work.image_url ? (
                                  <img
                                    src={work.image_url}
                                    alt={work.title || "Sample work"}
                                    style={{
                                      width: '100%',
                                      height: '100%',
                                      objectFit: 'cover',
                                      transition: 'transform 0.2s ease'
                                    }}
                                    onError={(e) => {
                                      e.target.style.display = 'none';
                                      e.target.nextSibling.style.display = 'flex';
                                    }}
                                  />
                                ) : null}
                                
                                {/* Fallback for missing images */}
                                <Flex
                                  align="center"
                                  justify="center"
                                  style={{
                                    width: '100%',
                                    height: '100%',
                                    backgroundColor: 'var(--gray-3)',
                                    color: 'var(--gray-9)',
                                    display: work.image_url ? 'none' : 'flex'
                                  }}
                                >
                                  <Text size="1">🎨</Text>
                                </Flex>

                                {/* Title overlay */}
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
                        {works.length > 6 && (
                          <Text size="1" color="gray" mt="2" display="block" align="center">
                            +{works.length - 6} more works
                          </Text>
                        )}
                      </Box>
                    )}
                  </Grid>
                </Flex>
              </Card>
            );
          })}
        </Grid>

        
        {/* Show create new profile option when no profiles found */}
        {showCreateNewProfile && candidateProfiles.length === 0 && (
          <Card size="3">
            <Flex direction="column" gap="4" p="4">
              <Flex direction="column" gap="2" align="center">
                <Text size="5" weight="bold">No Existing Profiles Found</Text>
                <Text size="3" color="gray" align="center">
                  We couldn't find any artist profiles associated with your contact information.
                  Would you like to create a new profile?
                </Text>
              </Flex>
              <Button size="4" variant="solid" color="crimson" onClick={handleCreateNewProfile}>
                Create New Artist Profile
              </Button>
            </Flex>
          </Card>
        )}
      </Flex>
    );
  }

  if (profiles.length === 0) {
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

      <Flex direction="column" gap="4">

        {/* Welcome Header */}
        <Flex direction="column" gap="2">
          <Heading size="6">
            Welcome back, {selectedProfile?.name || 'Artist'}!
          </Heading>
          <Text size="3" color="gray">
            Your artist dashboard overview
          </Text>
        </Flex>
      </Flex>

      {/* Payment Status Banner - shows for artists with confirmed events or event_artists entries */}
      <PaymentStatusBanner
        artistProfile={selectedProfile}
        confirmations={confirmations}
        hasRecentActivity={hasRecentActivity}
        onNavigateToTab={onNavigateToTab}
      />

      {/* Server-side Notes - content and eligibility determined server-side */}
      <ServerNotes artistProfile={selectedProfile} onNavigateToTab={onNavigateToTab} />

      {error && (
        <Callout.Root color="red">
          <Callout.Icon>
            <InfoCircledIcon />
          </Callout.Icon>
          <Callout.Text>{error}</Callout.Text>
        </Callout.Root>
      )}

      <Grid columns="1" gap="6">
        {/* Confirmed Events */}
        {confirmations.length > 0 && (
          <Card size="3" style={{ border: '2px solid var(--green-9)' }}>
            <Flex direction="column" gap="4">
              <Flex justify="between" align="center">
                <Heading size="5" style={{ color: 'var(--green-11)' }}>
                  ✅ My Confirmed Events
                </Heading>
                <Badge color="green" variant="solid">
                  {confirmations.length} confirmed
                </Badge>
              </Flex>
              
              <Flex direction="column" gap="3">
                {confirmations.map((confirmation) => (
                  <Card key={confirmation.id} size="2" style={{ backgroundColor: 'var(--green-2)', border: '1px solid var(--green-6)' }}>
                    <Flex direction="column" gap="3">
                      <Flex justify="between" align="start">
                        <Flex direction="column" gap="1">
                          <Text size="4" weight="bold">
                            {confirmation.event?.name}
                          </Text>
                          <Text size="2" color="gray">
                            📅 {confirmation.event?.event_start_datetime &&
                              formatDateTime(confirmation.event.event_start_datetime)}
                            {confirmation.event?.venue && ` • 📍 ${confirmation.event.venue}`}
                            {confirmation.event?.city && `, ${confirmation.event.city}`}
                          </Text>
                          <Text size="2" color="gray">
                            Artist #{confirmation.artist_number}
                          </Text>
                        </Flex>
                        
                        <Badge color="green" variant="solid">
                          CONFIRMED
                        </Badge>
                      </Flex>

                      <Callout.Root color="green" size="1">
                        <Callout.Icon>
                          <CheckCircledIcon />
                        </Callout.Icon>
                        <Callout.Text>
                          🎉 You are confirmed to participate in this event! Get ready to paint!
                        </Callout.Text>
                      </Callout.Root>
                      
                      {/* Cancel Confirmation Button */}
                      <Flex justify="end" style={{ marginTop: '12px' }}>
                        <Button 
                          variant="ghost" 
                          color="red" 
                          size="1"
                          onClick={() => handleCancelConfirmation(confirmation)}
                        >
                          Cancel Participation
                        </Button>
                      </Flex>
                    </Flex>
                  </Card>
                ))}
              </Flex>
            </Flex>
          </Card>
        )}

        {/* Pending Invitations */}
        {invitations.filter(inv => inv.event?.applications_open).length > 0 && (
          <Card size="3" style={{ border: '2px solid var(--crimson-9)' }}>
            <Flex direction="column" gap="4">
              <Flex justify="between" align="center">
                <Heading size="5" style={{ color: 'var(--crimson-11)' }}>
                  🎉 Event Invitations
                </Heading>
                <Badge color="crimson" variant="solid">
                  {invitations.filter(inv => inv.event?.applications_open).length} pending
                </Badge>
              </Flex>
              
              <Flex direction="column" gap="3">
                {invitations.filter(inv => inv.event?.applications_open).map((invitation) => (
                  <Card key={invitation.id} size="2" style={{ backgroundColor: 'var(--crimson-2)', border: '1px solid var(--crimson-6)' }}>
                    <Flex direction="column" gap="3">
                      <Flex justify="between" align="start">
                        <Flex direction="column" gap="1">
                          <Text size="4" weight="bold">
                            {invitation.event?.name}
                          </Text>
                          <Text size="2" color="gray">
                            📅 {invitation.event?.event_start_datetime &&
                              formatDateTime(invitation.event.event_start_datetime)}
                            {invitation.event?.venue && ` • 📍 ${invitation.event.venue}`}
                            {invitation.event?.city && `, ${invitation.event.city}`}
                          </Text>
                          <Text size="2" color="gray">
                            Artist #{invitation.artist_number}
                          </Text>
                        </Flex>
                        
                        <Badge color="crimson" variant="solid">
                          INVITED
                        </Badge>
                      </Flex>
                      
                      {invitation.message_from_producer && (
                        <Box p="3" style={{ backgroundColor: 'var(--blue-2)', borderRadius: '6px', borderLeft: '3px solid var(--blue-9)' }}>
                          <Text size="2" weight="medium" mb="1" style={{ display: 'block' }}>
                            Message from Producer:
                          </Text>
                          <Text size="2" style={{ fontStyle: 'italic', whiteSpace: 'pre-wrap' }}>
                            "{invitation.message_from_producer}"
                          </Text>
                        </Box>
                      )}
                      
                      <Button
                        size="3"
                        variant="solid"
                        color="crimson"
                        onClick={() => handleAcceptInvitation(invitation.id)}
                        style={{ 
                          fontSize: '14px',
                          fontWeight: 'bold',
                          textTransform: 'uppercase'
                        }}
                      >
                        <CheckCircledIcon width="16" height="16" />
                        Accept Invitation & Confirm Attendance
                      </Button>
                    </Flex>
                  </Card>
                ))}
              </Flex>
            </Flex>
          </Card>
        )}

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
                            formatDateTime(application.event.event_start_datetime)}
                          {application.event?.venue && ` • ${application.event.venue}`}
                          {application.event?.city && ` • ${application.event.city}`}
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
                    {selectedProfile?.name}
                  </Text>
                  
                  <Flex direction="column" gap="1">
                    {selectedProfile?.city && selectedProfile?.country && (
                      <Flex align="center" gap="2">
                        <Text size="2" color="gray">📍</Text>
                        <Text size="3" weight="medium">{selectedProfile.city}, {selectedProfile.country}</Text>
                      </Flex>
                    )}
                    {(selectedProfile?.website || selectedProfile?.instagram || selectedProfile?.facebook) && (
                      <Flex align="center" gap="2">
                        <Text size="2" color="gray">🌐</Text>
                        <Text size="3">
                          {selectedProfile.website && 'Website'}
                          {selectedProfile.instagram && (selectedProfile.website ? ' • Instagram' : 'Instagram')}
                          {selectedProfile.facebook && ((selectedProfile.website || selectedProfile.instagram) ? ' • Facebook' : 'Facebook')}
                        </Text>
                      </Flex>
                    )}
                  </Flex>
                </Flex>

                {selectedProfile?.bio && (
                  <Box>
                    <Text size="2" weight="medium" color="gray" mb="1" display="block">About</Text>
                    <Text size="3" style={{ 
                      display: '-webkit-box',
                      WebkitLineClamp: 4,
                      WebkitBoxOrient: 'vertical',
                      overflow: 'hidden',
                      lineHeight: '1.4'
                    }}>
                      {selectedProfile.bio}
                    </Text>
                  </Box>
                )}

              </Flex>

            </Grid>
          </Flex>
        </Card>
      </Grid>

      {/* Comprehensive Invitation Acceptance Modal */}
      {selectedInvitation && (
        <InvitationAcceptanceModal
          open={showInvitationModal}
          onOpenChange={setShowInvitationModal}
          event={selectedInvitation.event}
          invitation={selectedInvitation}
          artistProfile={selectedProfile}
          onAccept={processInvitationAcceptance}
          loading={accepting[selectedInvitation.id]}
        />
      )}

      {/* Cancel Confirmation Modal */}
      {selectedConfirmation && (
        <Dialog.Root open={showCancelModal} onOpenChange={setShowCancelModal}>
          <Dialog.Content maxWidth="500px">
            <Dialog.Title>
              Cancel Your Participation
            </Dialog.Title>
            <Dialog.Description size="2" mb="4">
              Are you sure you want to cancel your participation in{' '}
              <strong>{selectedConfirmation.events?.name || selectedConfirmation.event_eid}</strong>{' '}
              in {selectedConfirmation.events?.city || 'this city'} on{' '}
              {selectedConfirmation.events?.event_start_datetime ? 
                new Date(selectedConfirmation.events.event_start_datetime).toLocaleDateString('en-US', {
                  weekday: 'long',
                  year: 'numeric', 
                  month: 'long',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit'
                }) : 'the scheduled date'
              }?
            </Dialog.Description>

            <Flex direction="column" gap="3">
              <Box>
                <Text size="2" weight="medium" mb="2" display="block">
                  Reason for cancellation (optional):
                </Text>
                <TextArea
                  placeholder="Please let us know why you're cancelling..."
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  rows={3}
                />
              </Box>

              <Flex gap="3" justify="end">
                <Dialog.Close>
                  <Button variant="soft" color="gray">
                    Keep Participation
                  </Button>
                </Dialog.Close>
                <Button 
                  color="red" 
                  onClick={handleCancelSubmit}
                  disabled={loading}
                >
                  {loading ? 'Cancelling...' : 'Yes, Cancel Participation'}
                </Button>
              </Flex>
            </Flex>
          </Dialog.Content>
        </Dialog.Root>
      )}
    </Flex>
  );
};

export default Home;
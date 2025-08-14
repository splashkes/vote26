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
import AuthModal from './AuthModal';
import InvitationAcceptanceModal from './InvitationAcceptanceModal';


const Home = ({ onNavigateToTab, onProfilePickerChange }) => {
  const { user, person, loading: authLoading } = useAuth();
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [profiles, setProfiles] = useState([]);
  const [selectedProfile, setSelectedProfile] = useState(null);
  const [candidateProfiles, setCandidateProfiles] = useState([]);
  const [showProfilePicker, setShowProfilePicker] = useState(false);
  const [showCreateNewProfile, setShowCreateNewProfile] = useState(false);
  const [sampleWorks, setSampleWorks] = useState([]);
  const [applications, setApplications] = useState([]);
  const [invitations, setInvitations] = useState([]);
  const [confirmations, setConfirmations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [accepting, setAccepting] = useState({});
  const [showInvitationModal, setShowInvitationModal] = useState(false);
  const [selectedInvitation, setSelectedInvitation] = useState(null);

  useEffect(() => {
    if (!authLoading && user && person) {
      loadData();
    } else if (!authLoading && !user) {
      setLoading(false);
    }
  }, [user, person, authLoading]);

  // Notify parent when profile picker state changes
  useEffect(() => {
    if (onProfilePickerChange) {
      onProfilePickerChange(showProfilePicker);
    }
  }, [showProfilePicker, onProfilePickerChange]);

  const loadData = async () => {
    console.log('Home: Starting loadData, person:', person);
    try {

      // Step 1: Check if user has set a primary profile using the new system
      console.log('Home: Checking for primary profile with person.id:', person.id);
      const { data: primaryCheck, error: primaryError } = await supabase
        .rpc('has_primary_profile', { target_person_id: person.id });

      console.log('Home: Primary profile check result:', { primaryCheck, primaryError });

      if (!primaryError && primaryCheck && primaryCheck.length > 0) {
        const result = primaryCheck[0];
        if (result.has_primary && result.profile_id) {
          // Found primary profile, load it
          const { data: primaryProfile, error: profileError } = await supabase
            .from('artist_profiles')
            .select('*')
            .eq('id', result.profile_id)
            .single();

          if (!profileError && primaryProfile) {
            console.log('Home: Found primary profile, loading dashboard for:', primaryProfile.name);
            setProfiles([primaryProfile]);
            setSelectedProfile(primaryProfile);
            setCandidateProfiles([]); // Clear any candidate profiles
            setShowProfilePicker(false); // Ensure picker is hidden
            await loadProfileData(primaryProfile);
            return;
          }
        }
      }

      // Step 2: No primary profile set, run profile lookup to show picker
      console.log('Home: No primary profile found, running profile lookup...');
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
      let userPhone = user.phone;
      if (!userPhone) {
        setError('Phone number not available for profile lookup');
        return;
      }

      // Normalize phone number format for lookup
      if (userPhone && !userPhone.startsWith('+')) {
        if (userPhone.startsWith('1') && userPhone.length === 11) {
          userPhone = `+${userPhone}`;
        } else if (userPhone.length === 10) {
          userPhone = `+1${userPhone}`;
        } else {
          userPhone = `+1${userPhone}`;
        }
      }

      console.log('Home: Running profile lookup for phone:', userPhone);

      // Use the new simplified profile lookup
      const { data: candidateProfiles, error: lookupError } = await supabase
        .rpc('lookup_profiles_by_contact', { 
          target_phone: userPhone,
          target_email: user.email || null
        });

      console.log('Home: Profile lookup result:', { candidateProfiles, lookupError });

      if (lookupError) {
        console.error('Profile lookup failed:', lookupError);
        setError(`Failed to lookup profiles: ${lookupError.message || lookupError}`);
        setProfiles([]);
        setSelectedProfile(null);
        return;
      }

      if (candidateProfiles && candidateProfiles.length > 0) {
        // Load sample works for each profile
        const detailedCandidates = await Promise.all(
          candidateProfiles.map(async (candidate) => {
            // Get sample works using unified function
            const { data: sampleWorks } = await supabase
              .rpc('get_unified_sample_works', { profile_id: candidate.id });
            
            console.log('Sample works for', candidate.name, ':', sampleWorks);
            if (sampleWorks && sampleWorks.length > 0) {
              sampleWorks.forEach((work, idx) => {
                console.log(`  Work ${idx}:`, {
                  id: work.id,
                  title: work.title,
                  image_url: work.image_url,
                  source_type: work.source_type,
                  original_url: work.original_url
                });
              });
            }

            // Get artwork count from art table
            const { count: artworkCount } = await supabase
              .from('art')
              .select('*', { count: 'exact', head: true })
              .eq('artist_id', candidate.id);

            return {
              ...candidate,
              sampleWorks: sampleWorks || [],
              artworkCount: artworkCount || 0,
            };
          })
        );

        console.log('Home: Found candidate profiles with details:', detailedCandidates);
        
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
            artworkCount: candidate.artworkCount || 0
          });
        });

        // Auto-selection logic
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

        // Show picker if no auto-selection
        setCandidateProfiles(detailedCandidates);
        setShowProfilePicker(true);
        setProfiles([]);
        setSelectedProfile(null);
      } else {
        // No candidates found, show option to create new profile
        console.log('Home: No candidate profiles found for phone:', userPhone);
        setProfiles([]);
        setSelectedProfile(null);
        setCandidateProfiles([]);
        setShowProfilePicker(true); // Show picker with create new option
        setShowCreateNewProfile(true); // Flag to show create new profile option
      }
    } catch (err) {
      console.error('Home: Error in multi-profile lookup:', err);
      setError('Failed to lookup potential profiles: ' + err.message);
    }
  };

  const loadProfileData = async (profile) => {
    if (!profile) return;
    
    try {
      // Load sample works using unified function (combines modern + legacy)
      const { data: worksData, error: worksError } = await supabase
        .rpc('get_unified_sample_works', { profile_id: profile.id });

      console.log('Home: Sample works query result:', { 
        worksData, 
        worksError, 
        worksCount: worksData?.length || 0,
        profile_id: profile.id 
      });
      if (worksError) throw worksError;
      setSampleWorks(worksData || []);
      console.log('Home: Set sample works state:', { 
        worksCount: (worksData || []).length,
        firstWork: worksData?.[0] ? {
          id: worksData[0].id,
          title: worksData[0].title,
          media_file: worksData[0].media_file ? {
            original_url: worksData[0].media_file.original_url,
            compressed_url: worksData[0].media_file.compressed_url,
            cloudflare_id: worksData[0].media_file.cloudflare_id
          } : null
        } : null
      });

      // Load applications for selected profile
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
        .eq('artist_profile_id', profile.id)
        .order('applied_at', { ascending: false })
        .limit(5);

      console.log('Home: Applications query result:', { appsData, appsError });
      if (appsError) throw appsError;
      setApplications(appsData || []);

      // Load invitations for selected profile
      // Since there's no direct foreign key between artist_invitations.event_eid and events.eid,
      // we need to fetch invitations first, then get event details separately
      const { data: invitationsRaw, error: invitationsError } = await supabase
        .from('artist_invitations')
        .select('*')
        .eq('artist_profile_id', profile.id)
        .eq('status', 'pending')
        .is('accepted_at', null)
        .order('created_at', { ascending: false });

      if (invitationsError) throw invitationsError;

      // Get event details for each invitation
      const invitationsData = [];
      if (invitationsRaw && invitationsRaw.length > 0) {
        for (const invitation of invitationsRaw) {
          if (invitation.event_eid) {
            const { data: eventData } = await supabase
              .from('events')
              .select(`
                id,
                eid,
                name,
                event_start_datetime,
                venue,
                city:cities(name)
              `)
              .eq('eid', invitation.event_eid)
              .single();

            invitationsData.push({
              ...invitation,
              event: eventData
            });
          }
        }
      }

      console.log('Home: Invitations query result:', { invitationsData, invitationsError });
      if (invitationsError) throw invitationsError;
      setInvitations(invitationsData || []);

      // Load confirmations for selected profile
      const { data: confirmationsRaw, error: confirmationsError } = await supabase
        .from('artist_confirmations')
        .select('*')
        .eq('artist_profile_id', profile.id)
        .eq('confirmation_status', 'confirmed')
        .order('created_at', { ascending: false });

      if (confirmationsError) throw confirmationsError;

      // Get event details for each confirmation
      const confirmationsData = [];
      if (confirmationsRaw && confirmationsRaw.length > 0) {
        for (const confirmation of confirmationsRaw) {
          if (confirmation.event_eid) {
            const { data: eventData } = await supabase
              .from('events')
              .select(`
                id,
                eid,
                name,
                event_start_datetime,
                event_end_datetime,
                venue,
                city:cities(name)
              `)
              .eq('eid', confirmation.event_eid)
              .single();

            confirmationsData.push({
              ...confirmation,
              event: eventData
            });
          }
        }
      }

      console.log('Home: Confirmations query result:', { confirmationsData, confirmationsError });
      setConfirmations(confirmationsData || []);
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

  const handleCreateNewProfile = async () => {
    console.log('Home: Creating new profile for user');
    
    try {
      // Use edge function to create a new profile (bypasses RLS)
      const userPhone = user.phone;
      const { data: result, error: createError } = await supabase.functions
        .invoke('create-new-profile', {
          body: { 
            profileData: {
              name: user.name || user.email || 'Artist Profile',
              email: user.email,
              phone: userPhone
            },
            target_person_id: person.id
          }
        });

      console.log('Home: Create new profile result:', { result, createError });

      if (createError || !result?.success) {
        throw new Error(result?.message || createError?.message || 'Failed to create new profile');
      }

      const newProfile = result.profile;

      console.log('Home: New profile created successfully:', newProfile.name);
      setProfiles([newProfile]);
      setSelectedProfile(newProfile);
      setCandidateProfiles([]);
      setShowProfilePicker(false);
      setShowCreateNewProfile(false);
      
      // Notify parent that profile picker is hidden
      onProfilePickerChange(false);
      
      // Navigate to profile edit tab when creating new profile (use setTimeout to ensure state updates)
      console.log('Home: Navigating to profile edit tab after creating new profile');
      setTimeout(() => {
        console.log('Home: Executing delayed navigation to profile tab');
        onNavigateToTab('profile');
      }, 300);
      
      await loadProfileData(newProfile);
      
    } catch (err) {
      console.error('Home: Error creating new profile:', err);
      setError('Failed to create new profile: ' + err.message);
    }
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
      // Double-check if already confirmed (in case of race condition)
      const alreadyConfirmed = confirmations.find(conf => conf.event_eid === selectedInvitation.event_eid);
      if (alreadyConfirmed) {
        throw new Error('You have already accepted an invitation for this event!');
      }

      // Update artist profile with pronouns if provided
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
            original_invitation_id: selectedInvitation.id,
            accepted_via: 'artist_portal_enhanced_home'
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

      // Reload data to show updated status
      if (selectedProfile) {
        await loadProfileData(selectedProfile);
      }

      // Close the modal
      setShowInvitationModal(false);
      setSelectedInvitation(null);
    } catch (err) {
      setError('Failed to accept invitation: ' + err.message);
    } finally {
      setAccepting(prev => ({ ...prev, [selectedInvitation.id]: false }));
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
                    </Flex>
                    
                    <Button size="2" variant="solid" color="crimson" onClick={() => handleCandidateSelect(candidate)}>
                      Use This Profile
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
                            {confirmation.event?.city?.name && `, ${confirmation.event.city.name}`}
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
                    </Flex>
                  </Card>
                ))}
              </Flex>
            </Flex>
          </Card>
        )}

        {/* Pending Invitations */}
        {invitations.length > 0 && (
          <Card size="3" style={{ border: '2px solid var(--crimson-9)' }}>
            <Flex direction="column" gap="4">
              <Flex justify="between" align="center">
                <Heading size="5" style={{ color: 'var(--crimson-11)' }}>
                  🎉 Event Invitations
                </Heading>
                <Badge color="crimson" variant="solid">
                  {invitations.length} pending
                </Badge>
              </Flex>
              
              <Flex direction="column" gap="3">
                {invitations.map((invitation) => (
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
                            {invitation.event?.city?.name && `, ${invitation.event.city.name}`}
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

              {/* Right Column - Sample Works */}
              {sampleWorks.length > 0 && (
                <Box>
                  <Text size="2" weight="medium" color="gray" mb="3" display="block">Sample Works</Text>
                  <Grid columns="3" gap="2">
                    {sampleWorks.slice(0, 9).map((work, index) => {
                      console.log(`Home: Dashboard image ${index}:`, {
                        work_id: work.id,
                        work_title: work.title,
                        source_type: work.source_type,
                        image_url: work.image_url
                      });
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
                            src={work.image_url}
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
                            onError={(e) => {
                              console.error('Home: Dashboard image failed to load:', {
                                src: e.target.src,
                                work_id: work.id,
                                media_file: work.media_file
                              });
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
    </Flex>
  );
};

export default Home;
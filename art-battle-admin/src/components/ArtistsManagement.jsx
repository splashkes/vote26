import React, { useState, useEffect } from 'react';
import { 
  Box, 
  Card, 
  Text, 
  Flex, 
  Button, 
  Badge, 
  Heading, 
  TextField, 
  Select, 
  Tabs,
  Grid,
  Dialog,
  ScrollArea,
  Spinner,
  TextArea
} from '@radix-ui/themes';
import { PersonIcon, MagnifyingGlassIcon, Cross2Icon } from '@radix-ui/react-icons';
import { supabase } from '../lib/supabase';
import { getArtistProfilesWithAliases, getAliasBadgeText } from '../utils/aliasLookup';

const ArtistsManagement = () => {
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeFilter, setActiveFilter] = useState('all');
  
  // Tag filter states
  const [statusFilters, setStatusFilters] = useState({
    profiles: true,
    applications: true,
    invitations: true,
    confirmations: true
  });
  const [bioFilters, setBioFilters] = useState({
    hasBio: true,
    noBio: true
  });
  
  // Data states
  const [artistProfiles, setArtistProfiles] = useState([]);
  const [artistApplications, setArtistApplications] = useState([]);
  const [artistInvitations, setArtistInvitations] = useState([]);
  const [artistConfirmations, setArtistConfirmations] = useState([]);
  
  // Modal states
  const [selectedArtist, setSelectedArtist] = useState(null);
  const [artistModalOpen, setArtistModalOpen] = useState(false);
  const [artistModalType, setArtistModalType] = useState('');
  const [sampleWorks, setSampleWorks] = useState([]);
  const [sampleWorksLoading, setSampleWorksLoading] = useState(false);
  const [imageModalOpen, setImageModalOpen] = useState(false);
  const [selectedImage, setSelectedImage] = useState(null);
  
  // Artist event history data
  const [artistEventHistory, setArtistEventHistory] = useState([]);
  const [eventHistoryLoading, setEventHistoryLoading] = useState(false);
  
  // Bio editing states
  const [editingBio, setEditingBio] = useState(false);
  const [bioText, setBioText] = useState('');
  const [bioSaving, setBioSaving] = useState(false);
  
  // Profile loading state
  const [profilesLoading, setProfilesLoading] = useState(false);
  const [profilesLoadingProgress, setProfilesLoadingProgress] = useState({ loaded: 0, total: 0 });

  // Invite artist to event states
  const [inviteModalOpen, setInviteModalOpen] = useState(false);
  const [inviteLoading, setInviteLoading] = useState(false);
  const [selectedEventForInvite, setSelectedEventForInvite] = useState('');
  const [inviteMessage, setInviteMessage] = useState('');
  const [events, setEvents] = useState([]);

  useEffect(() => {
    fetchAllArtistsData();
    fetchEvents();
  }, []);

  // Search function with debouncing
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      if (searchTerm.trim()) {
        fetchAllArtistsData(searchTerm, 500); // Search with term, limit results
      } else {
        fetchAllArtistsData('', 1000); // No search term, get more results
      }
    }, 300); // Debounce for 300ms

    return () => clearTimeout(timeoutId);
  }, [searchTerm]);

  const fetchAllArtistsData = async (searchQuery = '', searchLimit = 1000) => {
    try {
      setLoading(true);
      
      // Get current session for authentication
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error('Not authenticated');
      }

      // Fetch artist data with search parameters
      const response = await fetch(`https://xsqdkubgyqwpyvfltnrf.supabase.co/functions/v1/admin-artists-search`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
          'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhzcWRrdWJneXF3cHl2Zmx0bnJmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTM0MjE2OTYsImV4cCI6MjA2ODk5NzY5Nn0.hY8v8IDZQTcdAFa_OvQNFd1CyvabGcOZZMn_J6c4c2U'
        },
        body: JSON.stringify({
          searchTerm: searchQuery,
          limit: searchLimit
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
      }

      const artistData = await response.json();
      
      // Set initial data without profiles - shows "Unknown Artist" initially
      setArtistApplications(artistData.applications || []);
      setArtistInvitations(artistData.invitations || []);
      setArtistConfirmations(artistData.confirmations || []);
      setArtistProfiles(artistData.profiles || []);
      
      // Stop loading now that we have the base data
      setLoading(false);
      
      // Get all unique artist numbers for profile lookup
      const allArtistNumbers = new Set();
      [artistData.applications, artistData.invitations, artistData.confirmations].forEach(dataArray => {
        dataArray?.forEach(item => {
          if (item.artist_number) {
            allArtistNumbers.add(item.artist_number);
          }
        });
      });

      // Fetch artist profile data in batches (non-blocking)  
      if (allArtistNumbers.size > 0) {
        const artistNumbersArray = Array.from(allArtistNumbers);
        const batchSize = 50; // Larger batches for faster loading
        console.log(`Loading ${artistNumbersArray.length} unique artist profiles in batches of ${batchSize}`);
        const totalBatches = Math.ceil(artistNumbersArray.length / batchSize);
        let allProfiles = {};
        let completedBatches = 0;
        
        // Set loading state
        setProfilesLoading(true);
        setProfilesLoadingProgress({ loaded: 0, total: totalBatches });
        
        // Helper function to update state with new profile data
        const updateWithProfiles = (newProfiles, batchIndex) => {
          Object.assign(allProfiles, newProfiles);
          completedBatches++;
          
          // Update progress
          setProfilesLoadingProgress({ loaded: completedBatches, total: totalBatches });
          
          // Merge profile data into workflow data
          const mergeProfileData = (items) => {
            return items?.map(item => ({
              ...item,
              artist_profiles: allProfiles[item.artist_number] || {}
            })) || [];
          };

          setArtistApplications(mergeProfileData(artistData.applications));
          setArtistInvitations(mergeProfileData(artistData.invitations));  
          setArtistConfirmations(mergeProfileData(artistData.confirmations));
          
          // Update standalone profiles
          const profilesArray = Object.entries(allProfiles).map(([artistNumber, profile]) => ({
            artist_number: artistNumber,
            artist_profiles: profile
          }));
          setArtistProfiles(prev => [...prev, ...profilesArray]);
          
          // Check if all batches are complete
          if (completedBatches >= totalBatches) {
            setProfilesLoading(false);
          }
        };
        
        // Process all batches in parallel - direct lookup first
        const batchPromises = [];
        for (let i = 0; i < artistNumbersArray.length; i += batchSize) {
          const batch = artistNumbersArray.slice(i, i + batchSize);
          const batchIndex = Math.floor(i / batchSize);
          
          const batchPromise = fetch(`https://xsqdkubgyqwpyvfltnrf.supabase.co/functions/v1/admin-artist-profiles`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${session.access_token}`,
              'Content-Type': 'application/json',
              'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhzcWRrdWJneXF3cHl2Zmx0bnJmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTM0MjE2OTYsImV4cCI6MjA2ODk5NzY5Nn0.hY8v8IDZQTcdAFa_OvQNFd1CyvabGcOZZMn_J6c4c2U'
            },
            body: JSON.stringify({ 
              artistNumbers: batch
            })
          })
          .then(async (response) => {
            if (response.ok) {
              const { data: profileData } = await response.json();
              const profiles = profileData.profiles || {};
              
              // Find artist numbers that came back empty/unknown
              const missingArtistNumbers = batch.filter(artistNumber => 
                !profiles[artistNumber] || !profiles[artistNumber].name
              );
              
              // If we have missing artists, try alias lookup as fallback
              if (missingArtistNumbers.length > 0) {
                console.log(`Batch ${batchIndex + 1}: ${missingArtistNumbers.length}/${batch.length} artists missing, trying alias lookup`);
                
                try {
                  const aliasResult = await getArtistProfilesWithAliases(missingArtistNumbers);
                  const aliasProfiles = aliasResult.profiles || {};
                  
                  // Merge alias results, marking them as found by alias
                  Object.keys(aliasProfiles).forEach(artistNumber => {
                    if (aliasProfiles[artistNumber] && aliasProfiles[artistNumber].name) {
                      profiles[artistNumber] = {
                        ...aliasProfiles[artistNumber],
                        foundByAlias: true
                      };
                      console.log(`Found profile for artist ${artistNumber} via alias lookup: ${aliasProfiles[artistNumber].name}`);
                    }
                  });
                } catch (aliasError) {
                  console.error(`Error in alias lookup for batch ${batchIndex + 1}:`, aliasError);
                }
              }
              
              return { profiles, batchIndex };
            }
            return { profiles: {}, batchIndex };
          })
          .catch((err) => {
            console.error(`Error fetching artist profiles batch ${batchIndex + 1}:`, err);
            return { profiles: {}, batchIndex };
          });
          
          batchPromises.push(batchPromise);
        }
        
        // Process results as they come in
        let processedBatches = 0;
        batchPromises.forEach((promise) => {
          promise.then(({ profiles, batchIndex }) => {
            updateWithProfiles(profiles, batchIndex);
            processedBatches++;
          });
        });
      }

    } catch (err) {
      console.error('Error fetching artists data:', err);
      setLoading(false);
    }
  };

  const openArtistModal = (artist, type) => {
    setSelectedArtist(artist);
    setArtistModalType(type);
    setArtistModalOpen(true);
    
    // Initialize bio editing state
    setBioText(artist.artist_profiles?.abhq_bio || '');
    setEditingBio(false);
    setBioSaving(false);
    
    // Load sample works if available
    if (artist.artist_number) {
      loadSampleWorks(artist.artist_number);
      loadArtistEventHistory(artist.artist_number);
    }
  };

  const loadSampleWorks = async (artistNumber) => {
    setSampleWorksLoading(true);
    try {
      // First get the profile_id using entry_id (artist_number is stored as entry_id in artist_profiles)
      const { data: profileData, error: profileError } = await supabase
        .from('artist_profiles')
        .select('id')
        .eq('entry_id', artistNumber)
        .single();

      if (profileError) {
        console.error('Error fetching artist profile for sample works:', profileError);
        setSampleWorks([]);
        return;
      }
      
      // Then get sample works using profile_id
      const { data: sampleWorksData, error: worksError } = await supabase
        .rpc('get_unified_sample_works', { profile_id: profileData.id });
      
      if (worksError) {
        console.error('Error fetching sample works:', worksError);
        setSampleWorks([]);
      } else {
        setSampleWorks(sampleWorksData || []);
      }
    } catch (error) {
      console.error('Error loading sample works:', error);
      setSampleWorks([]);
    } finally {
      setSampleWorksLoading(false);
    }
  };

  const loadArtistEventHistory = async (artistNumber) => {
    setEventHistoryLoading(true);
    try {
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

  const handleImageClick = (work) => {
    setSelectedImage(work);
    setImageModalOpen(true);
  };

  const saveBio = async () => {
    if (!selectedArtist?.artist_profiles?.id) {
      console.error('No artist profile ID available for bio save');
      return;
    }

    setBioSaving(true);
    try {
      const { error } = await supabase
        .from('artist_profiles')
        .update({ abhq_bio: bioText })
        .eq('id', selectedArtist.artist_profiles.id);

      if (error) throw error;

      // Update the selected artist in state
      setSelectedArtist(prev => ({
        ...prev,
        artist_profiles: {
          ...prev.artist_profiles,
          abhq_bio: bioText
        }
      }));

      // Update the artist in all relevant lists
      const updateArtistInList = (list, setList) => {
        setList(prev => prev.map(artist => 
          artist.artist_number === selectedArtist.artist_number 
            ? {
                ...artist,
                artist_profiles: {
                  ...artist.artist_profiles,
                  abhq_bio: bioText
                }
              }
            : artist
        ));
      };

      updateArtistInList(artistApplications, setArtistApplications);
      updateArtistInList(artistInvitations, setArtistInvitations);
      updateArtistInList(artistConfirmations, setArtistConfirmations);
      updateArtistInList(artistProfiles, setArtistProfiles);

      setEditingBio(false);
      console.log('Bio saved successfully');
    } catch (error) {
      console.error('Error saving bio:', error);
      alert('Error saving bio. Please try again.');
    } finally {
      setBioSaving(false);
    }
  };

  const cancelBioEdit = () => {
    setBioText(selectedArtist?.artist_profiles?.abhq_bio || '');
    setEditingBio(false);
  };

  // Fetch events for the invite dropdown
  const fetchEvents = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const { data, error } = await supabase
        .from('events')
        .select('id, name, eid, event_start_datetime, cities(name, countries(name))')
        .order('event_start_datetime', { ascending: false })
        .limit(50);

      if (!error && data) {
        setEvents(data);
      }
    } catch (error) {
      console.error('Error fetching events:', error);
    }
  };

  // Handle inviting artist to event
  const handleInviteArtist = () => {
    setInviteMessage(`Hi ${selectedArtist?.artist_profiles?.name || 'there'},

You're invited to participate in our upcoming Art Battle event! 

We'd love to have you showcase your artistic talents in this exciting live painting competition. 

Please let us know if you're interested in participating.

Best regards,
Art Battle Team`);
    setInviteModalOpen(true);
  };

  // Send invitation
  const sendInvitation = async () => {
    if (!selectedEventForInvite || !selectedArtist?.artist_profiles?.email) {
      alert('Please select an event and ensure the artist has an email address.');
      return;
    }

    setInviteLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      const selectedEvent = events.find(e => e.id === selectedEventForInvite);
      const response = await fetch(`https://xsqdkubgyqwpyvfltnrf.supabase.co/functions/v1/admin-send-invitation`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
          'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhzcWRrdWJneXF3cHl2Zmx0bnJmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTM0MjE2OTYsImV4cCI6MjA2ODk5NzY5Nn0.hY8v8IDZQTcdAFa_OvQNFd1CyvabGcOZZMn_J6c4c2U'
        },
        body: JSON.stringify({
          artist_number: (selectedArtist.artist_profiles.entry_id || selectedArtist.artist_number).toString(),
          event_eid: selectedEvent?.eid,
          message_from_producer: inviteMessage,
          artist_profile_id: selectedArtist.artist_profiles.id
        })
      });

      if (response.ok) {
        alert('Invitation sent successfully!');
        setInviteModalOpen(false);
        setSelectedEventForInvite('');
        setInviteMessage('');
        // Refresh artist data to show new invitation
        fetchAllArtistsData();
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

  const formatTimeSince = (date) => {
    if (!date) return '';
    const now = new Date();
    const diffMs = now - new Date(date);
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffMinutes = Math.floor(diffMs / (1000 * 60));
    const diffSeconds = Math.floor(diffMs / 1000);
    
    if (diffDays > 0) return `${diffDays}d ago`;
    if (diffHours > 0) return `${diffHours}h ago`;
    if (diffMinutes > 0) return `${diffMinutes}m ago`;
    if (diffSeconds > 0) return `${diffSeconds}s ago`;
    return 'Just now';
  };

  const toggleStatusFilter = (status) => {
    setStatusFilters(prev => ({
      ...prev,
      [status]: !prev[status]
    }));
  };

  const toggleBioFilter = (bioType) => {
    setBioFilters(prev => ({
      ...prev,
      [bioType]: !prev[bioType]
    }));
  };

  const clearAllFilters = () => {
    setStatusFilters({
      profiles: true,
      applications: true,
      invitations: true,
      confirmations: true
    });
    setBioFilters({
      hasBio: true,
      noBio: true
    });
    setActiveFilter('all');
    setSearchTerm('');
  };

  const getFilteredArtists = () => {
    let allArtists = [];
    const processedNumbers = new Set();

    // Helper function to add artist if not already processed
    const addArtist = (artist, type, timestamp) => {
      if (!processedNumbers.has(artist.artist_number)) {
        allArtists.push({
          ...artist,
          workflow_type: type,
          last_activity: timestamp
        });
        processedNumbers.add(artist.artist_number);
      }
    };

    // Process by priority: confirmations > invitations > applications > profiles
    // Apply status filters
    if ((activeFilter === 'all' || activeFilter === 'confirmations') && statusFilters.confirmations) {
      artistConfirmations
        .sort((a, b) => new Date(b.created_at || b.confirmed_at) - new Date(a.created_at || a.confirmed_at))
        .slice(0, 25)
        .forEach(artist => 
          addArtist(artist, 'confirmation', artist.created_at || artist.confirmed_at)
        );
    }

    if ((activeFilter === 'all' || activeFilter === 'invitations') && statusFilters.invitations) {
      artistInvitations
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
        .slice(0, 25)
        .forEach(artist => 
          addArtist(artist, 'invitation', artist.created_at)
        );
    }

    if ((activeFilter === 'all' || activeFilter === 'applications') && statusFilters.applications) {
      artistApplications
        .sort((a, b) => new Date(b.applied_at || b.created_at) - new Date(a.applied_at || a.created_at))
        .slice(0, 25)
        .forEach(artist => 
          addArtist(artist, 'application', artist.applied_at || artist.created_at)
        );
    }

    if ((activeFilter === 'all' || activeFilter === 'profiles') && statusFilters.profiles) {
      artistProfiles
        .sort((a, b) => new Date(b.artist_profiles?.created_at || b.created_at) - new Date(a.artist_profiles?.created_at || a.created_at))
        .slice(0, 25)
        .forEach(artist => 
          addArtist(artist, 'profile', artist.artist_profiles?.created_at || artist.created_at)
        );
    }

    // Handle missing bio filter
    if (activeFilter === 'missing_bio') {
      artistConfirmations
        .filter(artist => !artist.artist_profiles?.abhq_bio || artist.artist_profiles.abhq_bio.trim() === '')
        .sort((a, b) => new Date(b.created_at || b.confirmed_at) - new Date(a.created_at || a.confirmed_at))
        .slice(0, 25)
        .forEach(artist => {
          addArtist(artist, 'missing_bio', artist.created_at || artist.confirmed_at);
        });
    }

    // Apply bio filters
    allArtists = allArtists.filter(artist => {
      const hasBio = artist.artist_profiles?.abhq_bio && artist.artist_profiles.abhq_bio.trim() !== '';
      
      if (hasBio && !bioFilters.hasBio) return false;
      if (!hasBio && !bioFilters.noBio) return false;
      
      return true;
    });

    // Search is now handled server-side via the admin-artists-search function
    // No client-side filtering needed for search terms

    // Sort by last activity (most recent first)
    return allArtists.sort((a, b) => new Date(b.last_activity) - new Date(a.last_activity));
  };

  const getWorkflowBadge = (type) => {
    const badgeProps = {
      profile: { color: 'gray', label: 'Profile' },
      application: { color: 'blue', label: 'Application' },
      invitation: { color: 'orange', label: 'Invitation' },
      confirmation: { color: 'green', label: 'Confirmed' },
      missing_bio: { color: 'red', label: 'Missing Bio' }
    };
    
    const props = badgeProps[type] || badgeProps.profile;
    return <Badge color={props.color} size="1">{props.label}</Badge>;
  };

  if (loading) {
    return (
      <Box p="4">
        <Flex align="center" justify="center" style={{ height: '200px' }}>
          <Spinner size="3" />
        </Flex>
      </Box>
    );
  }

  const filteredArtists = getFilteredArtists();

  return (
    <Box p="4">
      <Flex direction="column" gap="4">
        {/* Header */}
        <Box>
          <Heading size="6" mb="2">Artists Management</Heading>
          <Text color="gray" size="2">
            Manage artist profiles, applications, invitations, and confirmations
          </Text>
        </Box>

        {/* Tag Toggles */}
        <Card>
          <Box p="4">
            <Text size="3" weight="medium" mb="3" style={{ display: 'block' }}>
              Filter Tags
            </Text>
            
            <Flex direction="column" gap="3">
              {/* Status Filters */}
              <Box>
                <Text size="2" weight="medium" mb="2" style={{ display: 'block' }}>
                  Artist Status:
                </Text>
                <Flex gap="2" wrap="wrap">
                  <Badge 
                    color={statusFilters.confirmations ? 'green' : 'gray'} 
                    style={{ cursor: 'pointer' }}
                    onClick={() => toggleStatusFilter('confirmations')}
                  >
                    ✅ Confirmed ({artistConfirmations.length})
                  </Badge>
                  <Badge 
                    color={statusFilters.invitations ? 'orange' : 'gray'} 
                    style={{ cursor: 'pointer' }}
                    onClick={() => toggleStatusFilter('invitations')}
                  >
                    📨 Invited ({artistInvitations.length})
                  </Badge>
                  <Badge 
                    color={statusFilters.applications ? 'blue' : 'gray'} 
                    style={{ cursor: 'pointer' }}
                    onClick={() => toggleStatusFilter('applications')}
                  >
                    📝 Applied ({artistApplications.length})
                  </Badge>
                  <Badge 
                    color={statusFilters.profiles ? 'indigo' : 'gray'} 
                    style={{ cursor: 'pointer' }}
                    onClick={() => toggleStatusFilter('profiles')}
                  >
                    👤 Profiles ({artistProfiles.length})
                  </Badge>
                </Flex>
              </Box>

              {/* Bio Filters */}
              <Box>
                <Text size="2" weight="medium" mb="2" style={{ display: 'block' }}>
                  ABHQ Bio Status:
                </Text>
                <Flex gap="2" wrap="wrap">
                  <Badge 
                    color={bioFilters.hasBio ? 'green' : 'gray'} 
                    style={{ cursor: 'pointer' }}
                    onClick={() => toggleBioFilter('hasBio')}
                  >
                    ✅ Has Bio
                  </Badge>
                  <Badge 
                    color={bioFilters.noBio ? 'red' : 'gray'} 
                    style={{ cursor: 'pointer' }}
                    onClick={() => toggleBioFilter('noBio')}
                  >
                    ❌ No Bio
                  </Badge>
                </Flex>
              </Box>

              {/* Quick Actions */}
              <Flex gap="2" align="center">
                <Button 
                  size="1" 
                  variant="soft" 
                  onClick={clearAllFilters}
                >
                  Clear All Filters
                </Button>
                <Text size="1" color="gray">
                  Click tags to toggle filters
                </Text>
              </Flex>
            </Flex>
          </Box>
        </Card>

        {/* Search and Filters */}
        <Card>
          <Box p="4">
            <Flex gap="4" align="end">
              <Box style={{ flex: 1 }}>
                <Text size="2" weight="medium" mb="2" style={{ display: 'block' }}>
                  Search Artists
                </Text>
                <TextField.Root 
                  placeholder="Search by name, email, phone, or entry ID..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                >
                  <TextField.Slot>
                    <MagnifyingGlassIcon height="16" width="16" />
                  </TextField.Slot>
                </TextField.Root>
              </Box>
              
              <Box>
                <Text size="2" weight="medium" mb="2" style={{ display: 'block' }}>
                  Filter by Type
                </Text>
                <Select.Root value={activeFilter} onValueChange={setActiveFilter}>
                  <Select.Trigger style={{ width: '200px' }} />
                  <Select.Content>
                    <Select.Item value="all">All Artists</Select.Item>
                    <Select.Item value="profiles">Profiles Only</Select.Item>
                    <Select.Item value="applications">Applications</Select.Item>
                    <Select.Item value="invitations">Invitations</Select.Item>
                    <Select.Item value="confirmations">Confirmations</Select.Item>
                    <Select.Item value="missing_bio">Missing Bio</Select.Item>
                  </Select.Content>
                </Select.Root>
              </Box>
            </Flex>
          </Box>
        </Card>

        {/* Results Summary */}
        <Flex align="center" justify="between">
          <Flex align="center" gap="2">
            <Text size="2" color="gray">
              {filteredArtists.length} artist{filteredArtists.length !== 1 ? 's' : ''} found
            </Text>
            {profilesLoading && (
              <Flex align="center" gap="2">
                <Spinner size="1" />
                <Text size="1" color="gray">
                  Loading profiles ({profilesLoadingProgress.loaded}/{profilesLoadingProgress.total})
                </Text>
              </Flex>
            )}
          </Flex>
          <Button 
            variant="soft" 
            onClick={fetchAllArtistsData}
            size="1"
          >
            Refresh Data
          </Button>
        </Flex>

        {/* Artists Grid */}
        <Grid columns={{ initial: '1', sm: '2', lg: '3' }} gap="4">
          {filteredArtists.map((artist) => (
            <Card 
              key={`${artist.artist_number}-${artist.workflow_type}`}
              style={{ cursor: 'pointer' }}
              onClick={() => openArtistModal(artist, artist.workflow_type)}
            >
              <Box p="4">
                <Flex direction="column" gap="3">
                  <Flex justify="between" align="start">
                    <Box>
                      <Flex align="center" gap="2" mb="1">
                        <Text weight="bold" size="3">
                          {artist.artist_profiles?.name || 'Unknown Artist'}
                        </Text>
                        {getAliasBadgeText(artist.artist_profiles) && (
                          <Badge color="purple" size="1">
                            {getAliasBadgeText(artist.artist_profiles)}
                          </Badge>
                        )}
                      </Flex>
                      <Text size="2" color="gray">
                        Artist #{artist.artist_number}
                      </Text>
                    </Box>
                    {getWorkflowBadge(artist.workflow_type)}
                  </Flex>
                  
                  {/* Artist Details */}
                  <Flex direction="column" gap="1">
                    {(artist.artist_profiles?.city_text || artist.artist_profiles?.city || artist.artist_profiles?.country) && (
                      <Text size="1" color="gray">
                        📍 {[
                          artist.artist_profiles?.city_text || artist.artist_profiles?.city,
                          artist.artist_profiles?.country
                        ].filter(Boolean).join(', ')}
                      </Text>
                    )}
                  </Flex>

                  {/* Last Activity */}
                  {artist.last_activity && (
                    <Text size="1" color="gray">
                      Last activity: {formatTimeSince(artist.last_activity)}
                    </Text>
                  )}
                </Flex>
              </Box>
            </Card>
          ))}
        </Grid>

        {filteredArtists.length === 0 && (
          <Card>
            <Box p="6" style={{ textAlign: 'center' }}>
              <Text color="gray">No artists found matching your criteria.</Text>
            </Box>
          </Card>
        )}
      </Flex>

      {/* Artist Details Modal - Reusing EventDetail modal structure */}
      <Dialog.Root open={artistModalOpen} onOpenChange={setArtistModalOpen}>
        <Dialog.Content style={{ maxWidth: 800, maxHeight: '90vh' }}>
          <Dialog.Title>
            <Flex align="center" justify="between">
              <Flex align="center" gap="3">
                <PersonIcon size={24} />
                <Box>
                  <Text size="5" weight="bold">
                    {selectedArtist?.artist_profiles?.name || 'Unknown Artist'}
                  </Text>
                  <Flex align="center" gap="2" mt="1">
                    <Text size="2" color="gray">
                      {artistModalType.charAt(0).toUpperCase() + artistModalType.slice(1)} Details
                    </Text>
                    {getAliasBadgeText(selectedArtist?.artist_profiles) && (
                      <Badge color="purple" size="2">
                        {getAliasBadgeText(selectedArtist.artist_profiles)}
                      </Badge>
                    )}
                    {selectedArtist?.artist_profiles?.experience_level && (
                      <Badge 
                        color={
                          selectedArtist.artist_profiles.experience_level === 'beginner' ? 'green' :
                          selectedArtist.artist_profiles.experience_level === 'intermediate' ? 'orange' :
                          'red'
                        }
                        size="2"
                      >
                        {selectedArtist.artist_profiles.experience_level}
                      </Badge>
                    )}
                  </Flex>
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
                    <Flex direction="column" gap="2">
                      <Text size="2">
                        <strong>Name:</strong> {selectedArtist?.artist_profiles?.name || 'Unknown'}
                      </Text>
                      <Text size="2">
                        <strong>Artist #:</strong> {selectedArtist?.artist_number || 'Unknown'}
                      </Text>
                      {selectedArtist?.artist_profiles?.email && (
                        <Text size="2">
                          <strong>Email:</strong> {selectedArtist.artist_profiles.email}
                        </Text>
                      )}
                      {selectedArtist?.artist_profiles?.phone && (
                        <Text size="2">
                          <strong>Phone:</strong> {selectedArtist.artist_profiles.phone}
                        </Text>
                      )}
                      {(selectedArtist?.artist_profiles?.city_text || selectedArtist?.artist_profiles?.city || selectedArtist?.artist_profiles?.country) && (
                        <Text size="2">
                          <strong>Location:</strong> {[selectedArtist?.artist_profiles?.city_text || selectedArtist?.artist_profiles?.city, selectedArtist?.artist_profiles?.country].filter(Boolean).join(', ')}
                        </Text>
                      )}
                      {selectedArtist?.artist_profiles?.studio_location && (
                        <Text size="2">
                          <strong>Studio:</strong> {selectedArtist.artist_profiles.studio_location}
                        </Text>
                      )}
                      {selectedArtist?.artist_profiles?.specialties && (
                        <Text size="2">
                          <strong>Specialties:</strong> {selectedArtist.artist_profiles.specialties}
                        </Text>
                      )}
                      {selectedArtist?.artist_profiles?.instagram && (
                        <Text size="2">
                          <strong>Instagram:</strong> <a href={`https://instagram.com/${selectedArtist.artist_profiles.instagram}`} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--blue-11)' }}>@{selectedArtist.artist_profiles.instagram}</a>
                        </Text>
                      )}
                      {selectedArtist?.artist_profiles?.website && (
                        <Text size="2">
                          <strong>Website:</strong> <a href={selectedArtist.artist_profiles.website} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--blue-11)' }}>{selectedArtist.artist_profiles.website}</a>
                        </Text>
                      )}
                      {selectedArtist?.artist_profiles?.facebook && (
                        <Text size="2">
                          <strong>Facebook:</strong> <a href={`https://facebook.com/${selectedArtist.artist_profiles.facebook}`} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--blue-11)' }}>{selectedArtist.artist_profiles.facebook}</a>
                        </Text>
                      )}
                      {selectedArtist?.artist_profiles?.twitter && (
                        <Text size="2">
                          <strong>Twitter:</strong> <a href={`https://twitter.com/${selectedArtist.artist_profiles.twitter}`} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--blue-11)' }}>@{selectedArtist.artist_profiles.twitter}</a>
                        </Text>
                      )}
                    </Flex>
                    
                    {/* Bio Section */}
                    {selectedArtist?.artist_profiles?.bio && (
                      <Box mt="3">
                        <Text size="2" weight="medium" mb="2" style={{ display: 'block' }}>
                          <strong>Bio:</strong>
                        </Text>
                        <Box p="3" style={{ backgroundColor: 'var(--gray-2)', borderRadius: '6px' }}>
                          <Text size="2" style={{ lineHeight: '1.5', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                            {selectedArtist.artist_profiles.bio}
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
                            onClick={() => setEditingBio(true)}
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
                          {selectedArtist?.artist_profiles?.abhq_bio ? (
                            <Box p="3" style={{ backgroundColor: 'var(--green-2)', borderRadius: '6px' }}>
                              <Text size="2" style={{ lineHeight: '1.5', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                                {selectedArtist.artist_profiles.abhq_bio}
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
                        {selectedArtist?.artist_profiles?.email && (
                          <Button 
                            variant="solid" 
                            color="blue" 
                            size="2"
                            onClick={handleInviteArtist}
                          >
                            Invite to Event
                          </Button>
                        )}
                        {!selectedArtist?.artist_profiles?.email && (
                          <Text size="2" color="gray">
                            No email address available for invitations
                          </Text>
                        )}
                      </Flex>
                    </Box>
                  </Box>
                </Card>

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

                              {/* Additional Details */}
                              {(eventHistory.application?.message_to_producer || eventHistory.invitation?.message_from_producer || eventHistory.confirmation?.message_to_organizers) && (
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
                                  {eventHistory.invitation?.message_from_producer && (
                                    <Box mb="2">
                                      <Text size="2" weight="medium">Invitation Message:</Text>
                                      <Box p="2" style={{ backgroundColor: 'var(--orange-3)', borderRadius: '4px', marginTop: '4px' }}>
                                        <Text size="2" style={{ whiteSpace: 'pre-wrap' }}>
                                          {eventHistory.invitation.message_from_producer}
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
                            key={work.id}
                            onClick={() => handleImageClick(work)}
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
                      <Text size="2" color="gray">No sample works available</Text>
                    )}
                  </Box>
                </Card>
              </Flex>
            </Box>
          </ScrollArea>
        </Dialog.Content>
      </Dialog.Root>

      {/* Invite Artist to Event Modal */}
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
                  Inviting: {selectedArtist?.artist_profiles?.name || 'Unknown Artist'}
                </Text>
                <Text size="2" color="gray">
                  Email: {selectedArtist?.artist_profiles?.email}
                </Text>
                <Text size="2" color="gray">
                  Artist #: {selectedArtist?.artist_profiles?.entry_id || selectedArtist?.artist_number || 'Unknown'}
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
                    {events.map((event) => (
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

      {/* Image Modal */}
      <Dialog.Root open={imageModalOpen} onOpenChange={setImageModalOpen}>
        <Dialog.Content style={{ maxWidth: '90vw', maxHeight: '90vh' }}>
          <Dialog.Title>
            <Flex align="center" justify="between">
              <Text>Sample Work</Text>
              <Dialog.Close>
                <Button variant="ghost" size="1">
                  <Cross2Icon />
                </Button>
              </Dialog.Close>
            </Flex>
          </Dialog.Title>
          
          <Box style={{ textAlign: 'center', padding: '2rem' }}>
            {selectedImage?.image_url && (
              <img 
                src={selectedImage.image_url} 
                alt="Sample work"
                style={{ 
                  maxWidth: '100%', 
                  maxHeight: '70vh', 
                  objectFit: 'contain',
                  borderRadius: '6px'
                }}
              />
            )}
            {selectedImage?.description && (
              <Text size="2" color="gray" style={{ display: 'block', marginTop: '1rem' }}>
                {selectedImage.description}
              </Text>
            )}
          </Box>
        </Dialog.Content>
      </Dialog.Root>
    </Box>
  );
};

export default ArtistsManagement;
import { useState, useEffect } from 'react';
import {
  Box,
  Heading,
  Text,
  Card,
  Flex,
  Button,
  Badge,
  Separator,
  Grid,
  Tabs,
  Dialog,
  Select,
  AlertDialog,
  Callout,
  Checkbox,
  IconButton,
  Spinner,
} from '@radix-ui/themes';
import { Cross2Icon, PlusIcon, InfoCircledIcon, ExclamationTriangleIcon } from '@radix-ui/react-icons';
import { supabase } from '../lib/supabase';
import EventEditor from './EventEditor';
import QRAdminPanel from './QRAdminPanel';
import VoteDataTimestamp from './VoteDataTimestamp';
import { getArtworkImageUrls } from '../lib/imageHelpers';
import { injectFlashStyles, applyFlashClass } from '../utils/realtimeFlash';
import { useVoteAnalytics } from '../hooks/useVoteAnalytics';

// PDF Preview Component
const PDFPreviewPanel = ({ eid }) => {
  const [pdfUrl, setPdfUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [copySuccess, setCopySuccess] = useState(false);

  // Generate the PDF URL
  const paperworkUrl = `https://paperwork-service-4nama.ondigitalocean.app/api/v1/event-pdf/${eid}`;

  const loadPdf = async () => {
    if (!eid) {
      setError('No event ID available');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Test if the PDF URL is accessible
      const response = await fetch(paperworkUrl, { method: 'HEAD' });
      if (response.ok) {
        setPdfUrl(paperworkUrl);
      } else {
        setError(`PDF not available (HTTP ${response.status})`);
      }
    } catch (err) {
      setError('Failed to connect to PDF service');
      console.error('PDF load error:', err);
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(paperworkUrl);
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  useEffect(() => {
    if (eid) {
      loadPdf();
    }
  }, [eid]);

  return (
    <Flex direction="column" gap="4">
      <Card size="2">
        <Heading size="3" mb="3">Event PDF Document</Heading>

        <Flex direction="column" gap="3">
          <Flex align="center" gap="2">
            <Text size="2" color="gray">Event ID:</Text>
            <Badge variant="soft">{eid || 'Not available'}</Badge>
          </Flex>

          <Flex align="center" gap="2">
            <Button
              size="2"
              onClick={copyToClipboard}
              variant={copySuccess ? "soft" : "outline"}
              color={copySuccess ? "green" : "blue"}
            >
              {copySuccess ? "Copied!" : "Copy PDF Link"}
            </Button>
            <Button size="2" onClick={loadPdf} disabled={loading}>
              {loading ? "Loading..." : "Refresh PDF"}
            </Button>
          </Flex>

          <Box>
            <Text size="2" color="gray">PDF URL:</Text>
            <Text size="1" style={{
              fontFamily: 'monospace',
              wordBreak: 'break-all',
              background: 'var(--gray-3)',
              padding: '8px',
              borderRadius: '4px',
              display: 'block',
              marginTop: '4px'
            }}>
              {paperworkUrl}
            </Text>
          </Box>

          {error && (
            <Callout.Root color="red">
              <Callout.Icon>
                <ExclamationTriangleIcon />
              </Callout.Icon>
              <Callout.Text>{error}</Callout.Text>
            </Callout.Root>
          )}

          {loading && (
            <Flex align="center" gap="2">
              <Spinner size="1" />
              <Text size="2" color="gray">Loading PDF...</Text>
            </Flex>
          )}

          {pdfUrl && !loading && (
            <Card size="1" style={{ border: '1px solid var(--gray-6)' }}>
              <Heading size="2" mb="2">PDF Preview (Thumbnail)</Heading>
              <Flex direction="column" gap="2">
                <Box style={{
                  width: '400px',
                  height: '310px', // 8.5:11 ratio scaled down (approx. landscape 8.5x11)
                  border: '1px solid var(--gray-6)',
                  borderRadius: '4px',
                  overflow: 'hidden',
                  background: 'var(--gray-2)',
                  position: 'relative'
                }}>
                  <iframe
                    src={pdfUrl}
                    style={{
                      width: '100%',
                      height: '100%',
                      border: 'none'
                    }}
                    title={`Event PDF for ${eid}`}
                    onError={() => setError('PDF preview failed to load')}
                  />
                  {/* Fallback message overlay */}
                  <Box style={{
                    position: 'absolute',
                    top: '50%',
                    left: '50%',
                    transform: 'translate(-50%, -50%)',
                    textAlign: 'center',
                    pointerEvents: 'none',
                    color: 'var(--gray-10)',
                    fontSize: '12px'
                  }}>
                    <Text size="1">PDF preview may not load in some browsers</Text>
                  </Box>
                </Box>
                <Flex gap="2">
                  <Button
                    size="2"
                    variant="outline"
                    onClick={() => window.open(pdfUrl, '_blank')}
                  >
                    Open Full PDF in New Tab
                  </Button>
                  <Button
                    size="2"
                    variant="soft"
                    onClick={() => {
                      const link = document.createElement('a');
                      link.href = pdfUrl;
                      link.download = `event-${eid}.pdf`;
                      link.click();
                    }}
                  >
                    Download PDF
                  </Button>
                </Flex>
              </Flex>
            </Card>
          )}
        </Flex>
      </Card>
    </Flex>
  );
};

const AdminPanel = ({ 
  eventId,
  eid,
  artworksByRound = {}, 
  roundWinners = {}, 
  setRoundWinners = () => {}, 
  artworks = [],
  currentTime = Date.now(),
  user = null,
  onDataChange = () => {}
}) => {
  const [auctionEndTime, setAuctionEndTime] = useState(null);
  const [auctionWarningActive, setAuctionWarningActive] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [newArtist, setNewArtist] = useState({ name: '', phone: '', email: '', city_text: '', instagram: '' });
  const [showCreateArtist, setShowCreateArtist] = useState(false);
  const [searchTimeout, setSearchTimeout] = useState(null);
  const [adminMode, setAdminMode] = useState('artists');
  const [localTime, setLocalTime] = useState(Date.now());
  const [rounds, setRounds] = useState([]);
  const [artists, setArtists] = useState([]);
  // Real-time vote data - merges with static artworksByRound
  const [liveArtworksByRound, setLiveArtworksByRound] = useState({});
  const [voteDataTimestamp, setVoteDataTimestamp] = useState(null);
  // Removed allArtists state - now using server-side search
  const [auctionTimerStatus, setAuctionTimerStatus] = useState(null);
  const [timerActionLoading, setTimerActionLoading] = useState(false);
  const [eventArtists, setEventArtists] = useState([]); // Artists added to event (including unassigned)
  const [selectedEasel, setSelectedEasel] = useState(null);
  const [roundTimers, setRoundTimers] = useState({}); // Track timer states for each round
  const [roundTimerData, setRoundTimerData] = useState({}); // Store detailed timer data per round
  const [confirmCancelTimer, setConfirmCancelTimer] = useState(null); // For cancel confirmation modal
  const [confirmCancelRoundTimer, setConfirmCancelRoundTimer] = useState(null); // For round-specific cancel confirmation
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [auctionArtworks, setAuctionArtworks] = useState([]);
  const [auctionBids, setAuctionBids] = useState({});
  const [selectedAuctionItem, setSelectedAuctionItem] = useState(null);
  const [confirmCloseAuction, setConfirmCloseAuction] = useState(false);
  const [adminLevel, setAdminLevel] = useState(null);
  const [clearOptions, setClearOptions] = useState({
    clearImages: false,
    clearVotes: false,
    clearBids: false
  });
  const [showRemovalInfo, setShowRemovalInfo] = useState(false);
  const [eventAdmins, setEventAdmins] = useState([]);
  const [adminPhoneSearch, setAdminPhoneSearch] = useState('');
  const [peopleSearchResults, setPeopleSearchResults] = useState([]);
  const [selectedAdminLevel, setSelectedAdminLevel] = useState('voting');
  const [adminMessage, setAdminMessage] = useState(null); // { type: 'success' | 'error', text: string }
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [eventData, setEventData] = useState(null);
  const [paymentFormData, setPaymentFormData] = useState({
    actualAmount: '',
    actualTax: '',
    paymentMethod: 'cash',
    collectionNotes: ''
  });

  // Offer functionality state
  const [showOfferConfirm, setShowOfferConfirm] = useState(null); // { bid, bidder }
  const [offerLoading, setOfferLoading] = useState(false);

  // Payment reminder functionality state
  const [paymentReminderLoading, setPaymentReminderLoading] = useState(false);

  // History modals state
  const [showReminderHistory, setShowReminderHistory] = useState(null); // art_id when open
  const [showOfferHistory, setShowOfferHistory] = useState(null); // art_id when open
  const [reminderHistory, setReminderHistory] = useState(null);
  const [offerHistory, setOfferHistory] = useState(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [lastReminderSent, setLastReminderSent] = useState({}); // artId -> timestamp
  const [lastOfferCreated, setLastOfferCreated] = useState({}); // artId -> timestamp
  const [activeOffers, setActiveOffers] = useState({}); // artId -> { expires_at, bidder_name, bidder_id }

  // Helper function to show temporary messages
  const showAdminMessage = (type, text) => {
    setAdminMessage({ type, text });
    setTimeout(() => setAdminMessage(null), 4000); // Auto-dismiss after 4 seconds
  };

  // Update local time for countdown and check for expired timers
  useEffect(() => {
    let lastExpiredCheck = new Set();
    
    const interval = setInterval(() => {
      const now = Date.now();
      setLocalTime(now);
      
      // Check for newly expired auctions (admin panel)
      if (adminMode === 'auction' && auctionArtworks.length > 0) {
        const currentlyExpired = new Set();
        auctionArtworks.forEach(artwork => {
          if (artwork.closing_time) {
            const closeTime = new Date(artwork.closing_time);
            const diffMs = closeTime - now;
            if (diffMs <= 0 && artwork.status === 'active') {
              currentlyExpired.add(artwork.id);
            }
          }
        });
        
        // If we have newly expired timers, refresh data after a short delay
        const newlyExpired = [...currentlyExpired].filter(id => !lastExpiredCheck.has(id));
        if (newlyExpired.length > 0) {
          console.log('Admin panel detected newly expired auctions:', newlyExpired);
          // Small delay to allow backend processing
          setTimeout(() => {
            fetchAuctionData();
          }, 2000);
        }
        
        lastExpiredCheck = currentlyExpired;
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [adminMode, auctionArtworks]);

  // Make refreshVoteWeights available globally for realtime updates
  useEffect(() => {
    if (adminMode === 'voting' && artworksByRound) {
      window.refreshVoteWeights = async () => {
        // Trigger parent component to refresh vote weights
        // This will be called by realtime subscription
        // const { fetchVoteWeights } = await import('../components/EventDetails');
        // if (fetchVoteWeights) fetchVoteWeights(); // TODO: Implement this function
      };
    }
    return () => {
      delete window.refreshVoteWeights;
    };
  }, [adminMode, artworksByRound]);

  // Check admin level when component mounts or user changes
  useEffect(() => {
    const checkAdminLevel = async () => {
      if (!eventId || !user) return;
      
      try {
        const { getUserAdminLevel } = await import('../lib/adminHelpers');
        const level = await getUserAdminLevel(eventId, user?.phone);
        setAdminLevel(level);
        console.log('Admin level:', level);
      } catch (error) {
        console.error('Error checking admin level:', error);
      }
    };
    
    checkAdminLevel();
  }, [eventId, user]);

  // Real-time vote analytics polling (admin only)
  const handleArtworksUpdate = (updatedArtworksByRound) => {
    setLiveArtworksByRound(updatedArtworksByRound);
  };

  const handleTimestampUpdate = (timestampData) => {
    setVoteDataTimestamp(timestampData);
  };

  useVoteAnalytics(
    eid, 
    adminLevel, 
    adminMode === 'voting', 
    handleArtworksUpdate,
    handleTimestampUpdate
  );

  // Fetch event data when eventId changes
  useEffect(() => {
    if (eventId) {
      fetchEventData();
      if (adminLevel === 'super') {
        fetchEventAdmins();
      }
      // Only fetch auction data if we have adminLevel set (to avoid calling before admin privileges are known)
      if (adminMode === 'auction' && adminLevel !== null) {
        fetchAuctionData();
        fetchAuctionTimerStatus();
        fetchRoundTimerStatus(); // Fetch round-specific timer data
      }
    }
  }, [eventId, adminLevel]);

  // Fetch event data for CSV export URL
  useEffect(() => {
    if (eventId) {
      const fetchEventData = async () => {
        try {
          // Convert EID to UUID for admin database calls
          const { getEventUuidFromEid } = await import('../lib/adminHelpers');
          const eventUuid = await getEventUuidFromEid(eventId);

          if (!eventUuid) {
            console.error(`Could not find UUID for event ${eventId}`);
            return;
          }

          const { data, error } = await supabase
            .from('events')
            .select('eid, name')
            .eq('id', eventUuid)
            .single()
          
          if (!error && data) {
            setEventData(data);
          }
        } catch (error) {
          console.error('Error fetching event data:', error);
        }
      };
      fetchEventData();
    }
  }, [eventId]);

  // Fetch auction data when switching to auction tab or admin level changes
  useEffect(() => {
    if (eventId && adminMode === 'auction' && adminLevel !== null) {
      fetchAuctionData();
      fetchAuctionTimerStatus();
      fetchRoundTimerStatus(); // Fetch round-specific timer data
    }
  }, [adminMode, adminLevel]);

  // Fetch admins when switching to event tab or admin level changes
  useEffect(() => {
    if (eventId && adminLevel === 'super' && adminMode === 'event') {
      fetchEventAdmins();
    }
  }, [adminMode, adminLevel]);

  // Inject flash styles on mount
  useEffect(() => {
    injectFlashStyles();
  }, []);

  // Set up realtime subscription for auction updates with flash animations
  useEffect(() => {
    if (!eventId || adminMode !== 'auction') return;

    let channel = null;

    const setupRealtimeSubscription = async () => {
      const { getEventUuidFromEid } = await import('../lib/adminHelpers');
      const eventUuid = await getEventUuidFromEid(eventId);

      if (!eventUuid) {
        console.error('Could not get UUID for event:', eventId);
        return;
      }

      channel = supabase
        .channel(`admin-auction-${eventId}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'art',
            filter: `event_id=eq.${eventUuid}`,
          },
        (payload) => {
          console.log('Art update:', payload);
          // Flash the auction status/timer if visible
          setTimeout(() => {
            const element = document.querySelector('[data-auction-timer]');
            if (element) applyFlashClass(element);
          }, 0);
          // Refresh auction data on any art table changes
          fetchAuctionData();
          fetchAuctionTimerStatus();
          fetchRoundTimerStatus(); // Update round-specific timers
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'bids',
        },
        (payload) => {
          // Check if bid is for this event
          const artId = payload.new?.art_id || payload.old?.art_id;
          if (artId && auctionArtworks.some(art => art.id === artId)) {
            // Flash the specific artwork's bid info
            setTimeout(() => {
              const element = document.querySelector(`[data-admin-bid="${artId}"]`);
              if (element) applyFlashClass(element);
            }, 0);
            fetchAuctionData();
          }
        }
      )
      .subscribe();
    };

    setupRealtimeSubscription();

    return () => {
      if (channel) {
        supabase.removeChannel(channel);
      }
    };
  }, [eventId, adminMode, auctionArtworks.length]);

  // Set up realtime subscription for voting updates
  useEffect(() => {
    if (!eventId || adminMode !== 'voting') return;

    let channel = null;

    const setupRealtimeSubscription = async () => {
      const { getEventUuidFromEid } = await import('../lib/adminHelpers');
      const eventUuid = await getEventUuidFromEid(eventId);

      if (!eventUuid) {
        console.error('Could not get UUID for event:', eventId);
        return;
      }

      channel = supabase
        .channel(`admin-voting-${eventId}`)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'votes',
            filter: `event_id=eq.${eventUuid}`,
          },
        (payload) => {
          console.log('Vote update:', payload);
          // Flash the vote display for the artwork
          const artUuid = payload.new?.art_uuid;
          if (artUuid) {
            setTimeout(() => {
              const element = document.querySelector(`[data-vote-display="${artUuid}"]`);
              if (element) applyFlashClass(element);
            }, 0);
          }
          // Trigger parent to refresh vote weights
          if (window.refreshVoteWeights) {
            window.refreshVoteWeights();
          }
        }
      )
      .subscribe();
    };

    setupRealtimeSubscription();

    return () => {
      if (channel) {
        supabase.removeChannel(channel);
      }
    };
  }, [eventId, adminMode]);

  // AdminPanel realtime subscriptions DISABLED
  // The realtime subscriptions were causing page reloads - investigation ongoing
  // EventDetails component handles realtime updates for now
  useEffect(() => {
    // DISABLED - Realtime subscriptions cause page reload issue
    // TODO: Investigate why realtime subscriptions crash the AdminPanel
  }, [eventId, adminMode]);

  // Real-time timer updates for button text
  useEffect(() => {
    const interval = setInterval(() => {
      // Force re-render to update button text with current timestamps
      // This will trigger getButtonText to recalculate time differences
      setLastReminderSent(prev => ({ ...prev }));
    }, 1000); // Update every second

    return () => clearInterval(interval);
  }, []);

  const fetchEventData = async () => {
    try {
      // Convert EID to UUID for admin database calls
      const { getEventUuidFromEid } = await import('../lib/adminHelpers');
      const eventUuid = await getEventUuidFromEid(eventId);

      if (!eventUuid) {
        throw new Error(`Could not find UUID for event ${eventId}`);
      }

      // Try to get the first round ID for this event (for staging artists)
      // This is optional - events can exist without rounds
      const { data: firstRound, error: roundError } = await supabase
        .from('rounds')
        .select('id')
        .eq('event_id', eventUuid)  // Use UUID instead of EID
        .eq('round_number', 1)
        .maybeSingle(); // Use maybeSingle instead of single to allow null

      // Don't throw error if no first round exists - just continue without it

      // Fetch all rounds with contestants (may be empty for events without rounds)
      const { data: roundsData, error: roundsError } = await supabase
        .from('rounds')
        .select(`
          id,
          round_number,
          closing_time,
          round_contestants (
            id,
            easel_number,
            is_winner,
            artist_id,
            artist_profiles (
              id,
              name,
              city_text,
              instagram,
              entry_id
            )
          )
        `)
        .eq('event_id', eventUuid)  // Use UUID instead of EID
        .order('round_number');

      if (roundsError) throw roundsError;
      
      // Handle case where there are no rounds yet
      if (!roundsData || roundsData.length === 0) {
        console.log('No rounds found for event', eventId, '- will still fetch event artists');
        setRounds([]);
        // Continue to fetch event artists even without rounds
      } else {
        // Transform rounds data for UI (preserve all easel boxes)
        const transformedRounds = roundsData.map(round => {
          // First, create a map of easel numbers to artists
          const easelMap = new Map();
          let highestEaselNumber = 0;
          
          round.round_contestants
            .filter(c => c.easel_number !== null && c.easel_number !== 0) // Ignore 0 as placeholder
            .forEach(contestant => {
              if (contestant.easel_number > highestEaselNumber) {
                highestEaselNumber = contestant.easel_number;
              }
              easelMap.set(contestant.easel_number, {
                id: contestant.artist_profiles.id,
                name: contestant.artist_profiles.name,
                city_text: contestant.artist_profiles.city_text,
                instagram: contestant.artist_profiles.instagram,
                entry_id: contestant.artist_profiles.entry_id,
                contestantId: contestant.id,
                isWinner: contestant.is_winner
              });
            });

          // Create easels for all positions from 1 to highestEaselNumber (including gaps)
          const easels = [];
          for (let i = 1; i <= highestEaselNumber; i++) {
            if (easelMap.has(i)) {
              // Occupied easel
              easels.push({
                easelNumber: i,
                artist: easelMap.get(i),
                isEmpty: false
              });
            } else {
              // Empty easel slot (gap that needs to be visible)
              easels.push({
                easelNumber: i,
                artist: null,
                isEmpty: true
              });
            }
          }

          return {
            id: round.id,
            roundNumber: round.round_number,
            easels: easels
          };
        });

        console.log('Setting transformed rounds:', transformedRounds.map(r => ({
          roundNumber: r.roundNumber,
          easels: r.easels.map(e => ({ easelNumber: e.easelNumber, hasArtist: !!e.artist }))
        })));
        setRounds(transformedRounds);
        
        // Process timer states from closing_time data
        const timerStates = {};
        roundsData.forEach(round => {
          if (round.closing_time) {
            const endTime = new Date(round.closing_time).getTime();
            const now = Date.now();
            if (endTime > now) {
              timerStates[round.id] = {
                endTime: endTime,
                active: true
              };
            }
          }
        });
        setRoundTimers(timerStates);
      }

      // Fetch artists from event_artists table
      const { data: eventArtistsData, error: eventArtistsError } = await supabase
        .from('event_artists')
        .select(`
          id,
          artist_id,
          artist_number,
          artist_profiles!inner (
            id,
            name,
            city_text,
            instagram,
            entry_id
          )
        `)
        .eq('event_id', eventUuid)
        .eq('status', 'confirmed');

      if (eventArtistsError) {
        console.error('Error fetching event artists:', eventArtistsError);
        throw eventArtistsError;
      }
      
      console.log('Event artists data for', eventId, ':', eventArtistsData);

      // Build a map of which artists are assigned to easels (if rounds exist)
      const artistAssignmentMap = new Map();
      if (roundsData && roundsData.length > 0) {
        roundsData.forEach(round => {
          round.round_contestants.forEach(contestant => {
            if (contestant.artist_id && contestant.easel_number !== null && contestant.easel_number !== 0) {
              artistAssignmentMap.set(contestant.artist_id, true);
            }
          });
        });
      }

      // Transform event artists data
      const allEventArtists = eventArtistsData.map(ea => ({
        ...ea.artist_profiles,
        artist_number: ea.artist_number,
        isAssigned: artistAssignmentMap.has(ea.artist_id)
      }));

      setEventArtists(allEventArtists);
    } catch (error) {
      console.error('Error fetching event data:', error);
    }
  };

  // Server-side artist search function
  const searchArtists = async (query) => {
    if (!query || query.length < 1) {
      setSearchResults([]);
      setShowCreateArtist(false);
      return;
    }

    try {
      // Call edge function for server-side search with phone deduplication
      const { data: { session } } = await supabase.auth.getSession();

      if (!session) {
        throw new Error('Not authenticated');
      }

      const response = await fetch(
        `https://xsqdkubgyqwpyvfltnrf.supabase.co/functions/v1/admin-artist-search-broadcast`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ query }),
        }
      );

      if (!response.ok) {
        throw new Error(`Search failed: ${response.statusText}`);
      }

      const { data } = await response.json();

      setSearchResults(data || []);
      setShowCreateArtist(query.length > 2); // Show create option after 3+ chars
    } catch (error) {
      console.error('Error searching artists:', error);
      setSearchResults([]);
    }
  };

  // Removed createDefaultRounds - rounds are now handled in frontend state only

  const addArtistToEvent = async (artistId) => {
    try {
      // Convert EID to UUID for admin database calls
      const { getEventUuidFromEid } = await import('../lib/adminHelpers');
      const eventUuid = await getEventUuidFromEid(eventId);

      if (!eventUuid) {
        throw new Error(`Could not find UUID for event ${eventId}`);
      }

      // Get the artist profile data including person_id
      const { data: artistData, error: fetchError } = await supabase
        .from('artist_profiles')
        .select('entry_id, phone, email, name, person_id')
        .eq('id', artistId)
        .single();

      if (fetchError) {
        throw fetchError;
      }

      // Auto-link artist to person if not already linked
      if (!artistData.person_id && artistData.phone) {
        console.log(`Auto-linking artist ${artistData.name} (${artistId}) via phone ${artistData.phone}`);

        // Find or create person record with this phone
        let { data: person, error: personFindError } = await supabase
          .from('people')
          .select('id')
          .eq('phone', artistData.phone)
          .maybeSingle();

        if (personFindError) {
          console.error('Error finding person:', personFindError);
          // Continue without linking - artist can still be added to event
        } else if (!person) {
          // Create new person record
          console.log(`Creating new person record for phone ${artistData.phone}`);
          const { data: newPerson, error: personCreateError } = await supabase
            .from('people')
            .insert({
              phone: artistData.phone,
              email: artistData.email,
              name: artistData.name,
              type: 'artist'
            })
            .select('id')
            .single();

          if (personCreateError) {
            console.error('Error creating person:', personCreateError);
            // Continue without linking
          } else {
            person = newPerson;
          }
        }

        // Link artist_profile to person
        if (person) {
          const { error: linkError } = await supabase
            .from('artist_profiles')
            .update({
              person_id: person.id,
              set_primary_profile_at: new Date().toISOString(),
              linked_how: 'artb-admin-event'
            })
            .eq('id', artistId);

          if (linkError) {
            console.error('Error linking artist to person:', linkError);
            // Continue - artist can still be added to event even if linking fails
          } else {
            console.log(`✅ Successfully linked artist ${artistData.name} to person ${person.id}`);
          }
        }
      } else if (!artistData.phone) {
        console.warn(`Artist ${artistData.name} has no phone number - cannot auto-link to person`);
      }

      // Add artist to event_artists table instead of round_contestants
      const { error } = await supabase
        .from('event_artists')
        .insert({
          event_id: eventUuid,
          artist_id: artistId,
          artist_number: artistData.entry_id?.toString(),
          status: 'confirmed'
        });

      if (error) {
        // Check if it's a duplicate error
        if (error.code === '23505') {
          alert('This artist is already added to the event');
        } else {
          throw error;
        }
        return;
      }

      // Refresh data and trigger broadcast cache refresh
      fetchEventData();
      onDataChange();
      setSearchQuery('');
      setSearchResults([]);
      setShowCreateArtist(false);
    } catch (error) {
      console.error('Error adding artist to event:', error);
      alert(`Failed to add artist to event: ${error.message || 'Unknown error'}`);
    }
  };

  // Auction Items List Component
  const AuctionItemsList = ({ eventId, currentTime, auctionEndTime }) => {
    // Group artworks by status
    const artworksByStatus = {
      active: [],
      sold: [],
      paid: [],
      cancelled: [],
      inactive: [],
      other: []
    };
    
    auctionArtworks.forEach(artwork => {
      // Check for paid status - prioritize art.status over buyer_pay_recent_status_id
      const status = artwork.status === 'paid' ? 'paid' : 
                    artwork.buyer_pay_recent_status_id ? 'paid' : 
                    artwork.status || 'other';
      if (artworksByStatus[status]) {
        artworksByStatus[status].push(artwork);
      } else {
        artworksByStatus.other.push(artwork);
      }
    });
    
    // Sort each group by highest bid
    Object.keys(artworksByStatus).forEach(status => {
      artworksByStatus[status].sort((a, b) => {
        const bidA = auctionBids[a.id]?.highestBid || a.current_bid || 0;
        const bidB = auctionBids[b.id]?.highestBid || b.current_bid || 0;
        return bidB - bidA;
      });
    });
    
    // Status order (active first, then sold, paid, etc)
    const statusOrder = ['active', 'sold', 'paid', 'cancelled', 'inactive', 'other'];
    
    return (
      <Flex direction="column" gap="4">
        {statusOrder.map(status => {
          const statusArtworks = artworksByStatus[status];
          if (statusArtworks.length === 0) return null;
          
          return (
            <Box key={status}>
              <Heading size="3" mb="3" color={
                status === 'active' ? 'green' :
                status === 'sold' ? 'orange' :
                status === 'paid' ? 'blue' :
                status === 'cancelled' ? 'gray' :
                'gray'
              }>
                {status.charAt(0).toUpperCase() + status.slice(1)} ({statusArtworks.length})
              </Heading>
              <Flex direction="column" gap="2">
                {statusArtworks.map(artwork => {
                  const bidInfo = auctionBids[artwork.id];
                  const currentBid = bidInfo?.highestBid || artwork.current_bid || artwork.starting_bid || 0;
                  const bidder = bidInfo?.highestBidder;
                  
                  // Calculate time until close or time since closed
                  const getTimeDisplay = () => {
                    if (artwork.status === 'sold' || artwork.status === 'cancelled') {
                      // Show when it closed
                      if (artwork.buyer_pay_recent_date) {
                        return new Date(artwork.buyer_pay_recent_date).toLocaleTimeString();
                      }
                      return '';
                    } else if (artwork.closing_time && status === 'active') {
                      // Show countdown based on actual closing time
                      const closingTime = new Date(artwork.closing_time).getTime();
                      const timeLeft = closingTime - currentTime;
                      if (timeLeft > 0) {
                        const hours = Math.floor(timeLeft / 3600000);
                        const minutes = Math.floor((timeLeft % 3600000) / 60000);
                        const seconds = Math.floor((timeLeft % 60000) / 1000);
                        
                        if (hours > 0) {
                          return `Closes in: ${hours}h ${minutes}m`;
                        } else if (minutes > 0) {
                          return `Closes in: ${minutes}:${seconds.toString().padStart(2, '0')}`;
                        } else {
                          return `Closes in: ${seconds}s`;
                        }
                      } else {
                        return 'Closing...';
                      }
                    }
                    return null;
                  };
                  
                  const timeDisplay = getTimeDisplay();
                  
                  return (
                    <Card
                      key={artwork.id}
                      size="2"
                      style={{ cursor: 'pointer' }}
                      onClick={() => setSelectedAuctionItem(artwork)}
                      data-admin-bid={artwork.id}
                    >
                      <Flex direction="column" gap="2">
                        {/* Top row: Thumbnail + Artist Name + Bid Amount */}
                        <Flex justify="between" align="center" gap="3">
                          <Flex align="center" gap="3" style={{ minWidth: 0, flex: 1 }}>
                            {/* Artwork Thumbnail */}
                            {artwork.media && artwork.media.length > 0 && (() => {
                              const imageUrls = getArtworkImageUrls(artwork, artwork.media[0]?.media_files);
                              const thumbnailUrl = imageUrls.compressed || imageUrls.original;

                              return thumbnailUrl ? (
                                <Box style={{
                                  width: '50px',
                                  height: '50px',
                                  overflow: 'hidden',
                                  borderRadius: '6px',
                                  flexShrink: 0,
                                  background: 'var(--gray-3)'
                                }}>
                                  <img
                                    src={thumbnailUrl}
                                    alt={`Artwork by ${artwork.artist_profiles?.name || 'Unknown Artist'}`}
                                    style={{
                                      width: '100%',
                                      height: '100%',
                                      objectFit: 'cover',
                                      display: 'block'
                                    }}
                                    onError={(e) => {
                                      e.target.style.display = 'none';
                                    }}
                                  />
                                </Box>
                              ) : null;
                            })()}

                            {/* Artist name and artwork info */}
                            <Box style={{ minWidth: 0, flex: 1 }}>
                              <Text size="3" weight="medium" style={{ display: 'block' }}>
                                {artwork.artist_profiles?.name || 'Unknown Artist'}
                              </Text>
                              <Text size="2" color="gray" style={{ display: 'block', marginTop: '2px' }}>
                                {artwork.events?.eid || 'EID'}-{artwork.round}-{artwork.easel}
                              </Text>
                            </Box>
                          </Flex>
                          {/* Right side: Bid amount and payment status */}
                          <Box style={{ textAlign: 'right', flexShrink: 0 }}>
                            <Text size="4" weight="bold" style={{ display: 'block' }}>
                              ${Math.round(currentBid)}
                            </Text>
                            {bidInfo && (
                              <Text size="1" color="gray" style={{ display: 'block', marginTop: '2px' }}>
                                {bidInfo.bidCount} bid{bidInfo.bidCount !== 1 ? 's' : ''}
                              </Text>
                            )}
                            {/* Payment status badges */}
                            {status === 'paid' && (
                              <Badge
                                color={(() => {
                                  // Stripe payments get green
                                  if (artwork.payment_statuses?.code === 'stripe_paid' ||
                                      (artwork.status === 'paid' && !artwork.buyer_pay_recent_status_id)) {
                                    return 'green';
                                  }
                                  // Admin payments get blue
                                  else {
                                    return 'blue';
                                  }
                                })()}
                                size="1"
                                style={{ marginTop: '4px' }}
                              >
                                {(() => {
                                  // Check if this is a Stripe payment first
                                  if (artwork.payment_statuses?.code === 'stripe_paid') {
                                    return '✓ STRIPE';
                                  }
                                  // For Stripe payments where status='paid' but no payment_statuses data
                                  else if (artwork.status === 'paid' && !artwork.buyer_pay_recent_status_id) {
                                    return '✓ STRIPE';
                                  }
                                  // Then check for admin payments with payment logs
                                  else if (artwork.payment_statuses?.code === 'admin_paid') {
                                    const adminPayment = artwork.payment_logs?.find(log => log.payment_type === 'admin_marked');
                                    if (adminPayment) {
                                      const paymentMethod = adminPayment.payment_method?.toUpperCase() || 'CASH';
                                      return `✓ ${paymentMethod}`;
                                    } else {
                                      return '✓ ADMIN';
                                    }
                                  }
                                  else {
                                    return '✓ PAID';
                                  }
                                })()}
                              </Badge>
                            )}
                            {status === 'sold' && !artwork.buyer_pay_recent_status_id && (
                              <Badge color="orange" size="1" style={{ marginTop: '4px' }}>
                                UNPAID
                              </Badge>
                            )}
                            {timeDisplay && (
                              <Text size="1" color={status === 'active' ? 'red' : 'gray'} style={{ display: 'block', marginTop: '2px' }}>
                                {timeDisplay}
                              </Text>
                            )}
                          </Box>
                        </Flex>

                        {/* Bottom row: Bidder information */}
                        {bidder && (
                          <Box style={{ borderTop: '1px solid var(--gray-6)', paddingTop: '8px' }}>
                            <Text size="2" weight="medium" style={{ display: 'block' }}>
                              Bidder: {bidder.first_name ?
                                `${bidder.first_name} ${bidder.last_name ? bidder.last_name.charAt(0) : ''}` :
                                'Anonymous'}
                            </Text>
                            <Flex gap="4" style={{ marginTop: '4px' }}>
                              {bidder.email && (
                                <Text size="1" color="gray">
                                  📧 {bidder.email}
                                </Text>
                              )}
                              {bidder.phone && (
                                <Text size="1" color="gray">
                                  📱 {bidder.phone}
                                </Text>
                              )}
                            </Flex>
                          </Box>
                        )}
                      </Flex>
                    </Card>
                  );
                })}
              </Flex>
            </Box>
          );
        }).filter(Boolean)}
      </Flex>
    );
  };

  const fetchAuctionData = async () => {
    try {
      console.log('fetchAuctionData called - adminLevel:', adminLevel, 'user phone:', user?.phone);

      // Convert EID to UUID for admin RPC calls
      const { getEventUuidFromEid } = await import('../lib/adminHelpers');
      const eventUuid = await getEventUuidFromEid(eventId);

      if (!eventUuid) {
        throw new Error(`Could not find UUID for event ${eventId}`);
      }

      // Note: get_admin_auction_details function doesn't exist, using regular method

      // Regular method for non-producer admins or fallback
      console.log('Using regular auction data fetch');
      
      // Fetch all artworks for this event with artist info
      const { data: artworksData, error: artworksError } = await supabase
        .from('art')
        .select(`
          id,
          art_code,
          round,
          easel,
          status,
          starting_bid,
          current_bid,
          bid_count,
          winner_id,
          closing_time,
          auction_extended,
          extension_count,
          buyer_pay_recent_status_id,
          buyer_pay_recent_date,
          buyer_pay_recent_person_id,
          artist_id,
          artist_profiles (
            id,
            name,
            entry_id
          ),
          winner_people:people!winner_id (
            id,
            first_name,
            last_name,
            nickname,
            email,
            phone_number,
            auth_phone,
            phone,
            name
          ),
          buyer_pay_recent_people:people!buyer_pay_recent_person_id (
            id,
            first_name,
            last_name,
            nickname,
            email,
            phone_number,
            auth_phone,
            phone,
            name
          )
        `)
        .eq('event_id', eventUuid)  // Use UUID instead of EID
        .not('artist_id', 'is', null)  // Only show artworks with artists assigned
        .order('round')
        .order('easel');

      if (artworksError) throw artworksError;

      // Get art IDs and payment status IDs
      const artIds = artworksData?.map(a => a.id) || [];
      const paymentStatusIds = artworksData?.map(a => a.buyer_pay_recent_status_id).filter(Boolean) || [];

      // Use simple admin functions to bypass RLS for payment data
      const { data: paymentLogsData } = await supabase
        .rpc('get_payment_logs_admin', {
          p_event_id: eventUuid
        });

      const { data: paymentStatusesData } = await supabase
        .rpc('get_payment_statuses_admin', {
          p_event_id: eventUuid
        });

      console.log('Payment data result:', { paymentLogsData, paymentStatusesData });

      // Create maps for payment data
      const paymentStatusMap = {};
      paymentStatusesData.forEach(status => {
        paymentStatusMap[status.id] = status;
      });

      const paymentLogsMap = {};
      if (paymentLogsData) {
        paymentLogsData.forEach(log => {
          if (!paymentLogsMap[log.art_id]) {
            paymentLogsMap[log.art_id] = [];
          }
          paymentLogsMap[log.art_id].push(log);
        });
      }

      // Fetch media for all artworks
      const { data: mediaData } = await supabase
        .from('art_media')
        .select(`
          art_id,
          media_id,
          media_type,
          display_order,
          media_files!art_media_media_id_fkey (
            id,
            original_url,
            thumbnail_url,
            compressed_url,
            file_type,
            cloudflare_id,
            created_at
          )
        `)
        .in('art_id', artIds)
        .eq('media_files.file_type', 'image')
        .order('created_at', { ascending: false });

      // Create a map of art_id to media
      const mediaByArt = {};
      if (mediaData) {
        mediaData.forEach(media => {
          if (!mediaByArt[media.art_id]) {
            mediaByArt[media.art_id] = [];
          }
          mediaByArt[media.art_id].push(media);
        });
      }

      // Fetch comprehensive bid history with full buyer info using admin function
      const { data: adminBidsData } = await supabase
        .rpc('get_admin_bid_history', {
          p_event_id: eventUuid
        });

      // Group bids by artwork and find highest bid
      const bidsByArt = {};
      if (adminBidsData) {
        adminBidsData.forEach(bid => {
          if (!bidsByArt[bid.art_id]) {
            bidsByArt[bid.art_id] = {
              highestBid: bid.amount,
              highestBidder: {
                first_name: bid.bidder_first_name,
                last_name: bid.bidder_last_name,
                nickname: bid.bidder_nickname,
                email: bid.bidder_email,
                phone_number: bid.bidder_phone,
                auth_phone: bid.bidder_auth_phone,
                name: bid.bidder_nickname || `${bid.bidder_first_name || ''} ${bid.bidder_last_name || ''}`.trim()
              },
              bidCount: 0,
              history: []
            };
          }
          // Update highest bid if this one is higher
          if (bid.amount > bidsByArt[bid.art_id].highestBid) {
            bidsByArt[bid.art_id].highestBid = bid.amount;
            bidsByArt[bid.art_id].highestBidder = {
              first_name: bid.bidder_first_name,
              last_name: bid.bidder_last_name,
              nickname: bid.bidder_nickname,
              email: bid.bidder_email,
              phone_number: bid.bidder_phone,
              auth_phone: bid.bidder_auth_phone,
              name: bid.bidder_nickname || `${bid.bidder_first_name || ''} ${bid.bidder_last_name || ''}`.trim()
            };
          }
          bidsByArt[bid.art_id].bidCount++;
          bidsByArt[bid.art_id].history.push({
            id: bid.bid_id, // Include the bid_id from the RPC response
            amount: bid.amount,
            created_at: bid.bid_time,
            bidder: {
              first_name: bid.bidder_first_name,
              last_name: bid.bidder_last_name,
              nickname: bid.bidder_nickname,
              email: bid.bidder_email,
              phone_number: bid.bidder_phone,
              auth_phone: bid.bidder_auth_phone,
              name: bid.bidder_nickname || `${bid.bidder_first_name || ''} ${bid.bidder_last_name || ''}`.trim()
            }
          });
        });
      }

      // Attach media and payment info to artworks
      const artworksWithAllData = (artworksData || []).map(artwork => ({
        ...artwork,
        media: mediaByArt[artwork.id] || [],
        payment_statuses: artwork.buyer_pay_recent_status_id ? paymentStatusMap[artwork.buyer_pay_recent_status_id] : null,
        payment_logs: paymentLogsMap[artwork.id] || []
      }));


      // Debug payment data - look for AB3019-2-5 specifically
      const targetArtwork = artworksWithAllData.find(a => a.art_code === 'AB3019-2-5');
      if (targetArtwork) {
        console.log('AB3019-2-5 artwork data:', {
          art_code: targetArtwork.art_code,
          status: targetArtwork.status,
          buyer_pay_recent_status_id: targetArtwork.buyer_pay_recent_status_id,
          payment_statuses: targetArtwork.payment_statuses,
          payment_logs: targetArtwork.payment_logs
        });
      }
      console.log('All payment statuses found:', paymentStatusesData);

      setAuctionArtworks(artworksWithAllData);
      setAuctionBids(bidsByArt);
    } catch (error) {
      console.error('Error fetching auction data:', error);
    }
  };

  const fetchAuctionTimerStatus = async () => {
    try {
      // Convert EID to UUID for admin RPC calls
      const { getEventUuidFromEid } = await import('../lib/adminHelpers');
      const eventUuid = await getEventUuidFromEid(eventId);

      if (!eventUuid) {
        throw new Error(`Could not find UUID for event ${eventId}`);
      }

      const { data, error } = await supabase
        .rpc('get_auction_timer_status', { p_event_id: eventUuid });
      
      if (error) throw error;
      
      setAuctionTimerStatus(data);
      // Update local auction end time based on earliest closing time
      if (data?.earliest_closing) {
        setAuctionEndTime(new Date(data.earliest_closing).getTime());
      } else {
        setAuctionEndTime(null);
      }
    } catch (error) {
      console.error('Error fetching auction timer status:', error);
    }
  };

  const handleCSVExport = async () => {
    try {
      // Convert EID to UUID for admin database calls
      const { getEventUuidFromEid } = await import('../lib/adminHelpers');
      const eventUuid = await getEventUuidFromEid(eventId);

      if (!eventUuid) {
        throw new Error(`Could not find UUID for event ${eventId}`);
      }

      // Get event EID from database using eventUuid
      const { data: eventData, error: eventError } = await supabase
        .from('events')
        .select('eid')
        .eq('id', eventUuid)
        .single()
      
      if (eventError || !eventData?.eid) {
        throw new Error('Failed to get event EID for CSV export')
      }

      // Get current session token for JWT authentication
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) {
        throw new Error('Authentication required for CSV export')
      }

      // Use direct fetch to the CSV export URL with EID in path and JWT auth
      const functionsUrl = 'https://xsqdkubgyqwpyvfltnrf.supabase.co/functions/v1'
      const response = await fetch(`${functionsUrl}/auction-csv-export/${eventData.eid}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json'
        }
      })

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`Export failed: ${errorText}`)
      }

      // Get CSV data
      const csvData = await response.text()
      
      // Create blob and download
      const blob = new Blob([csvData], { type: 'text/csv' })
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${eventData.eid}_auction_export_${new Date().toISOString().slice(0,19).replace(/[:.]/g, '-')}.csv`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      window.URL.revokeObjectURL(url)
      
      showAdminMessage('success', 'CSV exported successfully!')
    } catch (error) {
      console.error('CSV export error:', error)
      showAdminMessage('error', 'Failed to export CSV: ' + error.message)
    }
  }

  const handleTimerAction = async (action, duration = 12, roundNumber = null) => {
    setTimerActionLoading(true);
    try {
      console.log('Timer action:', action, 'Duration:', duration, 'Round:', roundNumber, 'Event ID:', eventId);

      if (!eventId) {
        throw new Error('Event ID is missing');
      }

      // Immediately update local state to avoid display lag
      if (roundNumber !== null) {
        if (action === 'start') {
          // Set expected closing time immediately to avoid "0:00" display
          const expectedClosingTime = new Date(Date.now() + duration * 60000).toISOString();
          setRoundTimerData(prev => ({
            ...prev,
            [roundNumber]: {
              ...prev[roundNumber],
              earliestClosing: expectedClosingTime,
              // Keep other fields if they exist
              ...(prev[roundNumber] || {})
            }
          }));
        } else if (action === 'cancel') {
          // Clear timer data immediately when canceling
          setRoundTimerData(prev => ({
            ...prev,
            [roundNumber]: {
              ...prev[roundNumber],
              earliestClosing: null,
              withTimers: 0
            }
          }));
        }
      }

      // Convert EID to UUID for admin RPC calls
      const { getEventUuidFromEid } = await import('../lib/adminHelpers');
      const eventUuid = await getEventUuidFromEid(eventId);

      if (!eventUuid) {
        throw new Error(`Could not find UUID for event ${eventId}`);
      }

      const { data, error } = await supabase
        .rpc('manage_auction_timer', {
          p_event_id: eventUuid,
          p_action: action,
          p_duration_minutes: duration,
          p_admin_phone: null, // Optional parameter
          p_round_number: roundNumber // NEW: Pass round number
        });

      console.log('Timer RPC response:', { data, error });
      if (error) {
        console.error('RPC Error details:', error);
        throw error;
      }

      if (data?.success) {
        showAdminMessage('success', data.message + (data.sms_sent ? ` (${data.sms_sent} SMS notifications sent)` : ''));
        await fetchAuctionTimerStatus();
        await fetchRoundTimerStatus(); // Fetch per-round timer status
        await fetchAuctionData();

        // Update round-specific timer state
        if (roundNumber !== null && data.closing_time) {
          setRoundTimerData(prev => ({
            ...prev,
            [roundNumber]: {
              closing_time: data.closing_time,
              artworks_count: data.artworks_updated
            }
          }));
        }
      } else {
        console.error('Function returned error:', data);
        showAdminMessage('error', data?.error || 'Failed to update timer');
      }
    } catch (error) {
      console.error('Error managing timer:', error);
      alert('Failed to update timer: ' + error.message);
    } finally {
      setTimerActionLoading(false);
    }
  };

  const fetchRoundTimerStatus = async () => {
    try {
      if (!eventId) return;

      // Convert EID to UUID for admin RPC calls
      const { getEventUuidFromEid } = await import('../lib/adminHelpers');
      const eventUuid = await getEventUuidFromEid(eventId);

      if (!eventUuid) return;

      const { data, error } = await supabase
        .rpc('get_auction_timer_status_by_round', { p_event_id: eventUuid });

      if (error) throw error;

      // Convert the data into a more usable format
      const timerData = {};
      if (data) {
        data.forEach(round => {
          timerData[round.round_number] = {
            total: round.artworks_total,
            withTimers: round.artworks_with_timers,
            active: round.artworks_active,
            earliestClosing: round.earliest_closing,
            latestClosing: round.latest_closing
          };
        });
      }
      setRoundTimerData(timerData);
    } catch (error) {
      console.error('Error fetching round timer status:', error);
    }
  };

  const fetchEventAdmins = async () => {
    try {
      // Convert EID to UUID for admin RPC calls
      const { getEventUuidFromEid } = await import('../lib/adminHelpers');
      const eventUuid = await getEventUuidFromEid(eventId);

      if (!eventUuid) {
        throw new Error(`Could not find UUID for event ${eventId}`);
      }

      // Use a manual JOIN since we can't enforce foreign key due to orphaned phone numbers
      const { data, error } = await supabase.rpc('get_event_admins_with_people', {
        p_event_id: eventUuid
      });
      
      if (error) throw error;
      setEventAdmins(data || []);
    } catch (error) {
      console.error('Error fetching event admins:', error);
      showAdminMessage('error', 'Failed to load current admins: ' + error.message);
    }
  };

  const searchPeopleByPhone = async (phoneSearch) => {
    try {
      // Format the search phone
      let searchPhone = phoneSearch.replace(/\D/g, '');
      if (!searchPhone.startsWith('1')) searchPhone = '1' + searchPhone;
      
      const { data, error } = await supabase
        .from('people')
        .select('id, first_name, last_name, name, nickname, phone')
        .ilike('phone', `%${searchPhone}%`)
        .limit(5);
      
      if (error) throw error;
      setPeopleSearchResults(data || []);
    } catch (error) {
      console.error('Error searching people:', error);
      setPeopleSearchResults([]);
    }
  };

  // Create offer to bidder function
  const handleCreateOffer = async () => {
    if (!showOfferConfirm || !selectedAuctionItem) return;

    setOfferLoading(true);
    try {
      let response;
      try {
        response = await fetch('https://db.artb.art/functions/v1/admin-offer-to-bidder', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`,
          'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhzcWRrdWJneXF3cHl2Zmx0bnJmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzQ1MDM5NjIsImV4cCI6MjA1MDA3OTk2Mn0.dBR_kWN0YCKkUrBKlMGJJkXO31g4CmMg4WZD6U-JMG0'
        },
        body: JSON.stringify({
          art_id: selectedAuctionItem.id,
          bid_id: showOfferConfirm.bid.id,
          admin_note: `Offer created via admin panel for ${showOfferConfirm.bidder.first_name || 'bidder'}`
        })
      });
      } catch (networkError) {
        if (networkError.name === 'TypeError' && networkError.message.includes('fetch')) {
          throw new Error('Network error - check connection');
        } else if (networkError.name === 'AbortError') {
          throw new Error('Request timed out');
        } else {
          throw new Error('Network error');
        }
      }

      let result;
      try {
        result = await response.json();
      } catch (parseError) {
        throw new Error('Invalid server response');
      }

      if (!response.ok || !result.success) {
        // Handle specific error cases
        if (response.status === 409 && result.error?.includes('already has an active offer')) {
          const existingOffer = result.existing_offer;
          const expiresAt = new Date(existingOffer.expires_at);
          const timeRemaining = Math.max(0, Math.ceil((expiresAt.getTime() - Date.now()) / (1000 * 60)));
          throw new Error(`Active offer exists (expires in ${timeRemaining}m)`);
        } else if (response.status === 400 && result.error?.includes('already the current winner')) {
          throw new Error('Bidder is already the current winner');
        } else if (response.status === 401) {
          throw new Error('Authentication failed - please refresh and try again');
        } else if (response.status === 403) {
          throw new Error('Access denied - insufficient permissions');
        } else if (response.status === 404) {
          throw new Error('Artwork or bid not found');
        } else {
          throw new Error(result.error || `Server error (${response.status})`);
        }
      }

      // Success
      showAdminMessage('success', `Offer created for ${result.offer.bidder_name} at $${result.offer.offered_amount}`);

      // Track the active offer for countdown display
      setActiveOffers(prev => ({
        ...prev,
        [selectedAuctionItem.id]: {
          expires_at: result.offer.expires_at,
          bidder_name: result.offer.bidder_name,
          bidder_id: result.offer.offered_to_person_id
        }
      }));

      // Update last offer created timestamp for other bidders
      setLastOfferCreated(prev => ({
        ...prev,
        [selectedAuctionItem.id]: new Date().toISOString()
      }));

      setShowOfferConfirm(null);

      // Optionally refresh auction data to show any updates
      fetchAuctionData();

    } catch (error) {
      console.error('Error creating offer:', error);
      showAdminMessage('error', 'Failed to create offer: ' + error.message);
    } finally {
      setOfferLoading(false);
    }
  };

  // Send payment reminder function
  const handleSendPaymentReminder = async (artId, bidder) => {
    setPaymentReminderLoading(true);
    try {
      let response;
      try {
        response = await fetch('https://db.artb.art/functions/v1/admin-send-payment-reminder', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`,
          'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhzcWRrdWJneXF3cHl2Zmx0bnJmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzQ1MDM5NjIsImV4cCI6MjA1MDA3OTk2Mn0.dBR_kWN0YCKkUrBKlMGJJkXO31g4CmMg4WZD6U-JMG0'
        },
        body: JSON.stringify({
          art_id: artId,
          admin_note: `Payment reminder sent via admin panel to ${bidder.first_name || bidder.name || 'bidder'}`
        })
      });
      } catch (networkError) {
        if (networkError.name === 'TypeError' && networkError.message.includes('fetch')) {
          throw new Error('Network error - check connection');
        } else if (networkError.name === 'AbortError') {
          throw new Error('Request timed out');
        } else {
          throw new Error('Network error');
        }
      }

      let result;
      try {
        result = await response.json();
      } catch (parseError) {
        throw new Error('Invalid server response');
      }

      if (!response.ok || !result.success) {
        // Handle specific error cases
        if (response.status === 400 && result.error?.includes('No winner found')) {
          throw new Error('No winning bidder found');
        } else if (response.status === 400 && result.error?.includes('already paid')) {
          throw new Error('Already paid - no reminder needed');
        } else if (response.status === 400 && result.error?.includes('No phone number')) {
          throw new Error('No phone number on file - cannot send SMS');
        } else if (response.status === 401) {
          throw new Error('Authentication failed - please refresh and try again');
        } else if (response.status === 403) {
          throw new Error('Access denied - insufficient permissions');
        } else if (response.status === 404) {
          throw new Error('Artwork not found');
        } else if (response.status === 500 && result.error?.includes('Failed to send SMS')) {
          throw new Error('SMS service error - please try again');
        } else {
          throw new Error(result.error || `Server error (${response.status})`);
        }
      }

      // Success
      const bidderName = bidder.first_name && bidder.last_name
        ? `${bidder.first_name} ${bidder.last_name}`
        : bidder.name || bidder.nickname || 'bidder';

      showAdminMessage('success', `Payment reminder sent to ${bidderName}`);
      // Update last reminder sent timestamp
      setLastReminderSent(prev => ({
        ...prev,
        [artId]: new Date().toISOString()
      }));

    } catch (error) {
      console.error('Error sending payment reminder:', error);
      showAdminMessage('error', 'Failed to send payment reminder: ' + error.message);
    } finally {
      setPaymentReminderLoading(false);
    }
  };

  // History functions
  const fetchReminderHistory = async (artId) => {
    setHistoryLoading(true);
    try {
      let response;
      try {
        response = await fetch('https://db.artb.art/functions/v1/admin-get-payment-reminder-history', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`,
            'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhzcWRrdWJneXF3cHl2Zmx0bnJmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzQ1MDM5NjIsImV4cCI6MjA1MDA3OTk2Mn0.dBR_kWN0YCKkUrBKlMGJJkXO31g4CmMg4WZD6U-JMG0'
          },
          body: JSON.stringify({ art_id: artId })
        });
      } catch (networkError) {
        if (networkError.name === 'TypeError' && networkError.message.includes('fetch')) {
          throw new Error('Network error - please check your internet connection and try again');
        } else {
          throw new Error('Network error: ' + networkError.message);
        }
      }

      let result;
      try {
        result = await response.json();
      } catch (parseError) {
        throw new Error('Server returned invalid response - please try again');
      }

      if (!response.ok || !result.success) {
        if (response.status === 401) {
          throw new Error('Authentication failed - please refresh and try again');
        } else if (response.status === 403) {
          throw new Error('Access denied - insufficient permissions');
        } else if (response.status === 404) {
          throw new Error('Artwork not found');
        } else {
          throw new Error(result.error || `Server error (${response.status})`);
        }
      }

      setReminderHistory(result);

      // Update last reminder sent timestamp
      if (result.last_reminder_sent) {
        setLastReminderSent(prev => ({
          ...prev,
          [artId]: result.last_reminder_sent
        }));
      }
    } catch (error) {
      console.error('Error fetching reminder history:', error);
      showAdminMessage('error', 'Failed to load reminder history: ' + error.message);
    } finally {
      setHistoryLoading(false);
    }
  };

  const fetchOfferHistory = async (artId) => {
    setHistoryLoading(true);
    try {
      let response;
      try {
        response = await fetch('https://db.artb.art/functions/v1/admin-get-offer-history', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`,
            'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhzcWRrdWJneXF3cHl2Zmx0bnJmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzQ1MDM5NjIsImV4cCI6MjA1MDA3OTk2Mn0.dBR_kWN0YCKkUrBKlMGJJkXO31g4CmMg4WZD6U-JMG0'
          },
          body: JSON.stringify({ art_id: artId })
        });
      } catch (networkError) {
        if (networkError.name === 'TypeError' && networkError.message.includes('fetch')) {
          throw new Error('Network error - please check your internet connection and try again');
        } else {
          throw new Error('Network error: ' + networkError.message);
        }
      }

      let result;
      try {
        result = await response.json();
      } catch (parseError) {
        throw new Error('Server returned invalid response - please try again');
      }

      if (!response.ok || !result.success) {
        if (response.status === 401) {
          throw new Error('Authentication failed - please refresh the page and try again');
        } else if (response.status === 403) {
          throw new Error('Access denied - you do not have permission to view this history');
        } else if (response.status === 404) {
          throw new Error('Artwork not found');
        } else {
          throw new Error(result.error || `Server error (${response.status}): Failed to fetch offer history`);
        }
      }

      setOfferHistory(result);

      // Update last offer created timestamp
      if (result.last_offer_created) {
        setLastOfferCreated(prev => ({
          ...prev,
          [artId]: result.last_offer_created
        }));
      }
    } catch (error) {
      console.error('Error fetching offer history:', error);
      showAdminMessage('error', 'Failed to load offer history: ' + error.message);
    } finally {
      setHistoryLoading(false);
    }
  };

  const openReminderHistory = async (artId) => {
    setShowReminderHistory(artId);
    await fetchReminderHistory(artId);
  };

  const openOfferHistory = async (artId) => {
    setShowOfferHistory(artId);
    await fetchOfferHistory(artId);
  };

  const formatTimestamp = (timestamp) => {
    if (!timestamp) return '';
    return new Date(timestamp).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
  };

  // Helper functions for button status text
  function getTimeAgo(timestamp) {
    if (!timestamp) return '';
    const now = Date.now();
    const diff = now - new Date(timestamp).getTime();
    const minutes = Math.floor(diff / (1000 * 60));
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days}d ago`;
    if (hours > 0) return `${hours}h ago`;
    if (minutes > 0) return `${minutes}m ago`;
    return 'just now';
  }

  function getTimeRemaining(timestamp) {
    if (!timestamp) return '';
    const now = Date.now();
    const diff = new Date(timestamp).getTime() - now;

    if (diff <= 0) return 'expired';

    const minutes = Math.floor(diff / (1000 * 60));
    const seconds = Math.floor((diff % (1000 * 60)) / 1000);

    if (minutes > 0) {
      return `${minutes}:${seconds.toString().padStart(2, '0')}`;
    }
    return `${seconds}s`;
  }

  function getButtonText(type, artId, bidderId = null) {
    if (type === 'reminder') {
      const lastSent = lastReminderSent[artId];
      if (lastSent) {
        return `Sent ${getTimeAgo(lastSent)}`;
      }
      return 'Send Payment Reminder';
    }

    if (type === 'offer') {
      const activeOffer = activeOffers[artId];
      // Only show countdown if the offer is for this specific bidder
      if (activeOffer && activeOffer.bidder_id === bidderId && new Date(activeOffer.expires_at).getTime() > Date.now()) {
        const remaining = getTimeRemaining(activeOffer.expires_at);
        if (remaining === 'expired') {
          return 'Create Offer';
        }
        return `Expires ${remaining}`;
      }

      // For other bidders, show "Sent X ago" if an offer was recently created
      const lastSent = lastOfferCreated[artId];
      if (lastSent) {
        return `Offer sent ${getTimeAgo(lastSent)}`;
      }

      return 'Offer to This Bidder';
    }

    return '';
  }

  // Timer functions
  const startRoundTimer = async (roundId, roundNumber) => {
    try {
      // Calculate timer end time: now + 19:56 (19 minutes 56 seconds = 1196 seconds)
      const now = new Date();
      const timerEndTime = new Date(now.getTime() + (19 * 60 + 56) * 1000);
      
      // Use RPC function to bypass RLS policies
      const { error } = await supabase.rpc('set_round_timer', {
        p_round_id: roundId,
        p_closing_time: timerEndTime.toISOString()
      });
      
      if (error) throw error;
      
      // Update local state
      setRoundTimers(prev => ({
        ...prev,
        [roundId]: {
          endTime: timerEndTime.getTime(),
          active: true
        }
      }));
      
      // Refresh rounds data
      await fetchEventData();
    } catch (error) {
      console.error('Error starting timer:', error);
      alert('Failed to start timer: ' + error.message);
    }
  };

  const cancelRoundTimer = async (roundId) => {
    try {
      // Use RPC function to bypass RLS policies
      const { error } = await supabase.rpc('set_round_timer', {
        p_round_id: roundId,
        p_closing_time: null
      });
      
      if (error) throw error;
      
      // Update local state
      setRoundTimers(prev => {
        const newState = { ...prev };
        delete newState[roundId];
        return newState;
      });
      
      // Refresh rounds data
      await fetchEventData();
      setConfirmCancelTimer(null);
    } catch (error) {
      console.error('Error canceling timer:', error);
      alert('Failed to cancel timer: ' + error.message);
    }
  };

  return (
    <Box style={{ paddingBottom: '40px' }}>
      <Heading size="4" mb="4">Admin Controls</Heading>
      
      {/* Admin Mode Tabs */}
      <Tabs.Root value={adminMode} onValueChange={setAdminMode}>
        <Tabs.List size="1" mb="4">
          <Tabs.Trigger value="artists">Artists</Tabs.Trigger>
          <Tabs.Trigger value="rounds">Rounds</Tabs.Trigger>
          <Tabs.Trigger value="voting" style={{ color: 'var(--purple-11)' }}>Voting</Tabs.Trigger>
          <Tabs.Trigger value="auction">Auction</Tabs.Trigger>
          <Tabs.Trigger value="qr">QR Codes</Tabs.Trigger>
          <Tabs.Trigger value="pdf">PDF</Tabs.Trigger>
          {adminLevel === 'super' && (
            <Tabs.Trigger value="event">Event</Tabs.Trigger>
          )}
        </Tabs.List>
        
        {/* Artists Tab */}
        <Tabs.Content value="artists">
          <Flex direction="column" gap="4">
            {/* Artists List */}
            <Card size="2">
              <Heading size="3" mb="3">Event Artists</Heading>
              <Flex direction="column" gap="2">
                {eventArtists.length === 0 ? (
                  <Text size="2" color="gray">No artists added yet</Text>
                ) : (
                  eventArtists.map(artist => (
                    <Flex key={artist.id} justify="between" align="center" p="2" style={{ borderBottom: '1px solid var(--gray-5)' }}>
                      <Box>
                        <Text size="2" weight="medium">{artist.name}</Text>
                        <Flex gap="2" align="center">
                          <Text size="1" color="gray">{artist.city_text}</Text>
                          <Text size="1" color="gray">• ID: {artist.artist_number || 'N/A'}</Text>
                        </Flex>
                      </Box>
                      <Flex align="center" gap="2">
                        {artist.instagram && (
                          <Text size="1" color="gray">@{artist.instagram}</Text>
                        )}
                        {!artist.isAssigned && (
                          <>
                            <Badge size="1" color="orange">Unassigned</Badge>
                            <Button 
                              size="1" 
                              variant="ghost" 
                              color="red"
                              onClick={() => setDeleteConfirm({ 
                                artist: artist, 
                                type: 'removeFromEvent'
                                // No contestantId or roundId needed for event removal
                              })}
                            >
                              <Cross2Icon />
                            </Button>
                          </>
                        )}
                      </Flex>
                    </Flex>
                  ))
                )}
              </Flex>
            </Card>
            
            {/* Search Artists */}
            <Card size="2">
              <Heading size="3" mb="3">Add Artist to Event</Heading>
              <Flex gap="2" mb="3">
                <input
                  type="text"
                  placeholder="Search artist profiles..."
                  value={searchQuery}
                  onChange={(e) => {
                    const query = e.target.value;
                    setSearchQuery(query);
                    
                    // Clear previous timeout
                    if (searchTimeout) {
                      clearTimeout(searchTimeout);
                    }
                    
                    // Debounce search with 300ms delay
                    const newTimeout = setTimeout(() => {
                      searchArtists(query);
                    }, 300);
                    
                    setSearchTimeout(newTimeout);
                  }}
                  onBlur={() => {
                    // Hide create artist option and search results after a small delay
                    // This allows clicks on the create artist button to register first
                    setTimeout(() => {
                      if (!searchQuery.trim()) {
                        setShowCreateArtist(false);
                        setSearchResults([]);
                      }
                    }, 150);
                  }}
                  onFocus={() => {
                    // Re-trigger search if there's existing query text
                    if (searchQuery.trim().length > 0) {
                      searchArtists(searchQuery);
                    }
                  }}
                  style={{
                    width: '100%',
                    padding: '8px',
                    borderRadius: '4px',
                    border: '1px solid var(--gray-6)',
                    background: 'var(--color-background)',
                    color: 'var(--color-text)'
                  }}
                />
              </Flex>
              
              {/* Search Results */}
              {(searchResults.length > 0 || showCreateArtist) && (
                <Box>
                  <Text size="2" weight="medium" mb="2">Search Results:</Text>
                  <Flex direction="column" gap="2">
                    {searchResults.map(artist => {
                      const isInEvent = eventArtists.some(ea => ea.id === artist.id);
                      return (
                        <Flex key={artist.id} justify="between" align="center" p="2" style={{
                          background: 'var(--gray-2)',
                          borderRadius: '4px',
                          border: '1px solid var(--gray-4)'
                        }}>
                          <Box>
                            <Text size="2" weight="medium">
                              {artist.name}
                              {artist.person_id && <Text size="1" color="green" weight="medium" style={{marginLeft: '6px'}}>(LATEST)</Text>}
                            </Text>
                            <Flex gap="2" align="center">
                              <Text size="1" color="gray">{artist.city_text}</Text>
                              {artist.entry_id && <Text size="1" color="gray">• ID: {artist.entry_id}</Text>}
                            </Flex>
                            <Text size="1" color="gray">
                              {artist.lastLogin
                                ? `Last login: ${artist.daysAgo === 0 ? 'today' : artist.daysAgo === 1 ? 'yesterday' : `${artist.daysAgo} days ago`}`
                                : 'Never logged in'}
                            </Text>
                          </Box>
                          {isInEvent ? (
                            <Badge size="1" color="green">Already Added</Badge>
                          ) : (
                            <Button
                              size="1"
                              variant="soft"
                              onClick={() => addArtistToEvent(artist.id)}
                            >
                              Add to Event
                            </Button>
                          )}
                        </Flex>
                      );
                    })}
                    
                    {/* Create New Artist Option */}
                    {showCreateArtist && (
                      <Flex justify="between" align="center" p="2" style={{ 
                        background: 'var(--blue-2)', 
                        borderRadius: '4px',
                        border: '2px dashed var(--blue-6)',
                        cursor: 'pointer'
                      }}
                      onClick={() => {
                        setNewArtist({ ...newArtist, name: searchQuery });
                        setSelectedEasel(null); // Close any open dialog
                        // Open create artist dialog
                        setTimeout(() => {
                          document.getElementById('create-artist-dialog-trigger')?.click();
                        }, 100);
                      }}>
                        <Box>
                          <Text size="2" weight="medium" color="blue">Create New Artist: "{searchQuery}"</Text>
                          <Text size="1" color="gray">Click to add new artist profile</Text>
                        </Box>
                        <PlusIcon width="20" height="20" color="var(--blue-9)" />
                      </Flex>
                    )}
                  </Flex>
                </Box>
              )}
            </Card>
            
          </Flex>
        </Tabs.Content>
        
        {/* Rounds Tab */}
        <Tabs.Content value="rounds">
          <Flex direction="column" gap="4">
            {rounds.length === 0 ? (
              // Show message if no rounds exist
              <Card size="2">
                <Text size="2" color="gray">No rounds found. Creating default rounds...</Text>
              </Card>
            ) : (
              // Show actual rounds
              rounds.map(round => (
                <Card key={round.id} size="2">
                  <Flex justify="between" align="center" mb="3">
                    <Heading size="3">Round {round.roundNumber}</Heading>
                    <Flex align="center" gap="2">
                      {/* Timer Display */}
                      {roundTimers[round.id]?.active && (
                        <Text size="2" weight="bold" color="orange">
                          {(() => {
                            const timeLeft = Math.max(0, roundTimers[round.id].endTime - localTime);
                            const minutes = Math.floor(timeLeft / 60000);
                            const seconds = Math.floor((timeLeft % 60000) / 1000);
                            return `${minutes}:${seconds.toString().padStart(2, '0')}`;
                          })()}
                        </Text>
                      )}
                      {/* Timer Button */}
                      {!roundTimers[round.id]?.active ? (
                        <Button
                          size="1"
                          onClick={() => startRoundTimer(round.id, round.roundNumber)}
                        >
                          Start 20:00 Timer
                        </Button>
                      ) : (
                        <Button
                          size="1"
                          color="red"
                          variant="soft"
                          onClick={() => setConfirmCancelTimer({ roundId: round.id, roundNumber: round.roundNumber })}
                        >
                          Cancel Timer
                        </Button>
                      )}
                    </Flex>
                  </Flex>
                  <Grid columns="4" gap="3">
                    {round.easels.map(easel => (
                      <Box
                        key={easel.easelNumber}
                        onClick={() => setSelectedEasel({ 
                          round: round.roundNumber, 
                          easel: easel.easelNumber, 
                          artist: easel.artist,
                          roundId: round.id 
                        })}
                        style={{
                          aspectRatio: '1',
                          border: easel.artist ? (
                            easel.artist.isWinner > 0 ? '3px solid var(--amber-9)' :
                            '2px solid var(--gray-6)'
                          ) : '2px dashed var(--gray-6)',
                          borderRadius: '8px',
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          justifyContent: 'center',
                          cursor: 'pointer',
                          background: easel.artist ? (
                            easel.artist.isWinner > 0 ? 'var(--amber-2)' :
                            'var(--gray-3)'
                          ) : 'var(--gray-2)',
                          padding: '8px',
                          gap: '4px',
                          position: 'relative',
                          overflow: 'hidden'
                        }}
                      >
                        {easel.artist ? (
                          <>
                            <Text 
                              size="2" 
                              weight="medium" 
                              align="center"
                              style={{
                                width: '100%',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap'
                              }}
                            >
                              {easel.artist.name}
                            </Text>
                            <Text size="1" color="gray">
                              Easel {easel.easelNumber}
                            </Text>
                          </>
                        ) : (
                          <>
                            <PlusIcon width="20" height="20" />
                            <Text size="1" color="gray">
                              Easel {easel.easelNumber}
                            </Text>
                          </>
                        )}
                      </Box>
                    ))}
                    {/* Add Easel Box */}
                    <Box
                      onClick={() => {
                        // Find the next easel number
                        const maxEasel = Math.max(...round.easels.map(e => e.easelNumber), 0);
                        const nextEasel = maxEasel + 1;
                        
                        // Open the dialog for the new easel
                        setSelectedEasel({ 
                          round: round.roundNumber, 
                          easel: nextEasel, 
                          artist: null,
                          roundId: round.id,
                          isNew: true
                        });
                      }}
                      style={{
                        aspectRatio: '1',
                        border: '2px dashed var(--blue-6)',
                        borderRadius: '8px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor: 'pointer',
                        background: 'var(--blue-2)',
                        transition: 'all 0.2s'
                      }}
                    >
                      <PlusIcon width="24" height="24" color="var(--blue-9)" />
                    </Box>
                  </Grid>
                </Card>
              ))
            )}
            
            {/* Add Round Button */}
            <Button size="2" variant="soft" onClick={() => {
              // Add round in frontend state only - find first missing round number
              const existingRoundNumbers = rounds.map(r => r.roundNumber).sort((a, b) => a - b);
              let nextRoundNumber = 1;
              
              // Find the first gap in round numbers
              for (let i = 0; i < existingRoundNumbers.length; i++) {
                if (existingRoundNumbers[i] === nextRoundNumber) {
                  nextRoundNumber++;
                } else {
                  break; // Found a gap
                }
              }
              
              const newRound = {
                id: `temp-round-${nextRoundNumber}`,
                roundNumber: nextRoundNumber,
                easels: []
              };
              
              setRounds([...rounds, newRound]);
            }}>
              <PlusIcon /> Add Round
            </Button>
          </Flex>
        </Tabs.Content>
        
        {/* Auction Controls */}
        <Tabs.Content value="auction">
          <Flex direction="column" gap="4">
            {/* Auction Overview */}
            <Card size="2">
              <Heading size="3" mb="3">Auction Overview</Heading>
              <Grid columns="4" gap="3">
                <Box>
                  <Text size="5" weight="bold" style={{ color: 'var(--blue-11)' }}>
                    {auctionArtworks.length}
                  </Text>
                  <Text size="1" color="gray">Total Artworks</Text>
                </Box>
                <Box>
                  <Text size="5" weight="bold" style={{ color: 'var(--green-11)' }}>
                    {auctionArtworks.filter(a => a.status === 'active').length}
                  </Text>
                  <Text size="1" color="gray">Active</Text>
                </Box>
                <Box>
                  <Text size="5" weight="bold" style={{ color: 'var(--purple-11)' }}>
                    {auctionArtworks.filter(a => a.closing_time).length}
                  </Text>
                  <Text size="1" color="gray">With Timers</Text>
                </Box>
                <Box>
                  <Text size="5" weight="bold" style={{ color: 'var(--orange-11)' }}>
                    {Object.keys(auctionBids).length}
                  </Text>
                  <Text size="1" color="gray">With Bids</Text>
                </Box>
              </Grid>
            </Card>

            {/* Round-Specific Auction Controls */}
            <Card size="2">
              <Heading size="3" mb="3">Round Auction Controls</Heading>
              <Text size="2" color="gray" style={{ display: 'block', marginBottom: '1rem' }}>
                Start auction timers per round - artworks close individually and may vary based on bidding action
              </Text>

              {/* Group artworks by round and display controls */}
              <Flex direction="column" gap="3">
                {(() => {
                  // Group artworks by round
                  const artworksByRound = auctionArtworks.reduce((acc, artwork) => {
                    const round = artwork.round || 0; // Use 0 for unassigned
                    if (!acc[round]) acc[round] = [];
                    acc[round].push(artwork);
                    return acc;
                  }, {});

                  // Sort rounds numerically
                  const sortedRounds = Object.keys(artworksByRound)
                    .map(Number)
                    .sort((a, b) => a - b);

                  return sortedRounds.map(round => {
                    const roundArtworks = artworksByRound[round];
                    const activeArtworks = roundArtworks.filter(a => a.status === 'active' && a.artist_id);
                    const timedArtworks = activeArtworks.filter(a => a.closing_time);
                    const untimedArtworks = activeArtworks.filter(a => !a.closing_time);

                    // Get timer data for this round
                    const timerData = roundTimerData[round] || {};

                    // Get earliest closing time - use roundTimerData if available, otherwise calculate from artworks
                    let earliestClosing = timerData.earliestClosing ? new Date(timerData.earliestClosing) : null;

                    // Fallback: If we have timed artworks but no round timer data yet, calculate from artworks
                    if (!earliestClosing && timedArtworks.length > 0) {
                      const closingTimes = timedArtworks
                        .map(a => a.closing_time ? new Date(a.closing_time) : null)
                        .filter(Boolean);
                      if (closingTimes.length > 0) {
                        earliestClosing = new Date(Math.min(...closingTimes.map(d => d.getTime())));
                      }
                    }

                    const timeRemaining = earliestClosing ? Math.max(0, earliestClosing - localTime) : 0;

                    if (round === 0 && roundArtworks.length === 0) return null; // Skip if no unassigned artworks

                    return (
                      <Card key={round} size="2" variant="surface">
                        <Flex justify="between" align="start" gap="3">
                          <Box style={{ flex: 1 }}>
                            <Text size="4" weight="bold" style={{ display: 'block' }}>
                              {round === 0 ? 'Unassigned' : `Round ${round}`}
                            </Text>
                            <Text size="2" color="gray" style={{ display: 'block', marginTop: '0.25rem' }}>
                              {activeArtworks.length} active artwork{activeArtworks.length !== 1 ? 's' : ''}
                              {timedArtworks.length > 0 && ` (${timedArtworks.length} with timer${timedArtworks.length !== 1 ? 's' : ''})`}
                            </Text>
                          </Box>

                          {timedArtworks.length > 0 ? (
                            <Box style={{ textAlign: 'right' }}>
                              <Text size="5" weight="bold" style={{
                                display: 'block',
                                color: timeRemaining < 60000 ? 'var(--red-11)' :
                                       timeRemaining < 120000 ? 'var(--orange-11)' :
                                       'var(--green-11)'
                              }}>
                                {(() => {
                                  const minutes = Math.floor(timeRemaining / 60000);
                                  const seconds = Math.floor((timeRemaining % 60000) / 1000);
                                  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
                                })()}
                              </Text>
                              <Flex gap="2" mt="2" justify="end">
                                <Button
                                  size="1"
                                  variant="soft"
                                  onClick={() => handleTimerAction('extend', 5, round)}
                                  disabled={timerActionLoading}
                                >
                                  +5 min
                                </Button>
                                <Button
                                  size="1"
                                  color="red"
                                  variant="soft"
                                  onClick={() => {
                                    if (confirm(`Cancel all timers for Round ${round}?`)) {
                                      handleTimerAction('cancel', 0, round);
                                    }
                                  }}
                                  disabled={timerActionLoading}
                                >
                                  Cancel
                                </Button>
                              </Flex>
                            </Box>
                          ) : (
                            round !== 0 && untimedArtworks.length > 0 && (
                              <Button
                                size="2"
                                variant="solid"
                                onClick={() => handleTimerAction('start', 12, round)}
                                disabled={timerActionLoading}
                              >
                                Start 12min Auction
                              </Button>
                            )
                          )}
                        </Flex>
                      </Card>
                    );
                  }).filter(Boolean);
                })()}
              </Flex>

              {/* Global Controls */}
              <Separator size="4" my="3" />
              <Flex gap="2" wrap="wrap">
                <Button
                  size="2"
                  variant="soft"
                  onClick={() => {
                    if (confirm('Start 12-minute auction for ALL rounds?')) {
                      handleTimerAction('start', 12);
                    }
                  }}
                  disabled={timerActionLoading}
                >
                  Start All Rounds (12min)
                </Button>
                <Button
                  size="2"
                  variant="soft"
                  color="orange"
                  onClick={() => {
                    if (confirm('Cancel ALL auction timers?')) {
                      handleTimerAction('cancel');
                    }
                  }}
                  disabled={timerActionLoading}
                >
                  Cancel All Timers
                </Button>
                <Button
                  size="2"
                  variant="soft"
                  color="red"
                  onClick={() => setConfirmCloseAuction(true)}
                  disabled={timerActionLoading}
                >
                  Force Close All Now
                </Button>
              </Flex>

              {timerActionLoading && (
                <Text size="2" color="gray" style={{ display: 'block', marginTop: '0.5rem' }}>
                  Processing...
                </Text>
              )}
            </Card>

            {/* CSV Export */}
            <Card size="2">
              <Heading size="3" mb="3">Export Data</Heading>
              {eventData?.eid ? (
                <input
                  type="text"
                  value={`https://xsqdkubgyqwpyvfltnrf.supabase.co/functions/v1/auction-csv-export/${eventData.eid}`}
                  readOnly
                  style={{
                    width: '100%',
                    fontFamily: 'monospace',
                    fontSize: '12px',
                    padding: '8px',
                    border: '1px solid var(--gray-6)',
                    borderRadius: '4px',
                    background: 'var(--gray-2)',
                    color: 'var(--gray-12)'
                  }}
                  onClick={(e) => e.target.select()}
                />
              ) : (
                <Text size="2" color="gray">Loading export URL...</Text>
              )}
            </Card>
            
            {/* Auction Artworks List */}
            <Card size="2">
              <Heading size="3" mb="3">Auction Items</Heading>
              <AuctionItemsList 
                eventId={eventId}
                currentTime={localTime}
                auctionEndTime={auctionEndTime}
              />
            </Card>
          </Flex>
        </Tabs.Content>

        {/* Voting Analytics Tab */}
        <Tabs.Content value="voting">
          <Box>
            <Flex justify="between" align="center" mb="4">
              <Heading size="4">Voting Analytics</Heading>
              {voteDataTimestamp && <VoteDataTimestamp timestampData={voteDataTimestamp} />}
            </Flex>
            <Flex direction="column" gap="4">
              {Object.entries(liveArtworksByRound.length || Object.keys(liveArtworksByRound).length > 0 ? liveArtworksByRound : artworksByRound).map(([round, artworks]) => {
                // Calculate max vote weight for this round for scaling
                const maxVoteWeight = Math.max(...artworks.map(a => a.totalVoteWeight || 0), 1);
                
                // Sort artworks by vote weight descending
                const sortedArtworks = [...artworks].sort((a, b) => 
                  (b.totalVoteWeight || 0) - (a.totalVoteWeight || 0)
                );
                
                return (
                  <Card key={round}>
                    <Heading size="3" mb="3">Round {round}</Heading>
                    <Flex direction="column" gap="3">
                      {sortedArtworks.map(artwork => {
                        const voteWeight = artwork.totalVoteWeight || 0;
                        const voteCount = artwork.vote_count || 0;
                        const barWidth = maxVoteWeight > 0 ? (voteWeight / maxVoteWeight) * 100 : 0;
                        
                        // Define range mappings with colors
                        const rangeMapping = [
                          { key: 'range_0_22', display: '0.22', color: '#FFD700', weight: 0.22 },     // Gold
                          { key: 'range_0_95', display: '0.95', color: '#FFA500', weight: 0.95 },     // Orange
                          { key: 'range_1_01', display: '1.01', color: '#00ffff', weight: 1.01 },     // Cyan
                          { key: 'range_1_90', display: '1.90', color: '#683359', weight: 1.90 },     // Dark Purple
                          { key: 'range_2_50', display: '2.50', color: '#6b5b95', weight: 2.50 },     // Med Purple
                          { key: 'range_5_01', display: '5.01', color: '#ff6b6b', weight: 5.01 },     // Coral Red
                          { key: 'range_10_00', display: '10.00', color: '#ff355e', weight: 10.00 },  // Radical Red
                          { key: 'range_above_10', display: '>10', color: '#ff0000', weight: 15.00 }  // Deep Red
                        ];
                        
                        // Calculate segments
                        const segments = [];
                        let totalWeightFromRanges = 0;
                        
                        if (artwork.voteRanges) {
                          // First pass: calculate total weight contribution
                          rangeMapping.forEach(range => {
                            const voteCount = artwork.voteRanges[range.key] || 0;
                            const weightContribution = voteCount * range.weight;
                            totalWeightFromRanges += weightContribution;
                          });
                          
                          // Second pass: calculate segment widths
                          rangeMapping.forEach((range, index) => {
                            const rangeVoteCount = artwork.voteRanges[range.key] || 0;
                            if (rangeVoteCount > 0) {
                              const weightContribution = rangeVoteCount * range.weight;
                              const segmentWidth = totalWeightFromRanges > 0 
                                ? (weightContribution / totalWeightFromRanges) * 100 
                                : 0;
                              
                              segments.push({
                                ...range,
                                voteCount: rangeVoteCount,
                                weightContribution,
                                segmentWidth,
                                index
                              });
                            }
                          });
                        }
                        
                        return (
                          <Box key={artwork.id} data-vote-display={artwork.art_code || artwork.id}>
                            <Flex justify="between" align="center" mb="2">
                              <Box>
                                <Text size="3" weight="medium" style={{ display: 'block' }}>
                                  {artwork.artist_profiles?.name || 'Unknown Artist'}
                                </Text>
                                <Text size="2" color="gray" style={{ display: 'block', marginTop: '4px' }}>
                                  Easel {artwork.easel}
                                </Text>
                              </Box>
                              <Box style={{ textAlign: 'right' }}>
                                <Text size="3" weight="bold">
                                  {voteWeight.toFixed(2)}
                                </Text>
                                <Text size="1" color="gray">
                                  {voteCount} vote{voteCount !== 1 ? 's' : ''}
                                </Text>
                              </Box>
                            </Flex>
                            
                            {/* Vote weight bar with segments */}
                            <Box 
                              style={{ 
                                width: '100%', 
                                height: '24px', 
                                backgroundColor: 'var(--gray-4)',
                                borderRadius: '12px',
                                overflow: 'hidden',
                                position: 'relative'
                              }}
                            >
                              {barWidth > 0 && segments.length > 0 ? (
                                <Box
                                  style={{
                                    width: `${barWidth}%`,
                                    height: '100%',
                                    display: 'flex',
                                    alignItems: 'center',
                                    position: 'relative'
                                  }}
                                >
                                  {segments.map((segment) => (
                                    <Box
                                      key={segment.key}
                                      style={{
                                        width: `${segment.segmentWidth}%`,
                                        height: '100%',
                                        backgroundColor: segment.color,
                                        position: 'relative',
                                        transition: 'all 0.3s ease'
                                      }}
                                      title={`Range ${segment.display}: ${segment.voteCount} votes (weight: ${segment.weightContribution.toFixed(2)})`}
                                    />
                                  ))}
                                  {barWidth > 25 && (
                                    <Text size="1" style={{ 
                                      position: 'absolute',
                                      right: '8px',
                                      color: 'white', 
                                      fontWeight: 'bold',
                                      textShadow: '0 1px 2px rgba(0,0,0,0.5)'
                                    }}>
                                      {voteWeight.toFixed(1)}
                                    </Text>
                                  )}
                                </Box>
                              ) : barWidth > 0 ? (
                                // Fallback to gradient if no range data
                                <Box
                                  style={{
                                    width: `${barWidth}%`,
                                    height: '100%',
                                    background: `linear-gradient(90deg, 
                                      var(--purple-9) 0%, 
                                      var(--purple-11) ${Math.min(barWidth, 50)}%, 
                                      var(--red-9) 100%)`,
                                    transition: 'width 0.3s ease',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'flex-end',
                                    paddingRight: '8px'
                                  }}
                                >
                                  {barWidth > 25 && (
                                    <Text size="1" style={{ 
                                      color: 'white', 
                                      fontWeight: 'bold',
                                      textShadow: '0 1px 2px rgba(0,0,0,0.3)'
                                    }}>
                                      {voteWeight.toFixed(1)}
                                    </Text>
                                  )}
                                </Box>
                              ) : null}
                              {barWidth === 0 && (
                                <Text size="1" style={{
                                  position: 'absolute',
                                  left: '50%',
                                  top: '50%',
                                  transform: 'translate(-50%, -50%)',
                                  color: 'var(--gray-9)'
                                }}>
                                  No votes yet
                                </Text>
                              )}
                            </Box>
                          </Box>
                        );
                      })}
                      
                      {/* Round total */}
                      <Box style={{ 
                        borderTop: '1px solid var(--gray-6)', 
                        paddingTop: '12px',
                        marginTop: '8px' 
                      }}>
                        <Flex justify="between" align="center">
                          <Text size="2" weight="bold" color="gray">Round Total</Text>
                          <Box style={{ textAlign: 'right' }}>
                            <Text size="3" weight="bold">
                              {sortedArtworks.reduce((sum, a) => sum + (a.totalVoteWeight || 0), 0).toFixed(2)}
                            </Text>
                            <Text size="1" color="gray">
                              {sortedArtworks.reduce((sum, a) => sum + (a.vote_count || 0), 0)} votes
                            </Text>
                          </Box>
                        </Flex>
                      </Box>
                    </Flex>
                  </Card>
                );
              })}
              
              {/* Event total */}
              <Card style={{ backgroundColor: 'var(--gray-2)' }}>
                <Flex justify="between" align="center">
                  <Text size="3" weight="bold">Event Total</Text>
                  <Box style={{ textAlign: 'right' }}>
                    <Text size="4" weight="bold">
                      {Object.values(Object.keys(liveArtworksByRound).length > 0 ? liveArtworksByRound : artworksByRound).flat().reduce((sum, a) => sum + (a.totalVoteWeight || 0), 0).toFixed(2)}
                    </Text>
                    <Text size="2" color="gray">
                      {Object.values(Object.keys(liveArtworksByRound).length > 0 ? liveArtworksByRound : artworksByRound).flat().reduce((sum, a) => sum + (a.vote_count || 0), 0)} total votes
                    </Text>
                  </Box>
                </Flex>
              </Card>
            </Flex>
          </Box>
        </Tabs.Content>

        {/* Event Tab - Super Admin Only */}
        {adminLevel === 'super' && (
          <Tabs.Content value="event">
            <Flex direction="column" gap="4">
              <EventEditor eventId={eventId} />
              
              {/* Admin Management Section */}
              <Card size="2">
                <Heading size="4" mb="4">Event Administrators</Heading>
                
                {/* Current Admins List */}
                <Card size="1" mb="4">
                  <Heading size="3" mb="3">Current Admins</Heading>
                  <Flex direction="column" gap="2">
                    {eventAdmins.length === 0 ? (
                      <Text size="2" color="gray">No additional admins configured</Text>
                    ) : (
                      eventAdmins.map(admin => (
                        <Flex key={admin.id} justify="between" align="center" p="2" style={{ borderBottom: '1px solid var(--gray-5)' }}>
                          <Box>
                            <Flex gap="2" align="center">
                              <Text size="2" weight="medium">
                                {admin.people?.first_name && admin.people?.last_name ? 
                                  `${admin.people.first_name} ${admin.people.last_name}` : 
                                  admin.people?.name || admin.people?.nickname || admin.phone}
                              </Text>
                              {!admin.people && (
                                <Badge color="orange" size="1">Not signed up</Badge>
                              )}
                            </Flex>
                            <Text size="1" color="gray">{admin.phone}</Text>
                            {!admin.people && (
                              <Text size="1" color="orange">This admin needs to sign up at artb.art</Text>
                            )}
                          </Box>
                          <Flex gap="2" align="center">
                            <Badge size="2" color={
                              admin.admin_level === 'super' ? 'red' : 
                              admin.admin_level === 'producer' ? 'blue' : 
                              admin.admin_level === 'photo' ? 'purple' : 
                              'green'
                            }>
                              {admin.admin_level.toUpperCase()}
                            </Badge>
                            <Button 
                              size="1" 
                              variant="ghost" 
                              color="red"
                              onClick={async () => {
                                if (confirm('Remove this admin?')) {
                                  try {
                                    const { error } = await supabase
                                      .from('event_admins')
                                      .delete()
                                      .eq('id', admin.id);
                                    
                                    if (error) throw error;
                                    fetchEventAdmins();
                                    showAdminMessage('success', 'Admin removed successfully');
                                  } catch (error) {
                                    console.error('Error removing admin:', error);
                                    showAdminMessage('error', 'Failed to remove admin');
                                  }
                                }
                              }}
                            >
                              <Cross2Icon />
                            </Button>
                          </Flex>
                        </Flex>
                      ))
                    )}
                  </Flex>
                </Card>
                
                {/* Add New Admin */}
                <Card size="1">
                  <Heading size="3" mb="3">Add Administrator</Heading>
                  
                  {/* Message Display */}
                  {adminMessage && (
                    <Callout.Root color={adminMessage.type === 'success' ? 'green' : 'red'} mb="3">
                      <Callout.Icon>
                        {adminMessage.type === 'success' ? <InfoCircledIcon /> : <ExclamationTriangleIcon />}
                      </Callout.Icon>
                      <Callout.Text>{adminMessage.text}</Callout.Text>
                    </Callout.Root>
                  )}
                  
                  <Flex direction="column" gap="3">
                    <Box>
                      <Text size="2" mb="1" weight="medium">Phone Number</Text>
                      <Flex gap="2">
                        <input
                          type="tel"
                          placeholder="+1 (555) 123-4567"
                          value={adminPhoneSearch}
                          onChange={(e) => {
                            const value = e.target.value;
                            setAdminPhoneSearch(value);
                            
                            // Search for people with this phone
                            if (value.length >= 10) {
                              searchPeopleByPhone(value);
                            } else {
                              setPeopleSearchResults([]);
                            }
                          }}
                          style={{
                            flex: 1,
                            padding: '8px',
                            borderRadius: '4px',
                            border: '1px solid var(--gray-6)',
                            background: 'var(--color-background)',
                            color: 'var(--color-text)'
                          }}
                        />
                        <Select.Root value={selectedAdminLevel} onValueChange={setSelectedAdminLevel}>
                          <Select.Trigger />
                          <Select.Content>
                            <Select.Item value="voting">Voting</Select.Item>
                            <Select.Item value="photo">Photo</Select.Item>
                            <Select.Item value="producer">Producer</Select.Item>
                            <Select.Item value="super">Super</Select.Item>
                          </Select.Content>
                        </Select.Root>
                        <Button 
                          size="2"
                          onClick={async () => {
                            if (!adminPhoneSearch) {
                              alert('Please enter a phone number');
                              return;
                            }
                            
                            // Format phone number
                            let phone = adminPhoneSearch.replace(/\D/g, '');
                            if (!phone.startsWith('1')) phone = '1' + phone;
                            if (phone.length !== 11) {
                              alert('Please enter a valid North American phone number');
                              return;
                            }
                            phone = '+' + phone;
                            
                            try {
                              // Convert EID to UUID for admin database calls
                              const { getEventUuidFromEid } = await import('../lib/adminHelpers');
                              const eventUuid = await getEventUuidFromEid(eventId);

                              if (!eventUuid) {
                                showAdminMessage('error', `Could not find UUID for event ${eventId}`);
                                return;
                              }

                              // Check if admin already exists
                              const { data: existing } = await supabase
                                .from('event_admins')
                                .select('id')
                                .eq('event_id', eventUuid)
                                .eq('phone', phone)
                                .single();
                              
                              if (existing) {
                                showAdminMessage('error', 'This phone number is already an admin for this event');
                                return;
                              }
                              
                              // Add new admin
                              const { error } = await supabase
                                .from('event_admins')
                                .insert({
                                  event_id: eventId,
                                  phone: phone,
                                  admin_level: selectedAdminLevel
                                });
                              
                              if (error) throw error;
                              
                              setAdminPhoneSearch('');
                              setPeopleSearchResults([]);
                              fetchEventAdmins();
                              showAdminMessage('success', 'Admin added successfully');
                            } catch (error) {
                              console.error('Error adding admin:', error);
                              showAdminMessage('error', 'Failed to add admin: ' + error.message);
                            }
                          }}
                        >
                          Add Admin
                        </Button>
                      </Flex>
                      
                      {/* Search Results */}
                      {peopleSearchResults.length > 0 && (
                        <Box mt="2" p="2" style={{ background: 'var(--gray-2)', borderRadius: '4px' }}>
                          <Text size="1" weight="medium" mb="2">Found in database:</Text>
                          {peopleSearchResults.map(person => (
                            <Flex 
                              key={person.id} 
                              p="1" 
                              align="center" 
                              justify="between"
                              style={{ cursor: 'pointer', borderRadius: '2px' }}
                              onClick={() => setAdminPhoneSearch(person.phone)}
                            >
                              <Text size="2">
                                {person.first_name && person.last_name ? 
                                  `${person.first_name} ${person.last_name}` : 
                                  person.name || person.nickname || 'Unknown'}
                              </Text>
                              <Text size="1" color="gray">{person.phone}</Text>
                            </Flex>
                          ))}
                        </Box>
                      )}
                    </Box>
                    
                    <Callout.Root size="1">
                      <Callout.Icon>
                        <InfoCircledIcon />
                      </Callout.Icon>
                      <Callout.Text>
                        <strong>Admin Levels:</strong><br/>
                        • <strong>Voting:</strong> Can view voting data and manage rounds<br/>
                        • <strong>Auction:</strong> Can manage auction settings and view bid data<br/>
                        • <strong>Super:</strong> Full access including event settings and admin management
                      </Callout.Text>
                    </Callout.Root>
                  </Flex>
                </Card>
              </Card>
            </Flex>
          </Tabs.Content>
        )}

        {/* PDF Tab */}
        <Tabs.Content value="pdf">
          <PDFPreviewPanel eid={eid} />
        </Tabs.Content>

        {/* QR Codes Tab */}
        <Tabs.Content value="qr">
          <QRAdminPanel eventId={eventId} />
        </Tabs.Content>
      </Tabs.Root>
      
      {/* Artist Selection Dialog */}
      <Dialog.Root open={!!selectedEasel} onOpenChange={() => setSelectedEasel(null)}>
        <Dialog.Content
          style={{
            position: 'fixed',
            top: '20px',
            left: '20px',
            maxWidth: '500px',
            width: 'calc(100vw - 40px)',
            maxHeight: 'calc(100vh - 40px)',
            overflow: 'auto',
            transform: 'none',
            margin: '0'
          }}
        >
          <Dialog.Title>
            {selectedEasel?.artist ? 'Edit Easel Assignment' : 'Select Artist'}
          </Dialog.Title>
          <Dialog.Description size="2">
            Round {selectedEasel?.round}, Easel {selectedEasel?.easel}
          </Dialog.Description>
          
          {selectedEasel?.artist ? (
            <Flex direction="column" gap="4" mt="4">
              <Card size="2">
                <Text size="3" weight="medium">{selectedEasel.artist.name}</Text>
                <Text size="2" color="gray">{selectedEasel.artist.city_text}</Text>
              </Card>
              
              <Flex gap="2">
                <Button 
                  size="2" 
                  variant={selectedEasel.artist.isWinner > 0 ? 'solid' : 'soft'}
                  color="gold"
                  onClick={async () => {
                    try {
                      console.log('Setting winner for:', selectedEasel.artist.name, 'Current isWinner:', selectedEasel.artist.isWinner);
                      const newStatus = selectedEasel.artist.isWinner > 0 ? 0 : 1;
                      console.log('New status will be:', newStatus);
                      
                      const { error } = await supabase
                        .from('round_contestants')
                        .update({ is_winner: newStatus })
                        .eq('id', selectedEasel.artist.contestantId);
                      
                      if (error) {
                        console.error('Error updating winner status:', error);
                        throw error;
                      }
                      console.log('Successfully updated winner status');
                      
                      // Update the selectedEasel state immediately for visual feedback
                      setSelectedEasel(prev => ({
                        ...prev,
                        artist: {
                          ...prev.artist,
                          isWinner: newStatus
                        }
                      }));
                      
                      // Update the rounds state immediately for easel grid visual feedback
                      setRounds(prev => prev.map(round => {
                        if (round.id === selectedEasel.roundId) {
                          return {
                            ...round,
                            easels: round.easels.map(easel => {
                              if (easel.easelNumber === selectedEasel.easel && easel.artist) {
                                return {
                                  ...easel,
                                  artist: {
                                    ...easel.artist,
                                    isWinner: newStatus
                                  }
                                };
                              }
                              return easel;
                            })
                          };
                        }
                        return round;
                      }));
                      
                      // Close modal after a brief delay to show the visual feedback
                      setTimeout(() => {
                        setSelectedEasel(null);
                      }, 500);
                      
                      // Refresh data in background
                      fetchEventData();
                      onDataChange();
                    } catch (error) {
                      console.error('Error setting winner:', error);
                      alert(`Failed to set winner: ${error.message}`);
                    }
                  }}
                >
                  🏆 {selectedEasel.artist.isWinner > 0 ? 'Remove Winner' : 'Set Winner'}
                </Button>
              </Flex>
              
              <Separator size="4" />
              
              <Flex direction="column" gap="2">
                <Button 
                  size="2" 
                  variant="soft" 
                  color="red"
                  onClick={async () => {
                    // Fetch data counts before showing confirmation
                    try {
                      // Convert EID to UUID for admin database calls
                      const { getEventUuidFromEid } = await import('../lib/adminHelpers');
                      const eventUuid = await getEventUuidFromEid(eventId);

                      if (!eventUuid) {
                        alert(`Could not find UUID for event ${eventId}`);
                        return;
                      }

                      const { data: artData } = await supabase
                        .from('art')
                        .select('id, vote_count, bid_count')
                        .eq('event_id', eventUuid)
                        .eq('round', selectedEasel.round)
                        .eq('easel', selectedEasel.easel)
                        .single();

                      let dataCounts = { imageCount: 0, voteCount: 0, bidCount: 0 };
                      
                      if (artData) {
                        // Get image count
                        const { count: imageCount } = await supabase
                          .from('art_media')
                          .select('*', { count: 'exact', head: true })
                          .eq('art_id', artData.id);
                        
                        dataCounts = {
                          imageCount: imageCount || 0,
                          voteCount: artData.vote_count || 0,
                          bidCount: artData.bid_count || 0
                        };
                      }

                      setDeleteConfirm({ 
                        ...selectedEasel, 
                        type: 'artist',
                        dataCounts 
                      });
                    } catch (error) {
                      console.error('Error fetching data counts:', error);
                      // Still show dialog even if count fetch fails
                      setDeleteConfirm({ 
                        ...selectedEasel, 
                        type: 'artist',
                        dataCounts: { imageCount: 0, voteCount: 0, bidCount: 0 }
                      });
                    }
                  }}
                >
                  <Cross2Icon /> Remove Artist from Easel
                </Button>
                
                {/* Only show Remove This Easel if it's the last easel */}
                {(() => {
                  const currentRound = rounds.find(r => r.id === selectedEasel.roundId);
                  const easelNumbers = currentRound?.easels?.map(e => e.easelNumber) || [];
                  const maxEasel = easelNumbers.length > 0 ? Math.max(...easelNumbers) : 0;
                  const isLastEasel = selectedEasel.easel === maxEasel;
                  
                  return isLastEasel ? (
                    <Button 
                      size="2" 
                      variant="soft" 
                      color="red"
                      onClick={() => setDeleteConfirm({ ...selectedEasel, type: 'easel' })}
                    >
                      <Cross2Icon /> Remove This Easel
                    </Button>
                  ) : (
                    <Text size="1" color="gray">
                      Only the last easel ({maxEasel}) can be removed
                    </Text>
                  );
                })()}
              </Flex>
            </Flex>
          ) : (
            <Flex direction="column" gap="4" mt="4">
              <Box>
                <Select.Root onValueChange={async (artistId) => {
                  try {
                    // If this is a new easel, add it to the rounds state first
                    if (selectedEasel?.isNew) {
                      setRounds(prevRounds => 
                        prevRounds.map(r => 
                          r.id === selectedEasel.roundId 
                            ? { ...r, easels: [...r.easels, { number: selectedEasel.easel, artist: null }] }
                            : r
                        )
                      );
                    }
                    
                    // Check if this is a temp round (frontend only)
                    if (selectedEasel.roundId.startsWith('temp-round-')) {
                      // Need to create the round in the database first
                      const roundNumber = parseInt(selectedEasel.roundId.split('-')[2]);

                      // Convert EID to UUID for admin database calls
                      const { getEventUuidFromEid } = await import('../lib/adminHelpers');
                      const eventUuid = await getEventUuidFromEid(eventId);

                      if (!eventUuid) {
                        throw new Error(`Could not find UUID for event ${eventId}`);
                      }

                      const { data: newRound, error: createError } = await supabase
                        .from('rounds')
                        .insert({
                          event_id: eventUuid,
                          round_number: roundNumber
                        })
                        .select('id')
                        .single();
                      
                      if (createError) {
                        throw new Error(`Cannot create round: ${createError.message}. Please ensure you are added as an admin for this event.`);
                      }
                      
                      // Update the round ID in state
                      const actualRoundId = newRound.id;
                      setRounds(prevRounds => 
                        prevRounds.map(r => 
                          r.id === selectedEasel.roundId 
                            ? { ...r, id: actualRoundId }
                            : r
                        )
                      );
                      
                      // Use the new round ID
                      selectedEasel.roundId = actualRoundId;
                    }
                    
                    // Find existing record for this artist (with easel 0 or null)
                    const { data: existingRecords } = await supabase
                      .from('round_contestants')
                      .select('id, easel_number')
                      .eq('round_id', selectedEasel.roundId)
                      .eq('artist_id', artistId);
                    
                    // Filter for records with no easel assignment
                    const existingRecord = existingRecords?.find(record => 
                      record.easel_number === null || record.easel_number === 0
                    );

                    if (existingRecord) {
                      // Update existing record with new easel number
                      const { error } = await supabase
                        .from('round_contestants')
                        .update({ easel_number: selectedEasel.easel })
                        .eq('id', existingRecord.id);
                      
                      if (error) throw error;
                    } else {
                      // Create new record
                      const { error } = await supabase
                        .from('round_contestants')
                        .insert({
                          round_id: selectedEasel.roundId,
                          artist_id: artistId,
                          easel_number: selectedEasel.easel
                        });
                      
                      if (error) throw error;
                    }

                    // Art record creation/update is now handled by database trigger
                    console.log('Artist assignment successful, attempting safe refresh...');

                    // Safe refresh with comprehensive error handling
                    try {
                      console.log('Starting fetchEventData...');
                      await fetchEventData();
                      onDataChange();
                      console.log('fetchEventData completed successfully');
                    } catch (refreshError) {
                      console.error('CRITICAL: fetchEventData failed:', refreshError);
                      console.error('Error name:', refreshError.name);
                      console.error('Error message:', refreshError.message);
                      console.error('Error stack:', refreshError.stack);
                      // Don't throw - just log and continue
                    }
                    
                    console.log('Closing dialog...');
                    setSelectedEasel(null);
                    console.log('Assignment complete!');
                  } catch (error) {
                    console.error('Error assigning artist:', error);
                    console.error('Error details:', error.message, error.stack);
                    alert('Failed to assign artist to easel');
                  }
                }}>
                  <Select.Trigger placeholder="Choose an artist..." />
                  <Select.Content
                    position="popper"
                    sideOffset={5}
                    style={{
                      maxHeight: '300px',
                      overflowY: 'auto'
                    }}
                  >
                    {eventArtists.filter(artist => {
                      // Show artists not assigned to THIS specific round
                      if (!selectedEasel) return false;
                      const isInThisRound = rounds
                        .find(r => r.id === selectedEasel.roundId)
                        ?.easels.some(e => e.artist?.id === artist.id);
                      return !isInThisRound;
                    }).map(artist => (
                      <Select.Item key={artist.id} value={artist.id}>
                        {artist.name} - {artist.city_text}
                      </Select.Item>
                    ))}
                  </Select.Content>
                </Select.Root>
              </Box>
              
              {selectedEasel && !selectedEasel.isNew && (() => {
                const currentRound = rounds.find(r => r.id === selectedEasel.roundId);
                const easelNumbers = currentRound?.easels?.map(e => e.easelNumber) || [];
                const maxEasel = easelNumbers.length > 0 ? Math.max(...easelNumbers) : 0;
                const isLastEasel = selectedEasel.easel === maxEasel;
                
                return isLastEasel ? (
                  <>
                    <Separator size="4" />
                    <Button 
                      size="2" 
                      variant="soft" 
                      color="red"
                      onClick={() => setDeleteConfirm({ ...selectedEasel, type: 'easel' })}
                    >
                      <Cross2Icon /> Remove This Easel
                    </Button>
                  </>
                ) : (
                  <>
                    <Separator size="4" />
                    <Text size="1" color="gray">
                      Only the last easel ({maxEasel}) can be removed
                    </Text>
                  </>
                );
              })()}
            </Flex>
          )}
          
          <Flex gap="3" mt="4" justify="end">
            <Dialog.Close>
              <Button variant="soft" color="gray">
                Cancel
              </Button>
            </Dialog.Close>
          </Flex>
        </Dialog.Content>
      </Dialog.Root>
      
      {/* Delete Confirmation */}
      <AlertDialog.Root open={!!deleteConfirm} onOpenChange={(open) => {
        if (!open) {
          setDeleteConfirm(null);
          setClearOptions({ clearImages: false, clearVotes: false, clearBids: false });
        }
      }}>
        <AlertDialog.Content style={{ maxWidth: '90vw', width: 450 }}>
          <AlertDialog.Title>
            {deleteConfirm?.type === 'easel' ? 'Remove Easel' : 
             deleteConfirm?.type === 'removeFromEvent' ? 'Remove Artist from Event' :
             'Remove Artist from Easel'}
          </AlertDialog.Title>
          <AlertDialog.Description size="2">
            {deleteConfirm?.type === 'easel' ? (
              <>
                Are you sure you want to remove Easel {deleteConfirm?.easel} from Round {deleteConfirm?.round}?
                {deleteConfirm?.artist && (
                  <> This will also remove <strong>{deleteConfirm.artist.name}</strong> from the easel.</>
                )}
              </>
            ) : deleteConfirm?.type === 'removeFromEvent' ? (
              <>
                Are you sure you want to remove <strong>{deleteConfirm?.artist?.name}</strong> from this event? 
                This artist is not assigned to any easel.
              </>
            ) : (
              <>
                <Text>
                  Are you sure you want to remove <strong>{deleteConfirm?.artist?.name}</strong> from Round {deleteConfirm?.round}, Easel {deleteConfirm?.easel}?
                </Text>
                
                {/* Only show clear options for artist removal */}
                {deleteConfirm?.type === 'artist' && (
                  <Flex direction="column" gap="2" mt="3">
                    <Flex justify="between" align="center">
                      <Text size="2" weight="medium">Clear existing data:</Text>
                      <Button 
                        size="1" 
                        variant="ghost" 
                        onClick={() => setShowRemovalInfo(true)}
                        style={{ textDecoration: 'underline' }}
                      >
                        More info
                      </Button>
                    </Flex>
                    <Flex direction="column" gap="2">
                      <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Checkbox 
                          checked={clearOptions.clearImages}
                          onCheckedChange={(checked) => 
                            setClearOptions(prev => ({ ...prev, clearImages: checked }))
                          }
                        />
                        <Text size="2">
                          Clear painting images {deleteConfirm.dataCounts?.imageCount > 0 && 
                            <span style={{ color: 'var(--gray-11)' }}>({deleteConfirm.dataCounts.imageCount})</span>
                          }
                        </Text>
                      </label>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Checkbox 
                          checked={clearOptions.clearVotes}
                          onCheckedChange={(checked) => 
                            setClearOptions(prev => ({ ...prev, clearVotes: checked }))
                          }
                        />
                        <Text size="2">
                          Clear votes {deleteConfirm.dataCounts?.voteCount > 0 && 
                            <span style={{ color: 'var(--gray-11)' }}>({deleteConfirm.dataCounts.voteCount})</span>
                          }
                        </Text>
                      </label>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Checkbox 
                          checked={clearOptions.clearBids}
                          onCheckedChange={(checked) => 
                            setClearOptions(prev => ({ ...prev, clearBids: checked }))
                          }
                        />
                        <Text size="2">
                          Clear bids {deleteConfirm.dataCounts?.bidCount > 0 && 
                            <span style={{ color: 'var(--gray-11)' }}>({deleteConfirm.dataCounts.bidCount})</span>
                          }
                        </Text>
                      </label>
                    </Flex>
                  </Flex>
                )}
              </>
            )}
          </AlertDialog.Description>
          <Flex gap="3" mt="4" justify="end">
            <AlertDialog.Cancel>
              <Button variant="soft" color="gray">
                Cancel
              </Button>
            </AlertDialog.Cancel>
            <AlertDialog.Action>
              <Button variant="solid" color="red" onClick={async () => {
                try {
                  console.log('Delete operation started:', deleteConfirm);
                  if (deleteConfirm?.type === 'removeFromEvent') {
                    console.log('Removing artist from event:', {
                      eventId,
                      artistId: deleteConfirm.artist.id,
                      artistName: deleteConfirm.artist.name
                    });

                    // Convert EID to UUID for admin database calls
                    const { getEventUuidFromEid } = await import('../lib/adminHelpers');
                    const eventUuid = await getEventUuidFromEid(eventId);

                    if (!eventUuid) {
                      throw new Error(`Could not find UUID for event ${eventId}`);
                    }

                    // Remove artist from event_artists table
                    const { error } = await supabase
                      .from('event_artists')
                      .delete()
                      .eq('event_id', eventUuid)
                      .eq('artist_id', deleteConfirm.artist.id);
                    
                    if (error) {
                      console.error('Error removing from event_artists:', error);
                      throw error;
                    }
                    console.log('Successfully removed from event_artists');
                    fetchEventData();
                    onDataChange();
                  } else if (deleteConfirm?.type === 'easel') {
                    console.log('Removing entire easel:', deleteConfirm);
                    
                    // First check what records exist before deletion
                    const { data: existingRecords, error: checkError } = await supabase
                      .from('round_contestants')
                      .select('id, easel_number, artist_id, art_id')
                      .eq('round_id', deleteConfirm.roundId)
                      .eq('easel_number', deleteConfirm.easel);
                    
                    console.log('Records found before deletion:', existingRecords);
                    
                    if (checkError) {
                      console.error('Error checking existing records:', checkError);
                      throw checkError;
                    }
                    
                    if (!existingRecords || existingRecords.length === 0) {
                      console.log('No records found to delete - easel may already be removed');
                      return;
                    }
                    
                    // Simply remove the easel slot by deleting the round_contestants record
                    // This preserves any art/votes/bids data and just removes the easel assignment
                    const { data: deletedRecords, error } = await supabase
                      .from('round_contestants')
                      .delete()
                      .eq('round_id', deleteConfirm.roundId)
                      .eq('easel_number', deleteConfirm.easel)
                      .select();
                    
                    console.log('Records deleted:', deletedRecords);
                    
                    if (error) {
                      console.error('Detailed error removing easel:', {
                        error: error,
                        message: error.message,
                        code: error.code,
                        details: error.details,
                        hint: error.hint,
                        deleteParams: {
                          round_id: deleteConfirm.roundId,
                          easel_number: deleteConfirm.easel
                        }
                      });
                      throw error;
                    }
                    console.log('Successfully removed easel from round_contestants');
                    console.log('Calling fetchEventData to refresh rounds...');
                    await fetchEventData();
                    onDataChange();
                    console.log('fetchEventData completed after easel removal');
                  } else if (deleteConfirm?.type === 'artist') {
                    // Convert EID to UUID for admin database calls
                    const { getEventUuidFromEid } = await import('../lib/adminHelpers');
                    const eventUuid = await getEventUuidFromEid(eventId);

                    if (!eventUuid) {
                      throw new Error(`Could not find UUID for event ${eventId}`);
                    }

                    // First, check if art record exists for this round/easel
                    const { data: artData, error: artCheckError } = await supabase
                      .from('art')
                      .select('id, art_code')
                      .eq('event_id', eventUuid)
                      .eq('round', deleteConfirm.round)
                      .eq('easel', deleteConfirm.easel)
                      .single();

                    if (artCheckError && artCheckError.code !== 'PGRST116') {
                      throw artCheckError;
                    }

                    if (artData) {
                      // Art record exists - handle clearing options
                      
                      // 1. Clear images if requested
                      if (clearOptions.clearImages) {
                        const { error: mediaError } = await supabase
                          .from('art_media')
                          .delete()
                          .eq('art_id', artData.id);
                        if (mediaError) throw mediaError;
                      }

                      // 2. Clear votes if requested
                      if (clearOptions.clearVotes) {
                        const { error: votesError } = await supabase
                          .from('votes')
                          .delete()
                          .eq('art_id', artData.id);
                        if (votesError) throw votesError;

                        // Update vote count to 0
                        const { error: voteCountError } = await supabase
                          .from('art')
                          .update({ vote_count: 0 })
                          .eq('id', artData.id);
                        if (voteCountError) throw voteCountError;
                      }

                      // 3. Clear bids if requested
                      if (clearOptions.clearBids) {
                        const { error: bidsError } = await supabase
                          .from('bids')
                          .delete()
                          .eq('art_id', artData.id);
                        if (bidsError) throw bidsError;

                        // Reset bid counts and amounts - first get the starting_bid value
                        const { data: artRecord, error: artFetchError } = await supabase
                          .from('art')
                          .select('starting_bid')
                          .eq('id', artData.id)
                          .single();
                        
                        if (artFetchError) throw artFetchError;
                        
                        const { error: bidCountError } = await supabase
                          .from('art')
                          .update({ 
                            bid_count: 0,
                            current_bid: artRecord.starting_bid
                          })
                          .eq('id', artData.id);
                        if (bidCountError) throw bidCountError;
                      }

                      // 4. Artist removal from art record is handled by database trigger
                      // when we delete from round_contestants below
                    }

                    // Remove from round_contestants
                    const { error } = await supabase
                      .from('round_contestants')
                      .delete()
                      .eq('id', deleteConfirm.artist.contestantId);
                    
                    if (error) throw error;
                    
                    // Clear the options for next time
                    setClearOptions({ clearImages: false, clearVotes: false, clearBids: false });
                    
                    fetchEventData();
                    onDataChange();
                  }
                  setDeleteConfirm(null);
                  setSelectedEasel(null);
                } catch (error) {
                  console.error('Delete operation failed:', error);
                  console.error('Delete confirm object:', deleteConfirm);
                  console.error('Event ID:', eventId);
                  alert(`Failed to remove artist from event: ${error.message || error.code || 'Unknown error'}`);
                }
              }}>
                Remove
              </Button>
            </AlertDialog.Action>
          </Flex>
        </AlertDialog.Content>
      </AlertDialog.Root>
      
      {/* Create Artist Dialog */}
      <Dialog.Root>
        <Dialog.Trigger asChild>
          <button id="create-artist-dialog-trigger" style={{ display: 'none' }} />
        </Dialog.Trigger>
        <Dialog.Content style={{ maxWidth: '90vw', width: 450 }}>
          <Dialog.Title>Create New Artist</Dialog.Title>
          <Dialog.Description size="2">
            Add a new artist profile to the system
          </Dialog.Description>
          
          <Flex direction="column" gap="3" mt="4">
            <Box>
              <Text size="2" mb="1" weight="medium">Name *</Text>
              <input
                type="text"
                value={newArtist.name}
                onChange={(e) => setNewArtist(prev => ({ ...prev, name: e.target.value }))}
                placeholder="Artist Name"
                style={{
                  width: '100%',
                  padding: '8px',
                  borderRadius: '4px',
                  border: '1px solid var(--gray-6)',
                  background: 'var(--color-background)',
                  color: 'var(--color-text)'
                }}
              />
            </Box>
            
            <Box>
              <Text size="2" mb="1" weight="medium">Phone *</Text>
              <input
                type="tel"
                value={newArtist.phone}
                onChange={(e) => {
                  // Simple international phone input - accept any format
                  setNewArtist(prev => ({ ...prev, phone: e.target.value }));
                }}
                placeholder="+1 (555) 123-4567"
                style={{
                  width: '100%',
                  padding: '8px',
                  borderRadius: '4px',
                  border: '1px solid var(--gray-6)',
                  background: 'var(--color-background)',
                  color: 'var(--color-text)'
                }}
              />
              <Text size="1" color="gray" mt="1">
                International phone number with country code
              </Text>
            </Box>
            
            <Box>
              <Text size="2" mb="1" weight="medium">Email</Text>
              <input
                type="email"
                value={newArtist.email}
                onChange={(e) => setNewArtist(prev => ({ ...prev, email: e.target.value }))}
                placeholder="artist@example.com"
                style={{
                  width: '100%',
                  padding: '8px',
                  borderRadius: '4px',
                  border: '1px solid var(--gray-6)',
                  background: 'var(--color-background)',
                  color: 'var(--color-text)'
                }}
              />
            </Box>
            
            <Box>
              <Text size="2" mb="1" weight="medium">City</Text>
              <input
                type="text"
                value={newArtist.city_text}
                onChange={(e) => setNewArtist(prev => ({ ...prev, city_text: e.target.value }))}
                placeholder="Toronto, ON"
                style={{
                  width: '100%',
                  padding: '8px',
                  borderRadius: '4px',
                  border: '1px solid var(--gray-6)',
                  background: 'var(--color-background)',
                  color: 'var(--color-text)'
                }}
              />
            </Box>
            
            <Box>
              <Text size="2" mb="1" weight="medium">Instagram</Text>
              <input
                type="text"
                value={newArtist.instagram}
                onChange={(e) => {
                  // Remove @ symbol if user includes it
                  const value = e.target.value.replace('@', '');
                  setNewArtist(prev => ({ ...prev, instagram: value }));
                }}
                placeholder="instagram_handle"
                style={{
                  width: '100%',
                  padding: '8px',
                  borderRadius: '4px',
                  border: '1px solid var(--gray-6)',
                  background: 'var(--color-background)',
                  color: 'var(--color-text)'
                }}
              />
            </Box>
          </Flex>
          
          <Flex gap="3" mt="4" justify="end">
            <Dialog.Close>
              <Button variant="soft" color="gray">
                Cancel
              </Button>
            </Dialog.Close>
            <Button 
              variant="solid"
              onClick={async () => {
                try {
                  // Validate required fields
                  if (!newArtist.name.trim()) {
                    alert('Please enter artist name');
                    return;
                  }
                  
                  // Extract clean phone number (digits only)
                  // Create artist profile using admin function
                  const { data: artistId, error } = await supabase
                    .rpc('admin_insert_artist_profile_temp', {
                      p_name: newArtist.name.trim(),
                      p_phone: newArtist.phone.trim(),
                      p_email: newArtist.email.trim() || null,
                      p_city: newArtist.city_text.trim() || null,
                      p_instagram: newArtist.instagram.trim() || null
                    });
                  
                  if (error) throw error;
                  
                  // Add to event immediately
                  await addArtistToEvent(artistId);
                  
                  // Reset form
                  setNewArtist({ name: '', phone: '', email: '', city_text: '', instagram: '' });
                  setSearchQuery('');
                  setSearchResults([]);
                  setShowCreateArtist(false);
                  
                  // Close dialog
                  document.getElementById('create-artist-dialog-trigger')?.click();
                  
                  // No need to refresh - search is server-side now
                } catch (error) {
                  console.error('Error creating artist:', error);
                  alert('Failed to create artist. They may already exist.');
                }
              }}
              disabled={!newArtist.name.trim() || !newArtist.phone.trim()}
            >
              Create Artist
            </Button>
          </Flex>
        </Dialog.Content>
      </Dialog.Root>

      {/* Auction Item Detail Dialog */}
      <Dialog.Root open={!!selectedAuctionItem} onOpenChange={() => setSelectedAuctionItem(null)}>
        <Dialog.Content style={{ maxWidth: '90vw', width: 650 }}>
          <Dialog.Title>
            <Flex justify="between" align="center">
              <Text>Artwork Details</Text>
              <Dialog.Close>
                <IconButton size="2" variant="ghost">
                  <Cross2Icon />
                </IconButton>
              </Dialog.Close>
            </Flex>
          </Dialog.Title>
          {selectedAuctionItem && (
            <Box>
              <Flex direction="column" gap="3">
                {/* Artwork Image - Larger Display */}
                {selectedAuctionItem.media && selectedAuctionItem.media.length > 0 && (() => {
                  const imageUrls = getArtworkImageUrls(selectedAuctionItem, selectedAuctionItem.media[0]?.media_files);
                  const imageUrl = imageUrls.original || imageUrls.compressed || '/placeholder.jpg';

                  return (
                    <Box style={{ width: '100%', maxHeight: '500px', overflow: 'hidden', borderRadius: '8px', marginBottom: '1rem' }}>
                      <img
                        src={imageUrl}
                        alt={`Artwork by ${selectedAuctionItem.artist_profiles?.name || 'Unknown Artist'}`}
                        style={{
                          width: '100%',
                          height: 'auto',
                          maxHeight: '500px',
                          objectFit: 'contain',
                          display: 'block',
                          borderRadius: '8px'
                        }}
                        onError={(e) => {
                          e.target.src = '/placeholder.jpg';
                        }}
                      />
                    </Box>
                  );
                })()}

                {/* Bidding Controls */}
                <Flex justify="center" gap="2">
                  {selectedAuctionItem.status === 'active' ? (
                    <Button 
                      size="2" 
                      variant="soft" 
                      color="red"
                      onClick={async () => {
                        try {
                          console.log('Closing bidding for:', selectedAuctionItem);
                          console.log('Art code:', selectedAuctionItem?.art_code);

                          if (!selectedAuctionItem?.art_code) {
                            throw new Error('Art code is missing');
                          }

                          // FIXED: Check for bids first to determine correct status
                          const { data: bidData, error: bidError } = await supabase
                            .from('bids')
                            .select('id')
                            .eq('art_id', selectedAuctionItem.id)
                            .limit(1);

                          if (bidError) throw bidError;

                          // Use bid-based status logic: 'sold' if bids exist, 'closed' if no bids
                          const newStatus = bidData && bidData.length > 0 ? 'sold' : 'closed';
                          console.log(`Setting status to '${newStatus}' based on bid count:`, bidData?.length || 0);

                          // Use the admin function to ensure notifications are sent
                          const { data, error } = await supabase
                            .rpc('admin_update_art_status', {
                              p_art_code: selectedAuctionItem.art_code,
                              p_new_status: newStatus
                            });
                          
                          console.log('RPC response:', { data, error });
                          
                          if (error) {
                            console.error('RPC error details:', error);
                            throw error;
                          }
                          
                          // Check if the function returned success: false
                          if (data && data.success === false) {
                            console.error('Function returned error:', data.error);
                            throw new Error(data.error || 'Failed to close bidding');
                          }
                          
                          if (data?.success) {
                            fetchAuctionData();
                            setSelectedAuctionItem(prev => ({ ...prev, status: newStatus }));

                            // Show appropriate message based on bid-based status
                            if (newStatus === 'sold' && data.has_winner) {
                              const smsStatus = data.notifications_sent > 0 ? '\nPayment notification sent via SMS' : '';
                              alert(`Bidding closed as SOLD!\nWinning bid: $${data.winning_bid}\nTotal (incl tax): $${data.calculated_total}${smsStatus}`);
                            } else if (newStatus === 'closed') {
                              alert('Bidding closed as CLOSED (no bids received)');
                            } else {
                              alert(`Bidding closed successfully (status: ${newStatus})`);
                            }
                          } else {
                            console.error('Unexpected response format:', data);
                            throw new Error('Unexpected response from server');
                          }
                        } catch (error) {
                          console.error('Error closing bidding:', error);
                          alert('Failed to close bidding: ' + error.message);
                        }
                      }}
                    >
                      Close Bidding
                    </Button>
                  ) : selectedAuctionItem.status === 'sold' ? (
                    <Button 
                      size="2" 
                      variant="soft" 
                      color="green"
                      onClick={async () => {
                        try {
                          const { data, error } = await supabase
                            .rpc('admin_update_art_status', {
                              p_art_code: selectedAuctionItem.art_code,
                              p_new_status: 'active'
                            });
                          
                          if (error) throw error;
                          
                          if (data?.success) {
                            fetchAuctionData();
                            setSelectedAuctionItem(prev => ({ ...prev, status: 'active' }));
                            alert('Bidding re-opened successfully');
                          } else {
                            throw new Error(data?.error || 'Failed to re-open bidding');
                          }
                        } catch (error) {
                          console.error('Error re-opening bidding:', error);
                          alert('Failed to re-open bidding: ' + error.message);
                        }
                      }}
                    >
                      Re-open Bidding
                    </Button>
                  ) : (
                    <Button 
                      size="2" 
                      variant="soft" 
                      color="green"
                      onClick={async () => {
                        try {
                          const { data, error } = await supabase
                            .rpc('admin_update_art_status', {
                              p_art_code: selectedAuctionItem.art_code,
                              p_new_status: 'active'
                            });
                          
                          if (error) throw error;
                          
                          if (data?.success) {
                            fetchAuctionData();
                            setSelectedAuctionItem(prev => ({ ...prev, status: 'active' }));
                            alert('Bidding opened successfully');
                          } else {
                            throw new Error(data?.error || 'Failed to open bidding');
                          }
                        } catch (error) {
                          console.error('Error opening bidding:', error);
                          alert('Failed to open bidding: ' + error.message);
                        }
                      }}
                    >
                      Open Bidding
                    </Button>
                  )}
                </Flex>

                {/* Artist and Artwork Info */}
                <Card size="2">
                  <Flex justify="between" align="start">
                    <Box>
                      <Text size="4" weight="bold">
                        {selectedAuctionItem.artist_profiles?.name || 'Unknown Artist'}
                      </Text>
                      <Text size="2" color="gray">
                        Round {selectedAuctionItem.round}, Easel {selectedAuctionItem.easel}
                      </Text>
                      <Text size="2" color="gray">
                        Artist ID: {selectedAuctionItem.artist_profiles?.entry_id || 'N/A'}
                      </Text>
                      <Text size="2" color="gray">
                        Art Code: {selectedAuctionItem.art_code}
                      </Text>
                    </Box>
                    <Badge size="2" color={
                      (selectedAuctionItem.status === 'paid' || selectedAuctionItem.buyer_pay_recent_status_id) ? 
                        // Stripe payments get green, admin payments get blue
                        (selectedAuctionItem.payment_statuses?.code === 'stripe_paid' || 
                         (selectedAuctionItem.status === 'paid' && !selectedAuctionItem.buyer_pay_recent_status_id)) ? 'green' : 'blue' :
                      selectedAuctionItem.status === 'sold' ? 'orange' :
                      selectedAuctionItem.status === 'active' ? 'green' :
                      'gray'
                    }>
                      {(selectedAuctionItem.status === 'paid' || selectedAuctionItem.buyer_pay_recent_status_id) ? 
                        (selectedAuctionItem.payment_statuses?.code === 'admin_paid' ? (() => {
                          const adminPayment = selectedAuctionItem.payment_logs?.find(log => log.payment_type === 'admin_marked');
                          const adminPhone = adminPayment?.admin_phone || 'ADMIN';
                          const amountText = adminPayment?.actual_amount_collected ? ` - $${adminPayment.actual_amount_collected}` : '';
                          return `MARKED PAID BY ${adminPhone}${amountText}`;
                         })() :
                         selectedAuctionItem.payment_statuses?.code === 'stripe_paid' ? 'PAID via STRIPE' : 
                         (selectedAuctionItem.status === 'paid' && !selectedAuctionItem.buyer_pay_recent_status_id) ? 'PAID via STRIPE' :
                         'PAID') : 
                       (selectedAuctionItem.status || 'UNKNOWN').toUpperCase()}
                    </Badge>
                  </Flex>
                </Card>

                {/* Bidding Info */}
                <Card size="2">
                  <Heading size="3" mb="3">Bidding Information</Heading>
                  <Flex direction="column" gap="2">
                    <Flex justify="between">
                      <Text size="2" color="gray">Starting Bid:</Text>
                      <Text size="2" weight="medium">
                        ${selectedAuctionItem.starting_bid || 0}
                      </Text>
                    </Flex>
                    <Flex justify="between">
                      <Text size="2" color="gray">Current Bid:</Text>
                      <Text size="3" weight="bold">
                        ${auctionBids[selectedAuctionItem.id]?.highestBid || selectedAuctionItem.current_bid || 0}
                      </Text>
                    </Flex>
                  </Flex>
                </Card>

                {/* Buyer/Bidder Info */}
                {(auctionBids[selectedAuctionItem.id]?.highestBidder ||
                  selectedAuctionItem.winner_people ||
                  selectedAuctionItem.buyer_pay_recent_people) && (
                  <Card size="2">
                    <Heading size="3" mb="3">
                      {auctionBids[selectedAuctionItem.id]?.highestBidder ? 'Highest Bidder' : 'Buyer Information'}
                    </Heading>
                    <Flex direction="column" gap="2">
                      <Text size="3" weight="medium" style={{ display: 'block' }}>
                        {(() => {
                          // Try bid data first, then fallback to winner/buyer data
                          const bidder = auctionBids[selectedAuctionItem.id]?.highestBidder;
                          const winner = selectedAuctionItem.winner_people;
                          const buyer = selectedAuctionItem.buyer_pay_recent_people;
                          const person = bidder || winner || buyer;

                          if (!person) return 'No bidder data';

                          if (adminLevel === 'producer' || adminLevel === 'super') {
                            // Producer+ users see full names
                            if (person.first_name && person.last_name) {
                              return `${person.first_name} ${person.last_name}`;
                            }
                            // Show what we have, with fallback for generic users
                            const name = person.name || person.nickname || person.email || person.phone_number || person.auth_phone || person.phone;
                            if (name && name !== 'User') {
                              return name;
                            }
                            // For generic 'User' entries, show that it's a registered bidder
                            const bidCount = auctionBids[selectedAuctionItem.id]?.bidCount || 0;
                            return `Registered Bidder (${bidCount} bid${bidCount !== 1 ? 's' : ''})`;
                          } else {
                            // Other admin levels see abbreviated names
                            if (person.first_name) {
                              return `${person.first_name} ${person.last_name ? person.last_name.charAt(0) + '.' : ''}`;
                            }
                            return person.nickname || (person.name && person.name !== 'User' ? person.name : 'Registered Bidder');
                          }
                        })()}
                      </Text>
                      {/* Debug info for troubleshooting */}
                      {(adminLevel === 'producer' || adminLevel === 'super') && auctionBids[selectedAuctionItem.id] && (
                        <Text size="1" color="gray" style={{ display: 'block', marginTop: '4px', fontFamily: 'monospace' }}>
                          Debug: {auctionBids[selectedAuctionItem.id].bidCount} bids, highest: ${auctionBids[selectedAuctionItem.id].highestBid}
                        </Text>
                      )}
                      {(adminLevel === 'producer' || adminLevel === 'super') && (() => {
                        const person = auctionBids[selectedAuctionItem.id]?.highestBidder ||
                                      selectedAuctionItem.winner_people ||
                                      selectedAuctionItem.buyer_pay_recent_people;
                        return person?.email && (
                          <Text size="2" color="gray" style={{ display: 'block', marginTop: '4px' }}>
                            📧 {person.email}
                          </Text>
                        );
                      })()}
                      {(adminLevel === 'producer' || adminLevel === 'super') && (() => {
                        const person = auctionBids[selectedAuctionItem.id]?.highestBidder ||
                                      selectedAuctionItem.winner_people ||
                                      selectedAuctionItem.buyer_pay_recent_people;
                        const phone = person?.phone_number || person?.auth_phone || person?.phone;
                        return phone && (
                          <Text size="2" color="gray" style={{ display: 'block', marginTop: '4px' }}>
                            📱 {phone}
                          </Text>
                        );
                      })()}
                    </Flex>
                  </Card>
                )}

                {/* Payment Status */}
                <Card size="2">
                  <Heading size="3" mb="3">Payment Status</Heading>
                  <Flex direction="column" gap="3">
                    {selectedAuctionItem.status === 'paid' || selectedAuctionItem.buyer_pay_recent_status_id ? (
                      <Box>
                        <Badge 
                          size="2" 
                          color={(() => {
                            // Stripe payments get green
                            if (selectedAuctionItem.payment_statuses?.code === 'stripe_paid' || 
                                (selectedAuctionItem.status === 'paid' && !selectedAuctionItem.buyer_pay_recent_status_id)) {
                              return 'green';
                            }
                            // Admin payments get blue
                            else {
                              return 'blue';
                            }
                          })()} 
                          mb="2"
                        >
                          {(() => {
                            // Check if this is a Stripe payment first  
                            if (selectedAuctionItem.payment_statuses?.code === 'stripe_paid') {
                              return 'PAID - STRIPE';
                            }
                            // For Stripe payments where status='paid' but no payment_statuses data
                            else if (selectedAuctionItem.status === 'paid' && !selectedAuctionItem.buyer_pay_recent_status_id) {
                              return 'PAID - STRIPE';
                            }
                            // Then check for admin payments with payment logs
                            else if (selectedAuctionItem.payment_statuses?.code === 'admin_paid') {
                              const adminPayment = selectedAuctionItem.payment_logs?.find(log => log.payment_type === 'admin_marked');
                              if (adminPayment) {
                                const paymentMethod = adminPayment.payment_method?.toUpperCase() || 'CASH';
                                const adminPhone = adminPayment.admin_phone || 'ADMIN';
                                const amountText = adminPayment.actual_amount_collected ? 
                                  ` - $${adminPayment.actual_amount_collected}` : '';
                                return `PAID - ${paymentMethod} by ${adminPhone}${amountText}`;
                              } else {
                                // Admin payment but no log entry (legacy data)
                                return 'PAID - ADMIN MARKED';
                              }
                            } 
                            else {
                              return 'PAID';
                            }
                          })()}
                        </Badge>
                        <Flex direction="column" gap="2">
                          <Text size="2" color="gray">
                            Paid on: {new Date(selectedAuctionItem.buyer_pay_recent_date).toLocaleString()}
                          </Text>
                          {selectedAuctionItem.payment_statuses && (
                            <Text size="2" color="gray">
                              Payment Type: {selectedAuctionItem.payment_statuses.description}
                            </Text>
                          )}
                          {selectedAuctionItem.payment_logs?.find(log => log.payment_type === 'admin_marked') && (
                            <Box>
                              {(() => {
                                const adminPayment = selectedAuctionItem.payment_logs.find(log => log.payment_type === 'admin_marked');
                                return (
                                  <>
                                    <Text size="2" color="gray">
                                      Payment Method: {adminPayment.payment_method?.toUpperCase() || 'Unknown'}
                                    </Text>
                                    {adminPayment.actual_amount_collected && (
                                      <Text size="2" color="gray">
                                        Amount Collected: ${adminPayment.actual_amount_collected}
                                        {adminPayment.actual_tax_collected && ` (Tax: $${adminPayment.actual_tax_collected})`}
                                      </Text>
                                    )}
                                    {adminPayment.collection_notes && (
                                      <Text size="2" color="gray" style={{ fontStyle: 'italic' }}>
                                        Notes: {adminPayment.collection_notes}
                                      </Text>
                                    )}
                                    <Text size="2" color="gray">
                                      Collected by: {adminPayment.admin_phone}
                                    </Text>
                                  </>
                                );
                              })()}
                            </Box>
                          )}
                        </Flex>
                      </Box>
                    ) : (
                      <Box>
                        <Badge size="2" color="gray" mb="2">NOT PAID</Badge>
                        {selectedAuctionItem.status === 'sold' && (
                          <Button 
                            size="2" 
                            variant="solid"
                            onClick={() => {
                              try {
                                console.log('Mark as Paid clicked, selectedAuctionItem:', selectedAuctionItem);
                                
                                // Calculate suggested values
                                const winningBid = auctionBids[selectedAuctionItem.id]?.highestBid || selectedAuctionItem.current_bid || 0;
                                const taxRate = selectedAuctionItem.tax || 0;
                                const suggestedTax = Math.round((winningBid * taxRate / 100) * 100) / 100;
                                const suggestedTotal = winningBid + suggestedTax;

                                console.log('Payment calculation:', { winningBid, taxRate, suggestedTax, suggestedTotal });

                                setPaymentFormData({
                                  actualAmount: suggestedTotal.toString(),
                                  actualTax: suggestedTax.toString(),
                                  paymentMethod: 'cash',
                                  collectionNotes: ''
                                });
                                
                                console.log('Setting showPaymentModal to true');
                                setShowPaymentModal(true);
                              } catch (error) {
                                console.error('Error opening payment modal:', error);
                                alert('Error opening payment modal: ' + error.message);
                              }
                            }}
                          >
                            Mark as Paid
                          </Button>
                        )}
                      </Box>
                    )}
                  </Flex>
                </Card>

                {/* Future: Credit Card Transaction Data */}
                <Card size="2">
                  <Heading size="3" mb="3">Transaction Details</Heading>
                  <Text size="2" color="gray">
                    Credit card transaction data will appear here when integrated.
                  </Text>
                </Card>

                {/* Bid History */}
                {auctionBids[selectedAuctionItem.id]?.history && 
                 auctionBids[selectedAuctionItem.id].history.length > 0 && (
                  <Card size="2">
                    <Heading size="3" mb="3">Bid History</Heading>
                    <Flex direction="column" gap="2">
                      {auctionBids[selectedAuctionItem.id].history.slice(0, 10).map((bid, index) => (
                        <Card key={index} size="1" style={{ padding: '12px' }}>
                          <Flex direction="column" gap="2">
                            {/* Top row: Bidder name and bid amount */}
                            <Flex justify="between" align="center">
                              <Box style={{ minWidth: 0, flex: 1 }}>
                                <Text size="2" weight="medium" style={{ display: 'block' }}>
                                  {(adminLevel === 'producer' || adminLevel === 'super') ? (
                                    // Producer+ sees full names from any available field
                                    bid.bidder?.first_name ?
                                      `${bid.bidder.first_name} ${bid.bidder.last_name || ''}` :
                                      bid.bidder?.name || bid.bidder?.nickname || bid.bidder?.email?.split('@')[0] || bid.bidder?.phone_number || bid.bidder?.auth_phone || bid.bidder?.phone || 'Unknown Bidder'
                                  ) : (
                                    // Other admin levels see abbreviated names
                                    bid.bidder?.first_name ?
                                      `${bid.bidder.first_name} ${bid.bidder.last_name ? bid.bidder.last_name.charAt(0) + '.' : ''}` :
                                      bid.bidder?.nickname || 'Anonymous'
                                  )}
                                </Text>
                                <Text size="1" color="gray">
                                  {new Date(bid.created_at).toLocaleString()}
                                </Text>
                              </Box>
                              <Box style={{ textAlign: 'right', flexShrink: 0 }}>
                                <Text size="3" weight="bold" style={{ display: 'block' }}>
                                  ${Math.round(bid.amount)}
                                </Text>
                                {index === 0 && (
                                  <Badge size="1" color="green" style={{ marginTop: '2px' }}>
                                    WINNING
                                  </Badge>
                                )}
                              </Box>
                            </Flex>

                            {/* Contact info row (only for producer+ levels) */}
                            {(adminLevel === 'producer' || adminLevel === 'super') && (bid.bidder?.email || bid.bidder?.phone) && (
                              <Flex gap="4" style={{ flexWrap: 'wrap' }}>
                                {bid.bidder?.email && (
                                  <Text size="1" color="gray">
                                    📧 {bid.bidder.email}
                                  </Text>
                                )}
                                {bid.bidder?.phone && (
                                  <Text size="1" color="gray">
                                    📱 {bid.bidder.phone}
                                  </Text>
                                )}
                              </Flex>
                            )}

                            {/* Action buttons row */}
                            {((index !== 0 && ['sold', 'closed'].includes(selectedAuctionItem.status) && !selectedAuctionItem.buyer_pay_recent_status_id && selectedAuctionItem.status !== 'paid') ||
                              (index === 0 && ['sold', 'closed'].includes(selectedAuctionItem.status) && !selectedAuctionItem.buyer_pay_recent_status_id && selectedAuctionItem.status !== 'paid')) && (
                              <Flex gap="2" style={{ flexWrap: 'wrap' }}>
                                {/* Offer button for non-winning bidders */}
                                {index !== 0 && (
                                  <>
                                    <Button
                                      size="1"
                                      variant="soft"
                                      color="orange"
                                      onClick={() => setShowOfferConfirm({
                                        bid: { id: bid.id, amount: bid.amount },
                                        bidder: bid.bidder
                                      })}
                                      style={{ fontSize: '11px', padding: '6px 12px' }}
                                    >
                                      {getButtonText('offer', selectedAuctionItem.id, bid.bidder?.id)}
                                    </Button>
                                    <Button
                                      size="1"
                                      variant="ghost"
                                      color="gray"
                                      onClick={() => openOfferHistory(selectedAuctionItem.id)}
                                      style={{ fontSize: '10px', padding: '4px 8px' }}
                                    >
                                      Offer History
                                    </Button>
                                  </>
                                )}

                                {/* Payment reminder button for winning bidder */}
                                {index === 0 && (
                                  <>
                                    <Button
                                      size="1"
                                      variant="soft"
                                      color="blue"
                                      onClick={() => handleSendPaymentReminder(selectedAuctionItem.id, bid.bidder)}
                                      style={{ fontSize: '11px', padding: '6px 12px' }}
                                      disabled={paymentReminderLoading}
                                    >
                                      {paymentReminderLoading ? 'Sending...' : getButtonText('reminder', selectedAuctionItem.id)}
                                    </Button>
                                    <Button
                                      size="1"
                                      variant="ghost"
                                      color="gray"
                                      onClick={() => openReminderHistory(selectedAuctionItem.id)}
                                      style={{ fontSize: '10px', padding: '4px 8px' }}
                                    >
                                      Reminder History
                                    </Button>
                                  </>
                                )}
                              </Flex>
                            )}

                            {/* Status messages below buttons */}
                            {index !== 0 && lastOfferCreated[selectedAuctionItem.id] && (
                              <Text size="1" color="gray" style={{ fontSize: '10px' }}>
                                Last offer: {formatTimestamp(lastOfferCreated[selectedAuctionItem.id])}
                              </Text>
                            )}
                            {index === 0 && lastReminderSent[selectedAuctionItem.id] && (
                              <Text size="1" color="gray" style={{ fontSize: '10px' }}>
                                Last reminder: {formatTimestamp(lastReminderSent[selectedAuctionItem.id])}
                              </Text>
                            )}
                          </Flex>
                        </Card>
                      ))}
                    </Flex>
                  </Card>
                )}
              </Flex>

              <Flex gap="3" mt="4" justify="end">
                <Dialog.Close>
                  <Button variant="soft" color="gray">
                    Close
                  </Button>
                </Dialog.Close>
              </Flex>
            </Box>
          )}
        </Dialog.Content>
      </Dialog.Root>

      {/* Payment Collection Modal */}
      <Dialog.Root open={showPaymentModal} onOpenChange={(open) => {
        console.log('Payment modal onOpenChange called with:', open);
        setShowPaymentModal(open);
      }}>
        <Dialog.Content style={{ maxWidth: '90vw', width: 500 }}>
          <Dialog.Title>
            <Flex justify="between" align="center">
              <Text>Collect Payment</Text>
              <Dialog.Close>
                <IconButton size="2" variant="ghost">
                  <Cross2Icon />
                </IconButton>
              </Dialog.Close>
            </Flex>
          </Dialog.Title>
          
          {selectedAuctionItem && (
            <Flex direction="column" gap="4" mt="3">
              {/* Artwork Summary */}
              <Card size="2" style={{ backgroundColor: 'var(--gray-2)' }}>
                <Flex direction="column" gap="2">
                  <Text size="3" weight="bold">
                    {selectedAuctionItem.artist_profiles?.name || 'Unknown Artist'}
                  </Text>
                  <Text size="2" color="gray">
                    Art Code: {selectedAuctionItem.art_code} • Round {selectedAuctionItem.round}, Easel {selectedAuctionItem.easel}
                  </Text>
                  <Text size="2" weight="medium">
                    Winning Bid: ${auctionBids[selectedAuctionItem.id]?.highestBid || selectedAuctionItem.current_bid || 0}
                  </Text>
                  {(adminLevel === 'producer' || adminLevel === 'super') && auctionBids[selectedAuctionItem.id]?.highestBidder && (
                    <Flex direction="column" gap="1">
                      <Text size="2" color="gray">
                        Winner: {(() => {
                          const bidder = auctionBids[selectedAuctionItem.id].highestBidder;

                          // If we have first and last name, use them
                          if (bidder.first_name && bidder.last_name) {
                            return `${bidder.first_name} ${bidder.last_name}`;
                          }

                          // If we have a nickname, use it
                          if (bidder.nickname && bidder.nickname !== 'User') {
                            return bidder.nickname;
                          }

                          // If we only have phone, show "Bidder (phone)"
                          if (bidder.phone_number) {
                            return `Bidder (${bidder.phone_number})`;
                          }

                          // Fallback
                          return bidder.name || 'Anonymous Bidder';
                        })()}
                      </Text>
                      {auctionBids[selectedAuctionItem.id].highestBidder.phone_number && (
                        <Text size="1" color="gray">
                          Phone: {auctionBids[selectedAuctionItem.id].highestBidder.phone_number}
                        </Text>
                      )}
                      {auctionBids[selectedAuctionItem.id].highestBidder.email && (
                        <Text size="1" color="gray">
                          Email: {auctionBids[selectedAuctionItem.id].highestBidder.email}
                        </Text>
                      )}
                    </Flex>
                  )}
                </Flex>
              </Card>

              {/* Payment Form */}
              <Flex direction="column" gap="3">
                <Box>
                  <Text size="2" weight="medium" mb="2" style={{ display: 'block' }}>
                    Actual Amount Collected *
                  </Text>
                  <input
                    type="number"
                    step="0.01"
                    value={paymentFormData.actualAmount}
                    onChange={(e) => setPaymentFormData(prev => ({ ...prev, actualAmount: e.target.value }))}
                    placeholder="Enter total amount collected"
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      borderRadius: '6px',
                      border: '1px solid var(--gray-6)',
                      backgroundColor: 'var(--gray-1)',
                      color: 'var(--gray-12)'
                    }}
                  />
                </Box>

                <Box>
                  <Text size="2" weight="medium" mb="2" style={{ display: 'block' }}>
                    Tax Amount Collected
                  </Text>
                  <input
                    type="number"
                    step="0.01"
                    value={paymentFormData.actualTax}
                    onChange={(e) => setPaymentFormData(prev => ({ ...prev, actualTax: e.target.value }))}
                    placeholder="Enter tax amount collected"
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      borderRadius: '6px',
                      border: '1px solid var(--gray-6)',
                      backgroundColor: 'var(--gray-1)',
                      color: 'var(--gray-12)'
                    }}
                  />
                </Box>

                <Box>
                  <Text size="2" weight="medium" mb="2" style={{ display: 'block' }}>
                    Payment Method
                  </Text>
                  <Select.Root 
                    value={paymentFormData.paymentMethod} 
                    onValueChange={(value) => setPaymentFormData(prev => ({ ...prev, paymentMethod: value }))}
                  >
                    <Select.Trigger style={{ width: '100%' }} />
                    <Select.Content>
                      <Select.Item value="cash">💵 Cash</Select.Item>
                      <Select.Item value="card">💳 Credit/Debit Card</Select.Item>
                      <Select.Item value="check">🏦 Check</Select.Item>
                      <Select.Item value="other">🔄 Other</Select.Item>
                    </Select.Content>
                  </Select.Root>
                </Box>

                <Box>
                  <Text size="2" weight="medium" mb="2" style={{ display: 'block' }}>
                    Collection Notes (Optional)
                  </Text>
                  <textarea
                    value={paymentFormData.collectionNotes}
                    onChange={(e) => setPaymentFormData(prev => ({ ...prev, collectionNotes: e.target.value }))}
                    placeholder="Any notes about the payment collection..."
                    rows="3"
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      borderRadius: '6px',
                      border: '1px solid var(--gray-6)',
                      backgroundColor: 'var(--gray-1)',
                      color: 'var(--gray-12)',
                      resize: 'vertical',
                      fontFamily: 'inherit'
                    }}
                  />
                </Box>
              </Flex>

              {/* Action Buttons */}
              <Flex gap="3" justify="end" mt="4">
                <Dialog.Close>
                  <Button variant="soft" color="gray">
                    Cancel
                  </Button>
                </Dialog.Close>
                <Button 
                  variant="solid"
                  disabled={!paymentFormData.actualAmount}
                  onClick={async () => {
                    try {
                      const actualAmount = parseFloat(paymentFormData.actualAmount);
                      const actualTax = parseFloat(paymentFormData.actualTax) || 0;

                      if (isNaN(actualAmount) || actualAmount <= 0) {
                        alert('Please enter a valid amount collected');
                        return;
                      }

                      // Call the enhanced admin function with actual payment data
                      const { data, error } = await supabase
                        .rpc('admin_update_art_status', {
                          p_art_code: selectedAuctionItem.art_code,
                          p_new_status: 'paid',
                          p_admin_phone: user?.phone,
                          p_actual_amount_collected: actualAmount,
                          p_actual_tax_collected: actualTax || null,
                          p_payment_method: paymentFormData.paymentMethod,
                          p_collection_notes: paymentFormData.collectionNotes || null
                        });

                      if (error) throw error;

                      if (data?.success) {
                        // Refresh auction data
                        fetchAuctionData();
                        setSelectedAuctionItem(null);
                        setShowPaymentModal(false);
                        showAdminMessage('success', 
                          `Payment recorded: $${actualAmount} via ${paymentFormData.paymentMethod} by ${user?.phone || 'admin'}`
                        );
                      } else {
                        throw new Error(data?.error || 'Failed to record payment');
                      }
                    } catch (error) {
                      console.error('Error recording payment:', error);
                      alert('Failed to record payment: ' + error.message);
                    }
                  }}
                >
                  Record Payment
                </Button>
              </Flex>
            </Flex>
          )}
        </Dialog.Content>
      </Dialog.Root>

      {/* Close Auction Confirmation Dialog */}
      <AlertDialog.Root open={confirmCloseAuction} onOpenChange={setConfirmCloseAuction}>
        <AlertDialog.Content style={{ maxWidth: 450 }}>
          <AlertDialog.Title>Confirm Close Auction</AlertDialog.Title>
          <AlertDialog.Description size="2">
            <Flex direction="column" gap="3">
              <Text>
                Are you sure you want to close the auction now?
              </Text>
              <Callout.Root color="amber" size="2">
                <Callout.Icon>
                  <InfoCircledIcon />
                </Callout.Icon>
                <Callout.Text>
                  Items that have received bids within the last 5 minutes will remain open and extend automatically.
                </Callout.Text>
              </Callout.Root>
              <Text size="2" color="gray">
                This will close bidding on all items that haven't had recent activity.
              </Text>
            </Flex>
          </AlertDialog.Description>
          <Flex gap="3" mt="4" justify="end">
            <AlertDialog.Cancel>
              <Button variant="soft" color="gray">
                Cancel
              </Button>
            </AlertDialog.Cancel>
            <AlertDialog.Action>
              <Button 
                variant="solid" 
                color="red"
                onClick={async () => {
                  setConfirmCloseAuction(false);
                  await handleTimerAction('close_now');
                }}
              >
                Close Auction
              </Button>
            </AlertDialog.Action>
          </Flex>
        </AlertDialog.Content>
      </AlertDialog.Root>

      {/* Artist Removal Info Dialog */}
      <Dialog.Root open={showRemovalInfo} onOpenChange={setShowRemovalInfo}>
        <Dialog.Content style={{ maxWidth: '90vw', width: 500 }}>
          <Dialog.Title>About Artist Removal</Dialog.Title>
          
          <Flex direction="column" gap="4">
            {/* Producer-friendly explanation */}
            <Box>
              <Heading size="3" mb="2">What happens when you remove an artist:</Heading>
              <Flex direction="column" gap="2">
                <Text size="2">
                  <strong>• The easel becomes available</strong> - You can assign a different artist to this position
                </Text>
                <Text size="2">
                  <strong>• The canvas code stays the same</strong> - The physical canvas (e.g., AB3032-1-3) doesn't change
                </Text>
                <Text size="2">
                  <strong>• Data is preserved by default</strong> - All votes, bids, and images remain unless you choose to clear them
                </Text>
                <Text size="2">
                  <strong>• The artist can be reassigned</strong> - You can put them on a different easel or in another round
                </Text>
              </Flex>
            </Box>

            <Callout.Root color="amber" size="2" mt="3">
              <Callout.Icon>
                <ExclamationTriangleIcon />
              </Callout.Icon>
              <Callout.Text>
                <strong>Important:</strong> When moving an artist between easels, their data (votes, bids, images) will NOT be copied to the new easel. Each easel maintains its own separate data tied to the canvas code.
              </Callout.Text>
            </Callout.Root>

            <Separator size="4" />

            {/* Technical details */}
            <Box>
              <Heading size="3" mb="2">Technical details:</Heading>
              <Flex direction="column" gap="2">
                <Text size="2" color="gray">
                  • The <code>art</code> record's <code>artist_id</code> is set to NULL
                </Text>
                <Text size="2" color="gray">
                  • The <code>round_contestants</code> entry is deleted
                </Text>
                <Text size="2" color="gray">
                  • The <code>art_code</code> (e.g., AB3032-1-3) remains unchanged
                </Text>
                <Text size="2" color="gray">
                  • If "Clear images" is checked: Deletes from <code>art_media</code> table
                </Text>
                <Text size="2" color="gray">
                  • If "Clear votes" is checked: Deletes from <code>votes</code> table and resets <code>vote_count</code> to 0
                </Text>
                <Text size="2" color="gray">
                  • If "Clear bids" is checked: Deletes from <code>bids</code> table and resets <code>bid_count</code> to 0, <code>current_bid</code> to <code>starting_bid</code>
                </Text>
                <Text size="2" color="gray">
                  • When a new artist is assigned: Updates <code>artist_id</code> in the existing <code>art</code> record
                </Text>
              </Flex>
            </Box>

            <Callout.Root color="blue" size="2">
              <Callout.Icon>
                <InfoCircledIcon />
              </Callout.Icon>
              <Callout.Text>
                This system ensures the physical canvas always matches the digital record, even when artists change.
              </Callout.Text>
            </Callout.Root>
          </Flex>

          <Flex gap="3" mt="4" justify="end">
            <Dialog.Close>
              <Button variant="soft">Got it</Button>
            </Dialog.Close>
          </Flex>
        </Dialog.Content>
      </Dialog.Root>
      
      {/* Timer Cancellation Confirmation */}
      <AlertDialog.Root open={!!confirmCancelTimer} onOpenChange={(open) => !open && setConfirmCancelTimer(null)}>
        <AlertDialog.Content style={{ maxWidth: 450 }}>
          <AlertDialog.Title>Cancel Timer?</AlertDialog.Title>
          <AlertDialog.Description size="2">
            Are you sure you want to cancel the timer for Round {confirmCancelTimer?.roundNumber}?
            This action cannot be undone.
          </AlertDialog.Description>

          <Flex gap="3" mt="4" justify="end">
            <AlertDialog.Cancel>
              <Button variant="soft" color="gray">
                Keep Timer
              </Button>
            </AlertDialog.Cancel>
            <AlertDialog.Action>
              <Button 
                color="red"
                onClick={() => {
                  if (confirmCancelTimer?.roundId) {
                    cancelRoundTimer(confirmCancelTimer.roundId);
                  }
                }}
              >
                Cancel Timer
              </Button>
            </AlertDialog.Action>
          </Flex>
        </AlertDialog.Content>
      </AlertDialog.Root>

      {/* Offer to Bidder Confirmation Dialog */}
      <AlertDialog.Root open={!!showOfferConfirm} onOpenChange={(open) => !open && setShowOfferConfirm(null)}>
        <AlertDialog.Content style={{ maxWidth: 500 }}>
          <AlertDialog.Title>Offer Artwork to Bidder</AlertDialog.Title>
          <AlertDialog.Description size="2">
            {showOfferConfirm && (
              <Flex direction="column" gap="3">
                <Text>
                  Are you sure you want to offer this artwork to{' '}
                  <strong>
                    {showOfferConfirm.bidder.first_name && showOfferConfirm.bidder.last_name
                      ? `${showOfferConfirm.bidder.first_name} ${showOfferConfirm.bidder.last_name}`
                      : showOfferConfirm.bidder.name || showOfferConfirm.bidder.nickname || 'this bidder'}
                  </strong>{' '}
                  for <strong>${showOfferConfirm.bid.amount}</strong>?
                </Text>
                <Card size="2" style={{ backgroundColor: 'var(--amber-2)', border: '1px solid var(--amber-6)' }}>
                  <Flex direction="column" gap="2">
                    <Text size="2" weight="medium" color="amber">
                      ⚡ Payment Race
                    </Text>
                    <Text size="2">
                      This will create a payment race between the current winner and this bidder.
                      Whoever pays first gets the artwork. The offer expires in 15 minutes.
                    </Text>
                  </Flex>
                </Card>
                <Text size="2" color="gray">
                  Art Code: {selectedAuctionItem?.art_code} •
                  Current Winner: ${auctionBids[selectedAuctionItem?.id]?.highestBid || selectedAuctionItem?.current_bid || 0}
                </Text>
              </Flex>
            )}
          </AlertDialog.Description>

          <Flex gap="3" mt="4" justify="end">
            <AlertDialog.Cancel>
              <Button variant="soft" color="gray" disabled={offerLoading}>
                Cancel
              </Button>
            </AlertDialog.Cancel>
            <AlertDialog.Action>
              <Button
                color="orange"
                onClick={handleCreateOffer}
                disabled={offerLoading}
              >
                {offerLoading ? (
                  <Flex align="center" gap="2">
                    <Spinner size="1" />
                    Creating Offer...
                  </Flex>
                ) : (
                  'Create Offer'
                )}
              </Button>
            </AlertDialog.Action>
          </Flex>
        </AlertDialog.Content>
      </AlertDialog.Root>

      {/* Payment Reminder History Modal */}
      <Dialog.Root open={!!showReminderHistory} onOpenChange={(open) => !open && setShowReminderHistory(null)}>
        <Dialog.Content style={{ maxWidth: 800, maxHeight: '80vh', overflow: 'auto' }}>
          <Dialog.Title>Payment Reminder History</Dialog.Title>
          <Dialog.Description size="2" mb="4">
            {reminderHistory && (
              <Text>
                {reminderHistory.artwork.art_code} • {reminderHistory.artwork.event_eid}
              </Text>
            )}
          </Dialog.Description>

          {historyLoading ? (
            <Flex align="center" justify="center" gap="2" py="6">
              <Spinner size="2" />
              <Text>Loading history...</Text>
            </Flex>
          ) : reminderHistory ? (
            <Flex direction="column" gap="4">
              {reminderHistory.total_reminders === 0 ? (
                <Card size="3">
                  <Flex align="center" justify="center" py="4">
                    <Text color="gray">No payment reminders sent yet</Text>
                  </Flex>
                </Card>
              ) : (
                <Flex direction="column" gap="3">
                  <Text size="2" weight="medium">
                    {reminderHistory.total_reminders} reminder{reminderHistory.total_reminders !== 1 ? 's' : ''} sent
                  </Text>

                  {reminderHistory.reminders.map((reminder) => (
                    <Card key={reminder.id} size="2">
                      <Flex direction="column" gap="2">
                        <Flex justify="between" align="start">
                          <Flex direction="column" gap="1">
                            <Text size="2" weight="medium">
                              Sent to: {reminder.people.first_name && reminder.people.last_name
                                ? `${reminder.people.first_name} ${reminder.people.last_name}`
                                : reminder.people.name || reminder.people.nickname || 'Unknown'}
                            </Text>
                            <Text size="1" color="gray">
                              {reminder.phone_number} • {formatTimestamp(reminder.created_at)}
                            </Text>
                          </Flex>
                          <Badge
                            color={reminder.sms_status === 'delivered' ? 'green' :
                                  reminder.sms_status === 'failed' ? 'red' : 'blue'}
                            variant="soft"
                          >
                            {reminder.sms_status || 'sent'}
                          </Badge>
                        </Flex>

                        <Box style={{ backgroundColor: 'var(--gray-2)', padding: '8px', borderRadius: '6px' }}>
                          <Text size="1" style={{ fontFamily: 'monospace' }}>
                            {reminder.message_content}
                          </Text>
                        </Box>

                        {reminder.admin_note && (
                          <Text size="1" color="gray" style={{ fontStyle: 'italic' }}>
                            Note: {reminder.admin_note}
                          </Text>
                        )}
                      </Flex>
                    </Card>
                  ))}
                </Flex>
              )}
            </Flex>
          ) : null}

          <Flex gap="3" mt="4" justify="end">
            <Dialog.Close>
              <Button variant="soft" color="gray">
                Close
              </Button>
            </Dialog.Close>
          </Flex>
        </Dialog.Content>
      </Dialog.Root>

      {/* Offer History Modal */}
      <Dialog.Root open={!!showOfferHistory} onOpenChange={(open) => !open && setShowOfferHistory(null)}>
        <Dialog.Content style={{ maxWidth: 800, maxHeight: '80vh', overflow: 'auto' }}>
          <Dialog.Title>Offer History</Dialog.Title>
          <Dialog.Description size="2" mb="4">
            {offerHistory && (
              <Text>
                {offerHistory.artwork.art_code} • {offerHistory.artwork.event_eid}
              </Text>
            )}
          </Dialog.Description>

          {historyLoading ? (
            <Flex align="center" justify="center" gap="2" py="6">
              <Spinner size="2" />
              <Text>Loading history...</Text>
            </Flex>
          ) : offerHistory ? (
            <Flex direction="column" gap="4">
              {/* Stats Summary */}
              <Grid columns="4" gap="2">
                <Card size="1">
                  <Flex direction="column" align="center" gap="1">
                    <Text size="3" weight="bold">{offerHistory.stats.total_offers}</Text>
                    <Text size="1" color="gray">Total</Text>
                  </Flex>
                </Card>
                <Card size="1">
                  <Flex direction="column" align="center" gap="1">
                    <Text size="3" weight="bold" color="green">{offerHistory.stats.active_offers}</Text>
                    <Text size="1" color="gray">Active</Text>
                  </Flex>
                </Card>
                <Card size="1">
                  <Flex direction="column" align="center" gap="1">
                    <Text size="3" weight="bold" color="blue">{offerHistory.stats.paid_offers}</Text>
                    <Text size="1" color="gray">Paid</Text>
                  </Flex>
                </Card>
                <Card size="1">
                  <Flex direction="column" align="center" gap="1">
                    <Text size="3" weight="bold" color="gray">{offerHistory.stats.expired_offers}</Text>
                    <Text size="1" color="gray">Expired</Text>
                  </Flex>
                </Card>
              </Grid>

              {offerHistory.stats.total_offers === 0 ? (
                <Card size="3">
                  <Flex align="center" justify="center" py="4">
                    <Text color="gray">No offers created yet</Text>
                  </Flex>
                </Card>
              ) : (
                <Flex direction="column" gap="3">
                  {offerHistory.offers.map((offer) => (
                    <Card key={offer.id} size="2">
                      <Flex direction="column" gap="2">
                        <Flex justify="between" align="start">
                          <Flex direction="column" gap="1">
                            <Text size="2" weight="medium">
                              Offered to: {offer.people.first_name && offer.people.last_name
                                ? `${offer.people.first_name} ${offer.people.last_name}`
                                : offer.people.name || offer.people.nickname || 'Unknown'}
                            </Text>
                            <Text size="2" weight="bold" color="green">
                              ${offer.offered_amount}
                            </Text>
                            <Text size="1" color="gray">
                              Created: {formatTimestamp(offer.created_at)}
                              {offer.expires_at && ` • Expires: ${formatTimestamp(offer.expires_at)}`}
                            </Text>
                          </Flex>
                          <Badge
                            color={offer.status === 'paid' ? 'green' :
                                  offer.status === 'pending' ? 'blue' :
                                  offer.status === 'expired' ? 'gray' : 'red'}
                            variant="soft"
                          >
                            {offer.status}
                          </Badge>
                        </Flex>

                        {offer.admin_note && (
                          <Text size="1" color="gray" style={{ fontStyle: 'italic' }}>
                            Note: {offer.admin_note}
                          </Text>
                        )}
                      </Flex>
                    </Card>
                  ))}
                </Flex>
              )}
            </Flex>
          ) : null}

          <Flex gap="3" mt="4" justify="end">
            <Dialog.Close>
              <Button variant="soft" color="gray">
                Close
              </Button>
            </Dialog.Close>
          </Flex>
        </Dialog.Content>
      </Dialog.Root>
    </Box>
  );
};

export default AdminPanel;
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
import { getArtworkImageUrls } from '../lib/imageHelpers';
import { injectFlashStyles, applyFlashClass } from '../utils/realtimeFlash';

const AdminPanel = ({ 
  eventId,
  artworksByRound = {}, 
  roundWinners = {}, 
  setRoundWinners = () => {}, 
  artworks = [],
  currentTime = Date.now(),
  user = null
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
  // Removed allArtists state - now using server-side search
  const [auctionTimerStatus, setAuctionTimerStatus] = useState(null);
  const [timerActionLoading, setTimerActionLoading] = useState(false);
  const [eventArtists, setEventArtists] = useState([]); // Artists added to event (including unassigned)
  const [selectedEasel, setSelectedEasel] = useState(null);
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
        const { fetchVoteWeights } = await import('../components/EventDetails');
        if (fetchVoteWeights) fetchVoteWeights();
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

  // Fetch event data when eventId changes
  useEffect(() => {
    if (eventId) {
      fetchEventData();
      if (adminLevel === 'super') {
        fetchEventAdmins();
      }
      if (adminMode === 'auction') {
        fetchAuctionData();
        fetchAuctionTimerStatus();
      }
    }
  }, [eventId]);

  // Fetch auction data when switching to auction tab
  useEffect(() => {
    if (eventId && adminMode === 'auction') {
      fetchAuctionData();
      fetchAuctionTimerStatus();
    }
  }, [adminMode]);

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
    
    const channel = supabase
      .channel(`admin-auction-${eventId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'art',
          filter: `event_id=eq.${eventId}`,
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

    return () => {
      supabase.removeChannel(channel);
    };
  }, [eventId, adminMode, auctionArtworks.length]);

  // Set up realtime subscription for voting updates
  useEffect(() => {
    if (!eventId || adminMode !== 'voting') return;
    
    const channel = supabase
      .channel(`admin-voting-${eventId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'votes',
          filter: `event_id=eq.${eventId}`,
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

    return () => {
      supabase.removeChannel(channel);
    };
  }, [eventId, adminMode]);

  // AdminPanel realtime subscriptions DISABLED
  // The realtime subscriptions were causing page reloads - investigation ongoing
  // EventDetails component handles realtime updates for now
  useEffect(() => {
    // DISABLED - Realtime subscriptions cause page reload issue
    // TODO: Investigate why realtime subscriptions crash the AdminPanel
  }, [eventId, adminMode]);

  const fetchEventData = async () => {
    try {
      // Try to get the first round ID for this event (for staging artists)
      // This is optional - events can exist without rounds
      const { data: firstRound, error: roundError } = await supabase
        .from('rounds')
        .select('id')
        .eq('event_id', eventId)
        .eq('round_number', 1)
        .maybeSingle(); // Use maybeSingle instead of single to allow null

      // Don't throw error if no first round exists - just continue without it

      // Fetch all rounds with contestants (may be empty for events without rounds)
      const { data: roundsData, error: roundsError } = await supabase
        .from('rounds')
        .select(`
          id,
          round_number,
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
        .eq('event_id', eventId)
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

          // Only create easels for actual database records
          const easels = [];
          for (let i = 1; i <= highestEaselNumber; i++) {
            if (easelMap.has(i)) {
              easels.push({
                easelNumber: i,
                artist: easelMap.get(i),
                isEmpty: false
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
      }

      // Fetch artists from event_artists table
      const { data: eventArtistsData, error: eventArtistsError } = await supabase
        .from('event_artists')
        .select(`
          id,
          artist_id,
          artist_profiles!inner (
            id,
            name,
            city_text,
            instagram,
            entry_id
          )
        `)
        .eq('event_id', eventId)
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
      // Check if query is numeric for entry_id search
      const isNumeric = /^\d+$/.test(query);
      
      // Build OR conditions - include entry_id only if query is numeric
      let orConditions = `name.ilike.%${query}%,city_text.ilike.%${query}%,instagram.ilike.%${query}%`;
      if (isNumeric) {
        orConditions += `,entry_id.eq.${query}`;
      }
      
      // Server-side search with OR conditions for name, city, instagram, and entry_id (if numeric)
      const { data, error } = await supabase
        .from('artist_profiles')
        .select('id, name, city_text, instagram, entry_id')
        .not('name', 'is', null)
        .or(orConditions)
        .order('name')
        .limit(20); // Limit results to 20 for performance

      if (error) throw error;
      
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
      // Add artist to event_artists table instead of round_contestants
      const { error } = await supabase
        .from('event_artists')
        .insert({
          event_id: eventId,
          artist_id: artistId,
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

      // Refresh data
      fetchEventData();
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
                      <Flex justify="between" align="center">
                        <Box>
                          <Text size="3" weight="medium" style={{ display: 'block' }}>
                            {artwork.artist_profiles?.name || 'Unknown Artist'}
                          </Text>
                          <Text size="2" color="gray" style={{ display: 'block', marginTop: '4px' }}>
                            Round {artwork.round}, Easel {artwork.easel}
                          </Text>
                          {bidder && (
                            <Box mt="1">
                              <Text size="2" weight="medium" style={{ display: 'block' }}>
                                {bidder.first_name ? 
                                  `${bidder.first_name} ${bidder.last_name ? bidder.last_name.charAt(0) : ''}` : 
                                  'Anonymous'}
                              </Text>
                              {bidder.email && (
                                <Text size="1" color="gray" style={{ display: 'block', marginTop: '2px' }}>
                                  {bidder.email}
                                </Text>
                              )}
                              {bidder.phone && (
                                <Text size="1" color="gray" style={{ display: 'block', marginTop: '2px' }}>
                                  {bidder.phone}
                                </Text>
                              )}
                            </Box>
                          )}
                        </Box>
                        <Box style={{ textAlign: 'right' }}>
                          <Text size="4" weight="bold" style={{ display: 'block' }}>
                            ${Math.round(currentBid)}
                          </Text>
                          {bidInfo && (
                            <Text size="1" color="gray" style={{ display: 'block', marginTop: '4px' }}>
                              {bidInfo.bidCount} bid{bidInfo.bidCount !== 1 ? 's' : ''}
                            </Text>
                          )}
                          {/* Payment status badges */}
                          {status === 'paid' && (
                            <Badge color="green" size="1" style={{ marginTop: '4px' }}>
                              {artwork.payment_statuses?.code === 'admin_paid' 
                                ? `✓ MARKED PAID BY ${artwork.payment_logs?.find(log => log.payment_type === 'admin_marked')?.admin_phone || 'ADMIN'}`
                                : artwork.payment_statuses?.code === 'stripe_paid' 
                                ? '✓ PAID via STRIPE' 
                                : '✓ PAID'}
                            </Badge>
                          )}
                          {status === 'sold' && !artwork.buyer_pay_recent_status_id && (
                            <Badge color="orange" size="1" style={{ marginTop: '4px' }}>
                              AWAITING PAYMENT
                            </Badge>
                          )}
                          {timeDisplay && (
                            <Text size="1" color={status === 'active' ? 'red' : 'gray'}>
                              {timeDisplay}
                            </Text>
                          )}
                        </Box>
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
          artist_id,
          artist_profiles (
            id,
            name,
            entry_id
          )
        `)
        .eq('event_id', eventId)
        .not('artist_id', 'is', null)  // Only show artworks with artists assigned
        .order('round')
        .order('easel');

      if (artworksError) throw artworksError;

      // Get art IDs and payment status IDs
      const artIds = artworksData?.map(a => a.id) || [];
      const paymentStatusIds = artworksData?.map(a => a.buyer_pay_recent_status_id).filter(Boolean) || [];

      // Fetch payment statuses
      let paymentStatusesData = [];
      if (paymentStatusIds.length > 0) {
        const { data: statusData } = await supabase
          .from('payment_statuses')
          .select('id, code, description')
          .in('id', paymentStatusIds);
        paymentStatusesData = statusData || [];
      }

      // Fetch payment logs
      const { data: paymentLogsData } = await supabase
        .from('payment_logs')
        .select('art_id, admin_phone, metadata, created_at, payment_type')
        .in('art_id', artIds);

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

      // Fetch all bids with bidder info
      const { data: bidsData } = await supabase
        .from('bids')
        .select(`
          art_id, 
          amount,
          created_at,
          person_id,
          people!bids_person_id_fkey (
            name,
            first_name,
            last_name,
            nickname,
            email,
            phone
          )
        `)
        .in('art_id', artIds)
        .order('created_at', { ascending: false });

      // Group bids by artwork and find highest bid
      const bidsByArt = {};
      if (bidsData) {
        bidsData.forEach(bid => {
          if (!bidsByArt[bid.art_id]) {
            bidsByArt[bid.art_id] = {
              highestBid: bid.amount,
              highestBidder: bid.people,
              bidCount: 0,
              history: []
            };
          }
          // Update highest bid if this one is higher
          if (bid.amount > bidsByArt[bid.art_id].highestBid) {
            bidsByArt[bid.art_id].highestBid = bid.amount;
            bidsByArt[bid.art_id].highestBidder = bid.people;
          }
          bidsByArt[bid.art_id].bidCount++;
          bidsByArt[bid.art_id].history.push({
            amount: bid.amount,
            created_at: bid.created_at,
            bidder: bid.people
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

      setAuctionArtworks(artworksWithAllData);
      setAuctionBids(bidsByArt);
    } catch (error) {
      console.error('Error fetching auction data:', error);
    }
  };

  const fetchAuctionTimerStatus = async () => {
    try {
      const { data, error } = await supabase
        .rpc('get_auction_timer_status', { p_event_id: eventId });
      
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

  const handleTimerAction = async (action, duration = 12) => {
    setTimerActionLoading(true);
    try {
      console.log('Timer action:', action, 'Duration:', duration, 'Event ID:', eventId, 'Event ID type:', typeof eventId);
      
      if (!eventId) {
        throw new Error('Event ID is missing');
      }
      
      const { data, error } = await supabase
        .rpc('manage_auction_timer', {
          p_event_id: eventId,
          p_action: action,
          p_duration_minutes: duration,
          p_admin_phone: null // Optional parameter
        });
      
      console.log('Timer RPC response:', { data, error });
      if (error) {
        console.error('RPC Error details:', error);
        throw error;
      }
      
      if (data?.success) {
        showAdminMessage('success', data.message + (data.sms_sent ? ` (${data.sms_sent} SMS notifications sent)` : ''));
        await fetchAuctionTimerStatus();
        await fetchAuctionData();
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

  const fetchEventAdmins = async () => {
    try {
      // Use a manual JOIN since we can't enforce foreign key due to orphaned phone numbers
      const { data, error } = await supabase.rpc('get_event_admins_with_people', {
        p_event_id: eventId
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

  return (
    <Box>
      <Heading size="4" mb="4">Admin Controls</Heading>
      
      {/* Admin Mode Tabs */}
      <Tabs.Root value={adminMode} onValueChange={setAdminMode}>
        <Tabs.List size="1" mb="4">
          <Tabs.Trigger value="artists">Artists</Tabs.Trigger>
          <Tabs.Trigger value="rounds">Rounds</Tabs.Trigger>
          <Tabs.Trigger value="voting" style={{ color: 'var(--purple-11)' }}>Voting</Tabs.Trigger>
          <Tabs.Trigger value="auction">Auction</Tabs.Trigger>
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
                          <Text size="1" color="gray">• ID: {artist.entry_id || 'N/A'}</Text>
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
                            <Text size="2" weight="medium">{artist.name}</Text>
                            <Flex gap="2" align="center">
                              <Text size="1" color="gray">{artist.city_text}</Text>
                              {artist.entry_id && <Text size="1" color="gray">• ID: {artist.entry_id}</Text>}
                            </Flex>
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
                  <Heading size="3" mb="3">Round {round.roundNumber}</Heading>
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
              // Add round in frontend state only
              const maxRoundNumber = rounds.length > 0 
                ? Math.max(...rounds.map(r => r.roundNumber)) 
                : 0;
              
              const newRound = {
                id: `temp-round-${maxRoundNumber + 1}`,
                roundNumber: maxRoundNumber + 1,
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
            {/* Auction Timer */}
            <Card size="2" data-auction-timer>
              <Heading size="3" mb="3">Auction Timer</Heading>
              <Text size="2" color="gray" style={{ display: 'block', marginBottom: '1rem' }}>
                Artworks close individually and may vary in close time based on bidding action
              </Text>
              
              {/* Timer Status */}
              {auctionTimerStatus && auctionTimerStatus.timer_active ? (
                <Box>
                  <Text size="6" weight="bold" style={{ display: 'block', marginBottom: '0.5rem' }}>
                    {(() => {
                      const timeLeft = Math.max(0, auctionEndTime - localTime);
                      const minutes = Math.floor(timeLeft / 60000);
                      const seconds = Math.floor((timeLeft % 60000) / 1000);
                      return `${minutes}:${seconds.toString().padStart(2, '0')}`;
                    })()}
                  </Text>
                  <Text size="2" color="gray" style={{ display: 'block', marginBottom: '0.5rem' }}>
                    Earliest closing: {auctionTimerStatus.earliest_closing ? new Date(auctionTimerStatus.earliest_closing).toLocaleTimeString() : 'N/A'}
                  </Text>
                  <Text size="2" color="gray" style={{ display: 'block', marginBottom: '1rem' }}>
                    {auctionTimerStatus.artworks_with_timers} artwork{auctionTimerStatus.artworks_with_timers !== 1 ? 's' : ''} with active timers
                  </Text>
                  
                  <Flex gap="2" wrap="wrap">
                    <Button 
                      size="2" 
                      variant="soft"
                      onClick={() => handleTimerAction('extend')}
                      disabled={timerActionLoading}
                    >
                      +5 min (All)
                    </Button>
                    <Button 
                      size="2" 
                      variant="soft" 
                      color="orange"
                      onClick={() => handleTimerAction('cancel')}
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
                      Close Auction Now
                    </Button>
                  </Flex>
                </Box>
              ) : (
                <Box>
                  <Text size="2" color="gray" style={{ display: 'block', marginBottom: '1rem' }}>
                    No active auction timers
                  </Text>
                  
                  {/* Auction Statistics */}
                  <Flex direction="column" gap="2" mb="3">
                    <Text size="3" weight="bold" style={{ display: 'block' }}>
                      Auction Statistics
                    </Text>
                    <Grid columns="3" gap="4" style={{ maxWidth: '400px' }}>
                      <Box>
                        <Text size="3" weight="bold" style={{ display: 'block', color: 'var(--blue-11)' }}>
                          {auctionArtworks.length}
                        </Text>
                        <Text size="1" color="gray">Artworks</Text>
                      </Box>
                      <Box>
                        <Text size="3" weight="bold" style={{ display: 'block', color: 'var(--green-11)' }}>
                          {Object.keys(auctionBids).length}
                        </Text>
                        <Text size="1" color="gray">With Bids</Text>
                      </Box>
                    </Grid>
                  </Flex>
                  
                  {/* 12min auction button - only show if there are active artworks with artists that don't have timers */}
                  {auctionArtworks.filter(a => a.artist_id && a.status === 'active' && !a.closing_time).length > 0 && (
                    <Flex gap="2" mt="3">
                      <Button 
                        size="2" 
                        variant="solid"
                        onClick={() => handleTimerAction('start', 12)}
                        disabled={timerActionLoading}
                      >
                        Start 12min Auction
                      </Button>
                      <Text size="1" color="gray" style={{ alignSelf: 'center' }}>
                        Note: Button may have errors - investigate if issues occur
                      </Text>
                    </Flex>
                  )}
                </Box>
              )}
              
              {timerActionLoading && (
                <Text size="2" color="gray" style={{ display: 'block', marginTop: '0.5rem' }}>
                  Processing...
                </Text>
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
            <Heading size="4" mb="4">Voting Analytics</Heading>
            <Flex direction="column" gap="4">
              {Object.entries(artworksByRound).map(([round, artworks]) => {
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
                      {Object.values(artworksByRound).flat().reduce((sum, a) => sum + (a.totalVoteWeight || 0), 0).toFixed(2)}
                    </Text>
                    <Text size="2" color="gray">
                      {Object.values(artworksByRound).flat().reduce((sum, a) => sum + (a.vote_count || 0), 0)} total votes
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
                              admin.admin_level === 'auction' ? 'blue' : 
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
                            <Select.Item value="auction">Auction</Select.Item>
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
                              // Check if admin already exists
                              const { data: existing } = await supabase
                                .from('event_admins')
                                .select('id')
                                .eq('event_id', eventId)
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
      </Tabs.Root>
      
      {/* Artist Selection Dialog */}
      <Dialog.Root open={!!selectedEasel} onOpenChange={() => setSelectedEasel(null)}>
        <Dialog.Content style={{ maxWidth: '90vw', width: 450 }}>
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
                      const { data: artData } = await supabase
                        .from('art')
                        .select('id, vote_count, bid_count')
                        .eq('event_id', eventId)
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
                      
                      const { data: newRound, error: createError } = await supabase
                        .from('rounds')
                        .insert({
                          event_id: eventId,
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
                  <Select.Content>
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
                    
                    // Remove artist from event_artists table
                    const { error } = await supabase
                      .from('event_artists')
                      .delete()
                      .eq('event_id', eventId)
                      .eq('artist_id', deleteConfirm.artist.id);
                    
                    if (error) {
                      console.error('Error removing from event_artists:', error);
                      throw error;
                    }
                    console.log('Successfully removed from event_artists');
                    fetchEventData();
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
                    console.log('fetchEventData completed after easel removal');
                  } else if (deleteConfirm?.type === 'artist') {
                    // First, check if art record exists for this round/easel
                    const { data: artData, error: artCheckError } = await supabase
                      .from('art')
                      .select('id, art_code')
                      .eq('event_id', eventId)
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
                  // Format phone number as user types
                  let value = e.target.value.replace(/\D/g, '');
                  if (value.length > 0 && !value.startsWith('1')) {
                    value = '1' + value;
                  }
                  // Limit to 11 digits (1 + 10 digit phone)
                  value = value.slice(0, 11);
                  
                  // Format for display
                  let formatted = value;
                  if (value.length > 1) {
                    formatted = '+' + value;
                    if (value.length > 1) {
                      formatted = `+${value.slice(0, 1)} `;
                      if (value.length > 4) {
                        formatted += `(${value.slice(1, 4)}) `;
                        if (value.length > 7) {
                          formatted += `${value.slice(4, 7)}-${value.slice(7)}`;
                        } else {
                          formatted += value.slice(4);
                        }
                      } else {
                        formatted += value.slice(1);
                      }
                    }
                  }
                  
                  setNewArtist(prev => ({ ...prev, phone: formatted }));
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
                Must be a valid North American phone number
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
                  const phoneDigits = newArtist.phone.replace(/\D/g, '');
                  if (phoneDigits.length !== 11 || !phoneDigits.startsWith('1')) {
                    alert('Please enter a valid North American phone number');
                    return;
                  }
                  
                  // Create artist profile
                  const { data: artist, error } = await supabase
                    .from('artist_profiles')
                    .insert({
                      name: newArtist.name.trim(),
                      phone: '+' + phoneDigits,
                      email: newArtist.email.trim() || null,
                      city_text: newArtist.city_text.trim() || null,
                      instagram: newArtist.instagram.trim() || null
                    })
                    .select()
                    .single();
                  
                  if (error) throw error;
                  
                  // Add to event immediately
                  await addArtistToEvent(artist.id);
                  
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
              disabled={!newArtist.name.trim() || newArtist.phone.replace(/\D/g, '').length !== 11}
            >
              Create Artist
            </Button>
          </Flex>
        </Dialog.Content>
      </Dialog.Root>

      {/* Auction Item Detail Dialog */}
      <Dialog.Root open={!!selectedAuctionItem} onOpenChange={() => setSelectedAuctionItem(null)}>
        <Dialog.Content style={{ maxWidth: '90vw', width: 550 }}>
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
                {/* Artwork Image */}
                {selectedAuctionItem.media && selectedAuctionItem.media.length > 0 && (() => {
                  const imageUrls = getArtworkImageUrls(selectedAuctionItem, selectedAuctionItem.media[0]?.media_files);
                  const imageUrl = imageUrls.compressed || imageUrls.original || '/placeholder.jpg';
                  
                  return (
                    <Box style={{ width: '100%', maxHeight: '400px', overflow: 'hidden', borderRadius: '8px' }}>
                      <img 
                        src={imageUrl}
                        alt={`Artwork by ${selectedAuctionItem.artist_profiles?.name || 'Unknown Artist'}`}
                        style={{
                          width: '100%',
                          height: 'auto',
                          maxHeight: '400px',
                          objectFit: 'contain'
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
                          
                          // Use the admin function to ensure notifications are sent
                          const { data, error } = await supabase
                            .rpc('admin_update_art_status', {
                              p_art_code: selectedAuctionItem.art_code,
                              p_new_status: 'sold'
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
                            setSelectedAuctionItem(prev => ({ ...prev, status: 'sold' }));
                            
                            // Show more detailed message if there's a winner
                            if (data.winner) {
                              const smsStatus = data.sms_sent > 0 ? '\nPayment notification sent via SMS' : '';
                              alert(`Bidding closed successfully!\nWinner: ${data.winner.nickname || 'Winner'}\nAmount: $${data.winner.amount}\nTotal (incl tax): $${data.winner.total_with_tax}${smsStatus}`);
                            } else {
                              alert('Bidding closed successfully (no bids)');
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
                      selectedAuctionItem.buyer_pay_recent_status_id ? 'blue' :
                      selectedAuctionItem.status === 'sold' ? 'orange' :
                      selectedAuctionItem.status === 'active' ? 'green' :
                      'gray'
                    }>
                      {selectedAuctionItem.buyer_pay_recent_status_id ? 
                        (selectedAuctionItem.payment_statuses?.code === 'admin_paid' ? 
                          `MARKED PAID BY ${selectedAuctionItem.payment_logs?.find(log => log.payment_type === 'admin_marked')?.admin_phone || 'ADMIN'}` :
                         selectedAuctionItem.payment_statuses?.code === 'stripe_paid' ? 'PAID via STRIPE' : 'PAID') : 
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
                    <Flex justify="between">
                      <Text size="2" color="gray">Total Bids:</Text>
                      <Text size="2" weight="medium">
                        {auctionBids[selectedAuctionItem.id]?.bidCount || selectedAuctionItem.bid_count || 0}
                      </Text>
                    </Flex>
                  </Flex>
                </Card>

                {/* Highest Bidder Info */}
                {auctionBids[selectedAuctionItem.id]?.highestBidder && (
                  <Card size="2">
                    <Heading size="3" mb="3">Highest Bidder</Heading>
                    <Flex direction="column" gap="2">
                      <Text size="3" weight="medium" style={{ display: 'block' }}>
                        {auctionBids[selectedAuctionItem.id].highestBidder.first_name && 
                         auctionBids[selectedAuctionItem.id].highestBidder.last_name ? 
                          `${auctionBids[selectedAuctionItem.id].highestBidder.first_name} ${auctionBids[selectedAuctionItem.id].highestBidder.last_name}` : 
                          auctionBids[selectedAuctionItem.id].highestBidder.name || 
                          auctionBids[selectedAuctionItem.id].highestBidder.nickname || 
                          'Anonymous'}
                      </Text>
                      {auctionBids[selectedAuctionItem.id].highestBidder.email && (
                        <Text size="2" color="gray" style={{ display: 'block', marginTop: '4px' }}>
                          {auctionBids[selectedAuctionItem.id].highestBidder.email}
                        </Text>
                      )}
                      {auctionBids[selectedAuctionItem.id].highestBidder.phone && (
                        <Text size="2" color="gray" style={{ display: 'block', marginTop: '4px' }}>
                          {auctionBids[selectedAuctionItem.id].highestBidder.phone}
                        </Text>
                      )}
                    </Flex>
                  </Card>
                )}

                {/* Payment Status */}
                <Card size="2">
                  <Heading size="3" mb="3">Payment Status</Heading>
                  <Flex direction="column" gap="3">
                    {selectedAuctionItem.buyer_pay_recent_status_id ? (
                      <Box>
                        <Badge size="2" color="blue" mb="2">
                          {selectedAuctionItem.payment_statuses?.code === 'admin_paid' ? 
                            `MARKED PAID BY ${selectedAuctionItem.payment_logs?.find(log => log.payment_type === 'admin_marked')?.admin_phone || 'ADMIN'}` :
                           selectedAuctionItem.payment_statuses?.code === 'stripe_paid' ? 'PAID via STRIPE' : 'PAID'}
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
                              <Text size="2" color="gray">
                                Admin Phone: {selectedAuctionItem.payment_logs.find(log => log.payment_type === 'admin_marked').admin_phone}
                              </Text>
                              {selectedAuctionItem.payment_logs.find(log => log.payment_type === 'admin_marked').metadata && (
                                <Text size="1" color="gray" style={{ fontFamily: 'monospace', marginTop: '4px' }}>
                                  {JSON.stringify(selectedAuctionItem.payment_logs.find(log => log.payment_type === 'admin_marked').metadata, null, 2)}
                                </Text>
                              )}
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
                            onClick={async () => {
                              try {
                                // Mark as paid using admin function
                                const { data, error } = await supabase
                                  .rpc('admin_update_art_status', {
                                    p_art_code: selectedAuctionItem.art_code,
                                    p_new_status: 'paid',
                                    p_admin_phone: user?.phone
                                  });

                                if (error) throw error;

                                if (data?.success) {
                                  // Refresh auction data
                                  fetchAuctionData();
                                  setSelectedAuctionItem(null);
                                  alert(`Marked as paid successfully by ${user?.phone || 'admin'}`);
                                } else {
                                  throw new Error(data?.error || 'Failed to mark as paid');
                                }
                              } catch (error) {
                                console.error('Error marking as paid:', error);
                                alert('Failed to mark as paid: ' + error.message);
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
                        <Flex key={index} justify="between" align="center">
                          <Box>
                            <Text size="2" style={{ display: 'block' }}>
                              {bid.bidder?.first_name ? 
                                `${bid.bidder.first_name} ${bid.bidder.last_name ? bid.bidder.last_name.charAt(0) : ''}` : 
                                'Anonymous'}
                            </Text>
                            {bid.bidder?.email && (
                              <Text size="1" color="gray" style={{ display: 'block', marginTop: '2px' }}>
                                {bid.bidder.email}
                              </Text>
                            )}
                            {bid.bidder?.phone && (
                              <Text size="1" color="gray" style={{ display: 'block', marginTop: '2px' }}>
                                {bid.bidder.phone}
                              </Text>
                            )}
                            <Text size="1" color="gray">
                              {new Date(bid.created_at).toLocaleString()}
                            </Text>
                          </Box>
                          <Text size="2" weight="medium">
                            ${Math.round(bid.amount)}
                          </Text>
                        </Flex>
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
    </Box>
  );
};

export default AdminPanel;
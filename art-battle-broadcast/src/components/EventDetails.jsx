import { useState, useEffect, useRef, lazy, Suspense } from 'react';
import { 
  getCurrencyFromEvent, 
  formatCurrencyFromEvent, 
  formatMinimumBidText 
} from '../utils/currency';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Container,
  Heading,
  Text,
  Card,
  Flex,
  Box,
  Button,
  Badge,
  IconButton,
  Separator,
  Callout,
  Grid,
  Dialog,
  AlertDialog,
  Spinner,
  Tabs,
} from '@radix-ui/themes';
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  HeartIcon,
  HeartFilledIcon,
  InfoCircledIcon,
  Cross2Icon,
  ExclamationTriangleIcon,
  CameraIcon,
  PlusIcon,
  MinusIcon,
} from '@radix-ui/react-icons';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import publicDataManager from '../lib/PublicDataManager';
import { useBroadcastCache } from '../hooks/useBroadcastCache';
import LoadingScreen from './LoadingScreen';
import { getImageUrl, getArtworkImageUrls } from '../lib/imageHelpers';
// V2 BROADCAST: Perfect cache invalidation system

// Import AdminPanel directly for now
import AdminPanel from './AdminPanel';

// Import ArtUpload directly to avoid lazy loading issues
import ArtUpload from './ArtUpload';

// Import bidder info components
import BidderInfoModal from './BidderInfoModal';
import { isBuyerInfoMissing, getBuyerInfoStatus, extractUserPhone } from '../utils/buyerInfoHelpers';

// Import ArtistsList component
import ArtistsList from './ArtistsList';
// Import PaymentButton for Stripe payments
import PaymentButton from './PaymentButton';

const EventDetails = () => {
  const { eventId, tab } = useParams();
  const navigate = useNavigate();
  
  const { user, person, loading: authLoading } = useAuth();
  const [event, setEvent] = useState(null);
  const [eventEid, setEventEid] = useState(null); // EID for broadcast subscription
  const [artworks, setArtworks] = useState([]);
  const [selectedArt, setSelectedArt] = useState(null);
  const [selectedImageIndex, setSelectedImageIndex] = useState(0);
  const [votedArtIds, setVotedArtIds] = useState(new Set());
  const [votedRounds, setVotedRounds] = useState({}); // { round: artId }
  const [bidAmounts, setBidAmounts] = useState({});
  const [currentBids, setCurrentBids] = useState({});
  const [bidHistory, setBidHistory] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [artworksByRound, setArtworksByRound] = useState({});
  const [voteError, setVoteError] = useState('');
  const [bidError, setBidError] = useState('');
  const [bidSuccess, setBidSuccess] = useState(false);
  const [confirmVote, setConfirmVote] = useState(null);
  const [votingInProgress, setVotingInProgress] = useState(false);
  
  // Bidder info modal state
  const [showBidderInfoModal, setShowBidderInfoModal] = useState(false);
  const [bidderInfoModalData, setBidderInfoModalData] = useState(null);
  // Removed session-based bidderInfoCompleted - now checks server each time
  const [voteSuccess, setVoteSuccess] = useState(false);
  const [voteFactor, setVoteFactor] = useState(null);
  const [currentTime, setCurrentTime] = useState(Date.now());
  const [roundWinners, setRoundWinners] = useState({});
  const [adminTabLoaded, setAdminTabLoaded] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [hasPhotoPermission, setHasPhotoPermission] = useState(false);
  const [voteWeights, setVoteWeights] = useState({});
  const [confirmBid, setConfirmBid] = useState(null);
  const [biddingInProgress, setBiddingInProgress] = useState(false);
  const [confirmDeleteImage, setConfirmDeleteImage] = useState(null); // For image deletion confirmation
  const [autoPaymentModal, setAutoPaymentModal] = useState(null); // For automatic payment modal
  const [paymentModalChecked, setPaymentModalChecked] = useState(false); // Prevent duplicate modals
  const [voteSummary, setVoteSummary] = useState([]); // V2 BROADCAST: Vote summary from cached data
  const [bidRanges, setBidRanges] = useState({}); // V2 BROADCAST: Bid ranges from cached data
  const [offerNotification, setOfferNotification] = useState(null); // Global offer notifications
  
  // V2 BROADCAST: Perfect cache invalidation system
  const { clearEventCache } = useBroadcastCache(
    eventEid, // Use EID for broadcast subscription, not UUID
    async (notificationData) => {
      console.log(`🔄 [V2-BROADCAST] Refreshing data after cache invalidation:`, notificationData);
      console.log(`🔄 [V2-BROADCAST] Invalidated endpoints:`, notificationData.endpoints);
      
      // Use surgical updates instead of full fetchEventDetails() to avoid constant reloading
      console.log(`🔄 [V2-BROADCAST] Processing surgical updates for invalidated endpoints`);
      
      try {
        // Only re-fetch specific endpoints that were invalidated with coordinated cache-busting
        if (notificationData.endpoints && notificationData.endpoints.length > 0) {
          const cacheVersion = notificationData.cache_version || Date.now();
          
          for (const endpoint of notificationData.endpoints) {
            console.log(`🎯 [V2-BROADCAST] Re-fetching invalidated endpoint: ${endpoint}`);
            
            try {
              // Use coordinated cache-busting from broadcast payload for ALL endpoints
              const fullUrl = `https://artb.art${endpoint}?v=${cacheVersion}`;
              console.log(`🔄 [V2-BROADCAST] Cache-busting with version: ${cacheVersion}`);
              const response = await fetch(fullUrl);
              
              if (response.ok) {
                const data = await response.json();
                
                // Handle different endpoint types
                if (endpoint.includes('/bids')) {
                  // Handle bid endpoint updates
                  const match = endpoint.match(/\/live\/event\/[^-]+-(\d+)-(\d+)\/bids/);
                  if (match && artworks.length > 0) {
                    const round = parseInt(match[1]);
                    const easel = parseInt(match[2]);
                    const targetArtwork = artworks.find(art => art.round === round && art.easel === easel);
                    
                    if (targetArtwork) {
                      const topBid = data.bids[0]?.amount || 0;
                      console.log(`💰 Bid update: ${data.bids.length} bids, top: $${topBid}`);
                      setBidHistory(prev => ({
                        ...prev,
                        [targetArtwork.id]: data.bids
                      }));
                      
                      // Also update currentBids to reflect new highest bid
                      setCurrentBids(prev => ({
                        ...prev,
                        [targetArtwork.id]: {
                          amount: topBid,
                          count: data.bids.length,
                          time: data.bids[0]?.created_at
                        }
                      }));
                    }
                  }
                } else if (endpoint.includes('/media')) {
                  // Handle media endpoint updates
                  console.log(`📸 Refreshing media data for event ${eventEid}`);
                  
                  // Update media data specifically when media endpoint is invalidated
                  if (data && data.media && Array.isArray(data.media)) {
                    console.log(`📸 Media update: ${data.media.length} artworks`);
                    
                    // Process media data by artwork (same logic as in fetchEventDetails)
                    const mediaByArt = {};
                    data.media.forEach((item, index) => {
                      const artId = item.artwork_id;
                      
                      if (item.media && Array.isArray(item.media)) {
                        // Convert media format to match initial load format
                        mediaByArt[artId] = item.media.map(mediaItem => ({
                          ...mediaItem,
                          media_files: mediaItem.media_files
                        }));
                      }
                    });
                    
                    console.log(`📸 Updated media for ${Object.keys(mediaByArt).length} artworks`);
                    
                    // Update artworks with new media data
                    setArtworks(prevArtworks => {
                      const updated = prevArtworks.map(artwork => ({
                        ...artwork,
                        media: mediaByArt[artwork.id] || artwork.media || []
                      }));
                      
                      // CRITICAL: Also update selectedArt if it's currently open
                      if (selectedArt && mediaByArt[selectedArt.id]) {
                        const updatedSelectedArt = {
                          ...selectedArt,
                          media: mediaByArt[selectedArt.id]
                        };
                        setSelectedArt(updatedSelectedArt);
                      }
                      
                      // CRITICAL: Also update artworksByRound for main grid display
                      const regrouped = updated.reduce((acc, artwork) => {
                        const round = artwork.round || 1;
                        if (!acc[round]) {
                          acc[round] = [];
                        }
                        acc[round].push(artwork);
                        return acc;
                      }, {});
                      setArtworksByRound(regrouped);
                      
                      return updated;
                    });
                  } else {
                    console.log(`⚠️ [DEBUG] No media data in response:`, data);
                  }
                } else if (endpoint.match(/\/live\/event\/[^\/]+$/)) {
                  // Handle main event endpoint updates (votes, artwork changes, artist assignments)
                  console.log(`✅ [V2-BROADCAST] Updating main event data from broadcast`);
                  
                  // Update main event data surgically instead of full reload
                  if (data && data.event) {
                    setEvent(data.event);
                    console.log(`✅ [V2-BROADCAST] Updated event data surgically`);
                  }
                  if (data && data.artworks) {
                    // CRITICAL: Preserve existing media data when updating artworks
                    setArtworks(prevArtworks => {
                      const updatedArtworks = data.artworks.map(newArtwork => {
                        // Find existing artwork to preserve its media data
                        const existingArtwork = prevArtworks.find(prev => prev.id === newArtwork.id);
                        return {
                          ...newArtwork,
                          // Preserve existing media data if it exists, otherwise use empty array
                          media: existingArtwork?.media || []
                        };
                      });
                      
                      console.log(`🔄 [V2-BROADCAST] About to regroup ${updatedArtworks.length} artworks by rounds (preserving media)...`);
                      
                      // CRITICAL: Also update artworksByRound when artworks change (for artist assignments)
                      try {
                        const regrouped = updatedArtworks.reduce((acc, artwork) => {
                          const round = artwork.round || 1;
                          if (!acc[round]) {
                            acc[round] = [];
                          }
                          acc[round].push(artwork);
                          return acc;
                        }, {});
                        
                        console.log(`🔄 [V2-BROADCAST] Regrouping complete, setting artworksByRound...`);
                        setArtworksByRound(regrouped);
                        
                        console.log(`✅ [V2-BROADCAST] Updated ${updatedArtworks.length} artworks and regrouped by rounds surgically (media preserved):`, Object.keys(regrouped).map(r => `Round ${r}: ${regrouped[r].length} artworks`));
                      } catch (error) {
                        console.error(`❌ [V2-BROADCAST] Error during regrouping:`, error);
                      }
                      
                      return updatedArtworks;
                    });
                  } else {
                    console.warn(`⚠️ [V2-BROADCAST] No artworks data in response or data is null:`, data);
                  }
                }
              } else {
                console.warn(`⚠️ [V2-BROADCAST] Failed to fetch ${fullUrl}: ${response.status}`);
              }
            } catch (error) {
              console.error(`❌ [V2-BROADCAST] Error fetching ${endpoint}:`, error);
            }
          }
        }
      } catch (error) {
        console.error(`❌ [V2-BROADCAST] Failed to refresh data:`, error);
      }
    },
    {
      autoRefresh: true,
      refreshDelay: 2000, // 2 second delay to batch multiple notifications
      debugMode: true // Enable debug logging to troubleshoot media broadcasts
    }
  );
  
  // Initialize activeTab from hash or tab parameter
  const getInitialTab = () => {
    const hash = window.location.hash.replace('#', '');
    return tab || hash || 'vote';
  };
  const [activeTab, setActiveTab] = useState(getInitialTab());
  const countdownInterval = useRef(null);
  

  useEffect(() => {
    console.log('EventDetails useEffect triggered - eventId:', eventId, 'authLoading:', authLoading);
    // Wait for auth to finish loading before fetching event data
    // This prevents race conditions and loading loops
    if (!authLoading && eventId) {
      console.log('EventDetails: Auth ready, starting event data fetch');
      fetchEventDetails();
    }
  }, [eventId, authLoading]);

  // Handle tab parameter from URL hash and authentication check
  useEffect(() => {
    // Check for tab in URL hash (from redirect)
    const hash = window.location.hash.replace('#', '');
    const tabFromUrl = tab || hash;
    
    // Don't do authentication checks if auth is still loading
    if (user === null) {
      return;
    }
    
    // Only redirect to login for restricted tabs when not authenticated
    if (tabFromUrl && !user && (tabFromUrl === 'admin' || tabFromUrl === 'auction')) {
      navigate('/');
    } else if (tabFromUrl) {
      // Update active tab if specified in URL
      setActiveTab(tabFromUrl);
    }
  }, [tab, user, navigate]);

  // Also listen for hash changes after navigation and handle initial load
  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash.replace('#', '');
      if (hash && hash !== activeTab) {
        setActiveTab(hash);
      }
    };

    window.addEventListener('hashchange', handleHashChange);
    
    // Force check hash on initial load with a small delay to ensure DOM is ready
    setTimeout(() => {
      const hash = window.location.hash.replace('#', '');
      if (hash && hash !== activeTab) {
        setActiveTab(hash);
      }
    }, 100);

    return () => window.removeEventListener('hashchange', handleHashChange);
  }, [activeTab]);

  // V2 BROADCAST: No subscription management needed - data loads on demand

  // V2 BROADCAST: Data loads on demand via cached endpoints - no subscriptions needed

  useEffect(() => {
    // Check admin permissions from database
    const checkAdminStatus = async () => {
      if (!user || !eventId) {
        setIsAdmin(false);
        setHasPhotoPermission(false);
        return;
      }
      
      try {
        const { isEventAdmin, checkEventAdminPermission } = await import('../lib/adminHelpers');
        const adminStatus = await isEventAdmin(eventId, user);
        setIsAdmin(adminStatus);
        
        // Check if user has photo permission or higher (photo, producer, super)
        const photoPermission = await checkEventAdminPermission(eventId, 'photo', user?.phone);
        setHasPhotoPermission(photoPermission);
      } catch (error) {
        console.error('Error checking admin status:', error);
        setIsAdmin(false);
        setHasPhotoPermission(false);
      }
    };
    
    checkAdminStatus();
  }, [user, eventId]);

  useEffect(() => {
    if (person) {
      fetchUserVotes();
    }
  }, [person, eventId]);

  // Update current time for countdown and check for expired timers
  useEffect(() => {
    let lastExpiredCheck = new Set();
    
    countdownInterval.current = setInterval(() => {
      const now = Date.now();
      setCurrentTime(now);
      
      // Check for newly expired auctions
      const currentlyExpired = new Set();
      artworks.forEach(artwork => {
        if (artwork.closing_time) {
          const closeTime = new Date(artwork.closing_time);
          const diffMs = closeTime - now;
          if (diffMs <= 0 && artwork.status === 'active') {
            currentlyExpired.add(artwork.id);
          }
        }
      });
      
      // If we have newly expired timers, log them (V2 broadcast will handle updates automatically)
      const newlyExpired = [...currentlyExpired].filter(id => !lastExpiredCheck.has(id));
      if (newlyExpired.length > 0) {
        console.log('Detected newly expired auctions (V2 broadcast will handle updates):', newlyExpired);
        // V2 BROADCAST: No manual refresh needed - broadcast system handles all real-time updates
      }
      
      lastExpiredCheck = currentlyExpired;
    }, 1000);

    return () => {
      if (countdownInterval.current) {
        clearInterval(countdownInterval.current);
      }
    };
  }, [artworks]);

  // Check for auto payment modal when all dependencies are ready
  useEffect(() => {
    if (person && artworks.length > 0 && currentBids && Object.keys(currentBids).length > 0 && !paymentModalChecked) {
      // Auto payment modal check (production-ready) - uses event-level data now
      checkForAutoPaymentModal();
      setPaymentModalChecked(true);
    }
  }, [person, artworks, currentBids, paymentModalChecked]);

  // Global offer notification handler for all artworks in the event
  useEffect(() => {
    if (!person || !eventId || !artworks.length) {
      return;
    }

    console.log('🎯 [EVENT-OFFERS] Setting up global offer listeners for event');

    // Create a channel for all artwork offers in this event
    const channelName = `event_offers_${eventId}_${person.id}`;
    const channel = supabase.channel(channelName);

    // Listen for offer changes for any artwork in this event
    channel.on('postgres_changes', {
      event: 'INSERT',
      schema: 'public',
      table: 'artwork_offers',
      filter: `offered_to_person_id=eq.${person.id}`
    }, (payload) => {
      console.log('🎯 [EVENT-OFFERS] New offer received:', payload);

      const offer = payload.new;
      const artwork = artworks.find(art => art.id === offer.art_id);

      if (artwork) {
        // Show global notification for new offers
        setOfferNotification({
          type: 'new_offer',
          artwork: artwork,
          offer: offer,
          timestamp: Date.now()
        });

        // Auto-dismiss after 15 seconds
        setTimeout(() => {
          setOfferNotification(prev =>
            prev?.timestamp === Date.now() ? null : prev
          );
        }, 15000);

        // Also trigger auto payment modal if not already shown
        if (artwork.status === 'sold' && !autoPaymentModal) {
          setAutoPaymentModal(artwork);
        }
      }
    });

    // Subscribe to channel
    channel.subscribe((status) => {
      console.log(`🎯 [EVENT-OFFERS] Channel status: ${status}`);
    });

    // Cleanup
    return () => {
      console.log('🎯 [EVENT-OFFERS] Cleaning up global offer listeners');
      supabase.removeChannel(channel);
    };
  }, [person?.id, eventId, artworks, autoPaymentModal]);

  const fetchEventDetails = async () => {
    try {
      console.log('EventDetails: Starting fetchEventDetails for eventId:', eventId);
      setLoading(true);
      setError(null);

      // V2 BROADCAST VERSION: Get ALL data from cached endpoints (no direct Supabase queries)
      try {
        console.log('🌐 [V2-BROADCAST] Fetching event data from cached endpoint');
        
        // First try to determine EID from eventId parameter
        let eid = eventId;
        
        // If eventId looks like a UUID, we need to find the EID
        if (eventId.length === 36 && eventId.includes('-')) {
          console.log('🔍 [V2-BROADCAST] EventId appears to be UUID, need to resolve EID...');
          // For now, we'll need to get this from the events list or make this work differently
          // But let's try the cached endpoint directly with the UUID
          eid = eventId; // Keep as is for now, the endpoint should handle UUID->EID mapping
        } else {
          console.log('🌐 [V2-BROADCAST] EventId appears to be EID:', eid);
        }
        
        const cachedData = await publicDataManager.getEventWithVersions(eid);
        console.log('🌐 [V2-BROADCAST] Versioned event data received:', cachedData ? 'SUCCESS' : 'FAILED');
        console.log('🌐 [V2-BROADCAST] Artworks in cache:', cachedData?.artworks?.length || 0);

        if (cachedData?.event) {
          // Set event data from cached endpoint
          setEvent(cachedData.event);
          setEventEid(cachedData.event.eid); // Store EID for broadcast subscription
          console.log('🌐 [V2-BROADCAST] Event EID from cache:', cachedData.event.eid);
        }
        
        if (cachedData?.artworks && cachedData.artworks.length > 0) {
          console.log('✅ [V2-BROADCAST] EventDetails: Loading artwork data from cached endpoints');
          
          // Media data is now included in the versioned response
          console.log('🌐 [V2-BROADCAST] Processing media data from versioned response');
          const mediaData = cachedData.media;
          
          // Process media data by artwork
          const mediaByArt = {};
          if (mediaData && mediaData.media) {
            mediaData.media.forEach(item => {
              const artId = item.artwork_id;
              // The API now returns item.media as an array of media objects (newest first)
              if (item.media && Array.isArray(item.media)) {
                mediaByArt[artId] = item.media; // Already sorted newest first by API
              }
            });
          }

          // Enhance cached artworks with media data
          const enhancedArtworks = cachedData.artworks.map(artwork => ({
            ...artwork,
            media: mediaByArt[artwork.id] || []
          }));

          // Process artworks by round
          const grouped = {};
          enhancedArtworks.forEach((artwork) => {
            const round = artwork.round || 1;
            if (!grouped[round]) {
              grouped[round] = [];
            }
            grouped[round].push(artwork);
          });

          setArtworksByRound(grouped);
          setArtworks(enhancedArtworks);
          
          // Set current bids from cached event data
          if (cachedData.current_bids) {
            const bidsByArt = {};
            cachedData.current_bids.forEach(bid => {
              bidsByArt[bid.art_id] = {
                amount: bid.current_bid,
                count: bid.bid_count || 0,
                time: bid.bid_time,
                buyer_person_id: bid.buyer_person_id, // Include buyer info for payment modal
                closing_time: bid.closing_time
              };
            });
            setCurrentBids(bidsByArt);
          }
          
          // Set vote summary from cached event data
          if (cachedData.vote_summary) {
            setVoteSummary(cachedData.vote_summary.map(vote => {
              return {
                artId: vote.art_id,
                artCode: vote.art_code,
                artistName: vote.artist_name,
                totalWeight: vote.weighted_vote_total || 0,
                voteCount: vote.raw_vote_count || 0
              };
            }));
          }

          // Set round winners from cached event data
          if (cachedData.round_winners) {
            setRoundWinners(cachedData.round_winners);
            console.log('✅ [V2-BROADCAST] Round winners loaded from cached endpoint');
          }
          
          console.log('✅ [V2-BROADCAST] EventDetails: Enhanced with cached data - bid history loads on demand');
          
          // No longer need to auto-load bid history - using event-level data now
          
          return; // Exit early with cached data - NO FALLBACKS
        }
      } catch (cachedError) {
        console.error('❌ [V2-BROADCAST] CRITICAL: Cached endpoints failed:', cachedError);
        // Check if it's a 429 rate limit error and provide friendly message
        if (cachedError.message && cachedError.message.includes('429')) {
          throw new Error('Oops! Too much refreshing. Please try again in a few minutes.');
        }
        throw new Error('API endpoints unavailable. This is a broadcast-only version that requires cached endpoints.');
      }

      // SECURITY: ALL DATA LOADING FROM CACHED ENDPOINTS ONLY
      // No fallback database queries allowed in broadcast version
    } catch (error) {
      console.error('Error fetching event details:', error);
      setError(error.message);
    } finally {
      setLoading(false);
    }
  };

  // V2 BROADCAST: Background refresh function removed - V2 broadcast system handles all real-time updates automatically

  // Check if user needs to see automatic payment modal
  const checkForAutoPaymentModal = () => {
    // Don't show payment modal for events before August 1, 2025
    const eventDate = event?.event_start_datetime ? new Date(event.event_start_datetime) : null;
    const cutoffDate = new Date('2025-08-01T00:00:00Z');
    const isOlderEvent = eventDate && eventDate < cutoffDate;
    if (isOlderEvent) {
      return;
    }
    
    if (!person || !artworks.length || !currentBids || Object.keys(currentBids).length === 0) {
      return;
    }
    
    // Find artwork where current user is winning bidder and needs to pay
    const winningArtwork = artworks.find(artwork => {
      // Check sold artworks or closed artworks with winners (for incorrectly marked items)
      if (artwork.status !== 'sold' && !(artwork.status === 'closed' && artwork.winner_id)) {
        return false;
      }
      
      // Get bid data from event-level currentBids data
      const bidData = currentBids[artwork.id];
      if (!bidData || bidData.count === 0) {
        return false;
      }
      
      // Check if current user is the buyer using buyer_person_id from event data
      if (bidData.buyer_person_id !== person.id) {
        return false;
      }
      
      return true;
    });
    
    if (winningArtwork) {
      setAutoPaymentModal(winningArtwork);
    }
  };

  const fetchBidHistory = async (artIds) => {
    if (!artIds || artIds.length === 0) return;
    
    try {
      console.log('🌐 [V2-BROADCAST] Loading bid history for artworks using cached endpoints');
      
      // V2 BROADCAST VERSION: Load bid history from cached endpoints
      // For each artwork, we need to determine the round and easel to make the API call
      const historyByArt = {};
      
      for (const artId of artIds) {
        // Find the artwork to get round and easel
        const artwork = artworks.find(art => art.id === artId);
        if (!artwork || !event?.eid) {
          console.warn(`⚠️ [V2-BROADCAST] Cannot load bids for artwork ${artId} - missing artwork or event data`);
          continue;
        }
        
        console.log(`🌐 [V2-BROADCAST] Loading versioned bid history for artwork ${artwork.round}-${artwork.easel}`);
        
        try {
          const bidData = await publicDataManager.getArtworkBidsWithVersions(event.eid, artwork.round, artwork.easel, cachedData.cacheVersions || new Map());
          
          if (bidData && bidData.bids) {
            historyByArt[artId] = bidData.bids;
            console.log(`✅ [V2-BROADCAST] Loaded ${bidData.bids.length} bids for artwork ${artwork.round}-${artwork.easel}`);
          }
        } catch (bidError) {
          console.error(`❌ [V2-BROADCAST] Failed to load bids for artwork ${artwork.round}-${artwork.easel}:`, bidError);
        }
      }
      
      // Update bid history state
      setBidHistory(prev => ({ ...prev, ...historyByArt }));
    } catch (error) {
      console.error('❌ [V2-BROADCAST] Error in fetchBidHistory:', error);
    }
  };

  const fetchRoundWinners = async (eventId, artworks) => {
    try {
      // Get winner data from round_contestants by joining through rounds table
      const { data: winners, error } = await supabase
        .from('round_contestants')
        .select(`
          is_winner,
          artist_id,
          easel_number,
          rounds!inner(
            event_id,
            round_number
          )
        `)
        .eq('rounds.event_id', eventId)
        .gt('is_winner', 0);
        
      if (error) throw error;
      
      
      // Organize winners by round
      const winnersByRound = {};
      
      winners?.forEach(winner => {
        // Get the round number from the joined rounds data
        const roundNumber = winner.rounds?.round_number;
        
        // Find the matching artwork by artist_id, easel, and round
        const artwork = artworks.find(a => 
          a.artist_id === winner.artist_id && 
          a.easel === winner.easel_number &&
          a.round === roundNumber
        );
        
        if (artwork) {
          const round = artwork.round || 1;
          if (!winnersByRound[round]) winnersByRound[round] = {};
          
          // is_winner = 1 means winner (only one value > 0 in the data)
          winnersByRound[round][artwork.id] = 'winner';
        }
      });
      
      setRoundWinners(winnersByRound);
    } catch (error) {
      console.error('Error fetching winners from round_contestants:', error);
    }
  };

  const fetchUserVotes = async () => {
    console.log('🚫 [V2-BROADCAST] User votes fetch disabled in broadcast version');
    // SECURITY: No direct database queries in broadcast version
    // User voting status should come from cached endpoints
    return;
  };

  const handleVoteClick = (artwork) => {
    setVoteError('');
    
    if (!user || !person) {
      setVoteError('Please sign in to vote');
      return;
    }

    // Check if already voted in this round
    if (votedRounds[artwork.round]) {
      const votedArtwork = artworks.find(a => a.id === votedRounds[artwork.round]);
      setVoteError(`You already voted for ${votedArtwork?.artist_profiles?.name || 'another artist'}\nin Round ${artwork.round}`);
      return;
    }

    // Show confirmation dialog
    setConfirmVote(artwork);
  };

  const handleVoteConfirm = async () => {
    if (!confirmVote || votingInProgress) return;

    setVotingInProgress(true);
    
    try {
      // Add 2 second delay to simulate server processing
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Back to simplified function to test basic INSERT
      const { data, error } = await supabase
        .rpc('cast_vote_secure', {
          p_eid: event.eid,
          p_round: confirmVote.round,
          p_easel: confirmVote.easel
        });

      console.log('Vote function call params:', { p_art_id: confirmVote.id });
      console.log('Artwork ID:', confirmVote.id, 'EID:', event.eid, 'Round:', confirmVote.round, 'Easel:', confirmVote.easel);
      console.log('Vote function response:', { data, error });
      console.log('Vote function data details:', JSON.stringify(data, null, 2));
      console.log('Vote function error details:', JSON.stringify(error, null, 2));
      
      if (error) {
        console.error('Vote RPC error:', error);
        throw error;
      }
      
      if (!data || !data.success) {
        console.error('Vote function returned error:', data);
        console.error('Error details:', data?.error, 'Detail:', data?.detail);
        setVoteError(data?.error || 'Failed to register vote');
      } else {
        // Vote successful - log weight info
        if (data.vote_weight) {
          console.log('Vote registered with weight:', data.vote_weight);
          if (data.weight_info) {
            console.log('Weight breakdown:', data.weight_info);
          }
        }
        
        // Store vote factor for display
        if (data.vote_factor) {
          setVoteFactor(data.vote_factor);
        }
        
        if (data.action === 'voted') {
          setVoteSuccess(true);
          setVotedArtIds(prev => new Set([...prev, confirmVote.id]));
          setVotedRounds(prev => ({
            ...prev,
            [confirmVote.round]: confirmVote.id
          }));
        } else if (data.action === 'unvoted') {
          // Handle unvote case
          setVotedArtIds(prev => {
            const newSet = new Set(prev);
            newSet.delete(confirmVote.id);
            return newSet;
          });
          setVotedRounds(prev => {
            const newRounds = { ...prev };
            delete newRounds[confirmVote.round];
            return newRounds;
          });
        }
        
        // Keep dialog open for 3 seconds to show success with weight
        setTimeout(() => {
          setConfirmVote(null);
          setVoteSuccess(false);
          setVoteError('');
          setVoteFactor(null);
        }, 3000);
      }
    } catch (error) {
      console.error('Error voting:', error);
      setVoteError('Failed to register vote. Please try again.');
    } finally {
      setVotingInProgress(false);
    }
  };

  const calculateBidIncrement = (currentBid) => {
    const fivePercent = currentBid * 0.05;
    const increment = Math.max(5, fivePercent);
    // Round to nearest $5
    return Math.ceil(increment / 5) * 5;
  };

  // Helper function to get round title
  const getRoundTitle = (round, artworksInRound) => {
    if (artworksInRound.length === 1) {
      return 'Featured Artist';
    }
    return `Round ${round}`;
  };

  const getBiddingStatus = (artwork) => {
    if (!artwork) return null;

    // Handle all known status values: sold, active, inactive, cancelled, closed, paid
    switch (artwork.status) {
      case 'active':
        return {
          text: 'Bidding Open',
          color: 'green',
          canBid: true
        };
      case 'sold':
        return {
          text: 'Artwork Sold',
          color: 'red',
          canBid: false
        };
      case 'paid':
        return {
          text: 'Buyer has PAID',
          color: 'green',
          canBid: false
        };
      case 'closed':
        return {
          text: 'Bidding Closed',
          color: 'orange',
          canBid: false
        };
      case 'cancelled':
        return {
          text: 'Cancelled',
          color: 'gray',
          canBid: false
        };
      case 'inactive':
        return {
          text: 'Not Started',
          color: 'yellow',
          canBid: false
        };
      default:
        // For any unknown status, log it and show a safe default
        console.warn('Unknown artwork status:', artwork.status);
        return {
          text: 'Unavailable',
          color: 'gray',
          canBid: false
        };
    }
  };

  const getMinimumBid = (artId) => {
    const currentBid = currentBids[artId]?.amount || 0;
    const startingBid = event?.auction_start_bid || 0;
    
    // If there are no current bids, the minimum bid is the starting bid
    if (currentBid === 0) {
      return startingBid;
    }
    
    // If there are current bids, add the increment to the current highest bid
    const increment = calculateBidIncrement(currentBid);
    return currentBid + increment;
  };

  // Helper function to get voting-specific messages
  const getVotingMessage = (artwork) => {
    if (!artwork) return null;

    // Voting-specific messages only
    if (!user) {
      return { 
        text: "Sign in to vote", 
        color: "gray", 
        icon: <InfoCircledIcon /> 
      };
    }

    if (voteError) {
      return { 
        text: voteError, 
        color: "red", 
        icon: <ExclamationTriangleIcon /> 
      };
    }

    if (votingInProgress) {
      return { 
        text: "Casting vote...", 
        color: "blue", 
        icon: <InfoCircledIcon /> 
      };
    }

    return null;
  };

  // Helper function to get bidding-specific messages
  const getBiddingMessage = (artwork) => {
    if (!artwork) return null;

    // Bidding-specific messages only
    if (!user) {
      return { 
        text: "Sign in to place bids", 
        color: "gray", 
        icon: <InfoCircledIcon /> 
      };
    }

    if (bidError) {
      return { 
        text: bidError, 
        color: "red", 
        icon: <ExclamationTriangleIcon /> 
      };
    }

    if (bidSuccess) {
      return { 
        text: "Bid placed successfully!", 
        color: "green", 
        icon: <InfoCircledIcon /> 
      };
    }

    if (biddingInProgress) {
      return { 
        text: "Placing bid...", 
        color: "blue", 
        icon: <InfoCircledIcon /> 
      };
    }

    // Time remaining info for bidding
    if (artwork.closing_time && isBiddingAvailable(artwork)) {
      const timeMsg = getTimeRemainingMessage(artwork.closing_time, artwork.status);
      if (timeMsg) {
        return { 
          text: timeMsg, 
          color: "orange", 
          icon: <InfoCircledIcon /> 
        };
      }
    }

    return null;
  };

  // Helper function for time remaining message
  const getTimeRemainingMessage = (closingTime, artworkStatus) => {
    if (!closingTime) return null;
    const now = new Date();
    const closeTime = new Date(closingTime);
    const diffMs = closeTime - now;
    
    // If time has passed, show status based on artwork state
    if (diffMs <= 0) {
      if (artworkStatus === 'paid') return "Paid";
      if (artworkStatus === 'sold') return "Sold";
      return "Bidding closed";
    }
    
    const diffMinutes = Math.ceil(diffMs / (1000 * 60));
    if (diffMinutes < 60) {
      return `${diffMinutes} min remaining`;
    } else {
      const diffHours = Math.floor(diffMinutes / 60);
      const remainingMins = diffMinutes % 60;
      if (remainingMins === 0) {
        return `${diffHours}h remaining`;
      } else {
        return `${diffHours}h ${remainingMins}m remaining`;
      }
    }
  };

  // Helper function to check if bidding is actually available
  const isBiddingAvailable = (artwork) => {
    if (!artwork) return false;
    
    // Must be active status
    if (artwork.status !== 'active') return false;
    
    // Check if auction hasn't closed
    if (artwork.closing_time) {
      const now = new Date();
      const closeTime = new Date(artwork.closing_time);
      if (closeTime <= now) return false;
    }
    
    return true;
  };

  const handleBidIncrement = (artId, direction) => {
    const currentBid = currentBids[artId]?.amount || 0;
    const currentUserBid = bidAmounts[artId] || getMinimumBid(artId);
    const increment = calculateBidIncrement(currentBid);
    
    if (direction === 'up') {
      setBidAmounts(prev => ({
        ...prev,
        [artId]: currentUserBid + increment
      }));
    } else if (direction === 'down') {
      const newBid = currentUserBid - increment;
      const minBid = getMinimumBid(artId);
      if (newBid >= minBid) {
        setBidAmounts(prev => ({
          ...prev,
          [artId]: newBid
        }));
      }
    }
  };

  // Check server for current user info and show modal if needed
  const checkAndShowBuyerInfoModal = async (artId, amount, artwork) => {
    if (!user?.id) return false; // No user logged in

    try {
      // Fetch fresh user data from server
      const { data: freshPersonData, error } = await supabase
        .from('people')
        .select('first_name, last_name, nickname, email, phone, phone_number, auth_phone')
        .eq('auth_user_id', user.id)
        .single();

      if (error) {
        console.error('Error fetching fresh user data:', error);
        return false; // Don't block bidding if we can't check
      }

      // Check if buyer info is missing using fresh server data
      const buyerInfoStatus = getBuyerInfoStatus(freshPersonData);
      if (buyerInfoStatus.isMissing) {
        // Prepare data for the modal
        setBidderInfoModalData({
          artId,
          amount,
          artwork,
          artistName: artwork?.artist_profiles?.name || 'Unknown Artist',
          userPhone: extractUserPhone(user, freshPersonData),
          existingInfo: buyerInfoStatus.existingInfo
        });
        setShowBidderInfoModal(true);
        return true; // Modal shown, halt bidding flow
      }

      return false; // Info complete, continue with bidding
    } catch (err) {
      console.error('Error in checkAndShowBuyerInfoModal:', err);
      return false; // Don't block bidding on error
    }
  };

  const handleBid = async (artId) => {
    setBidError('');
    setBidSuccess(false);
    
    if (!user || !person) {
      setBidError('Please sign in to place a bid');
      return;
    }

    // Find the artwork to check its status
    const artwork = artworks.find(a => a.id === artId);
    if (artwork && (artwork.status === 'sold' || artwork.status === 'cancelled')) {
      setBidError(`Bidding is ${artwork.status === 'sold' ? 'closed (artwork sold)' : 'cancelled for this artwork'}`);
      return;
    }

    const amount = bidAmounts[artId] || getMinimumBid(artId);
    
    // Check if buyer info is missing by fetching fresh data from server
    const modalShown = await checkAndShowBuyerInfoModal(artId, amount, artwork);
    if (modalShown) {
      return; // Stop here, bid will continue after modal interaction
    }

    // Clear any previous errors and show confirmation dialog
    setBidError('');
    setConfirmBid({
      artId,
      amount,
      artwork,
      artistName: artwork?.artist_profiles?.name || 'Unknown Artist',
      round: artwork?.round,
      easel: artwork?.easel
    });
  };

  // Handle bidder info modal actions
  const handleBidderInfoSuccess = (updatedInfo) => {
    console.log('Bidder info updated:', updatedInfo);
    // User has updated their info on the server, proceed with bidding
    proceedWithBid();
  };

  const handleBidderInfoSkip = () => {
    // User chose to skip, proceed with bidding anyway
    proceedWithBid();
  };

  const proceedWithBid = () => {
    if (!bidderInfoModalData) return;
    
    // Clear modal state
    setShowBidderInfoModal(false);
    const modalData = bidderInfoModalData;
    setBidderInfoModalData(null);
    
    // Show bid confirmation dialog
    setBidError('');
    setConfirmBid({
      artId: modalData.artId,
      amount: modalData.amount,
      artwork: modalData.artwork,
      artistName: modalData.artistName,
      round: modalData.artwork?.round,
      easel: modalData.artwork?.easel
    });
  };

  const confirmAndPlaceBid = async () => {
    if (!confirmBid) return;
    
    setBiddingInProgress(true);
    setBidError('');
    
    try {
      // Find the artwork to get its art_code
      const artwork = artworks.find(a => a.id === confirmBid.artId);
      if (!artwork) {
        throw new Error('Artwork not found');
      }

      console.log('Placing bid for:', artwork.art_code, 'Amount:', confirmBid.amount);
      console.log('Current user:', user);
      console.log('Current person:', person);

      // Use the secure RPC function instead of direct insert
      const { data, error } = await supabase
        .rpc('process_bid_secure', {
          p_art_id: artwork.art_code,
          p_amount: confirmBid.amount
        });

      console.log('Bid response:', data);
      if (error) {
        console.error('Bid error:', error);
        throw error;
      }

      if (!data?.success) {
        throw new Error(data?.error || 'Failed to place bid');
      }

      // Update current bids with the new format including currency info
      setCurrentBids(prev => ({
        ...prev,
        [confirmBid.artId]: {
          amount: data.amount || confirmBid.amount,
          count: (prev[confirmBid.artId]?.count || 0) + 1,
          time: new Date().toISOString()
        }
      }));

      // Update bid amount to new minimum bid
      const newCurrentBid = data.amount || confirmBid.amount;
      const newIncrement = calculateBidIncrement(newCurrentBid);
      const newMinimumBid = newCurrentBid + newIncrement;
      
      setBidAmounts(prev => ({
        ...prev,
        [confirmBid.artId]: newMinimumBid
      }));

      // Update the artwork's closing time if it was extended
      if (data.new_closing_time) {
        setArtworks(prev => prev.map(art => 
          art.id === confirmBid.artId 
            ? { ...art, closing_time: data.new_closing_time, auction_extended: true }
            : art
        ));
      }

      setBidSuccess(true);
      setConfirmBid(null);
      // Clear success message after 3 seconds
      setTimeout(() => setBidSuccess(false), 3000);
    } catch (error) {
      console.error('Error placing bid:', error);
      // Custom error messages similar to voting
      if (error.code === '23505') {
        setBidError('You have already placed this bid amount');
      } else if (error.message?.includes('person_id')) {
        setBidError('Session expired. Please refresh and try again.');
      } else {
        setBidError(error.message || 'Failed to place bid');
      }
    } finally {
      setBiddingInProgress(false);
    }
  };

  const handleArtClick = async (artwork) => {
    setSelectedArt(artwork);
    setSelectedImageIndex(0); // Start with the first (latest) image
    setVoteError('');
    setBidError('');
    setBidSuccess(false);
    
    // Initialize bid amount to minimum bid if not already set
    if (artwork && !bidAmounts[artwork.id]) {
      const currentBid = currentBids[artwork.id]?.amount || 0;
      const startingBid = event?.auction_start_bid || 0;
      
      let minimumBid;
      if (currentBid === 0) {
        minimumBid = startingBid;
      } else {
        const increment = calculateBidIncrement(currentBid);
        minimumBid = currentBid + increment;
      }
      
      setBidAmounts(prev => ({
        ...prev,
        [artwork.id]: minimumBid
      }));
    }
    
    // V2 BROADCAST VERSION: Load bid history on demand when artwork is clicked
    if (artwork && !bidHistory[artwork.id] && event?.eid) {
      console.log(`🌐 [V2-BROADCAST] Loading bid history on-demand for artwork ${artwork.round}-${artwork.easel}`);
      try {
        const bidData = await publicDataManager.getArtworkBids(event.eid, artwork.round, artwork.easel);
        
        if (bidData && bidData.bids) {
          setBidHistory(prev => ({
            ...prev,
            [artwork.id]: bidData.bids
          }));
          console.log(`✅ [V2-BROADCAST] Loaded ${bidData.bids.length} bids for artwork ${artwork.round}-${artwork.easel}`);
        }
      } catch (bidError) {
        console.error(`❌ [V2-BROADCAST] Failed to load bids for artwork ${artwork.round}-${artwork.easel}:`, bidError);
      }
    }
  };

  const handleDeleteMedia = async (mediaId) => {
    try {
      // Get user session for authentication
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        alert('Please sign in to delete images');
        return;
      }

      // Call edge function to delete media and handle broadcast
      const response = await fetch('https://db.artb.art/functions/v1/delete-media', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          media_id: mediaId,
          event_eid: event?.eid,
          art_id: selectedArt?.id,
          round: selectedArt?.round,
          easel: selectedArt?.easel
        })
      });

      const data = await response.json();

      console.log('Delete media response:', {
        status: response.status,
        ok: response.ok,
        data: data
      });

      if (!response.ok || !data.success) {
        console.error('Media deletion failed:', data.error || data);
        alert(`Failed to delete image: ${data.error || 'Unknown error'}. Please try again.`);
        return;
      }

      console.log('🗑️ Media deleted successfully');
      
      // Immediately update local state to remove the deleted media
      setArtworks(prevArtworks => {
        const updated = prevArtworks.map(artwork => {
          if (artwork.id === selectedArt?.id) {
            return {
              ...artwork,
              media: artwork.media?.filter(m => m.media_files?.id !== mediaId) || []
            };
          }
          return artwork;
        });
        return updated;
      });
      
      // Also update selectedArt if it's currently open
      if (selectedArt) {
        const updatedMedia = selectedArt.media?.filter(m => m.media_files?.id !== mediaId) || [];
        setSelectedArt({
          ...selectedArt,
          media: updatedMedia
        });
        
        // Reset selected image index if we deleted the current image
        if (selectedImageIndex >= updatedMedia.length) {
          setSelectedImageIndex(Math.max(0, updatedMedia.length - 1));
        }
      }
      
      // Update artworksByRound for main grid display
      setArtworksByRound(prevRounds => {
        const updated = { ...prevRounds };
        Object.keys(updated).forEach(round => {
          updated[round] = updated[round].map(artwork => {
            if (artwork.id === selectedArt?.id) {
              return {
                ...artwork,
                media: artwork.media?.filter(m => m.media_files?.id !== mediaId) || []
              };
            }
            return artwork;
          });
        });
        return updated;
      });

    } catch (error) {
      console.error('Error in handleDeleteMedia:', error);
      alert('Failed to delete image. Please try again.');
    }
  };

  const closeArtDialog = () => {
    setSelectedArt(null);
    setSelectedImageIndex(0);
    setVoteError('');
    setBidError('');
    setBidSuccess(false);
  };

  if (loading || authLoading) {
    return (
      <Container size="3" style={{ paddingTop: '10rem' }}>
        <LoadingScreen message={authLoading ? "Loading authentication..." : "Loading event details..."} />
      </Container>
    );
  }
  
  if (error) {
    return (
      <Container size="3" style={{ padding: '2rem', paddingTop: '10rem' }}>
        <Callout.Root color="red">
          <Callout.Icon>
            <ExclamationTriangleIcon />
          </Callout.Icon>
          <Callout.Text>Error: {error}</Callout.Text>
        </Callout.Root>
      </Container>
    );
  }
  
  if (!event) {
    return (
      <Container size="3" style={{ padding: '2rem', paddingTop: '10rem' }}>
        <Callout.Root>
          <Callout.Icon>
            <InfoCircledIcon />
          </Callout.Icon>
          <Callout.Text>Event not found</Callout.Text>
        </Callout.Root>
      </Container>
    );
  }

  return (
    <Container size="3" style={{ padding: '2rem', paddingTop: '2rem' }}>
      {/* iOS app spacing */}
      <Box style={{ height: '40px' }} />
      
      {/* Header */}
      <Box mb="4">
        <Button 
          variant="ghost" 
          size="2" 
          onClick={() => navigate('/')}
          style={{ marginBottom: '1rem' }}
        >
          <ChevronLeftIcon /> Back to Events
        </Button>
        
        
        <Heading size="8" mb="2">{event.name}</Heading>
        <Text size="3" color="gray">{event.venue}</Text>
        {event.subtitle && (
          <Text size="2" color="gray" style={{ display: 'block', marginTop: '0.5rem' }}>
            {event.subtitle}
          </Text>
        )}
      </Box>

      {/* Global Offer Notification */}
      {offerNotification && (
        <Box mb="4">
          <Card style={{
            background: 'linear-gradient(135deg, var(--amber-3), var(--amber-4))',
            border: '2px solid var(--amber-6)',
            animation: 'slideInFromTop 0.4s ease-out'
          }}>
            <Flex direction="column" gap="3" p="3">
              <Flex align="center" gap="2">
                <Text size="3" weight="bold" color="amber">
                  🎯 Special Artwork Offer!
                </Text>
                <Badge color="amber" size="1">NEW</Badge>
              </Flex>

              <Text size="3">
                You've been offered <strong>{offerNotification.artwork.art_code}</strong> by{' '}
                <strong>{offerNotification.artwork.artist_profiles?.name || 'the artist'}</strong>{' '}
                for <strong>{formatCurrencyFromEvent(offerNotification.offer.offered_amount, event, 'display')}</strong>
              </Text>

              <Flex direction="column" gap="2">
                <Text size="2" color="amber" style={{ fontWeight: 'bold' }}>
                  ⚡ Payment race active! First to pay wins.
                </Text>
                <Text size="1" color="gray">
                  Offer expires: {new Date(offerNotification.offer.expires_at).toLocaleString()}
                </Text>
              </Flex>

              <Flex gap="2" justify="end">
                <Button
                  size="2"
                  variant="soft"
                  color="gray"
                  onClick={() => setOfferNotification(null)}
                >
                  Dismiss
                </Button>
                <Button
                  size="2"
                  variant="solid"
                  color="amber"
                  onClick={() => {
                    // Navigate to the artwork and show payment modal
                    setSelectedArt(offerNotification.artwork);
                    setAutoPaymentModal(offerNotification.artwork);
                    setOfferNotification(null);
                  }}
                >
                  Pay Now
                </Button>
              </Flex>
            </Flex>
          </Card>
        </Box>
      )}

      {/* Tab Controls */}
      <Tabs.Root 
        value={activeTab}
        onValueChange={(value) => {
          setActiveTab(value);
          if (value === 'admin' && !adminTabLoaded && isAdmin) {
            setAdminTabLoaded(true);
          }
          // Clear hash from URL when manually switching tabs to prevent sticking
          if (window.location.hash) {
            window.history.replaceState(null, '', window.location.pathname + window.location.search);
          }
        }}
      >
        <Tabs.List size="2">
          <Tabs.Trigger value="info">Info</Tabs.Trigger>
          <Tabs.Trigger value="vote">Vote</Tabs.Trigger>
          <Tabs.Trigger value="auction">Auction</Tabs.Trigger>
          {isAdmin && (
            <Tabs.Trigger value="admin" style={{ color: 'var(--blue-11)' }}>Admin</Tabs.Trigger>
          )}
        </Tabs.List>

        <Box pt="4">
          <Tabs.Content value="info" data-tab="info">
            <Card>
              <Heading size="4" mb="3">Event Information</Heading>
              <Flex direction="column" gap="3">
                <Box>
                  <Text size="5" weight="bold">{event.name}</Text>
                </Box>
                
                <Separator size="4" />
                
                <Flex direction="column" gap="2">
                  {event.event_start_datetime && (
                    <Flex gap="2" align="center">
                      <Text size="2" weight="medium">Date & Time:</Text>
                      <Text size="2">
                        {new Date(event.event_start_datetime).toLocaleDateString('en-US', {
                          weekday: 'long',
                          year: 'numeric',
                          month: 'long',
                          day: 'numeric'
                        })}
                        {' at '}
                        {new Date(event.event_start_datetime).toLocaleTimeString('en-US', {
                          hour: 'numeric',
                          minute: '2-digit',
                          hour12: true
                        })}
                      </Text>
                    </Flex>
                  )}
                  
                  {event.venue && (
                    <Flex gap="2" align="center">
                      <Text size="2" weight="medium">Venue:</Text>
                      <Text size="2">{event.venue}</Text>
                    </Flex>
                  )}
                  
                  {event.city && (
                    <Flex gap="2" align="center">
                      <Text size="2" weight="medium">City:</Text>
                      <Text size="2">{event.city}</Text>
                    </Flex>
                  )}
                  
                  {event.price && (
                    <Flex gap="2" align="center">
                      <Text size="2" weight="medium">Price:</Text>
                      <Text size="2">${event.price}</Text>
                    </Flex>
                  )}
                  
                  {event.ticket_link && (
                    <Box mt="3">
                      <Button
                        size="2"
                        variant="solid"
                        style={{ width: '100%' }}
                        asChild
                      >
                        <a 
                          href={event.ticket_link} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          style={{ textDecoration: 'none' }}
                        >
                          Get Tickets
                        </a>
                      </Button>
                    </Box>
                  )}
                  
                </Flex>
                
                {event.description && (
                  <>
                    <Separator size="4" />
                    <Box>
                      <Text size="2" weight="medium" style={{ display: 'block', marginBottom: '8px' }}>
                        About this event:
                      </Text>
                      <Text size="2" style={{ lineHeight: '1.6' }}>
                        {event.description}
                      </Text>
                    </Box>
                  </>
                )}
              </Flex>
            </Card>
            
            <Card mt="4">
              <Heading size="4" mb="2">Artists</Heading>
              <ArtistsList eventId={eventId} eventEid={eventEid} />
            </Card>
          </Tabs.Content>

          <Tabs.Content value="vote">
            {/* Artworks grouped by round */}
            {Object.keys(artworksByRound).sort((a, b) => a - b).map(round => (
        <Box key={round} mb="6">
          <Heading size="5" mb="4">{getRoundTitle(round, artworksByRound[round])}</Heading>
          <Grid columns={{ initial: '2', sm: '3', md: '4' }} gap="4">
              {artworksByRound[round].map(artwork => {
                // Get primary or latest media (newest first)
                const primaryMedia = artwork.media?.find(am => am.is_primary) || artwork.media?.[0];
                const mediaFile = primaryMedia?.media_files;
                const imageUrls = getArtworkImageUrls(artwork, mediaFile);
                const thumbnail = imageUrls.thumbnail;
                const hasImage = !!thumbnail;
                const status = roundWinners[round]?.[artwork.id];
                const isWinner = status === 'winner';
                const isFinalist = status === 'finalist';
                
                return (
                  <Card 
                    key={artwork.id} 
                    size="2" 
                    style={{ 
                      cursor: 'pointer',
                      border: (isWinner || isFinalist) ? '3px solid gold' : 'none',
                      boxShadow: (isWinner || isFinalist) ? '0 0 20px rgba(255, 215, 0, 0.5)' : 'none'
                    }}
                    onClick={() => handleArtClick(artwork)}
                    data-art-id={artwork.id}
                  >
                    <Box style={{ position: 'relative', paddingBottom: '100%' }}>
                      {hasImage ? (
                        <img 
                          src={thumbnail}
                          alt={`${artwork.artist_profiles?.name || 'Unknown Artist'} - Easel ${artwork.easel}`}
                          data-art-image={artwork.id}
                          style={{ 
                            position: 'absolute',
                            top: 0,
                            left: 0,
                            width: '100%',
                            height: '100%',
                            objectFit: 'cover',
                            borderRadius: '4px'
                          }}
                        />
                      ) : (
                        <Flex
                          style={{
                            position: 'absolute',
                            top: 0,
                            left: 0,
                            width: '100%',
                            height: '100%',
                            backgroundColor: 'var(--gray-2)',
                            borderRadius: '4px',
                            alignItems: 'center',
                            justifyContent: 'center'
                          }}
                        >
                          <Text size="2" color="gray">NO IMAGE YET</Text>
                        </Flex>
                      )}
                      {votedArtIds.has(artwork.id) && (
                        <Box
                          style={{
                            position: 'absolute',
                            top: '8px',
                            right: '8px',
                            background: 'var(--color-background)',
                            borderRadius: '50%',
                            padding: '4px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                          }}
                        >
                          <HeartFilledIcon color="red" width="16" height="16" />
                        </Box>
                      )}
                      {(isWinner || isFinalist) && (
                        <Box
                          style={{
                            position: 'absolute',
                            top: '8px',
                            left: '8px',
                            background: 'gold',
                            borderRadius: '4px',
                            padding: '4px 8px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                          }}
                        >
                          <Text size="1" weight="bold" style={{ color: 'black' }}>
                            {isWinner ? '🏆 Winner' : '⭐ Finalist'}
                          </Text>
                        </Box>
                      )}
                    </Box>
                    <Box mt="2">
                      <Text size="2" weight="medium" style={{ display: 'block' }}>
                        {artwork.artist_profiles?.name || 'Unknown Artist'}
                      </Text>
                      <Text size="1" style={{ display: 'block', marginTop: '2px' }}>
                        {currentBids[artwork.id]?.amount ? (
                          <>
                            <Text size="1" color={
                              artwork.status === 'sold' ? 'red' : 
                              artwork.status === 'active' ? 'green' : 
                              artwork.status === 'cancelled' ? 'gray' : 
                              'yellow'
                            } weight="medium">
                              {formatCurrencyFromEvent(currentBids[artwork.id]?.amount || 0, event, 'display')}
                            </Text>
                            <Text size="1" color="gray">
                              {' • '}
                            </Text>
                          </>
                        ) : null}
                        <Text size="1" color="gray">
                          Easel {artwork.easel}
                        </Text>
                      </Text>
                    </Box>
                  </Card>
                );
              })}
            </Grid>
          </Box>
        ))}
          </Tabs.Content>

          <Tabs.Content value="auction">
            <Box>
              <Heading size="4" mb="4">Auction</Heading>
              <Flex direction="column" gap="4">
                {(() => {
                  // DISABLED: My Auctions section - causing too much DB activity
                  // TODO: Re-enable with better performance optimization
                  /*
                  // First, get user's bid artworks
                  const myBidArtworks = artworks.filter(artwork => {
                    const history = bidHistory[artwork.id] || [];
                    const hasUserBid = history.some(bid => bid.bidder_person_id === person?.id);
                    if (hasUserBid) {
                      console.log('Found user bid for artwork:', artwork.id, 'history:', history);
                    }
                    return hasUserBid;
                  });
                  */
                  
                  // Group artworks by status
                  const artworksByStatus = {
                    active: [],
                    sold: [],
                    cancelled: [],
                    inactive: [],
                    other: []
                  };
                  
                  artworks.forEach(artwork => {
                    const status = artwork.status || 'other';
                    if (artworksByStatus[status]) {
                      artworksByStatus[status].push(artwork);
                    } else {
                      artworksByStatus.other.push(artwork);
                    }
                  });
                  
                  // Sort each group by highest bid
                  Object.keys(artworksByStatus).forEach(status => {
                    artworksByStatus[status].sort((a, b) => {
                      const bidA = currentBids[a.id]?.amount || 0;
                      const bidB = currentBids[b.id]?.amount || 0;
                      return bidB - bidA;
                    });
                  });
                  
                  // Status order (active first)
                  const isOlderEvent = eventId && parseInt(eventId.replace('AB', '')) < 2936;
                  const statusOrder = ['active', 'sold', 'cancelled', 'inactive', 'other'];
                  
                  return (
                    <>
                      {/* DISABLED: My Auctions Section - causing too much DB activity */}
                      {/*
                      {myBidArtworks.length > 0 && (
                        <Box>
                          <Heading size="3" mb="3" color="blue">
                            My Auctions ({myBidArtworks.length})
                          </Heading>
                          <Flex direction="column" gap="3">
                            {myBidArtworks.map(artwork => {
                              // Implementation removed for performance
                            })}
                          </Flex>
                          <Separator size="4" my="4" />
                        </Box>
                      )}
                      */}
                      
                      {/* Existing status groups */}
                      {statusOrder.map(status => {
                    const statusArtworks = artworksByStatus[status];
                    if (statusArtworks.length === 0) return null;
                    
                    return (
                      <Box key={status}>
                        <Heading size="3" mb="3" color={
                          status === 'active' ? 'green' :
                          status === 'sold' ? 'red' :
                          status === 'cancelled' ? 'gray' :
                          'yellow'
                        }>
                          {status.charAt(0).toUpperCase() + status.slice(1)} ({statusArtworks.length})
                        </Heading>
                        <Flex direction="column" gap="3">
                          {statusArtworks.map(artwork => {
                    // Get primary or latest media (newest first)
                    const primaryMedia = artwork.media?.find(am => am.is_primary) || artwork.media?.[0];
                    const mediaFile = primaryMedia?.media_files;
                    const imageUrls = getArtworkImageUrls(artwork, mediaFile);
                    const thumbnail = imageUrls.thumbnail;
                    const hasImage = !!thumbnail;
                    const bidData = currentBids[artwork.id];
                    const currentBid = bidData?.amount || 0;
                    const bidCount = bidData?.count || 0;
                    const lastBidTime = bidData?.time;
                    // Calculate time ago for last bid using auction data
                    const getTimeAgo = (timestamp) => {
                      if (!timestamp) return null;
                      const now = new Date();
                      const bidTime = new Date(timestamp);
                      const diffMinutes = Math.floor((now - bidTime) / (1000 * 60));
                      
                      if (diffMinutes < 60) {
                        return `${diffMinutes} min ago`;
                      } else {
                        return bidTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                      }
                    };

                    // Calculate time remaining until closing
                    const getTimeRemaining = (closingTime, artworkStatus, hasBids) => {
                      if (!closingTime) return null;
                      const now = new Date();
                      const closeTime = new Date(closingTime);
                      const diffMs = closeTime - now;
                      
                      // If time has passed, show status based on artwork state
                      if (diffMs <= 0) {
                        if (artworkStatus === 'paid') return "Paid";
                        if (artworkStatus === 'sold' && hasBids) return "Sold";
                        return "Closed";
                      }
                      
                      const diffMinutes = Math.ceil(diffMs / (1000 * 60));
                      if (diffMinutes < 60) {
                        return `${diffMinutes} min to close`;
                      } else {
                        const diffHours = Math.floor(diffMinutes / 60);
                        const remainingMins = diffMinutes % 60;
                        if (remainingMins === 0) {
                          return `${diffHours}h to close`;
                        } else {
                          return `${diffHours}h ${remainingMins}m to close`;
                        }
                      }
                    };
                    
                    return (
                      <div key={artwork.id}>
                        <Card 
                          size="2"
                          style={{ cursor: 'pointer' }}
                          onClick={() => handleArtClick(artwork)}
                        >
                          <Flex gap="3" align="center">
                            {/* Thumbnail on left */}
                            <Box style={{ width: '80px', height: '80px', flexShrink: 0 }}>
                              {hasImage ? (
                                <img 
                                  src={thumbnail}
                                  alt={artwork.artist_profiles?.name || 'Unknown Artist'}
                                  style={{ 
                                    width: '100%',
                                    height: '100%',
                                    objectFit: 'cover',
                                    borderRadius: '4px'
                                  }}
                                />
                              ) : (
                                <Flex
                                  style={{
                                    width: '100%',
                                    height: '100%',
                                    backgroundColor: 'var(--gray-2)',
                                    borderRadius: '4px',
                                    alignItems: 'center',
                                    justifyContent: 'center'
                                  }}
                                >
                                  <Text size="1" color="gray">NO IMAGE</Text>
                                </Flex>
                              )}
                            </Box>
                            
                            {/* Content on right */}
                            <Box style={{ flex: 1 }}>
                              <Flex justify="between" align="start">
                                <Box>
                                  <Text size="3" weight="medium" style={{ display: 'block' }}>
                                    {artwork.artist_profiles?.name || 'Unknown Artist'}
                                  </Text>
                                  <Text size="2" color="gray">
                                    Round {artwork.round}, Easel {artwork.easel}
                                  </Text>
                                </Box>
                                
                                <Box style={{ textAlign: 'right' }} data-bid-art={artwork.id}>
                                  <Text size="4" weight="bold" style={{ display: 'block' }}>
                                    {formatCurrencyFromEvent(currentBid, event, 'display')}
                                  </Text>
                                  <Text size="1" color="gray">
                                    {bidCount} bid{bidCount !== 1 ? 's' : ''}
                                    {lastBidTime && ` • ${getTimeAgo(lastBidTime)}`}
                                  </Text>
                                  {artwork.closing_time && (
                                    <Text size="1" color="orange" weight="medium" style={{ display: 'block', marginTop: '2px' }}>
                                      {getTimeRemaining(artwork.closing_time, artwork.status, currentBid > 0)}
                                    </Text>
                                  )}
                                </Box>
                              </Flex>
                            </Box>
                          </Flex>
                        </Card>
                        
                        {/* Paid Receipt Display - show if user is authenticated paid buyer */}
                        {artwork.status === 'paid' && person && bidHistory[artwork.id]?.length > 0 && bidHistory[artwork.id]?.[0]?.person_id === person.id && (
                          <Card 
                            size="3" 
                            style={{ 
                              marginTop: '12px',
                              border: '3px solid #16a34a',
                              background: 'linear-gradient(135deg, #22c55e, #16a34a)',
                              color: 'white',
                              boxShadow: '0 4px 12px rgba(22, 163, 74, 0.3)'
                            }}
                          >
                            <Flex direction="column" gap="3" align="center">
                              <Box style={{ textAlign: 'center' }}>
                                <Text size="6" weight="bold" style={{ color: 'white', display: 'block' }}>
                                  ✅ PAYMENT CONFIRMED
                                </Text>
                                <Text size="2" style={{ color: 'rgba(255, 255, 255, 0.8)', marginTop: '4px' }}>
                                  Receipt for Auction Purchase
                                </Text>
                              </Box>
                              
                              <Box 
                                style={{ 
                                  background: 'rgba(0, 0, 0, 0.7)',
                                  color: 'white',
                                  padding: '16px',
                                  borderRadius: '8px',
                                  border: '1px solid rgba(255, 255, 255, 0.2)',
                                  width: '100%',
                                  maxWidth: '400px'
                                }}
                              >
                                <Flex direction="column" gap="2">
                                  <Flex justify="between">
                                    <Text size="2" weight="medium">Artwork:</Text>
                                    <Text size="2">{artwork.art_code}</Text>
                                  </Flex>
                                  <Flex justify="between">
                                    <Text size="2" weight="medium">Artist:</Text>
                                    <Text size="2">{artwork.artist_profiles?.name || 'Unknown Artist'}</Text>
                                  </Flex>
                                  <Flex justify="between">
                                    <Text size="2" weight="medium">Final Bid:</Text>
                                    <Text size="2" weight="bold">{formatCurrencyFromEvent(currentBid, event, 'display')}</Text>
                                  </Flex>
                                  <Flex justify="between">
                                    <Text size="2" weight="medium">Buyer:</Text>
                                    <Text size="2">{person.nickname || 'You'}</Text>
                                  </Flex>
                                  <Flex justify="between">
                                    <Text size="2" weight="medium">Status:</Text>
                                    <Text size="2" style={{ color: '#22c55e' }} weight="bold">PAID IN FULL</Text>
                                  </Flex>
                                  <Box style={{ borderTop: '1px solid rgba(255, 255, 255, 0.2)', marginTop: '8px', paddingTop: '8px' }}>
                                    <Text size="1" style={{ color: 'rgba(255, 255, 255, 0.7)', textAlign: 'center' }}>
                                      Thank you for participating in Art Battle!
                                    </Text>
                                  </Box>
                                </Flex>
                              </Box>
                            </Flex>
                          </Card>
                        )}
                      </div>
                    );
                  })}
                        </Flex>
                      </Box>
                    );
                  })}
                    </>
                  );
                })()}
              </Flex>
            </Box>
          </Tabs.Content>

<Tabs.Content value="admin">
            {isAdmin && adminTabLoaded && (
              <AdminPanel 
                eventId={eventId}
                eid={event?.eid}
                artworksByRound={artworksByRound}
                roundWinners={roundWinners}
                setRoundWinners={setRoundWinners}
                artworks={artworks}
                currentTime={currentTime}
                user={user}
                onDataChange={clearEventCache}
              />
            )}
            {!isAdmin && (
              <Box p="4">
                <Text size="3" color="gray">You don't have permission to access admin controls.</Text>
              </Box>
            )}
          </Tabs.Content>
        </Box>
      </Tabs.Root>

      {/* Selected Artwork Dialog */}
      <Dialog.Root open={!!selectedArt} onOpenChange={(open) => !open && closeArtDialog()}>
        <Dialog.Content style={{ maxWidth: '90vw', maxHeight: '90vh', overflow: 'auto' }}>
          {selectedArt && (() => {
            // Handle multiple images if available
            const allMedia = selectedArt.media || [];
            const currentMedia = allMedia[selectedImageIndex] || allMedia[0];
            const mediaFile = currentMedia?.media_files;
            const imageUrls = getArtworkImageUrls(selectedArt, mediaFile);
            // Use compressed version for display, original for download
            const imageUrl = imageUrls.compressed;
            const hasImage = !!imageUrl;
            return (
              <>
                <Dialog.Title>
                  <Flex justify="between" align="center">
                    <Box>
                      <Heading size="5">
                        {selectedArt.artist_profiles?.name || 'Unknown Artist'}
                      </Heading>
                      <Text size="3" color="gray">
                        Round {selectedArt.round}, Easel {selectedArt.easel}
                      </Text>
                      {(() => {
                        const status = roundWinners[selectedArt.round]?.[selectedArt.id];
                        if (status === 'winner') {
                          return (
                            <Badge color="gold" size="2" mt="2">
                              🏆 Winner
                            </Badge>
                          );
                        } else if (status === 'finalist') {
                          return (
                            <Badge color="gold" size="2" mt="2">
                              ⭐ Finalist
                            </Badge>
                          );
                        }
                        return null;
                      })()}
                    </Box>
                    <Dialog.Close>
                      <IconButton size="2" variant="ghost">
                        <Cross2Icon />
                      </IconButton>
                    </Dialog.Close>
                  </Flex>
                </Dialog.Title>

                <Box my="4" style={{ textAlign: 'center' }}>
                  {/* Main Image */}
                  <Box style={{ position: 'relative', display: 'inline-block' }}>
                    {hasImage ? (
                      <>
                        <img 
                          src={imageUrl}
                          alt={`${selectedArt.artist_profiles?.name || 'Unknown Artist'} - Easel ${selectedArt.easel}`}
                          style={{ 
                            maxWidth: '100%',
                            maxHeight: '60vh',
                            objectFit: 'contain',
                            display: 'block',
                            borderRadius: '8px'
                          }}
                        />
                        {/* Delete button for admin users - positioned on the image */}
                        {hasPhotoPermission && currentMedia && (
                          <button
                            onClick={() => {
                              // Get media ID from the media_files object
                              const mediaId = currentMedia?.media_files?.id;
                              setConfirmDeleteImage({
                                mediaId,
                                artistName: selectedArt?.artist_profiles?.name || 'Unknown Artist',
                                round: selectedArt?.round,
                                easel: selectedArt?.easel
                              });
                            }}
                            style={{
                              position: 'absolute',
                              top: '10px',
                              right: '10px',
                              width: '24px',
                              height: '24px',
                              border: 'none',
                              borderRadius: '50%',
                              backgroundColor: 'rgba(0, 0, 0, 0.8)',
                              color: 'white',
                              cursor: 'pointer',
                              fontSize: '14px',
                              fontWeight: 'bold',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              lineHeight: '1'
                            }}
                          >
                            ×
                          </button>
                        )}
                      </>
                    ) : (
                      <Flex
                        style={{
                          minHeight: '300px',
                          backgroundColor: 'var(--gray-2)',
                          borderRadius: '8px',
                          alignItems: 'center',
                          justifyContent: 'center'
                        }}
                      >
                        <Text size="3" color="gray">NO IMAGE YET</Text>
                      </Flex>
                    )}
                    
                    {/* Navigation arrows if multiple images */}
                    {selectedArt.media?.length > 1 && (
                      <>
                        <IconButton
                          size="3"
                          variant="soft"
                          style={{
                            position: 'absolute',
                            left: '10px',
                            top: '50%',
                            transform: 'translateY(-50%)'
                          }}
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedImageIndex(prev => 
                              prev === 0 ? (selectedArt.media?.length || 1) - 1 : prev - 1
                            );
                          }}
                        >
                          <ChevronLeftIcon />
                        </IconButton>
                        <IconButton
                          size="3"
                          variant="soft"
                          style={{
                            position: 'absolute',
                            right: '10px',
                            top: '50%',
                            transform: 'translateY(-50%)'
                          }}
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedImageIndex(prev => 
                              prev === (selectedArt.media?.length || 1) - 1 ? 0 : prev + 1
                            );
                          }}
                        >
                          <ChevronRightIcon />
                        </IconButton>
                      </>
                    )}
                  </Box>

                  {/* Thumbnail strip with upload button - Admin only */}
                  <Flex gap="2" justify="center" mt="3" wrap="wrap">
                    {/* Camera upload button - Photo admin or higher only */}
                    {hasPhotoPermission && (
                      <Box
                        style={{
                          width: '60px',
                          height: '60px',
                          cursor: 'pointer',
                          border: '2px solid var(--accent-9)',
                          borderRadius: '4px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          background: 'var(--gray-3)'
                        }}
                      >
                        <ArtUpload 
                          artwork={selectedArt} 
                          onUploadComplete={() => {
                            // Refresh data and go back to artwork list
                            fetchEventDetails();
                            setSelectedArt(null);
                          }}
                        />
                      </Box>
                    )}
                      
                      {/* Existing thumbnails */}
                      {selectedArt.media?.map((media, index) => {
                        const thumbUrls = getArtworkImageUrls(null, media.media_files);
                        const thumb = thumbUrls.thumbnail;
                        return (
                          <Box
                            key={media.media_id}
                            style={{
                              width: '60px',
                              height: '60px',
                              cursor: 'pointer',
                              border: selectedImageIndex === index ? '2px solid var(--accent-9)' : '2px solid transparent',
                              borderRadius: '4px',
                              overflow: 'hidden',
                              position: 'relative'
                            }}
                          >
                            <img
                              src={thumb}
                              alt={`Thumbnail ${index + 1}`}
                              onClick={() => setSelectedImageIndex(index)}
                              style={{
                                width: '100%',
                                height: '100%',
                                objectFit: 'cover'
                              }}
                            />
                          </Box>
                        );
                      })}
                  </Flex>
                </Box>

                <Flex direction="column" gap="4">
                  {/* Voting Section */}
                  <Box>
                    <Flex justify="center" align="center" mb="3">
                      <Button
                        size="3"
                        variant={votedArtIds.has(selectedArt.id) ? "solid" : "soft"}
                        onClick={() => handleVoteClick(selectedArt)}
                        disabled={votedArtIds.has(selectedArt.id) || (!user && !votedArtIds.has(selectedArt.id))}
                      >
                        {votedArtIds.has(selectedArt.id) ? (
                          <><HeartFilledIcon /> Voted</>
                        ) : !user ? (
                          <><HeartIcon /> Sign in to vote</>
                        ) : (
                          <><HeartIcon /> Vote for {selectedArt.artist_profiles?.name || 'this artwork'}</>
                        )}
                      </Button>
                    </Flex>
                    
                    {/* Voting-specific message area */}
                    {(() => {
                      const message = getVotingMessage(selectedArt);
                      return message && (
                        <Callout.Root color={message.color} size="1" mb="3">
                          <Callout.Icon>
                            {message.icon}
                          </Callout.Icon>
                          <Callout.Text>{message.text}</Callout.Text>
                        </Callout.Root>
                      );
                    })()}
                  </Box>

                  <Separator size="4" />

                  {/* Bidding Section */}
                  <Box>
                    <Flex justify="center" align="center" mb="3">
                      {(() => {
                        const status = getBiddingStatus(selectedArt);
                        return (
                          <Box>
                            <Badge color={status.color} size="3">
                              {status.text}
                            </Badge>
                            {status.subtext && (
                              <Text size="1" color="gray" style={{ display: 'block', marginTop: '2px', textAlign: 'center' }}>
                                {status.subtext}
                              </Text>
                            )}
                          </Box>
                        );
                      })()}
                    </Flex>
                    
                    {/* Bidding-specific message area */}
                    {(() => {
                      const message = getBiddingMessage(selectedArt);
                      return message && (
                        <Callout.Root color={message.color} size="1" mb="3">
                          <Callout.Icon>
                            {message.icon}
                          </Callout.Icon>
                          <Callout.Text>{message.text}</Callout.Text>
                        </Callout.Root>
                      );
                    })()}
                    
                    {/* Payment Button for winning bidder */}
                    {(selectedArt.status === 'sold' || selectedArt.status === 'paid') && !(eventId && parseInt(eventId.replace('AB', '')) < 2936) && (
                      <PaymentButton
                        artwork={selectedArt}
                        currentBid={selectedArt.current_bid}
                        isWinningBidder={(() => {
                          // Check if current user is the winning bidder
                          if (!person || !bidHistory[selectedArt.id] || bidHistory[selectedArt.id].length === 0) {
                            return false;
                          }
                          const topBid = bidHistory[selectedArt.id][0];
                          return topBid.person_id === person.id;
                        })()}
                        onPaymentComplete={() => {
                          // Refresh artwork data
                          fetchEventDetails();
                        }}
                      />
                    )}
                    
                    {/* Show bidding controls only when bidding is actually available */}
                    {isBiddingAvailable(selectedArt) && (
                    <>
                    <Box mb="3">
                      <Flex align="center" gap="3" justify="center">
                        <IconButton
                          size="3"
                          variant="soft"
                          onClick={() => handleBidIncrement(selectedArt.id, 'down')}
                          disabled={!user || (bidAmounts[selectedArt.id] || getMinimumBid(selectedArt.id)) <= getMinimumBid(selectedArt.id)}
                        >
                          <MinusIcon />
                        </IconButton>
                        
                        <Box style={{ minWidth: '120px', textAlign: 'center' }}>
                          <Text size="6" weight="bold">
                            {formatCurrencyFromEvent(bidAmounts[selectedArt.id] || getMinimumBid(selectedArt.id), event, 'display')}
                          </Text>
                        </Box>
                        
                        <IconButton
                          size="3"
                          variant="soft"
                          onClick={() => handleBidIncrement(selectedArt.id, 'up')}
                          disabled={!user}
                        >
                          <PlusIcon />
                        </IconButton>
                      </Flex>
                      
                      <Text size="1" color="gray" style={{ display: 'block', marginTop: '0.5rem', textAlign: 'center' }}>
                        {(() => {
                          const currentBid = currentBids[selectedArt.id]?.amount || 0;
                          const minimumBid = getMinimumBid(selectedArt.id);
                          const currency = getCurrencyFromEvent(event);
                          return formatMinimumBidText(currentBid, minimumBid, currency.code, currency.symbol);
                        })()}
                      </Text>
                    </Box>
                    
                    <Button 
                      size="3"
                      style={{ width: '100%' }}
                      onClick={() => handleBid(selectedArt.id)}
                      disabled={!user || biddingInProgress}
                    >
                      {biddingInProgress ? (
                        <>
                          <Spinner size="1" />
                          {' '}Placing Bid...
                        </>
                      ) : !user ? (
                        'Sign in to bid'
                      ) : (
                        formatCurrencyFromEvent(bidAmounts[selectedArt.id] || getMinimumBid(selectedArt.id), event, 'button')
                      )}
                    </Button>
                    </>
                    )}

                    {/* Show alternative button when bidding not available */}
                    {!isBiddingAvailable(selectedArt) && selectedArt.status !== 'sold' && selectedArt.status !== 'paid' && (
                      <Button 
                        size="3"
                        style={{ width: '100%' }}
                        disabled={true}
                        variant="soft"
                        color="gray"
                      >
                        Bidding Closed
                      </Button>
                    )}
                    
                    {/* Bid History */}
                    {bidHistory[selectedArt.id] && bidHistory[selectedArt.id].length > 0 && (
                      <Box mt="4">
                        <Separator size="4" mb="3" />
                        <Heading size="3" mb="3">
                          Bid History ({bidHistory[selectedArt.id].length} bids)
                        </Heading>
                        <Flex direction="column" gap="2">
                          {bidHistory[selectedArt.id].map((bid, index) => (
                            <Flex key={index} justify="between" align="center">
                              <Text size="2">
                                {bid.display_name}
                              </Text>
                              <Flex gap="3" align="center">
                                <Text size="2" weight="medium">
                                  ${Math.round(bid.amount)}
                                </Text>
                                <Text size="1" color="gray">
                                  {new Date(bid.created_at).toLocaleTimeString()}
                                </Text>
                              </Flex>
                            </Flex>
                          ))}
                        </Flex>
                      </Box>
                    )}
                  </Box>
                </Flex>
              </>
            );
          })()}
        </Dialog.Content>
      </Dialog.Root>

      {/* Vote Confirmation Dialog */}
      <AlertDialog.Root open={!!confirmVote}>
        <AlertDialog.Content style={{ maxWidth: 450 }}>
          <AlertDialog.Title>Confirm Your Vote</AlertDialog.Title>
          <AlertDialog.Description size="2">
            <Flex direction="column" gap="2">
              <Text>Are you sure you want to vote for:</Text>
              <Box style={{ 
                background: voteSuccess ? 'var(--green-9)' : 'var(--gray-3)', 
                padding: '12px', 
                borderRadius: '4px',
                textAlign: 'center',
                transition: 'background-color 0.3s ease'
              }}>
                <Text size="5" weight="bold" style={{ display: 'block', marginBottom: '8px' }}>
                  {confirmVote?.artist_profiles?.name || 'Unknown Artist'}
                </Text>
                <Text size="4" weight="medium" style={{ display: 'block' }}>
                  Round {confirmVote?.round}, Easel {confirmVote?.easel}
                </Text>
                {voteSuccess && voteFactor && (
                  <Text size="3" weight="bold" style={{ 
                    color: 'white', 
                    display: 'block', 
                    marginTop: '12px' 
                  }}>
                    VOTE CAST AT {voteFactor}x WEIGHT
                  </Text>
                )}
              </Box>
              {voteError ? (
                <Text size="2" color="red" weight="bold">
                  {voteError}
                </Text>
              ) : (
                <Text size="2" color="gray">
                  Note: You can only vote for one artist per round.
                </Text>
              )}
            </Flex>
          </AlertDialog.Description>

          <Flex gap="3" mt="4" justify="end">
            <AlertDialog.Cancel>
              <Button 
                variant="soft" 
                color="gray" 
                onClick={() => {
                  setConfirmVote(null);
                  setVoteError('');
                  setVoteFactor(null);
                }}
                disabled={votingInProgress}
              >
                Cancel
              </Button>
            </AlertDialog.Cancel>
            <AlertDialog.Action>
              <Button 
                variant="solid" 
                onClick={handleVoteConfirm}
                disabled={votingInProgress || voteSuccess}
              >
                {voteSuccess ? (
                  'VOTED!'
                ) : votingInProgress ? (
                  <Flex align="center" gap="2">
                    <Spinner size="1" />
                    <Text>Voting...</Text>
                  </Flex>
                ) : (
                  'Confirm Vote'
                )}
              </Button>
            </AlertDialog.Action>
          </Flex>
        </AlertDialog.Content>
      </AlertDialog.Root>

      {/* Bid Confirmation Dialog */}
      <AlertDialog.Root open={!!confirmBid}>
        <AlertDialog.Content style={{ maxWidth: 450 }}>
          <AlertDialog.Title>Confirm Your Bid</AlertDialog.Title>
          <AlertDialog.Description size="2">
            <Flex direction="column" gap="2">
              <Text>
                You are about to place a bid of <strong>{formatCurrencyFromEvent(confirmBid?.amount || 0, event, 'confirmation')}</strong> for:
              </Text>
              <Box style={{ 
                background: 'var(--gray-3)', 
                padding: '12px', 
                borderRadius: '4px' 
              }}>
                <Text size="2" weight="medium">
                  {confirmBid?.artistName}
                </Text>
                <Text size="2" color="gray">
                  Round {confirmBid?.round}, Easel {confirmBid?.easel}
                </Text>
              </Box>
              <Text size="2" color="red">
                Note: This bid is binding if you win the auction.
              </Text>
              
              {/* Error display in modal */}
              {bidError && (
                <Box mt="3" p="3" style={{ 
                  background: 'var(--red-2)', 
                  borderRadius: '4px',
                  border: '1px solid var(--red-6)'
                }}>
                  <Flex align="center" gap="2">
                    <ExclamationTriangleIcon style={{ color: 'var(--red-9)' }} />
                    <Text size="2" color="red" weight="medium">
                      {bidError}
                    </Text>
                  </Flex>
                </Box>
              )}
            </Flex>
          </AlertDialog.Description>

          <Flex gap="3" mt="4" justify="end">
            <AlertDialog.Cancel>
              <Button 
                variant="soft" 
                color="gray" 
                onClick={() => setConfirmBid(null)}
                disabled={biddingInProgress}
              >
                Cancel
              </Button>
            </AlertDialog.Cancel>
            <AlertDialog.Action>
              <Button 
                variant="solid" 
                color="blue"
                onClick={confirmAndPlaceBid}
                disabled={biddingInProgress}
              >
                {biddingInProgress ? (
                  <Flex align="center" gap="2">
                    <Spinner size="1" />
                    Confirming...
                  </Flex>
                ) : (
                  'Confirm Bid'
                )}
              </Button>
            </AlertDialog.Action>
          </Flex>
        </AlertDialog.Content>
      </AlertDialog.Root>

      {/* Delete Image Confirmation Dialog */}
      <AlertDialog.Root open={!!confirmDeleteImage} onOpenChange={(open) => !open && setConfirmDeleteImage(null)}>
        <AlertDialog.Content style={{ maxWidth: 450 }}>
          <AlertDialog.Title>Delete Image?</AlertDialog.Title>
          <AlertDialog.Description size="2">
            <Flex direction="column" gap="2">
              <Text>
                Are you sure you want to delete this image? This action cannot be undone.
              </Text>
              {confirmDeleteImage && (
                <Box style={{ 
                  background: 'var(--gray-3)', 
                  padding: '12px', 
                  borderRadius: '4px' 
                }}>
                  <Text size="2" weight="medium">
                    {confirmDeleteImage.artistName}
                  </Text>
                  <Text size="2" color="gray">
                    Round {confirmDeleteImage.round}, Easel {confirmDeleteImage.easel}
                  </Text>
                </Box>
              )}
            </Flex>
          </AlertDialog.Description>

          <Flex gap="3" mt="4" justify="end">
            <AlertDialog.Cancel>
              <Button 
                variant="soft" 
                color="gray"
                onClick={() => setConfirmDeleteImage(null)}
              >
                Cancel
              </Button>
            </AlertDialog.Cancel>
            <AlertDialog.Action>
              <Button 
                color="red"
                onClick={() => {
                  if (confirmDeleteImage?.mediaId) {
                    handleDeleteMedia(confirmDeleteImage.mediaId);
                  }
                  setConfirmDeleteImage(null);
                }}
              >
                Delete Image
              </Button>
            </AlertDialog.Action>
          </Flex>
        </AlertDialog.Content>
      </AlertDialog.Root>

      {/* Automatic Payment Modal */}
      <AlertDialog.Root open={!!autoPaymentModal} onOpenChange={(open) => !open && setAutoPaymentModal(null)}>
        <AlertDialog.Content style={{ maxWidth: 500 }}>
          <AlertDialog.Title>🎉 Congratulations! You Won!</AlertDialog.Title>
          <AlertDialog.Description size="2">
            {autoPaymentModal && (
              <Flex direction="column" gap="3">
                <Text>
                  You are the winning bidder for <strong>{autoPaymentModal.art_code}</strong>
                  {autoPaymentModal.artist_profiles?.[0] && (
                    <> by <strong>{autoPaymentModal.artist_profiles[0].name}</strong></>
                  )}
                </Text>
                
                {/* Show the artwork image if available */}
                {autoPaymentModal.art_media?.[0]?.media_files?.[0] && (
                  <Box style={{ textAlign: 'center', marginTop: '8px' }}>
                    <img
                      src={autoPaymentModal.art_media[0].media_files[0].compressed_url || autoPaymentModal.art_media[0].media_files[0].original_url}
                      alt={`Artwork ${autoPaymentModal.art_code}`}
                      style={{
                        maxWidth: '100%',
                        maxHeight: '200px',
                        borderRadius: '8px',
                        objectFit: 'cover'
                      }}
                    />
                  </Box>
                )}

                <Text size="3" weight="bold" style={{ textAlign: 'center', color: 'var(--accent-9)' }}>
                  Complete your payment to secure this artwork
                </Text>

                {/* Payment Button */}
                <PaymentButton
                  artwork={autoPaymentModal}
                  currentBid={autoPaymentModal.current_bid}
                  isWinningBidder={true}
                  onPaymentComplete={() => {
                    setAutoPaymentModal(null);
                    fetchEventDetails(); // Refresh data
                  }}
                />
              </Flex>
            )}
          </AlertDialog.Description>

          <Flex gap="3" mt="4" justify="end">
            <AlertDialog.Cancel>
              <Button variant="soft" color="gray">
                I'll Pay Later
              </Button>
            </AlertDialog.Cancel>
          </Flex>
        </AlertDialog.Content>
      </AlertDialog.Root>

      {/* iOS app spacing - bottom */}
      <Box style={{ height: '40px' }} />
      
      {/* Bidder Info Modal - for capturing buyer information when missing */}
      {showBidderInfoModal && bidderInfoModalData && (
        <BidderInfoModal
          isOpen={showBidderInfoModal}
          onClose={handleBidderInfoSkip}
          onSuccess={handleBidderInfoSuccess}
          userPhone={bidderInfoModalData.userPhone}
          existingInfo={bidderInfoModalData.existingInfo}
        />
      )}
    </Container>
  );
};

export default EventDetails;
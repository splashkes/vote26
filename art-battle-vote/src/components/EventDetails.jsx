import { useState, useEffect, useRef, lazy, Suspense } from 'react';
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
import LoadingScreen from './LoadingScreen';
import { getImageUrl, getArtworkImageUrls } from '../lib/imageHelpers';
import { injectFlashStyles, applyFlashClass } from '../utils/realtimeFlash';

// Import AdminPanel directly for now
import AdminPanel from './AdminPanel';

// Import ArtUpload directly to avoid lazy loading issues
import ArtUpload from './ArtUpload';

// Import ArtistsList component
import ArtistsList from './ArtistsList';
// Import PaymentButton for Stripe payments
import PaymentButton from './PaymentButton';

const EventDetails = () => {
  const { eventId, tab } = useParams();
  const navigate = useNavigate();
  
  const { user, person } = useAuth();
  const [event, setEvent] = useState(null);
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
  const [autoPaymentModal, setAutoPaymentModal] = useState(null); // For automatic payment modal
  const [paymentModalChecked, setPaymentModalChecked] = useState(false); // Prevent duplicate modals
  // Initialize activeTab from hash or tab parameter
  const getInitialTab = () => {
    const hash = window.location.hash.replace('#', '');
    return tab || hash || 'vote';
  };
  const [activeTab, setActiveTab] = useState(getInitialTab());
  const countdownInterval = useRef(null);
  
  // Connection management state
  const [connectionState, setConnectionState] = useState('disconnected'); // 'connecting', 'connected', 'disconnected', 'reconnecting'
  const [reconnectAttempts, setReconnectAttempts] = useState(0);
  const [subscriptionRefs, setSubscriptionRefs] = useState(new Map()); // Track active subscriptions
  const reconnectTimeoutRef = useRef(null);

  useEffect(() => {
    fetchEventDetails();
    injectFlashStyles(); // Inject flash animation styles
  }, [eventId]);

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

  // Connection management functions
  const cleanupSubscriptions = () => {
    console.log('Cleaning up all subscriptions...');
    subscriptionRefs.forEach((subscription, key) => {
      if (subscription && typeof subscription.unsubscribe === 'function') {
        subscription.unsubscribe();
      }
    });
    setSubscriptionRefs(new Map());
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
    }
  };

  const getReconnectDelay = (attempts) => {
    // Exponential backoff: 1s, 2s, 4s, 8s, 16s, max 60s
    return Math.min(1000 * Math.pow(2, attempts), 60000);
  };

  const createManagedSubscription = (channelName, subscriptionConfig) => {
    const existingSubscription = subscriptionRefs.get(channelName);
    if (existingSubscription) {
      console.log(`Subscription ${channelName} already exists, skipping`);
      return existingSubscription;
    }

    console.log(`Creating subscription: ${channelName}`);
    setConnectionState('connecting');
    
    const subscription = supabase.channel(channelName);
    
    // Add the postgres_changes listener
    subscription.on('postgres_changes', subscriptionConfig, subscriptionConfig.callback);
    
    // Handle connection events
    subscription.on('system', {}, (payload) => {
      console.log(`Subscription ${channelName} status:`, payload.status);
      if (payload.status === 'SUBSCRIBED') {
        setConnectionState('connected');
        setReconnectAttempts(0);
      } else if (payload.status === 'CLOSED') {
        setConnectionState('disconnected');
        // Auto-reconnect with exponential backoff
        handleReconnect(channelName, subscriptionConfig);
      }
    });

    const subscribedChannel = subscription.subscribe();
    
    // Store reference
    setSubscriptionRefs(prev => new Map(prev).set(channelName, subscribedChannel));
    
    return subscribedChannel;
  };

  const handleReconnect = (channelName, subscriptionConfig) => {
    if (reconnectAttempts >= 5) {
      console.log(`Max reconnection attempts reached for ${channelName}`);
      setConnectionState('disconnected');
      return;
    }

    setConnectionState('reconnecting');
    const delay = getReconnectDelay(reconnectAttempts);
    
    console.log(`Reconnecting ${channelName} in ${delay}ms (attempt ${reconnectAttempts + 1})`);
    
    reconnectTimeoutRef.current = setTimeout(() => {
      setReconnectAttempts(prev => prev + 1);
      createManagedSubscription(channelName, subscriptionConfig);
    }, delay);
  };

  // Handle page visibility changes to pause/resume connections
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden) {
        console.log('Page hidden - pausing real-time connections');
        // Don't cleanup, just note the state change
      } else {
        console.log('Page visible - resuming real-time connections');
        // Reset reconnect attempts when page becomes visible again
        setReconnectAttempts(0);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, []);

  // Set up realtime subscriptions for public views
  useEffect(() => {
    if (!eventId) return;

    // Subscribe to art table for winner status, auction status changes
    const artSubscription = supabase
      .channel(`art-${eventId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'art',
        filter: `event_id=eq.${eventId}`
      }, (payload) => {
        console.log('Art realtime update:', payload);
        
        if (payload.eventType === 'UPDATE') {
          setArtworks(prev => prev.map(art => {
            if (art.id === payload.new.id) {
              // Flash the updated artwork
              setTimeout(() => {
                const element = document.querySelector(`[data-art-id="${art.id}"]`);
                if (element) applyFlashClass(element);
              }, 0);
              return { ...art, ...payload.new };
            }
            return art;
          }));
          
          // Update round winners if winner status changed
          if (payload.new.is_winner !== payload.old?.is_winner) {
            fetchRoundWinners();
          }
        }
      })
      .subscribe();

    // Subscribe to bids table for live bid updates
    const bidsSubscription = supabase
      .channel(`bids-${eventId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'bids'
      }, async (payload) => {
        console.log('Bid realtime update:', payload);
        
        // Update current bids for the artwork
        const artId = payload.new.art_id;
        setCurrentBids(prev => {
          const newBids = { ...prev, [artId]: payload.new.amount };
          // Flash the bid display
          setTimeout(() => {
            const element = document.querySelector(`[data-bid-art="${artId}"]`);
            if (element) applyFlashClass(element);
          }, 0);
          return newBids;
        });
        
        // Reset bid input to new minimum bid when someone else bids
        setBidAmounts(prev => {
          const updated = { ...prev };
          // Don't reset if this bid is from the current user
          if (payload.new.person_id !== person?.id) {
            delete updated[artId]; // This will make getMinimumBid() recalculate
          }
          return updated;
        });
        
        // Update bid history
        fetchBidHistory([artId]);
      })
      .subscribe();

    // Subscribe to votes table for admin panel (only if admin)
    let votesSubscription = null;
    if (isAdmin) {
      votesSubscription = supabase
        .channel(`votes-${eventId}`)
        .on('postgres_changes', {
          event: 'INSERT',
          schema: 'public',
          table: 'votes',
          filter: `event_id=eq.${eventId}`
        }, (payload) => {
          console.log('Vote realtime update:', payload);
          // Update vote weights
          fetchVoteWeights();
        })
        .subscribe();
    }

    // Subscribe to round_contestants - real-time for admins, polling for regular users
    let roundContestantsSubscription = null;
    let roundContestantsInterval = null;
    
    if (isAdmin) {
      // Admin users get real-time updates
      roundContestantsSubscription = supabase
        .channel(`round-contestants-${eventId}`)
        .on('postgres_changes', {
          event: '*',
          schema: 'public',
          table: 'round_contestants'
        }, (payload) => {
          console.log('Round contestants update:', payload);
          // Use background refresh to avoid loading screen
          refreshEventDataSilently();
          // Flash the info tab if visible
          setTimeout(() => {
            const element = document.querySelector('[data-tab="info"]');
            if (element) applyFlashClass(element, 'realtime-flash-subtle');
          }, 0);
        })
        .subscribe();
    } else {
      // Regular users get polling every 5 minutes
      roundContestantsInterval = setInterval(() => {
        console.log('Round contestants polling update (5min interval)');
        refreshEventDataSilently();
      }, 5 * 60 * 1000); // 5 minutes
    }

    // Subscribe to art_media for image updates
    const artMediaSubscription = supabase
      .channel(`art-media-${eventId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'art_media'
      }, async (payload) => {
        console.log('Art media update:', payload);
        // Refresh the specific artwork's images
        if (payload.new?.art_id) {
          const artId = payload.new.art_id;
          const { data: mediaData } = await supabase
            .from('art_media')
            .select('*')
            .eq('art_id', artId)
            .order('created_at', { ascending: false });
          
          if (mediaData) {
            setArtworks(prev => prev.map(art => {
              if (art.id === artId) {
                // Flash the artwork image
                setTimeout(() => {
                  const element = document.querySelector(`[data-art-image="${artId}"]`);
                  if (element) applyFlashClass(element);
                }, 0);
                return { ...art, art_media: mediaData };
              }
              return art;
            }));
          }
        }
      })
      .subscribe();

    return () => {
      // Clean up all subscriptions and intervals
      cleanupSubscriptions();
      if (roundContestantsInterval) clearInterval(roundContestantsInterval);
      
      // Legacy cleanup for any remaining direct subscriptions
      if (artSubscription) artSubscription.unsubscribe();
      if (bidsSubscription) bidsSubscription.unsubscribe();
      if (votesSubscription) votesSubscription.unsubscribe();
      if (roundContestantsSubscription) roundContestantsSubscription.unsubscribe();
      if (artMediaSubscription) artMediaSubscription.unsubscribe();
    };
  }, [eventId, isAdmin]);

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
      
      // If we have newly expired timers, refresh data after a short delay
      const newlyExpired = [...currentlyExpired].filter(id => !lastExpiredCheck.has(id));
      if (newlyExpired.length > 0) {
        console.log('Detected newly expired auctions:', newlyExpired);
        // Small delay to allow backend processing
        setTimeout(() => {
          refreshEventDataSilently();
        }, 2000);
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
    if (person && artworks.length > 0 && bidHistory && Object.keys(bidHistory).length > 0 && !paymentModalChecked) {
      // Auto payment modal check (production-ready)
      checkForAutoPaymentModal();
      setPaymentModalChecked(true);
    }
  }, [person, artworks, bidHistory, paymentModalChecked]);

  const fetchEventDetails = async () => {
    try {
      setLoading(true);
      setError(null);

      // Fetch event details
      const { data: eventData, error: eventError } = await supabase
        .from('events')
        .select('*')
        .eq('id', eventId)
        .single();

      if (eventError) throw eventError;
      setEvent(eventData);

      // Fetch artworks with artist profiles and media files
      const { data: artworks, error: artError } = await supabase
        .from('art')
        .select(`
          *,
          artist_profiles!art_artist_id_fkey (
            id,
            name,
            bio,
            instagram,
            city_text
          ),
          art_media (
            id,
            media_type,
            is_primary,
            display_order,
            media_files (
              id,
              original_url,
              thumbnail_url,
              compressed_url,
              cloudflare_id,
              file_type,
              width,
              height
            )
          )
        `)
        .eq('event_id', eventId)
        .not('artist_id', 'is', null)  // Only show artworks with artists assigned
        .order('round')
        .order('easel');

      if (artError) throw artError;

      // Fetch media files with created_at for sorting
      // TODO: This separate query could be optimized by including created_at datetime 
      // information in the main artwork query above
      const artIds = artworks.map(a => a.id);
      const { data: mediaData, error: mediaError } = await supabase
        .from('art_media')
        .select(`
          art_id,
          media_id,
          display_order,
          media_files!art_media_media_id_fkey (
            id,
            original_url,
            thumbnail_url,
            compressed_url,
            file_type,
            created_at
          )
        `)
        .in('art_id', artIds)
        .eq('media_files.file_type', 'image');
        
      if (mediaError) {
        console.error('Error fetching media:', mediaError);
      }

      // Group media by art_id and sort by created_at (latest first)
      const mediaByArt = {};
      if (mediaData) {
        mediaData.forEach(media => {
          if (!mediaByArt[media.art_id]) {
            mediaByArt[media.art_id] = [];
          }
          if (media.media_files) {
            mediaByArt[media.art_id].push(media);
          }
        });
        
        // Sort each artwork's media by created_at (latest first)
        Object.keys(mediaByArt).forEach(artId => {
          mediaByArt[artId].sort((a, b) => {
            const dateA = new Date(a.media_files.created_at);
            const dateB = new Date(b.media_files.created_at);
            return dateB - dateA; // Latest first
          });
        });
      }

      // Fetch all bids with person info using RPC (bypasses RLS)
      const { data: bidsData, error: bidsError } = await supabase.rpc('get_bid_history_with_names', {
        p_art_ids: artIds
      });

      if (bidsError) {
        console.error('Error fetching bids:', bidsError);
      }

      // Get highest bid and history for each artwork
      const bidsByArt = {};
      const historyByArt = {};
      if (bidsData) {
        bidsData.forEach(bid => {
          // Track highest bid
          if (!bidsByArt[bid.art_id] || bid.amount > bidsByArt[bid.art_id]) {
            bidsByArt[bid.art_id] = bid.amount;
          }
          // Track bid history
          if (!historyByArt[bid.art_id]) {
            historyByArt[bid.art_id] = [];
          }
          // Use display_name from RPC function (already formatted)
          historyByArt[bid.art_id].push({
            amount: bid.amount,
            created_at: bid.created_at,
            bidder_name: bid.display_name || 'Anonymous',
            display_name: bid.display_name || 'Anonymous',
            person_id: bid.person_id
          });
        });
      }
      
      setCurrentBids(bidsByArt);
      setBidHistory(historyByArt);
      
      // Check for automatic payment modal after bid history is loaded
      setTimeout(() => {
        checkForAutoPaymentModal();
      }, 1000);

      // Group artworks by round
      const groupedByRound = artworks.reduce((acc, artwork) => {
        const round = artwork.round || 1;
        if (!acc[round]) {
          acc[round] = [];
        }
        const media = mediaByArt[artwork.id] || [];
        acc[round].push({
          ...artwork,
          media: media
        });
        return acc;
      }, {});

      // Fetch vote weights and ranges for each artwork
      const { data: voteData, error: voteError } = await supabase
        .rpc('get_event_weighted_votes', { p_event_id: eventId });
      
      if (voteError) {
        console.error('Error fetching vote weights:', voteError);
      }
      
      // Fetch vote ranges for segmented display
      const { data: rangeData, error: rangeError } = await supabase
        .rpc('get_event_vote_ranges', { p_event_id: eventId });
      
      if (rangeError) {
        console.error('Error fetching vote ranges:', rangeError);
      }
      
      // Create a map of art_id to vote weight data
      const voteWeightMap = {};
      if (voteData) {
        voteData.forEach(vote => {
          voteWeightMap[vote.art_id] = {
            totalWeight: vote.weighted_vote_total || 0,
            voteCount: vote.raw_vote_count || 0
          };
        });
      }
      
      // Add range data to the map
      if (rangeData) {
        rangeData.forEach(range => {
          if (voteWeightMap[range.art_id]) {
            voteWeightMap[range.art_id].ranges = {
              range_0_22: range.range_0_22 || 0,
              range_0_95: range.range_0_95 || 0,
              range_1_01: range.range_1_01 || 0,
              range_1_90: range.range_1_90 || 0,
              range_2_50: range.range_2_50 || 0,
              range_5_01: range.range_5_01 || 0,
              range_10_00: range.range_10_00 || 0,
              range_above_10: range.range_above_10 || 0
            };
          }
        });
      }
      
      // Add vote weight data to artworks
      const artworksWithWeights = artworks.map(artwork => ({
        ...artwork,
        media: mediaByArt[artwork.id] || [],
        totalVoteWeight: voteWeightMap[artwork.id]?.totalWeight || 0,
        vote_count: voteWeightMap[artwork.id]?.voteCount || 0,
        voteRanges: voteWeightMap[artwork.id]?.ranges || null
      }));
      
      // Update grouped by round with weights
      const groupedWithWeights = artworksWithWeights.reduce((acc, artwork) => {
        const round = artwork.round || 1;
        if (!acc[round]) {
          acc[round] = [];
        }
        acc[round].push(artwork);
        return acc;
      }, {});
      
      setArtworksByRound(groupedWithWeights);
      setArtworks(artworksWithWeights);
      setVoteWeights(voteWeightMap);
      
      // Fetch all votes to determine winners
      await fetchRoundWinners(eventId, artworks);
    } catch (error) {
      console.error('Error fetching event details:', error);
      setError(error.message);
    } finally {
      setLoading(false);
    }
  };

  // Background refresh for realtime updates without loading screen
  const refreshEventDataSilently = async () => {
    try {
      console.log('Background refresh triggered by realtime update');
      
      // Fetch event details (usually doesn't change, but just in case)
      const { data: eventData, error: eventError } = await supabase
        .from('events')
        .select('*')
        .eq('id', eventId)
        .single();

      if (eventError) {
        console.error('Error fetching event data in background:', eventError);
        return;
      }
      setEvent(eventData);

      // Fetch artworks with artist profiles and media files
      const { data: artworks, error: artError } = await supabase
        .from('art')
        .select(`
          *,
          artist_profiles!art_artist_id_fkey (
            id,
            name,
            bio,
            instagram,
            city_text
          ),
          art_media (
            id,
            media_type,
            is_primary,
            display_order,
            media_files (
              id,
              original_url,
              thumbnail_url,
              compressed_url,
              cloudflare_id,
              file_type,
              width,
              height
            )
          )
        `)
        .eq('event_id', eventId)
        .not('artist_id', 'is', null)  // Only show artworks with artists assigned
        .order('round')
        .order('easel');

      if (artError) {
        console.error('Error fetching artworks in background:', artError);
        return;
      }

      // Fetch media files with created_at for sorting
      const artIds = artworks.map(a => a.id);
      const { data: mediaData, error: mediaError } = await supabase
        .from('art_media')
        .select(`
          art_id,
          media_id,
          display_order,
          media_files!art_media_media_id_fkey (
            id,
            original_url,
            thumbnail_url,
            compressed_url,
            file_type,
            created_at
          )
        `)
        .in('art_id', artIds)
        .eq('media_files.file_type', 'image');
        
      if (mediaError) {
        console.error('Error fetching media in background:', mediaError);
      }

      // Group media by art_id and sort by created_at (latest first)
      const mediaByArt = {};
      if (mediaData) {
        mediaData.forEach(media => {
          if (!mediaByArt[media.art_id]) {
            mediaByArt[media.art_id] = [];
          }
          if (media.media_files) {
            mediaByArt[media.art_id].push(media);
          }
        });
        
        Object.keys(mediaByArt).forEach(artId => {
          mediaByArt[artId].sort((a, b) => {
            const dateA = new Date(a.media_files.created_at);
            const dateB = new Date(b.media_files.created_at);
            return dateB - dateA;
          });
        });
      }

      // Fetch all bids with person info using RPC (bypasses RLS)
      const { data: bidsData, error: bidsError } = await supabase.rpc('get_bid_history_with_names', {
        p_art_ids: artIds
      });

      if (bidsError) {
        console.error('Error fetching bids in background:', bidsError);
      }

      // Process bids data
      const bidsByArt = {};
      const historyByArt = {};
      if (bidsData) {
        bidsData.forEach(bid => {
          if (!bidsByArt[bid.art_id] || bid.amount > bidsByArt[bid.art_id]) {
            bidsByArt[bid.art_id] = bid.amount;
          }
          if (!historyByArt[bid.art_id]) {
            historyByArt[bid.art_id] = [];
          }
          
          // Use display_name from RPC function (already formatted)
          historyByArt[bid.art_id].push({
            amount: bid.amount,
            created_at: bid.created_at,
            bidder_name: bid.display_name || 'Anonymous',
            display_name: bid.display_name || 'Anonymous',
            person_id: bid.person_id
          });
        });
      }
      
      setCurrentBids(bidsByArt);
      setBidHistory(historyByArt);

      // Fetch vote weights and ranges for each artwork
      const { data: voteData, error: voteError } = await supabase
        .rpc('get_event_weighted_votes', { p_event_id: eventId });
      
      const { data: rangeData, error: rangeError } = await supabase
        .rpc('get_event_vote_ranges', { p_event_id: eventId });
      
      const voteWeightMap = {};
      if (voteData) {
        voteData.forEach(vote => {
          voteWeightMap[vote.art_id] = {
            totalWeight: vote.weighted_vote_total || 0,
            voteCount: vote.raw_vote_count || 0
          };
        });
      }
      
      if (rangeData) {
        rangeData.forEach(range => {
          if (voteWeightMap[range.art_id]) {
            voteWeightMap[range.art_id].ranges = {
              range_0_22: range.range_0_22 || 0,
              range_0_95: range.range_0_95 || 0,
              range_1_01: range.range_1_01 || 0,
              range_1_90: range.range_1_90 || 0,
              range_2_50: range.range_2_50 || 0,
              range_5_01: range.range_5_01 || 0,
              range_10_00: range.range_10_00 || 0,
              range_above_10: range.range_above_10 || 0
            };
          }
        });
      }
      
      // Add vote weight data and media to artworks
      const artworksWithWeights = artworks.map(artwork => ({
        ...artwork,
        media: mediaByArt[artwork.id] || [],
        totalVoteWeight: voteWeightMap[artwork.id]?.totalWeight || 0,
        vote_count: voteWeightMap[artwork.id]?.voteCount || 0,
        voteRanges: voteWeightMap[artwork.id]?.ranges || null
      }));
      
      // Update grouped by round with weights
      const groupedWithWeights = artworksWithWeights.reduce((acc, artwork) => {
        const round = artwork.round || 1;
        if (!acc[round]) {
          acc[round] = [];
        }
        acc[round].push(artwork);
        return acc;
      }, {});
      
      // Update all state without loading screen
      setArtworksByRound(groupedWithWeights);
      setArtworks(artworksWithWeights);
      setVoteWeights(voteWeightMap);
      
      // Fetch winners data
      await fetchRoundWinners(eventId, artworks);
      
      console.log('Background refresh completed successfully');
    } catch (error) {
      console.error('Error in background refresh:', error);
      // Don't show error to user for background updates
    }
  };

  // Check if user needs to see automatic payment modal
  const checkForAutoPaymentModal = () => {
    // Don't show payment modal for events before August 1, 2025
    const eventDate = event?.event_start_datetime ? new Date(event.event_start_datetime) : null;
    const cutoffDate = new Date('2025-08-01T00:00:00Z');
    const isOlderEvent = eventDate && eventDate < cutoffDate;
    if (isOlderEvent) {
      return;
    }
    
    if (!person || !artworks.length || !bidHistory || Object.keys(bidHistory).length === 0) {
      return;
    }
    
    // Find artwork where current user is winning bidder and needs to pay
    
    const winningArtwork = artworks.find(artwork => {
      // Check if artwork needs payment (sold or closed with bids)
      if (artwork.status !== 'sold' && artwork.status !== 'closed') {
        return false;
      }
      
      // If status is closed, only show payment modal if there are actual bids
      if (artwork.status === 'closed') {
        const history = bidHistory[artwork.id];
        if (!history || history.length === 0) {
          return false;
        }
      }
      
      // Get bid history for this artwork (already checked above for closed status)
      const history = bidHistory[artwork.id];
      if (!history || history.length === 0) {
        return false;
      }
      
      // Check if current user is the top bidder
      const topBid = history[0]; // Assuming sorted by amount DESC
      if (!topBid || topBid.person_id !== person.id) {
        return false;
      }
      
      // Check if payment is not already completed
      if (artwork.status === 'paid') {
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
      // Use RPC function to get bid history with proper names (bypasses RLS)
      const { data, error } = await supabase.rpc('get_bid_history_with_names', {
        p_art_ids: artIds
      });
      
      if (error) {
        console.error('Error fetching bid history:', error);
        return;
      }
      
      // Group bids by art_id
      const historyByArt = {};
      data.forEach(bid => {
        if (!historyByArt[bid.art_id]) {
          historyByArt[bid.art_id] = [];
        }
        historyByArt[bid.art_id].push(bid);
      });
      
      // Update bid history state
      setBidHistory(prev => ({ ...prev, ...historyByArt }));
    } catch (error) {
      console.error('Error in fetchBidHistory:', error);
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
    if (!person) return;

    try {
      const { data: votes, error } = await supabase
        .from('votes')
        .select('art_id, round')
        .eq('person_id', person.id)
        .eq('event_id', eventId);

      if (error) throw error;

      if (votes) {
        const votedIds = new Set();
        const roundVotes = {};
        
        votes.forEach(v => {
          votedIds.add(v.art_id);
          roundVotes[v.round] = v.art_id;
        });
        
        setVotedArtIds(votedIds);
        setVotedRounds(roundVotes);
      }
    } catch (error) {
      console.error('Error fetching user votes:', error);
    }
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
      
      // Use the secure RPC function with eid, round, easel
      const { data, error } = await supabase
        .rpc('cast_vote_secure', {
          p_eid: event.eid,
          p_round: confirmVote.round,
          p_easel: confirmVote.easel
        });

      if (error) {
        console.error('Vote error:', error);
        throw error;
      }
      
      if (!data || !data.success) {
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
    const currentBid = currentBids[artId] || 0;
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
    const currentBid = currentBids[artId] || 0;
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
    
    // Show confirmation dialog
    setConfirmBid({
      artId,
      amount,
      artwork,
      artistName: artwork?.artist_profiles?.name || 'Unknown Artist',
      round: artwork?.round,
      easel: artwork?.easel
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

      // Update current bids with the actual amount from the response
      setCurrentBids(prev => ({
        ...prev,
        [confirmBid.artId]: data.amount || confirmBid.amount
      }));

      // Clear bid amount
      setBidAmounts(prev => ({
        ...prev,
        [confirmBid.artId]: ''
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

  const handleArtClick = (artwork) => {
    setSelectedArt(artwork);
    setSelectedImageIndex(0); // Start with the first (latest) image
    setVoteError('');
    setBidError('');
    setBidSuccess(false);
  };

  const closeArtDialog = () => {
    setSelectedArt(null);
    setSelectedImageIndex(0);
    setVoteError('');
    setBidError('');
    setBidSuccess(false);
  };

  if (loading) {
    return (
      <Container size="3">
        <LoadingScreen message="Loading event details..." />
      </Container>
    );
  }
  
  if (error) {
    return (
      <Container size="3" style={{ padding: '2rem' }}>
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
      <Container size="3" style={{ padding: '2rem' }}>
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
    <Container size="3" style={{ padding: '2rem' }}>
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
              <ArtistsList eventId={eventId} />
            </Card>
          </Tabs.Content>

          <Tabs.Content value="vote">
            {/* Artworks grouped by round */}
            {Object.keys(artworksByRound).sort((a, b) => a - b).map(round => (
        <Box key={round} mb="6">
          <Heading size="5" mb="4">Round {round}</Heading>
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
                        {currentBids[artwork.id] ? (
                          <>
                            <Text size="1" color={
                              artwork.status === 'sold' ? 'red' : 
                              artwork.status === 'active' ? 'green' : 
                              artwork.status === 'cancelled' ? 'gray' : 
                              'yellow'
                            } weight="medium">
                              ${Math.round(currentBids[artwork.id])}
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
                      const bidA = currentBids[a.id] || 0;
                      const bidB = currentBids[b.id] || 0;
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
                    const currentBid = currentBids[artwork.id] || 0;
                    const history = bidHistory[artwork.id] || [];
                    const lastBid = history[0]; // Most recent bid
                    
                    // Calculate time ago for last bid
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
                                    ${Math.round(currentBid)}
                                  </Text>
                                  <Text size="1" color="gray">
                                    {history.length} bid{history.length !== 1 ? 's' : ''}
                                    {lastBid && ` • ${getTimeAgo(lastBid.created_at)}`}
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
                        {artwork.status === 'paid' && person && history.length > 0 && history[0].person_id === person.id && (
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
                                    <Text size="2" weight="bold">${Math.round(currentBid)}</Text>
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
                artworksByRound={artworksByRound}
                roundWinners={roundWinners}
                setRoundWinners={setRoundWinners}
                artworks={artworks}
                currentTime={currentTime}
                user={user}
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

                <Box my="4">
                  {/* Main Image */}
                  <Box style={{ position: 'relative' }}>
                    {hasImage ? (
                      <img 
                        src={imageUrl}
                        alt={`${selectedArt.artist_profiles?.name || 'Unknown Artist'} - Easel ${selectedArt.easel}`}
                        style={{ 
                          maxWidth: '100%',
                          maxHeight: '60vh',
                          objectFit: 'contain',
                          display: 'block',
                          margin: '0 auto',
                          borderRadius: '8px'
                        }}
                      />
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
                            key={media.id}
                            onClick={() => setSelectedImageIndex(index)}
                            style={{
                              width: '60px',
                              height: '60px',
                              cursor: 'pointer',
                              border: selectedImageIndex === index ? '2px solid var(--accent-9)' : '2px solid transparent',
                              borderRadius: '4px',
                              overflow: 'hidden'
                            }}
                          >
                            <img
                              src={thumb}
                              alt={`Thumbnail ${index + 1}`}
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
                        currentBid={currentBids[selectedArt.id] || selectedArt.current_bid}
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
                            ${bidAmounts[selectedArt.id] || getMinimumBid(selectedArt.id)}
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
                        Next minimum bid: ${getMinimumBid(selectedArt.id)}
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
                        'Place Bid'
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
                        <Heading size="3" mb="3">Bid History</Heading>
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
                You are about to place a bid of <strong>${confirmBid?.amount?.toFixed(2)}</strong> for:
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
                  currentBid={currentBids[autoPaymentModal.id] || autoPaymentModal.current_bid}
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
    </Container>
  );
};

export default EventDetails;
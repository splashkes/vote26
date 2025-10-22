import { createContext, useContext, useEffect, useState, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from './AuthContext';
import { AlertDialog, Flex, Text, Box, Heading, Button } from '@radix-ui/themes';
import PaymentButton from '../components/PaymentButton';

const AuctionWinnerContext = createContext({});

export const useAuctionWinner = () => useContext(AuctionWinnerContext);

export const AuctionWinnerProvider = ({ children }) => {
  const { person } = useAuth();
  const [wonArtwork, setWonArtwork] = useState(null);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const channelsRef = useRef(new Map()); // Track all subscribed channels
  const processedWinsRef = useRef(new Set()); // Prevent duplicate modals

  useEffect(() => {
    if (!person?.id) {
      console.log('🎯 [AUCTION-WINNER] No person ID, skipping global listener setup');
      return;
    }

    console.log('🚀 [AUCTION-WINNER] Setting up global auction winner listener for person:', person.id);

    // Function to subscribe to an event's auction winner channel
    const subscribeToEvent = (eventEid) => {
      // Skip if already subscribed
      if (channelsRef.current.has(eventEid)) {
        return;
      }

      const channelName = `auction_winner_${eventEid}`;
      console.log(`📡 [AUCTION-WINNER] Subscribing to channel: ${channelName}`);

      const channel = supabase.channel(channelName);

      // Listen for auction winner broadcasts
      channel.on('broadcast', { event: 'auction_winner' }, async (payload) => {
        console.log(`🏆 [AUCTION-WINNER] Received broadcast on ${channelName}:`, payload);

        const data = payload.payload || payload;

        // Check if this user is the winner
        if (data.winner_person_id === person.id) {
          // Create unique key for this win to prevent duplicates
          const winKey = `${data.art_id}-${data.timestamp || Date.now()}`;

          if (processedWinsRef.current.has(winKey)) {
            console.log(`⚠️ [AUCTION-WINNER] Already processed win: ${winKey}`);
            return;
          }

          processedWinsRef.current.add(winKey);

          console.log(`🎉 [AUCTION-WINNER] YOU WON! Artwork: ${data.art_code}`);

          // Fetch complete artwork details for the payment modal
          try {
            const { data: artworkData, error } = await supabase
              .from('art')
              .select(`
                *,
                artist_profiles:artist_profiles(
                  id,
                  name,
                  profile_picture
                ),
                art_media:art_media(
                  media_files:media_files(
                    id,
                    original_url,
                    compressed_url
                  )
                )
              `)
              .eq('id', data.art_id)
              .single();

            if (error) {
              console.error('❌ [AUCTION-WINNER] Error fetching artwork details:', error);
              // Still show modal with basic info
              setWonArtwork({
                id: data.art_id,
                art_code: data.art_code,
                current_bid: data.winning_amount,
                currency: data.currency,
                status: 'sold'
              });
            } else {
              console.log('✅ [AUCTION-WINNER] Fetched artwork details:', artworkData);
              setWonArtwork({
                ...artworkData,
                current_bid: data.winning_amount,
                currency: data.currency
              });
            }

            setShowPaymentModal(true);
          } catch (err) {
            console.error('❌ [AUCTION-WINNER] Exception fetching artwork:', err);
            // Show modal with basic info
            setWonArtwork({
              id: data.art_id,
              art_code: data.art_code,
              current_bid: data.winning_amount,
              currency: data.currency,
              status: 'sold'
            });
            setShowPaymentModal(true);
          }
        }
      });

      // Subscribe to channel
      channel.subscribe((status) => {
        console.log(`📡 [AUCTION-WINNER] Channel ${channelName} status: ${status}`);
      });

      // Store channel reference
      channelsRef.current.set(eventEid, channel);
    };

    // Subscribe to all active events
    const subscribeToAllEvents = async () => {
      try {
        console.log('🔍 [AUCTION-WINNER] Fetching all active events...');

        // Get all events that are happening today or in the future
        const { data: events, error } = await supabase
          .from('events')
          .select('id, eid')
          .gte('event_start_datetime', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()) // Include events from last 24h
          .not('eid', 'is', null);

        if (error) {
          console.error('❌ [AUCTION-WINNER] Error fetching events:', error);
          return;
        }

        console.log(`✅ [AUCTION-WINNER] Found ${events?.length || 0} active events`);

        // Subscribe to each event's auction winner channel
        events?.forEach(event => {
          if (event.eid) {
            subscribeToEvent(event.eid);
          }
        });
      } catch (err) {
        console.error('❌ [AUCTION-WINNER] Exception in subscribeToAllEvents:', err);
      }
    };

    // Initial subscription
    subscribeToAllEvents();

    // Resubscribe every 5 minutes to catch new events
    const intervalId = setInterval(subscribeToAllEvents, 5 * 60 * 1000);

    // Cleanup
    return () => {
      console.log('🧹 [AUCTION-WINNER] Cleaning up all subscriptions');
      clearInterval(intervalId);

      // Unsubscribe from all channels
      channelsRef.current.forEach((channel, eventEid) => {
        console.log(`🔇 [AUCTION-WINNER] Unsubscribing from ${eventEid}`);
        supabase.removeChannel(channel);
      });
      channelsRef.current.clear();
      processedWinsRef.current.clear();
    };
  }, [person?.id]);

  const handlePaymentComplete = () => {
    console.log('💳 [AUCTION-WINNER] Payment completed, closing modal');
    setShowPaymentModal(false);
    setWonArtwork(null);
    // Clear this win from processed set after a delay
    setTimeout(() => {
      processedWinsRef.current.clear();
    }, 5000);
  };

  const handleModalClose = () => {
    console.log('❌ [AUCTION-WINNER] User closed payment modal');
    setShowPaymentModal(false);
    // Don't clear wonArtwork so user can reopen if needed
  };

  return (
    <AuctionWinnerContext.Provider value={{ wonArtwork, showPaymentModal }}>
      {children}

      {/* Global Payment Modal */}
      <AlertDialog.Root open={showPaymentModal} onOpenChange={(open) => !open && handleModalClose()}>
        <AlertDialog.Content style={{ maxWidth: 500 }}>
          <AlertDialog.Title>🎉 Congratulations! You Won!</AlertDialog.Title>
          <AlertDialog.Description size="2">
            {wonArtwork && (
              <Flex direction="column" gap="3">
                <Text>
                  You are the winning bidder for <strong>{wonArtwork.art_code}</strong>
                  {wonArtwork.artist_profiles?.[0] && (
                    <> by <strong>{wonArtwork.artist_profiles[0].name}</strong></>
                  )}
                </Text>

                {/* Show the artwork image if available */}
                {wonArtwork.art_media?.[0]?.media_files?.[0] && (
                  <Box style={{ textAlign: 'center', marginTop: '8px' }}>
                    <img
                      src={wonArtwork.art_media[0].media_files[0].compressed_url || wonArtwork.art_media[0].media_files[0].original_url}
                      alt={`Artwork ${wonArtwork.art_code}`}
                      style={{
                        maxWidth: '100%',
                        maxHeight: '200px',
                        objectFit: 'contain',
                        borderRadius: '8px'
                      }}
                    />
                  </Box>
                )}

                <Box style={{
                  padding: '12px',
                  background: 'var(--accent-2)',
                  borderRadius: '8px',
                  textAlign: 'center'
                }}>
                  <Text size="5" weight="bold">
                    Winning Bid: ${Math.round(wonArtwork.current_bid)} {wonArtwork.currency || 'CAD'}
                  </Text>
                </Box>

                {/* Payment Button */}
                <PaymentButton
                  artwork={wonArtwork}
                  currentBid={wonArtwork.current_bid}
                  isWinningBidder={true}
                  onPaymentComplete={handlePaymentComplete}
                  onPaymentError={(error) => {
                    console.error('❌ [AUCTION-WINNER] Payment error:', error);
                  }}
                />
              </Flex>
            )}
          </AlertDialog.Description>

          <Flex gap="3" mt="4" justify="end">
            <AlertDialog.Cancel>
              <Button variant="soft" color="gray">
                Pay Later
              </Button>
            </AlertDialog.Cancel>
          </Flex>
        </AlertDialog.Content>
      </AlertDialog.Root>
    </AuctionWinnerContext.Provider>
  );
};
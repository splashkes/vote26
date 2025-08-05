import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Box,
  Container,
  Heading,
  Card,
  Flex,
  Text,
  Button,
  Badge,
  ScrollArea,
  Tabs,
  Avatar,
  Grid,
  IconButton,
  TextField,
  Dialog,
  Separator,
  Skeleton,
} from '@radix-ui/themes';
import {
  ArrowLeftIcon,
  HeartIcon,
  HeartFilledIcon,
  PlusIcon,
} from '@radix-ui/react-icons';
import { supabase } from '../lib/supabase';

// Auction Timer Component
const AuctionTimer = ({ closingTime, status, extended, extensionCount }) => {
  const [timeLeft, setTimeLeft] = useState('');
  const [isUrgent, setIsUrgent] = useState(false);

  useEffect(() => {
    if (status === 'closed' || !closingTime) return;

    const updateTimer = () => {
      const now = new Date();
      const closing = new Date(closingTime);
      const diff = closing - now;

      if (diff <= 0) {
        setTimeLeft('Auction ended');
        return;
      }

      const hours = Math.floor(diff / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diff % (1000 * 60)) / 1000);

      setIsUrgent(diff < 5 * 60 * 1000); // Less than 5 minutes
      
      if (hours > 0) {
        setTimeLeft(`${hours}h ${minutes}m`);
      } else if (minutes > 0) {
        setTimeLeft(`${minutes}m ${seconds}s`);
      } else {
        setTimeLeft(`${seconds}s`);
      }
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);

    return () => clearInterval(interval);
  }, [closingTime, status]);

  if (status === 'closed') {
    return (
      <Badge size="1" variant="soft" color="gray">
        Auction Closed
      </Badge>
    );
  }

  return (
    <Flex align="center" gap="2">
      <Badge 
        size="1" 
        variant={isUrgent ? "solid" : "soft"} 
        color={isUrgent ? "red" : "green"}
      >
        {timeLeft}
      </Badge>
      {extended && extensionCount > 0 && (
        <Badge size="1" variant="outline" color="orange">
          Extended {extensionCount}x
        </Badge>
      )}
    </Flex>
  );
};

const EventDetails = () => {
  const { eventId } = useParams();
  const navigate = useNavigate();
  const [event, setEvent] = useState(null);
  const [rounds, setRounds] = useState([]);
  const [artPieces, setArtPieces] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedArt, setSelectedArt] = useState(null);
  const [votedArt, setVotedArt] = useState(new Set());
  const [bidAmounts, setBidAmounts] = useState({});
  const [showBidDialog, setShowBidDialog] = useState(false);
  const [currentBidArt, setCurrentBidArt] = useState(null);
  const [showPaymentDialog, setShowPaymentDialog] = useState(false);
  const [paymentArt, setPaymentArt] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);

  useEffect(() => {
    fetchEventDetails();
    fetchCurrentUser();
    
    // Set up realtime subscriptions for auction updates
    const channel = supabase
      .channel(`event-${eventId}-auction`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'art',
          filter: `event_id=eq.${eventId}`,
        },
        (payload) => {
          console.log('Art update received:', payload);
          // Update the specific art piece with new bid data
          setArtPieces((prev) =>
            prev.map((art) =>
              art.id === payload.new.id
                ? {
                    ...art,
                    current_bid: payload.new.current_bid,
                    bid_count: payload.new.bid_count,
                    closing_time: payload.new.closing_time,
                    auction_extended: payload.new.auction_extended,
                    extension_count: payload.new.extension_count,
                  }
                : art
            )
          );
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'bids',
        },
        async (payload) => {
          console.log('New bid received:', payload);
          // Find the art piece this bid belongs to
          const artPiece = artPieces.find(art => art.id === payload.new.art_id);
          if (artPiece && artPiece.event_id === eventId) {
            // Update bid count and amount for the specific art piece
            setArtPieces((prev) =>
              prev.map((art) =>
                art.id === payload.new.art_id
                  ? {
                      ...art,
                      highest_bid: Math.max(art.highest_bid || 0, payload.new.amount),
                    }
                  : art
              )
            );
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [eventId]);

  const fetchCurrentUser = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        // Get the person record for this user
        const { data: person } = await supabase
          .from('people')
          .select('*')
          .eq('auth_user_id', user.id)
          .single();
        
        setCurrentUser(person);
      }
    } catch (error) {
      console.error('Error fetching current user:', error);
    }
  };

  const fetchEventDetails = async () => {
    try {
      // Fetch event details
      const { data: eventData, error: eventError } = await supabase
        .from('events')
        .select(`
          *,
          cities (name, state, country)
        `)
        .eq('id', eventId)
        .single();

      if (eventError) throw eventError;
      setEvent(eventData);

      // Fetch rounds
      const { data: roundsData, error: roundsError } = await supabase
        .from('rounds')
        .select('*')
        .eq('event_id', eventId)
        .order('round_number');

      if (roundsError) throw roundsError;
      setRounds(roundsData);

      // Fetch art pieces with artist info and vote/bid counts
      const { data: artData, error: artError } = await supabase
        .from('art')
        .select(`
          *,
          artist_profiles (
            id,
            name,
            entry_id,
            bio,
            instagram,
            city_text
          ),
          votes (count),
          bids (amount)
        `)
        .eq('event_id', eventId)
        .order('round')
        .order('easel');

      if (artError) throw artError;

      // Process art data to include vote counts and highest bids
      const processedArt = artData.map((art) => ({
        ...art,
        vote_count: art.votes?.length || 0,
        highest_bid: art.bids?.length > 0 
          ? Math.max(...art.bids.map(b => b.amount))
          : art.starting_bid || 0,
      }));

      setArtPieces(processedArt);

      // Get media for art pieces
      const artIds = artData.map(a => a.id);
      const { data: mediaData } = await supabase
        .from('art_media')
        .select(`
          art_id,
          media_files (url, type)
        `)
        .in('art_id', artIds);

      // Add media URLs to art pieces
      if (mediaData) {
        const mediaMap = {};
        mediaData.forEach(m => {
          if (!mediaMap[m.art_id]) mediaMap[m.art_id] = [];
          mediaMap[m.art_id].push(m.media_files);
        });

        setArtPieces(prev => prev.map(art => ({
          ...art,
          media: mediaMap[art.id] || []
        })));
      }
    } catch (error) {
      console.error('Error fetching event details:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleVote = async (artId) => {
    // Find the art piece to get its code
    const artPiece = artPieces.find(art => art.id === artId);
    if (!artPiece) return;

    try {
      // Call the secure vote function
      const { data, error } = await supabase
        .rpc('cast_vote_secure', {
          p_art_id: artPiece.art_code
        });

      if (error) throw error;

      if (data?.success) {
        const isVoted = data.action === 'voted';
        
        // Update local state
        if (isVoted) {
          setVotedArt(prev => new Set(prev).add(artId));
        } else {
          setVotedArt(prev => {
            const newSet = new Set(prev);
            newSet.delete(artId);
            return newSet;
          });
        }

        // Update vote count
        setArtPieces(prev => prev.map(art => 
          art.id === artId 
            ? { ...art, vote_count: art.vote_count + (isVoted ? 1 : -1) }
            : art
        ));
      } else {
        alert(data?.error || 'Failed to process vote');
      }
    } catch (error) {
      console.error('Error voting:', error);
      // Check if user is authenticated
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        alert('Please sign in to vote');
      } else {
        alert('Error processing vote. Please try again.');
      }
    }
  };

  const handleBidSubmit = async () => {
    if (!currentBidArt || !bidAmounts[currentBidArt.id]) return;

    const bidAmount = parseFloat(bidAmounts[currentBidArt.id]);
    
    try {
      // Check auth status first
      const { data: { user } } = await supabase.auth.getUser();
      console.log('Current user:', user);
      console.log('User phone:', user?.phone);
      console.log('User metadata:', user?.user_metadata);
      
      // Call the secure bid function
      const { data, error } = await supabase
        .rpc('process_bid_secure', {
          p_art_id: currentBidArt.art_code,
          p_amount: bidAmount
        });

      console.log('Bid response:', data);
      if (error) {
        console.error('Bid error:', error);
        throw error;
      }

      if (data?.success) {
        // Update UI optimistically
        setArtPieces(prev => prev.map(art => 
          art.id === currentBidArt.id 
            ? { 
                ...art, 
                current_bid: bidAmount,
                highest_bid: bidAmount,
                bid_count: (art.bid_count || 0) + 1,
                closing_time: data.new_closing_time || art.closing_time,
                auction_extended: data.auction_extended || art.auction_extended
              }
            : art
        ));
        
        // Show success message
        alert('Bid placed successfully!');
      } else {
        alert(data?.error || 'Failed to place bid');
      }
    } catch (error) {
      console.error('Error placing bid:', error);
      alert('Error placing bid. Please try again.');
    }

    setShowBidDialog(false);
    setCurrentBidArt(null);
    setBidAmounts({});
  };

  const ArtCard = ({ art, roundNumber }) => {
    const isVoted = votedArt.has(art.id);
    const imageUrl = art.media?.find(m => m.type === 'image')?.url;

    return (
      <Card size="2" style={{ marginBottom: '16px' }}>
        <Flex direction="column" gap="3">
          {/* Art Image */}
          {imageUrl ? (
            <Box
              style={{
                width: '100%',
                height: '200px',
                backgroundColor: 'var(--gray-3)',
                borderRadius: 'var(--radius-2)',
                overflow: 'hidden',
              }}
            >
              <img
                src={imageUrl}
                alt={art.art_code}
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                }}
              />
            </Box>
          ) : (
            <Box
              style={{
                width: '100%',
                height: '200px',
                backgroundColor: 'var(--gray-3)',
                borderRadius: 'var(--radius-2)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Text color="gray">No image available</Text>
            </Box>
          )}

          {/* Artist Info */}
          <Flex align="center" gap="3">
            <Avatar
              size="3"
              fallback={art.artist_profiles?.name?.[0] || 'A'}
              color="indigo"
              variant="soft"
            />
            <Box style={{ flex: 1 }}>
              <Text size="3" weight="bold">
                {art.artist_profiles?.name || 'Unknown Artist'}
              </Text>
              <Text size="2" color="gray">
                {art.art_code} • Easel {art.easel}
              </Text>
            </Box>
          </Flex>

          {/* Stats */}
          <Flex gap="4" align="center">
            <Flex align="center" gap="1">
              <IconButton
                size="2"
                variant={isVoted ? 'solid' : 'soft'}
                color="red"
                onClick={() => handleVote(art.id)}
              >
                {isVoted ? <HeartFilledIcon /> : <HeartIcon />}
              </IconButton>
              <Text size="2" weight="medium">
                {art.vote_count}
              </Text>
            </Flex>

            {event?.enable_auction && (
              <Flex direction="column" gap="1" style={{ flex: 1 }}>
                <Flex align="center" gap="2">
                  <Text size="2" color="gray">
                    Current bid:
                  </Text>
                  <Text size="3" weight="bold">
                    ${art.current_bid || art.highest_bid || art.starting_bid || 0}
                  </Text>
                  {art.bid_count > 0 && (
                    <Badge size="1" variant="soft">
                      {art.bid_count} bid{art.bid_count !== 1 ? 's' : ''}
                    </Badge>
                  )}
                </Flex>
                
                {/* Auction status and countdown */}
                {art.closing_time && (
                  <AuctionTimer 
                    closingTime={art.closing_time} 
                    status={art.status}
                    extended={art.auction_extended}
                    extensionCount={art.extension_count}
                  />
                )}
                
                {/* Show appropriate button based on auction status and winner */}
                {art.status === 'closed' && art.winner_id === currentUser?.id ? (
                  <Button
                    size="1"
                    variant="solid"
                    color="green"
                    onClick={() => {
                      setPaymentArt(art);
                      setShowPaymentDialog(true);
                    }}
                  >
                    Pay Now
                  </Button>
                ) : (
                  <Button
                    size="1"
                    variant="soft"
                    disabled={art.status === 'closed'}
                    onClick={() => {
                      setCurrentBidArt(art);
                      setShowBidDialog(true);
                    }}
                  >
                    {art.status === 'closed' ? 'Auction Closed' : 'Place Bid'}
                  </Button>
                )}
              </Flex>
            )}
          </Flex>

          {/* Expand for more details */}
          <Button
            variant="ghost"
            size="2"
            onClick={() => setSelectedArt(art)}
          >
            View Details
          </Button>
        </Flex>
      </Card>
    );
  };

  if (loading) {
    return (
      <Container size="1" style={{ padding: '16px', maxWidth: '480px' }}>
        <Flex direction="column" gap="3">
          <Skeleton height="40px" />
          <Skeleton height="200px" />
          <Skeleton height="200px" />
        </Flex>
      </Container>
    );
  }

  return (
    <Container size="1" style={{ padding: '0', maxWidth: '480px' }}>
      {/* Header */}
      <Box
        style={{
          position: 'sticky',
          top: 0,
          backgroundColor: 'var(--color-background)',
          zIndex: 10,
          borderBottom: '1px solid var(--gray-4)',
          padding: '16px',
        }}
      >
        <Flex align="center" gap="3">
          <IconButton
            size="3"
            variant="ghost"
            onClick={() => navigate('/')}
          >
            <ArrowLeftIcon />
          </IconButton>
          <Box style={{ flex: 1 }}>
            <Heading size="5">{event?.name}</Heading>
            <Text size="2" color="gray">
              {event?.cities?.name}, {event?.cities?.state || event?.cities?.country}
            </Text>
          </Box>
        </Flex>
      </Box>

      {/* Content */}
      <ScrollArea style={{ height: 'calc(100vh - 80px)' }}>
        <Box p="4">
          {/* Event Info */}
          <Card size="2" mb="4">
            <Flex direction="column" gap="2">
              <Text size="2">
                <strong>Venue:</strong> {event?.venue}
              </Text>
              <Text size="2">
                <strong>Event ID:</strong> {event?.eid}
              </Text>
              <Flex gap="2">
                {event?.enable_auction && (
                  <Badge color="green">Auction Active</Badge>
                )}
                {event?.vote_by_link && (
                  <Badge color="blue">Link Voting</Badge>
                )}
              </Flex>
            </Flex>
          </Card>

          {/* Rounds Tabs */}
          <Tabs.Root defaultValue="all">
            <Tabs.List>
              <Tabs.Trigger value="all">All Rounds</Tabs.Trigger>
              {rounds.map((round) => (
                <Tabs.Trigger key={round.id} value={`round-${round.round_number}`}>
                  Round {round.round_number}
                </Tabs.Trigger>
              ))}
            </Tabs.List>

            <Box mt="4">
              <Tabs.Content value="all">
                {artPieces.map((art) => (
                  <ArtCard key={art.id} art={art} />
                ))}
              </Tabs.Content>

              {rounds.map((round) => (
                <Tabs.Content key={round.id} value={`round-${round.round_number}`}>
                  {artPieces
                    .filter((art) => art.round === round.round_number)
                    .map((art) => (
                      <ArtCard key={art.id} art={art} roundNumber={round.round_number} />
                    ))}
                </Tabs.Content>
              ))}
            </Box>
          </Tabs.Root>
        </Box>
      </ScrollArea>

      {/* Bid Dialog */}
      <Dialog.Root open={showBidDialog} onOpenChange={setShowBidDialog}>
        <Dialog.Content style={{ maxWidth: 450 }}>
          <Dialog.Title>Place Bid</Dialog.Title>
          <Dialog.Description size="2" mb="4">
            Place a bid for {currentBidArt?.artist_profiles?.name}'s artwork
          </Dialog.Description>

          <Flex direction="column" gap="3">
            <Text size="2">
              Current highest bid: <strong>${currentBidArt?.current_bid || currentBidArt?.highest_bid || 0}</strong>
            </Text>
            <Text size="2">
              Minimum bid: <strong>${(currentBidArt?.current_bid || currentBidArt?.highest_bid || 0) + (event?.min_bid_increment || 10)}</strong>
            </Text>
            
            {/* Show auction closing time if set */}
            {currentBidArt?.closing_time && (
              <Box>
                <Text size="2" color="gray" mb="1">Auction closes:</Text>
                <AuctionTimer 
                  closingTime={currentBidArt.closing_time} 
                  status={currentBidArt.status}
                  extended={currentBidArt.auction_extended}
                  extensionCount={currentBidArt.extension_count}
                />
                {currentBidArt.auction_extended && (
                  <Text size="1" color="orange" mt="1">
                    ⚠️ Bids within 5 minutes of closing will extend the auction
                  </Text>
                )}
              </Box>
            )}
            
            <TextField.Root>
              <TextField.Slot>$</TextField.Slot>
              <TextField.Input
                type="number"
                placeholder="Enter bid amount"
                value={bidAmounts[currentBidArt?.id] || ''}
                onChange={(e) => setBidAmounts(prev => ({
                  ...prev,
                  [currentBidArt.id]: e.target.value
                }))}
                min={(currentBidArt?.highest_bid || 0) + (event?.min_bid_increment || 10)}
                step={event?.min_bid_increment || 10}
              />
            </TextField.Root>
          </Flex>

          <Flex gap="3" mt="4" justify="end">
            <Dialog.Close>
              <Button variant="soft" color="gray">
                Cancel
              </Button>
            </Dialog.Close>
            <Button onClick={handleBidSubmit}>
              Place Bid
            </Button>
          </Flex>
        </Dialog.Content>
      </Dialog.Root>

      {/* Payment Dialog */}
      <Dialog.Root open={showPaymentDialog} onOpenChange={setShowPaymentDialog}>
        <Dialog.Content style={{ maxWidth: 500 }}>
          <Dialog.Title>Complete Payment</Dialog.Title>
          <Dialog.Description size="2" mb="4">
            Congratulations! You won the auction for {paymentArt?.artist_profiles?.name}'s artwork
          </Dialog.Description>

          <Flex direction="column" gap="4">
            {/* Artwork Details */}
            <Card>
              <Flex direction="column" gap="2">
                <Text size="2" weight="bold">Artwork: {paymentArt?.art_code}</Text>
                <Text size="2">Artist: {paymentArt?.artist_profiles?.name}</Text>
                <Text size="2">Round {paymentArt?.round}, Easel {paymentArt?.easel}</Text>
              </Flex>
            </Card>

            {/* Payment Calculation */}
            <Card>
              <Flex direction="column" gap="2">
                <Flex justify="between">
                  <Text size="2">Winning Bid:</Text>
                  <Text size="2" weight="bold">
                    {event?.currency || '$'}{paymentArt?.current_bid || paymentArt?.highest_bid || 0}
                  </Text>
                </Flex>
                
                {event?.tax_percent > 0 && (
                  <>
                    <Separator size="4" />
                    <Flex justify="between">
                      <Text size="2">Tax ({event.tax_percent}%):</Text>
                      <Text size="2">
                        {event?.currency || '$'}
                        {((paymentArt?.current_bid || paymentArt?.highest_bid || 0) * event.tax_percent / 100).toFixed(2)}
                      </Text>
                    </Flex>
                  </>
                )}
                
                <Separator size="4" />
                <Flex justify="between">
                  <Text size="3" weight="bold">Total Due:</Text>
                  <Text size="3" weight="bold" color="green">
                    {event?.currency || '$'}
                    {(
                      (paymentArt?.current_bid || paymentArt?.highest_bid || 0) * 
                      (1 + (event?.tax_percent || 0) / 100)
                    ).toFixed(2)}
                  </Text>
                </Flex>
              </Flex>
            </Card>

            {/* Payment Instructions */}
            <Card variant="surface">
              <Flex direction="column" gap="2">
                <Text size="2" weight="bold" color="orange">
                  Payment Instructions:
                </Text>
                <Text size="2">
                  • Payment integration coming soon
                </Text>
                <Text size="2">
                  • Please contact event organizers to arrange payment
                </Text>
                <Text size="2">
                  • Reference your winning bid ID: {paymentArt?.id?.slice(0, 8)}
                </Text>
              </Flex>
            </Card>

            {/* Placeholder Payment Button */}
            <Button size="3" disabled>
              Pay with Stripe (Coming Soon)
            </Button>
          </Flex>

          <Flex gap="3" mt="4" justify="end">
            <Dialog.Close>
              <Button variant="soft" color="gray">
                Close
              </Button>
            </Dialog.Close>
          </Flex>
        </Dialog.Content>
      </Dialog.Root>
    </Container>
  );
};

export default EventDetails;
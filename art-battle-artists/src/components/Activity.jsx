import { useState, useEffect } from 'react';
import {
  Heading,
  Text,
  Card,
  Flex,
  Badge,
  Box,
  Skeleton,
  Callout,
  Button,
  Table,
} from '@radix-ui/themes';
import { 
  CalendarIcon,
  PersonIcon,
  InfoCircledIcon
} from '@radix-ui/react-icons';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { getArtworkImageUrls } from '../lib/imageHelpers';
import AuthModal from './AuthModal';

const Activity = () => {
  const { user, person, loading: authLoading } = useAuth();
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [activities, setActivities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!authLoading && user) {
      loadActivity();
    } else if (!authLoading && !user) {
      setLoading(false);
    }
  }, [user, authLoading]);

  const loadActivity = async () => {
    try {
      // Use the same edge function as other components for consistency
      const { data, error } = await supabase.functions.invoke('artist-get-my-profile');

      if (error) {
        console.error('Activity: Secure profile lookup failed:', error);
        setError(`Failed to get your profile: ${error.message || error}`);
        setLoading(false);
        return;
      }

      let artistProfileIds = [];

      if (data.profile) {
        // Single authoritative profile
        artistProfileIds = [data.profile.id];
      } else if (data.candidateProfiles && data.candidateProfiles.length > 0) {
        // Multiple profiles - include all for activity view
        artistProfileIds = data.candidateProfiles.map(p => p.id);
      } else {
        // No profiles found
        setError('No artist profiles found. Please create your profile first.');
        setLoading(false);
        return;
      }

      // Get artwork data with actual payment status
      const { data: artworkData, error: artworkError } = await supabase
        .from('art')
        .select(`
          id,
          art_code,
          description,
          status,
          current_bid,
          created_at,
          artist_id,
          event:events(
            eid,
            name,
            event_start_datetime
          ),
          art_media(
            media_files!art_media_media_id_fkey(
              id,
              cloudflare_id,
              thumbnail_url,
              compressed_url
            )
          )
        `)
        .in('artist_id', artistProfileIds)
        .order('created_at', { ascending: false });

      if (artworkError) throw artworkError;

      // Get actual payment data for these artworks
      const artIds = artworkData.map(art => art.id);
      
      const { data: paymentData, error: paymentError } = await supabase
        .from('payment_processing')
        .select('art_id, amount, currency, status, completed_at')
        .in('art_id', artIds);

      const { data: artistPaymentData, error: artistPaymentError } = await supabase
        .from('artist_payments')
        .select('art_id, net_amount, currency, status, paid_at')
        .in('artist_profile_id', artistProfileIds);

      // Create lookup maps for payments
      const paymentMap = {};
      const artistPaymentMap = {};

      if (paymentData) {
        paymentData.forEach(payment => {
          paymentMap[payment.art_id] = payment;
        });
      }

      if (artistPaymentData) {
        artistPaymentData.forEach(payment => {
          artistPaymentMap[payment.art_id] = payment;
        });
      }

      // Transform data with actual payment status
      const transformedData = artworkData.map(art => {
        const payment = paymentMap[art.id];
        const artistPayment = artistPaymentMap[art.id];
        const eventCodeFromArt = art.art_code ? art.art_code.split('-')[0] : null;

        // Determine payment status based on actual payment records
        let paymentStatus = 'no_bids';
        let buyerPaidAmount = null;
        let artistNetAmount = null;

        if (payment && payment.status === 'completed') {
          paymentStatus = 'buyer_paid';
          buyerPaidAmount = payment.amount;
          
          if (artistPayment && artistPayment.status === 'paid' && artistPayment.paid_at) {
            paymentStatus = 'artist_paid';
            artistNetAmount = artistPayment.net_amount;
          }
        } else if (art.current_bid > 0) {
          paymentStatus = 'awaiting_buyer_payment';
        }

        return {
          art_id: art.id,
          art_code: art.art_code,
          title: art.description || art.art_code,
          art_status: art.status,
          current_bid: art.current_bid,
          art_created_at: art.created_at,
          event_title: art.event?.eid || art.event?.name || eventCodeFromArt || 'Unknown Event',
          event_date: art.event?.event_start_datetime || art.created_at,
          payment_status: paymentStatus,
          buyer_paid_amount: buyerPaidAmount,
          artist_net_amount: artistNetAmount,
          artist_paid_at: artistPayment?.paid_at,
          currency: payment?.currency || artistPayment?.currency || 'USD',
          art_media: art.art_media
        };
      });

      setActivities(transformedData);
    } catch (err) {
      setError('Failed to load activity: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'Date unknown';
    
    try {
      const date = new Date(dateString);
      if (isNaN(date.getTime())) return 'Invalid date';
      
      return date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
      });
    } catch (e) {
      return 'Date error';
    }
  };

  const formatAmount = (amount, currency = 'USD') => {
    if (!amount) return '--';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency
    }).format(amount);
  };

  const getPaymentStatusBadge = (status) => {
    const statusConfig = {
      no_bids: { color: 'gray', text: 'No Bids' },
      awaiting_buyer_payment: { color: 'orange', text: 'Awaiting Buyer Payment' },
      buyer_paid: { color: 'green', text: 'Buyer Paid' },
      artist_paid: { color: 'jade', text: 'Artist Paid' },
      unknown: { color: 'gray', text: 'Unknown' }
    };

    const config = statusConfig[status] || statusConfig.unknown;
    return (
      <Badge color={config.color} variant="soft">
        {config.text}
      </Badge>
    );
  };

  if (authLoading || loading) {
    return (
      <Box>
        <Heading size="6" mb="4">Activity</Heading>
        <Flex direction="column" gap="4">
          {[1, 2, 3].map((i) => (
            <Card key={i} size="3">
              <Skeleton height="60px" />
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
            <Heading size="6">Activity</Heading>
            <Text size="3" color="gray" align="center">
              Sign in to view your artwork activity and payment status
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

  return (
    <Flex direction="column" gap="6">
      <Flex direction="column" gap="2">
        <Heading size="6">Activity</Heading>
        <Text size="3" color="gray">
          Your artwork history and payment status
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

      {activities.length === 0 ? (
        <Card size="3">
          <Flex direction="column" align="center" gap="3" py="6">
            <CalendarIcon width="48" height="48" />
            <Text size="4" weight="bold">No Activity</Text>
            <Text size="3" color="gray" align="center">
              You haven't created any artwork yet
            </Text>
          </Flex>
        </Card>
      ) : (
        <Card size="3">
          <Table.Root variant="ghost">
            <Table.Header>
              <Table.Row>
                <Table.ColumnHeaderCell>Artwork</Table.ColumnHeaderCell>
                <Table.ColumnHeaderCell>Event</Table.ColumnHeaderCell>
                <Table.ColumnHeaderCell>Date</Table.ColumnHeaderCell>
                <Table.ColumnHeaderCell>Final Bid</Table.ColumnHeaderCell>
                <Table.ColumnHeaderCell>Payment Status</Table.ColumnHeaderCell>
                <Table.ColumnHeaderCell>Your Payment</Table.ColumnHeaderCell>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {activities.map((activity) => {
                const latestMedia = activity.art_media?.[0]?.media_files;
                const imageUrls = getArtworkImageUrls(activity, latestMedia);

                return (
                  <Table.Row key={activity.art_id}>
                    <Table.Cell>
                      <Flex align="center" gap="3">
                        <Box
                          style={{
                            width: '40px',
                            height: '40px',
                            borderRadius: '6px',
                            overflow: 'hidden',
                            backgroundColor: 'var(--gray-3)',
                            flexShrink: 0
                          }}
                        >
                          {imageUrls.thumbnail || imageUrls.compressed || imageUrls.original ? (
                            <img
                              src={imageUrls.thumbnail || imageUrls.compressed || imageUrls.original}
                              alt={activity.title || activity.art_code}
                              style={{
                                width: '100%',
                                height: '100%',
                                objectFit: 'cover'
                              }}
                            />
                          ) : (
                            <Flex 
                              style={{ width: '100%', height: '100%' }}
                              align="center" 
                              justify="center"
                            >
                              <Text size="1" color="gray">No Image</Text>
                            </Flex>
                          )}
                        </Box>
                        <Flex direction="column" gap="1">
                          <Text size="2" weight="medium">
                            {activity.title || activity.art_code}
                          </Text>
                          <Text size="1" color="gray">
                            {activity.art_code}
                          </Text>
                        </Flex>
                      </Flex>
                    </Table.Cell>
                    
                    <Table.Cell>
                      <Text size="2">
                        {activity.event_title || 'Unknown Event'}
                      </Text>
                    </Table.Cell>
                    
                    <Table.Cell>
                      <Text size="2" color="gray">
                        {formatDate(activity.event_date || activity.art_created_at)}
                      </Text>
                    </Table.Cell>
                    
                    <Table.Cell>
                      <Text size="2" weight="medium">
                        {activity.current_bid > 0 
                          ? formatAmount(activity.current_bid, activity.currency)
                          : '--'
                        }
                      </Text>
                    </Table.Cell>
                    
                    <Table.Cell>
                      {getPaymentStatusBadge(activity.payment_status)}
                    </Table.Cell>
                    
                    <Table.Cell>
                      <Flex direction="column" gap="1">
                        <Text size="2" weight="medium" color="green">
                          {activity.artist_net_amount 
                            ? formatAmount(activity.artist_net_amount, activity.currency)
                            : activity.buyer_paid_amount
                            ? formatAmount(activity.buyer_paid_amount * 0.5, activity.currency) + ' (pending)'
                            : '--'
                          }
                        </Text>
                        {activity.artist_paid_at && (
                          <Text size="1" color="gray">
                            Paid {formatDate(activity.artist_paid_at)}
                          </Text>
                        )}
                        {activity.buyer_paid_amount && !activity.artist_net_amount && (
                          <Text size="1" color="orange">
                            50% of {formatAmount(activity.buyer_paid_amount, activity.currency)}
                          </Text>
                        )}
                      </Flex>
                    </Table.Cell>
                  </Table.Row>
                );
              })}
            </Table.Body>
          </Table.Root>
        </Card>
      )}
    </Flex>
  );
};

export default Activity;
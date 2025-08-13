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
    if (!authLoading && user && person) {
      loadActivity();
    } else if (!authLoading && !user) {
      setLoading(false);
    }
  }, [user, person, authLoading]);

  const loadActivity = async () => {
    try {
      // Use the new primary profile system
      const { data: primaryCheck, error: primaryError } = await supabase
        .rpc('has_primary_profile', { target_person_id: person.id });

      if (primaryError) {
        throw primaryError;
      }

      if (!primaryCheck || primaryCheck.length === 0) {
        setError('No primary profile found. Please set up your profile first.');
        setLoading(false);
        return;
      }

      const result = primaryCheck[0];
      if (!result.has_primary || !result.profile_id) {
        setError('No primary profile found. Please set up your profile first.');
        setLoading(false);
        return;
      }

      const artistProfileId = result.profile_id;

      // Get activity data using the new view
      const { data: activityData, error: activityError } = await supabase
        .from('artist_activity_with_payments')
        .select('*')
        .eq('artist_profile_id', artistProfileId)
        .order('art_created_at', { ascending: false });

      if (activityError) {
        // Fallback to direct query if view doesn't exist yet
        // First try to find art by artist_profile_id (if column exists), then by artist_id
        let fallbackData, fallbackError;
        
        // Try with artist_profile_id first (new schema)
        const { data: newSchemaData, error: newSchemaError } = await supabase
          .from('art')
          .select(`
            id,
            art_code,
            description,
            status,
            current_bid,
            created_at,
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
          .eq('artist_profile_id', artistProfileId)
          .order('created_at', { ascending: false });

        if (newSchemaError) {
          // Fallback to artist_id (old schema)
          const { data: oldSchemaData, error: oldSchemaError } = await supabase
            .from('art')
            .select(`
              id,
              art_code,
              description,
              status,
              current_bid,
              created_at,
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
            .eq('artist_id', artistProfileId)
            .order('created_at', { ascending: false });
            
          fallbackData = oldSchemaData;
          fallbackError = oldSchemaError;
        } else {
          fallbackData = newSchemaData;
          fallbackError = newSchemaError;
        }

        if (fallbackError) throw fallbackError;

        console.log('Fallback data found:', fallbackData?.length || 0, 'artworks');
        if (fallbackData?.length > 0) {
          console.log('Sample artwork:', fallbackData[0]);
        }

        // Transform fallback data to match expected format
        const transformedData = fallbackData.map(art => {
          // Extract event code from art_code (e.g., "AB3009" from "AB3009-1-2")
          const eventCodeFromArt = art.art_code ? art.art_code.split('-')[0] : null;
          
          return {
            art_id: art.id,
            art_code: art.art_code,
            title: art.description || art.art_code,
            art_status: art.status,
            current_bid: art.current_bid,
            art_created_at: art.created_at,
            event_title: art.event?.eid || art.event?.name || eventCodeFromArt || 'Unknown Event',
            event_date: art.event?.event_start_datetime || art.created_at,
            payment_status: art.current_bid && art.current_bid > 0 
              ? (art.status === 'paid' ? 'buyer_paid' : 'closed_unpaid')
              : 'no_bids',
            buyer_paid_amount: null,
            artist_net_amount: null,
            currency: 'USD',
            art_media: art.art_media
          };
        });

        setActivities(transformedData);
      } else {
        setActivities(activityData);
      }
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
      available: { color: 'blue', text: 'Available' },
      closed_unpaid: { color: 'orange', text: 'Closed, Unpaid' },
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
                            : '--'
                          }
                        </Text>
                        {activity.artist_paid_at && (
                          <Text size="1" color="gray">
                            Paid {formatDate(activity.artist_paid_at)}
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
import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, Text, Heading, Flex, Button, Box, Badge } from '@radix-ui/themes';
import { supabase } from '../lib/supabase';
import { getArtworkImageUrls } from '../lib/imageHelpers';

const PaymentReceipt = () => {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const [payment, setPayment] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchPaymentDetails = async () => {
      if (!sessionId) {
        setError('No session ID provided');
        setLoading(false);
        return;
      }

      try {
        console.log('Fetching payment details for session:', sessionId);

        // Fetch payment details with related data
        const { data: paymentData, error: paymentError } = await supabase
          .from('payment_processing')
          .select(`
            id,
            art_id,
            person_id,
            event_id,
            amount,
            amount_with_tax,
            currency,
            status,
            payment_method,
            created_at,
            completed_at,
            stripe_checkout_session_id,
            art:art_id (
              art_code,
              status,
              artist_profiles (
                name
              )
            ),
            people:person_id (
              first_name,
              last_name,
              email
            ),
            events:event_id (
              name,
              id
            )
          `)
          .eq('stripe_checkout_session_id', sessionId)
          .single();

        if (paymentError) {
          console.error('Error fetching payment:', paymentError);
          setError('Payment not found');
          setLoading(false);
          return;
        }

        if (!paymentData) {
          setError('Payment not found');
          setLoading(false);
          return;
        }

        // Fetch artwork media with created_at for proper sorting (same as EventDetails)
        if (paymentData.art_id) {
          const { data: mediaData, error: mediaError } = await supabase
            .from('art_media')
            .select(`
              art_id,
              media_id,
              is_primary,
              display_order,
              media_files!art_media_media_id_fkey (
                id,
                original_url,
                thumbnail_url,
                compressed_url,
                cloudflare_id,
                file_type,
                created_at
              )
            `)
            .eq('art_id', paymentData.art_id)
            .eq('media_files.file_type', 'image');

          if (!mediaError && mediaData && mediaData.length > 0) {
            // Sort by created_at (latest first) - same logic as EventDetails
            const sortedMedia = mediaData
              .filter(media => media.media_files) // Only include media with valid files
              .sort((a, b) => {
                const dateA = new Date(a.media_files.created_at);
                const dateB = new Date(b.media_files.created_at);
                return dateB - dateA; // Latest first
              });
            
            paymentData.art.art_media = sortedMedia;
          }
        }

        console.log('Payment data loaded:', paymentData);
        setPayment(paymentData);

      } catch (err) {
        console.error('Error loading payment details:', err);
        setError('Error loading payment details');
      } finally {
        setLoading(false);
      }
    };

    fetchPaymentDetails();
  }, [sessionId]);

  const handleBackToEvent = () => {
    if (payment?.event_id) {
      navigate(`/event/${payment.event_id}`);
    } else {
      navigate('/');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-900">
        <Card className="p-8">
          <Text size="4">Loading payment details...</Text>
        </Card>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-900">
        <Card className="p-8 max-w-md">
          <Flex direction="column" gap="4" align="center">
            <Text size="4" color="red">❌ {error}</Text>
            <Button onClick={() => navigate('/')} variant="soft">
              Return to Events
            </Button>
          </Flex>
        </Card>
      </div>
    );
  }

  const formatCurrency = (amount, currency) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency?.toUpperCase() || 'USD',
    }).format(amount);
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'Processing...';
    return new Date(dateString).toLocaleString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-900 p-4">
      <Card 
        className="p-8 max-w-lg w-full"
        style={{ 
          backgroundColor: 'rgba(34, 197, 94, 0.1)', 
          border: '2px solid rgb(34, 197, 94)',
          borderRadius: '12px'
        }}
      >
        <Flex direction="column" gap="6" align="center">
          {/* Success Header */}
          <Box style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '4rem', marginBottom: '1rem' }}>✅</div>
            <Heading size="6" style={{ color: 'rgb(34, 197, 94)' }}>
              Payment Successful!
            </Heading>
          </Box>

          {/* Payment Status Badge */}
          <Badge 
            size="3" 
            color={payment?.status === 'completed' ? 'green' : 'orange'}
            variant="soft"
          >
            {payment?.status?.toUpperCase() || 'PROCESSING'}
          </Badge>

          {/* Artwork Details */}
          <Box style={{ textAlign: 'center', width: '100%' }}>
            <Text size="2" color="gray">Artwork</Text>
            
            {/* Artwork Image */}
            {(() => {
              // Get primary or latest media (same logic as EventDetails)
              const primaryMedia = payment?.art?.art_media?.find(am => am.is_primary) || payment?.art?.art_media?.[0];
              const mediaFile = primaryMedia?.media_files;
              const imageUrls = getArtworkImageUrls(payment?.art, mediaFile);
              const thumbnail = imageUrls.compressed || imageUrls.original;
              
              if (thumbnail) {
                return (
                  <Box style={{ margin: '1rem 0' }}>
                    <img
                      src={thumbnail}
                      alt={payment?.art?.art_code || 'Artwork'}
                      style={{
                        maxWidth: '100%',
                        maxHeight: '200px',
                        objectFit: 'contain',
                        borderRadius: '8px',
                        border: '1px solid rgba(255,255,255,0.2)'
                      }}
                      onError={(e) => {
                        e.target.style.display = 'none';
                      }}
                    />
                  </Box>
                );
              }
              return null;
            })()}
            
            <Heading size="4" style={{ margin: '0.5rem 0' }}>
              {payment?.art?.art_code || 'Loading...'}
            </Heading>
            <Text size="3" style={{ color: 'rgb(156, 163, 175)' }}>
              by {payment?.art?.artist_profiles?.name || 'Unknown Artist'}
            </Text>
          </Box>

          {/* Payment Amount */}
          <Box style={{ textAlign: 'center' }}>
            <Text size="2" color="gray">Amount Paid</Text>
            <Heading size="7" style={{ color: 'rgb(34, 197, 94)', margin: '0.5rem 0' }}>
              {formatCurrency(payment?.amount_with_tax || payment?.amount || 0, payment?.currency)}
            </Heading>
          </Box>

          {/* Buyer Details */}
          <Box style={{ textAlign: 'center' }}>
            <Text size="2" color="gray">Buyer</Text>
            <Text size="4" weight="bold" style={{ display: 'block', margin: '0.5rem 0' }}>
              {payment?.people?.first_name} {payment?.people?.last_name}
            </Text>
            <Text size="2" color="gray">
              {payment?.people?.email}
            </Text>
          </Box>

          {/* Payment Details */}
          <Box style={{ width: '100%', borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '1rem' }}>
            <Flex direction="column" gap="2">
              <Flex justify="between">
                <Text size="2" color="gray">Payment Method</Text>
                <Text size="2">{payment?.payment_method?.toUpperCase() || 'Stripe'}</Text>
              </Flex>
              <Flex justify="between">
                <Text size="2" color="gray">Transaction Date</Text>
                <Text size="2">{formatDate(payment?.completed_at || payment?.created_at)}</Text>
              </Flex>
              <Flex justify="between">
                <Text size="2" color="gray">Session ID</Text>
                <Text size="1" style={{ fontFamily: 'monospace', wordBreak: 'break-all' }}>
                  {sessionId?.substring(0, 20)}...
                </Text>
              </Flex>
            </Flex>
          </Box>

          {/* Action Buttons */}
          <Flex gap="3" style={{ width: '100%', marginTop: '1rem' }}>
            <Button 
              onClick={handleBackToEvent}
              size="3"
              variant="soft"
              style={{ flex: 1 }}
            >
              Back to Event
            </Button>
            <Button 
              onClick={() => window.print()}
              size="3"
              variant="outline"
              style={{ flex: 1 }}
            >
              Print Receipt
            </Button>
          </Flex>
        </Flex>
      </Card>
    </div>
  );
};

export default PaymentReceipt;
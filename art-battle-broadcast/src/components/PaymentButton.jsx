import { useState, useEffect, useCallback } from 'react';
import { Button, Spinner, Text, Badge, Flex, Box } from '@radix-ui/themes';
import { CheckCircledIcon, CrossCircledIcon, LockClosedIcon } from '@radix-ui/react-icons';
import { supabase } from '../lib/supabase';
import { useOfferNotifications } from '../hooks/useOfferNotifications';

const PaymentButton = ({ 
  artwork, 
  currentBid, 
  isWinningBidder,
  onPaymentComplete 
}) => {
  const [loading, setLoading] = useState(false);
  const [checkingStatus, setCheckingStatus] = useState(true);
  const [paymentStatus, setPaymentStatus] = useState(null);
  const [error, setError] = useState(null);
  const [raceAlert, setRaceAlert] = useState(null); // For showing race notifications

  useEffect(() => {
    checkPaymentStatus();
  }, [artwork.id]);

  // Handle offer change notifications
  const handleOfferChange = useCallback((notification) => {
    console.log('PaymentButton: Offer change notification', notification);

    // Refresh payment status to get updated offer information
    checkPaymentStatus();

    // Show temporary alert for offer changes
    if (notification.isForCurrentUser) {
      if (notification.type === 'insert') {
        setRaceAlert({
          type: 'offer_received',
          message: '🎯 New artwork offer received! You can now pay at your bid price.',
          color: 'amber'
        });
      } else if (notification.type === 'update' && notification.offer.status === 'expired') {
        setRaceAlert({
          type: 'offer_expired',
          message: '⏰ Your artwork offer has expired.',
          color: 'gray'
        });
      } else if (notification.type === 'update' && notification.offer.status === 'overtaken') {
        setRaceAlert({
          type: 'offer_overtaken',
          message: '😔 Someone else won the payment race.',
          color: 'red'
        });
      }

      // Auto-dismiss alerts after 10 seconds
      setTimeout(() => setRaceAlert(null), 10000);
    }
  }, []);

  // Handle payment race updates
  const handlePaymentRaceUpdate = useCallback((notification) => {
    console.log('PaymentButton: Payment race update', notification);

    if (notification.type === 'payment_completed') {
      // Someone completed payment - refresh status
      checkPaymentStatus();

      // Show alert if this was a race completion
      if (notification.race_result === 'lost') {
        setRaceAlert({
          type: 'race_lost',
          message: '😔 Payment race lost - someone else paid first.',
          color: 'red'
        });
      } else if (notification.race_result === 'won') {
        setRaceAlert({
          type: 'race_won',
          message: '🎉 Payment completed successfully!',
          color: 'green'
        });

        // Call the completion callback
        if (onPaymentComplete) {
          onPaymentComplete();
        }
      }

      // Auto-dismiss alerts after 8 seconds
      setTimeout(() => setRaceAlert(null), 8000);
    } else if (notification.type === 'offer_change') {
      // Offer count changed - refresh status for race condition display
      checkPaymentStatus();
    }
  }, [onPaymentComplete]);

  // Set up real-time notifications
  const { isConnected } = useOfferNotifications(
    artwork.id,
    handleOfferChange,
    handlePaymentRaceUpdate
  );

  const checkPaymentStatus = async () => {
    try {
      setCheckingStatus(true);

      // Get session and only include auth header if we have a valid token
      const { data: { session } } = await supabase.auth.getSession();
      const headers = {
        'apikey': supabase.supabaseKey,
        'Content-Type': 'application/json'
      };

      // Only add Authorization header if we have a valid access token
      if (session?.access_token) {
        headers['Authorization'] = `Bearer ${session.access_token}`;
      }

      // Use GET request with query parameters as the edge function expects
      const response = await fetch(`${supabase.supabaseUrl}/functions/v1/stripe-payment-status?art_id=${artwork.id}`, {
        method: 'GET',
        headers
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      setPaymentStatus(data);
    } catch (err) {
      console.error('Error checking payment status:', err);
      setError(`Payment status check failed: ${err.message}`);
    } finally {
      setCheckingStatus(false);
    }
  };

  const handlePayment = async () => {
    try {
      setLoading(true);
      setError(null);

      // Call edge function to create checkout session
      // Let the edge function use its default URLs which have the correct format
      const { data, error } = await supabase.functions.invoke('stripe-create-checkout', {
        body: {
          art_id: artwork.id
          // success_url and cancel_url will use the defaults in the edge function
        }
      });

      if (error) throw error;

      if (data.url) {
        // Redirect to Stripe Checkout
        window.location.href = data.url;
      } else {
        throw new Error('No checkout URL returned');
      }
    } catch (err) {
      console.error('Payment error:', err);

      // Check if this is a "not winning bidder" error
      const errorMessage = err.message || 'Failed to initiate payment';
      if (errorMessage.includes('not the winning bidder') || errorMessage.includes('winning bidder')) {
        setError('It appears you are not the top bidder for this artwork. Please refresh the page to see current bid status.');
      } else {
        setError(errorMessage);
      }

      setLoading(false);
    }
  };

  // Don't show button if not sold status
  if (artwork.status !== 'sold' && artwork.status !== 'paid' && artwork.status !== 'closed') {
    return null;
  }

  // Show loading while checking status
  if (checkingStatus) {
    return (
      <Box py="3">
        <Flex align="center" gap="2">
          <Spinner size="2" />
          <Text size="2" color="gray">Checking payment status...</Text>
        </Flex>
      </Box>
    );
  }

  // If payment is completed
  if (paymentStatus?.payment_status === 'completed' || artwork.status === 'paid') {
    return (
      <Box py="3">
        <Badge color="green" size="3">
          <CheckCircledIcon />
          <Text ml="1">PAID</Text>
        </Badge>
        {paymentStatus?.completed_at && (
          <Text size="1" color="gray" style={{ display: 'block', marginTop: '4px' }}>
            Payment completed {new Date(paymentStatus.completed_at).toLocaleDateString()}
          </Text>
        )}
      </Box>
    );
  }

  // If payment is processing
  if (paymentStatus?.payment_status === 'processing') {
    return (
      <Box py="3">
        <Badge color="yellow" size="3">
          <Spinner size="1" />
          <Text ml="1">Processing Payment...</Text>
        </Badge>
      </Box>
    );
  }

  // Handle payment races and offers
  const hasActiveOffer = paymentStatus?.has_active_offer;
  const activeOffer = paymentStatus?.active_offer;
  const isRaceCondition = hasActiveOffer && paymentStatus?.is_winning_bidder;

  // If user has an active offer but is not the winning bidder
  if (hasActiveOffer && !paymentStatus?.is_winning_bidder) {
    return (
      <Box py="3">
        <Flex direction="column" gap="3">
          {/* Race Status Header */}
          <Badge color="amber" size="3" style={{ textAlign: 'center' }}>
            ⚡ Payment Race Active
          </Badge>

          {/* Offer Details */}
          <Box style={{
            padding: '12px',
            backgroundColor: 'var(--amber-2)',
            border: '1px solid var(--amber-6)',
            borderRadius: '8px'
          }}>
            <Text size="2" weight="medium" style={{ display: 'block', marginBottom: '8px' }}>
              🎯 Special Offer for You!
            </Text>
            <Text size="2" style={{ display: 'block', marginBottom: '4px' }}>
              You can purchase this artwork for <strong>{formatAmount(activeOffer?.offered_amount || currentBid, currency)}</strong>
            </Text>
            <Text size="1" color="gray" style={{ display: 'block', marginBottom: '8px' }}>
              Expires: {activeOffer?.expires_at ? new Date(activeOffer.expires_at).toLocaleString() : 'Soon'}
            </Text>
            <Text size="1" color="amber" style={{ fontWeight: 'bold' }}>
              ⚠️ First to pay wins! The current winner can also pay at any time.
            </Text>
          </Box>

          {/* Payment Button */}
          <Button
            size="3"
            variant="solid"
            color="amber"
            onClick={handlePayment}
            disabled={loading}
            style={{ width: '100%' }}
          >
            {loading ? (
              <>
                <Spinner size="2" />
                <Text ml="2">Redirecting to payment...</Text>
              </>
            ) : (
              <>
                <LockClosedIcon />
                <Text ml="2">Pay {formatAmount(activeOffer?.offered_amount || currentBid, currency)} Now</Text>
              </>
            )}
          </Button>
        </Flex>
      </Box>
    );
  }

  // Only show payment button to winning bidder (use API response, not prop)
  if (!paymentStatus?.is_winning_bidder) {
    if (artwork.status === 'sold') {
      return (
        <Box py="3">
          <Badge color="orange" size="3">
            <LockClosedIcon />
            <Text ml="1">Pending Payment</Text>
          </Badge>
          {paymentStatus?.winner_info && (
            <Text size="1" color="gray" style={{ display: 'block', marginTop: '4px' }}>
              Winner: {paymentStatus.winner_info.display_name}
            </Text>
          )}
        </Box>
      );
    }
    return null;
  }

  // Show payment button for winning bidder
  const amount = paymentStatus?.amount || currentBid;
  const currency = paymentStatus?.currency || 'USD';

  // Format amount with currency
  const formatAmount = (amount, currency) => {
    try {
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: currency,
        minimumFractionDigits: 0,
        maximumFractionDigits: 2
      }).format(amount);
    } catch {
      // Fallback for unsupported currencies
      const symbols = {
        'USD': '$',
        'CAD': 'C$',
        'GBP': '£',
        'EUR': '€',
        'MXN': 'MX$'
      };
      const symbol = symbols[currency] || '$';
      return `${symbol}${amount.toFixed(2)}`;
    }
  };

  // Check if there are competing offers (race condition for winner)
  const activeOfferCount = paymentStatus?.active_offer_count || 0;
  const isWinnerInRace = activeOfferCount > 0;

  return (
    <Box py="3">
      <Flex direction="column" gap="2">
        {/* Real-time race alerts */}
        {raceAlert && (
          <Box style={{
            padding: '10px',
            backgroundColor: `var(--${raceAlert.color}-2)`,
            border: `1px solid var(--${raceAlert.color}-6)`,
            borderRadius: '8px',
            marginBottom: '8px',
            animation: 'fadeIn 0.3s ease-in-out'
          }}>
            <Text size="2" weight="medium" color={raceAlert.color}>
              {raceAlert.message}
            </Text>
            {!isConnected && (
              <Text size="1" color="gray" style={{ display: 'block', marginTop: '4px' }}>
                ⚠️ Real-time updates may be delayed
              </Text>
            )}
          </Box>
        )}

        {/* Race warning for winning bidder */}
        {isWinnerInRace && (
          <Box style={{
            padding: '12px',
            backgroundColor: 'var(--red-2)',
            border: '1px solid var(--red-6)',
            borderRadius: '8px',
            marginBottom: '8px'
          }}>
            <Text size="2" weight="medium" color="red" style={{ display: 'block', marginBottom: '4px' }}>
              ⚡ Payment Race Alert!
            </Text>
            <Text size="2" style={{ display: 'block' }}>
              {activeOfferCount} other bidder{activeOfferCount > 1 ? 's have' : ' has'} been offered this artwork.
            </Text>
            <Text size="1" color="red" style={{ fontWeight: 'bold', marginTop: '4px', display: 'block' }}>
              ⚠️ Pay now to secure your purchase - first payment wins!
            </Text>
          </Box>
        )}

        <Button
          size="3"
          variant="solid"
          color={isWinnerInRace ? "red" : "blue"}
          onClick={handlePayment}
          disabled={loading}
          style={{ width: '100%' }}
        >
          {loading ? (
            <>
              <Spinner size="2" />
              <Text ml="2">Redirecting to payment...</Text>
            </>
          ) : (
            <>
              <LockClosedIcon />
              <Text ml="2">{isWinnerInRace ? 'Pay Now to Win!' : 'Click to Pay'} {formatAmount(amount, currency)}</Text>
            </>
          )}
        </Button>

        {error && (
          <Flex align="center" gap="1">
            <CrossCircledIcon color="red" />
            <Text size="2" color="red">{error}</Text>
          </Flex>
        )}

        <Text size="1" color="gray" style={{ textAlign: 'center' }}>
          Secure payment via Stripe
        </Text>
      </Flex>
    </Box>
  );
};

export default PaymentButton;
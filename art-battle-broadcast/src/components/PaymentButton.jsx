import { useState, useEffect } from 'react';
import { Button, Spinner, Text, Badge, Flex, Box } from '@radix-ui/themes';
import { CheckCircledIcon, CrossCircledIcon, LockClosedIcon } from '@radix-ui/react-icons';
import { supabase } from '../lib/supabase';

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

  useEffect(() => {
    checkPaymentStatus();
  }, [artwork.id]);

  const checkPaymentStatus = async () => {
    try {
      setCheckingStatus(true);
      // Use GET request with query parameters as the edge function expects
      const response = await fetch(`${supabase.supabaseUrl}/functions/v1/stripe-payment-status?art_id=${artwork.id}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`,
          'apikey': supabase.supabaseKey,
          'Content-Type': 'application/json'
        }
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

  return (
    <Box py="3">
      <Flex direction="column" gap="2">
        <Button
          size="3"
          variant="solid"
          color="blue"
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
              <Text ml="2">Click to Pay {formatAmount(amount, currency)}</Text>
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
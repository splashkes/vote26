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
  Grid,
  Separator,
} from '@radix-ui/themes';
import { 
  CheckIcon,
  PersonIcon,
  InfoCircledIcon,
  CheckCircledIcon,
  ClockIcon,
  ExclamationTriangleIcon
} from '@radix-ui/react-icons';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import AuthModal from './AuthModal';
import StripeConnectOnboarding from './StripeConnectOnboarding';

const PaymentDashboard = () => {
  const { user, person, loading: authLoading } = useAuth();
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [paymentData, setPaymentData] = useState({
    totalEarnings: 0,
    pendingPayments: 0,
    paidAmount: 0,
    artworksSold: 0,
    recentPayments: []
  });
  const [stripeAccount, setStripeAccount] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!authLoading && user && person) {
      loadPaymentData();
      loadStripeAccount();
    } else if (!authLoading && !user) {
      setLoading(false);
    }
  }, [user, person, authLoading]);

  const loadPaymentData = async () => {
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

      // Get payment summary
      const { data: activityData, error: activityError } = await supabase
        .from('artist_activity_with_payments')
        .select('*')
        .eq('artist_profile_id', artistProfileId);

      if (activityError) {
        // Fallback query if view doesn't exist
        const { data: fallbackData, error: fallbackError } = await supabase
          .from('art')
          .select(`
            id,
            current_bid,
            status,
            created_at,
            event:events(eid, name)
          `)
          .eq('artist_id', artistProfileId);

        if (fallbackError) throw fallbackError;

        // Calculate summary from fallback data
        const soldArtworks = fallbackData.filter(art => art.current_bid > 0);
        const totalEarnings = soldArtworks.reduce((sum, art) => sum + (art.current_bid * 0.85), 0); // Assuming 15% platform fee

        setPaymentData({
          totalEarnings: totalEarnings,
          pendingPayments: totalEarnings,
          paidAmount: 0,
          artworksSold: soldArtworks.length,
          recentPayments: []
        });
      } else {
        // Calculate summary from activity data
        const soldArtworks = activityData.filter(activity => 
          activity.payment_status === 'buyer_paid' || activity.payment_status === 'artist_paid'
        );
        
        const totalEarnings = soldArtworks.reduce((sum, activity) => 
          sum + (activity.buyer_paid_amount || activity.current_bid || 0) * 0.85, 0
        );
        
        const paidAmount = activityData
          .filter(activity => activity.payment_status === 'artist_paid')
          .reduce((sum, activity) => sum + (activity.artist_net_amount || 0), 0);

        const pendingAmount = activityData
          .filter(activity => activity.payment_status === 'buyer_paid')
          .reduce((sum, activity) => sum + (activity.buyer_paid_amount || 0) * 0.85, 0);

        setPaymentData({
          totalEarnings: totalEarnings,
          pendingPayments: pendingAmount,
          paidAmount: paidAmount,
          artworksSold: soldArtworks.length,
          recentPayments: activityData
            .filter(activity => activity.artist_paid_at)
            .sort((a, b) => new Date(b.artist_paid_at) - new Date(a.artist_paid_at))
            .slice(0, 5)
        });
      }
    } catch (err) {
      setError('Failed to load payment data: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const loadStripeAccount = async () => {
    try {
      // Use the new primary profile system
      const { data: primaryCheck, error: primaryError } = await supabase
        .rpc('has_primary_profile', { target_person_id: person.id });

      if (primaryError || !primaryCheck || primaryCheck.length === 0) return;

      const result = primaryCheck[0];
      if (!result.has_primary || !result.profile_id) return;

      const artistProfileId = result.profile_id;

      const { data: stripeData, error: stripeError } = await supabase
        .from('artist_stripe_accounts')
        .select('*')
        .eq('artist_profile_id', artistProfileId)
        .single();

      if (stripeError && stripeError.code !== 'PGRST116') {
        console.error('Stripe account error:', stripeError);
        return;
      }

      setStripeAccount(stripeData);
    } catch (err) {
      console.error('Error loading Stripe account:', err);
    }
  };

  const formatAmount = (amount, currency = 'USD') => {
    if (!amount) return '$0.00';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency
    }).format(amount);
  };

  const formatDate = (dateString) => {
    if (!dateString) return '';
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  const getStripeStatusBadge = () => {
    if (!stripeAccount) {
      return (
        <Badge color="gray" variant="soft">
          <ClockIcon width="12" height="12" />
          Not Set Up
        </Badge>
      );
    }

    switch (stripeAccount.onboarding_status) {
      case 'completed':
        return (
          <Badge color="green" variant="soft">
            <CheckCircledIcon width="12" height="12" />
            Active
          </Badge>
        );
      case 'pending':
        return (
          <Badge color="orange" variant="soft">
            <ClockIcon width="12" height="12" />
            Pending
          </Badge>
        );
      case 'restricted':
        return (
          <Badge color="red" variant="soft">
            <ExclamationTriangleIcon width="12" height="12" />
            Restricted
          </Badge>
        );
      default:
        return (
          <Badge color="gray" variant="soft">
            <ClockIcon width="12" height="12" />
            Not Started
          </Badge>
        );
    }
  };

  if (authLoading || loading) {
    return (
      <Box>
        <Heading size="6" mb="4">Payment Dashboard</Heading>
        <Grid columns="3" gap="4" mb="6">
          {[1, 2, 3].map((i) => (
            <Card key={i} size="3">
              <Skeleton height="80px" />
            </Card>
          ))}
        </Grid>
      </Box>
    );
  }

  if (!user) {
    return (
      <>
        <Card size="3">
          <Flex direction="column" gap="4" align="center">
            <PersonIcon width="48" height="48" />
            <Heading size="6">Payment Dashboard</Heading>
            <Text size="3" color="gray" align="center">
              Sign in to view your payment information and earnings
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
        <Heading size="6">Payment Dashboard</Heading>
        <Text size="3" color="gray">
          Track your earnings and payment status
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

      {/* Payment Summary Cards */}
      <Grid columns="3" gap="4">
        <Card size="3">
          <Flex direction="column" gap="2">
            <Flex align="center" gap="2">
              <CheckIcon width="16" height="16" />
              <Text size="2" color="gray">Total Earnings</Text>
            </Flex>
            <Text size="6" weight="bold" color="green">
              {formatAmount(paymentData.totalEarnings)}
            </Text>
            <Text size="1" color="gray">
              From {paymentData.artworksSold} artwork{paymentData.artworksSold !== 1 ? 's' : ''} sold
            </Text>
          </Flex>
        </Card>

        <Card size="3">
          <Flex direction="column" gap="2">
            <Flex align="center" gap="2">
              <ClockIcon width="16" height="16" />
              <Text size="2" color="gray">Pending Payments</Text>
            </Flex>
            <Text size="6" weight="bold" color="orange">
              {formatAmount(paymentData.pendingPayments)}
            </Text>
            <Text size="1" color="gray">
              Waiting to be transferred
            </Text>
          </Flex>
        </Card>

        <Card size="3">
          <Flex direction="column" gap="2">
            <Flex align="center" gap="2">
              <CheckCircledIcon width="16" height="16" />
              <Text size="2" color="gray">Paid Out</Text>
            </Flex>
            <Text size="6" weight="bold">
              {formatAmount(paymentData.paidAmount)}
            </Text>
            <Text size="1" color="gray">
              Transferred to your account
            </Text>
          </Flex>
        </Card>
      </Grid>

      {/* Stripe Connect Onboarding */}
      <StripeConnectOnboarding 
        stripeAccount={stripeAccount} 
        onAccountUpdate={loadStripeAccount}
      />

      {/* Recent Payments */}
      {paymentData.recentPayments.length > 0 && (
        <Card size="3">
          <Flex direction="column" gap="4">
            <Heading size="4">Recent Payments</Heading>
            <Separator />
            <Flex direction="column" gap="3">
              {paymentData.recentPayments.map((payment, index) => (
                <Flex key={index} justify="between" align="center">
                  <Flex direction="column" gap="1">
                    <Text size="2" weight="medium">
                      {payment.art_code || payment.title}
                    </Text>
                    <Text size="1" color="gray">
                      {payment.event_title} • {formatDate(payment.artist_paid_at)}
                    </Text>
                  </Flex>
                  <Text size="2" weight="bold" color="green">
                    {formatAmount(payment.artist_net_amount, payment.currency)}
                  </Text>
                </Flex>
              ))}
            </Flex>
          </Flex>
        </Card>
      )}
    </Flex>
  );
};

export default PaymentDashboard;
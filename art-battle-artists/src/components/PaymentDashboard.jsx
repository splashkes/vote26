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
import GlobalPaymentsOnboarding from './GlobalPaymentsOnboarding';

const PaymentDashboard = () => {
  const { user, person, loading: authLoading } = useAuth();
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [paymentData, setPaymentData] = useState({
    totalEarnings: 0,
    pendingPayments: 0,
    paidAmount: 0,
    artworksSold: 0,
    awaitingPayment: 0,
    recentPayments: []
  });
  const [stripeAccount, setStripeAccount] = useState(null);
  const [globalPaymentAccount, setGlobalPaymentAccount] = useState(null);
  const [paymentSystem, setPaymentSystem] = useState('detect'); // 'connect', 'global', 'detect'
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!authLoading && user && person) {
      Promise.all([loadPaymentData(), loadPaymentAccounts()]).finally(() => {
        setLoading(false);
      });
    } else if (!authLoading && !user) {
      setLoading(false);
    }
  }, [user, person, authLoading]);

  // Detect payment system after accounts are loaded
  useEffect(() => {
    detectPaymentSystem();
  }, [stripeAccount, globalPaymentAccount]);

  const loadPaymentData = async () => {
    try {
      // Use the same edge function as other components for consistency
      const { data, error } = await supabase.functions.invoke('artist-get-my-profile');

      if (error) {
        console.error('PaymentDashboard: Secure profile lookup failed:', error);
        setError(`Failed to get your profile: ${error.message || error}`);
        return;
      }

      let artistProfileIds = [];

      if (data.profile) {
        // Single authoritative profile
        artistProfileIds = [data.profile.id];
      } else if (data.candidateProfiles && data.candidateProfiles.length > 0) {
        // Multiple profiles - include all for payment tracking
        artistProfileIds = data.candidateProfiles.map(p => p.id);
      } else {
        // No profiles found
        setError('No artist profiles found. Please create your profile first.');
        return;
      }

      // Get artworks for ALL artist profiles
      const { data: artworks, error: artworkError } = await supabase
        .from('art')
        .select('id')
        .in('artist_id', artistProfileIds);
      
      if (artworkError) {
        console.error('Artwork query error:', artworkError);
        setError('Failed to load artwork data: ' + artworkError.message);
        return;
      }
      
      const artworkIds = artworks?.map(art => art.id) || [];
      
      // Get ACTUAL payment data - only from completed payments for this artist's artworks
      const { data: paymentProcessingData, error: paymentError } = await supabase
        .from('payment_processing')
        .select(`
          id,
          art_id,
          amount,
          currency,
          status,
          completed_at,
          art:art!payment_processing_art_id_fkey(
            id,
            art_code,
            artist_id,
            event:events(eid, name)
          )
        `)
        .in('art_id', artworkIds)
        .eq('status', 'completed');

      if (paymentError) {
        console.error('Payment query error:', paymentError);
        setError('Failed to load payment data: ' + paymentError.message);
        return;
      }

      // Get artist payment records
      const { data: artistPaymentsData, error: artistPaymentError } = await supabase
        .from('artist_payments')
        .select(`
          id,
          art_id,
          gross_amount,
          net_amount,
          currency,
          status,
          paid_at,
          art:art!artist_payments_art_id_fkey(
            id,
            art_code,
            event:events(eid, name)
          )
        `)
        .in('artist_profile_id', artistProfileIds);

      if (artistPaymentError) {
        console.warn('Artist payments query failed:', artistPaymentError);
      }

      // Get all artworks to check for ones awaiting payment
      const { data: allArtworkData, error: allArtworkError } = await supabase
        .from('art')
        .select('id, current_bid')
        .in('artist_id', artistProfileIds);

      // Calculate earnings from ACTUAL completed payments only
      const completedPayments = paymentProcessingData || [];
      const artistPayments = artistPaymentsData || [];
      const allArtworks = allArtworkData || [];

      // Count artworks with bids but no completed payment
      const artworksWithPayments = new Set(completedPayments.map(p => p.art_id));
      const awaitingPayment = allArtworks.filter(art => 
        art.current_bid > 0 && !artworksWithPayments.has(art.id)
      ).length;

      // Total earnings = 50% of actually collected payments
      const totalEarnings = completedPayments.reduce((sum, payment) => 
        sum + (payment.amount * 0.5), 0
      );

      // Paid amount = sum of artist payments that are actually paid
      const paidAmount = artistPayments
        .filter(payment => payment.status === 'paid' && payment.paid_at)
        .reduce((sum, payment) => sum + (payment.net_amount || 0), 0);

      // Pending = earnings from completed buyer payments minus what's already paid to artist
      const pendingAmount = totalEarnings - paidAmount;

      setPaymentData({
        totalEarnings: totalEarnings,
        pendingPayments: Math.max(0, pendingAmount), // Never negative
        paidAmount: paidAmount,
        artworksSold: completedPayments.length,
        awaitingPayment: awaitingPayment, // New field
        recentPayments: artistPayments
          .filter(payment => payment.paid_at)
          .sort((a, b) => new Date(b.paid_at) - new Date(a.paid_at))
          .slice(0, 5)
          .map(payment => ({
            art_code: payment.art?.art_code,
            title: payment.art?.art_code,
            event_title: payment.art?.event?.name || payment.art?.event?.eid,
            artist_paid_at: payment.paid_at,
            artist_net_amount: payment.net_amount,
            currency: payment.currency
          }))
      });
    } catch (err) {
      setError('Failed to load payment data: ' + err.message);
    }
  };

  const loadPaymentAccounts = async () => {
    try {
      // Get ALL artist profiles for this person
      const { data: allProfiles, error: profilesError } = await supabase
        .from('artist_profiles')
        .select('id')
        .eq('person_id', person.id);

      if (profilesError || !allProfiles || allProfiles.length === 0) return;

      const artistProfileIds = allProfiles.map(p => p.id);

      // Load Stripe Connect accounts (legacy)
      const { data: stripeData, error: stripeError } = await supabase
        .from('artist_stripe_accounts')
        .select('*')
        .in('artist_profile_id', artistProfileIds);

      if (stripeError && stripeError.code !== 'PGRST116') {
        console.error('Stripe Connect account error:', stripeError);
      } else {
        setStripeAccount(stripeData && stripeData.length > 0 ? stripeData[0] : null);
      }

      // Load Global Payments accounts (new system)
      const { data: globalData, error: globalError } = await supabase
        .from('artist_global_payments')
        .select('*')
        .in('artist_profile_id', artistProfileIds);

      if (globalError && globalError.code !== 'PGRST116') {
        console.error('Global Payments account error:', globalError);
      } else {
        setGlobalPaymentAccount(globalData && globalData.length > 0 ? globalData[0] : null);
      }

    } catch (err) {
      console.error('Error loading payment accounts:', err);
    }
  };

  const detectPaymentSystem = () => {
    // Simple auto-detection based on what accounts exist
    // Priority: Global Payments > Connect > Default to Global for new users
    if (globalPaymentAccount) {
      setPaymentSystem('global');
    } else if (stripeAccount) {
      setPaymentSystem('connect');
    } else {
      // New users get Global Payments by default
      setPaymentSystem('global');
    }
    console.log('🔧 Payment system detected:', {
      globalPaymentAccount: !!globalPaymentAccount,
      stripeAccount: !!stripeAccount,
      selectedSystem: globalPaymentAccount ? 'global' : stripeAccount ? 'connect' : 'global'
    });
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
      <Grid columns="2" gap="4">
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

        {/* HIDDEN: Pending Payments Card */}
        {/* <Card size="3">
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
        </Card> */}

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

        {/* HIDDEN: Awaiting Buyer Payment Card */}
        {/* <Card size="3">
          <Flex direction="column" gap="2">
            <Flex align="center" gap="2">
              <ExclamationTriangleIcon width="16" height="16" />
              <Text size="2" color="gray">Awaiting Buyer Payment</Text>
            </Flex>
            <Text size="6" weight="bold" color="orange">
              {paymentData.awaitingPayment || 0}
            </Text>
            <Text size="1" color="gray">
              Artwork{(paymentData.awaitingPayment || 0) !== 1 ? 's' : ''} sold but not paid
            </Text>
          </Flex>
        </Card> */}
      </Grid>

      {/* Payment System Switcher */}
      {(stripeAccount && globalPaymentAccount) && (
        <Card size="3">
          <Flex direction="column" gap="3">
            <Heading size="4">Payment System</Heading>
            <Text size="2" color="gray">
              You have both payment systems set up. Choose which one to use:
            </Text>
            <Flex gap="2">
              <Button
                variant={paymentSystem === 'connect' ? 'solid' : 'outline'}
                onClick={() => setPaymentSystem('connect')}
                size="2"
              >
                Stripe Connect (Legacy)
              </Button>
              <Button
                variant={paymentSystem === 'global' ? 'solid' : 'outline'}
                onClick={() => setPaymentSystem('global')}
                size="2"
                color="blue"
              >
                Global Payments (Recommended)
              </Button>
            </Flex>
          </Flex>
        </Card>
      )}

      {/* Migration Banner - Show to Connect users who haven't migrated */}
      {paymentSystem === 'connect' && stripeAccount && !globalPaymentAccount && (
        <Callout.Root color="blue">
          <Callout.Icon>
            <InfoCircledIcon />
          </Callout.Icon>
          <Callout.Text>
            <Flex direction="column" gap="2">
              <Text>
                <strong>Upgrade to Global Payments:</strong> Faster setup, simpler onboarding, and direct payouts.
              </Text>
              <Button 
                size="1" 
                variant="soft" 
                onClick={() => setPaymentSystem('global')}
              >
                Switch to Global Payments
              </Button>
            </Flex>
          </Callout.Text>
        </Callout.Root>
      )}

      {/* Payment System Onboarding */}
      {paymentSystem === 'global' ? (
        <GlobalPaymentsOnboarding 
          globalPaymentAccount={globalPaymentAccount} 
          onAccountUpdate={loadPaymentAccounts}
        />
      ) : (
        <StripeConnectOnboarding 
          stripeAccount={stripeAccount} 
          onAccountUpdate={loadPaymentAccounts}
        />
      )}

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
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
    potentialEarnings: 0,
    primaryCurrency: 'USD',
    currencyBreakdown: {},
    ledgerEntries: [],
    summary: null
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
      // Get the artist profile first
      const { data: profileData, error: profileError } = await supabase.functions.invoke('artist-get-my-profile');

      if (profileError) {
        console.error('PaymentDashboard: Secure profile lookup failed:', profileError);
        setError(`Failed to get your profile: ${profileError.message || profileError}`);
        return;
      }

      const artistProfile = profileData.profile;
      if (!artistProfile) {
        setError('No artist profile found. Please create your profile first.');
        return;
      }

      // Get current session for authentication
      const { data: sessionData } = await supabase.auth.getSession();

      // Load ledger data using the standardized function
      const { data: ledgerData, error: ledgerError } = await supabase.functions.invoke('artist-account-ledger', {
        body: {
          artist_profile_id: artistProfile.id
        },
        headers: sessionData?.session?.access_token ? {
          Authorization: `Bearer ${sessionData.session.access_token}`
        } : {}
      });

      if (ledgerError) {
        console.error('PaymentDashboard: Ledger data failed:', ledgerError);
        setError(`Failed to load payment data: ${ledgerError.message || ledgerError}`);
        return;
      }

      const { ledger, summary } = ledgerData;

      // Extract different types of entries
      const artSales = ledger.filter(entry => entry.type === 'credit' && entry.category === 'Art Sale');
      const payments = ledger.filter(entry => entry.type === 'debit' && (entry.category === 'Manual Payment' || entry.category === 'Stripe Payment'));
      const potentialEarnings = ledger.filter(entry => entry.type === 'event' && entry.metadata?.lost_opportunity);

      // Calculate summary stats
      const totalEarnings = summary.total_credits || 0;
      const totalPaid = summary.total_debits || 0;
      const pendingPayments = summary.current_balance || 0;
      const artworksSold = artSales.length;
      const potentialEarningsAmount = potentialEarnings.reduce((sum, entry) =>
        sum + (entry.metadata?.potential_artist_earnings || 0), 0
      );

      setPaymentData({
        totalEarnings,
        pendingPayments: Math.max(0, pendingPayments),
        paidAmount: totalPaid,
        artworksSold,
        potentialEarnings: potentialEarningsAmount,
        primaryCurrency: summary.primary_currency || 'USD',
        currencyBreakdown: summary.currency_breakdown || {},
        ledgerEntries: ledger,
        summary
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
          <Badge color="orange" variant="soft">
            <ExclamationTriangleIcon width="12" height="12" />
            Setup Incomplete
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
              {formatAmount(paymentData.totalEarnings, paymentData.primaryCurrency)}
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
              <Text size="2" color="gray">Outstanding Balance</Text>
            </Flex>
            <Text size="6" weight="bold" color="orange">
              {formatAmount(paymentData.pendingPayments, paymentData.primaryCurrency)}
            </Text>
            <Text size="1" color="gray">
              Available for withdrawal
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
              {formatAmount(paymentData.paidAmount, paymentData.primaryCurrency)}
            </Text>
            <Text size="1" color="gray">
              Transferred to your account
            </Text>
          </Flex>
        </Card>

        <Card size="3">
          <Flex direction="column" gap="2">
            <Flex align="center" gap="2">
              <ExclamationTriangleIcon width="16" height="16" />
              <Text size="2" color="gray">Potential Lost Earnings</Text>
            </Flex>
            <Text size="6" weight="bold" color="amber">
              {formatAmount(paymentData.potentialEarnings, paymentData.primaryCurrency)}
            </Text>
            <Text size="1" color="gray">
              From unpaid sales
            </Text>
          </Flex>
        </Card>
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

      {/* Payment Ledger */}
      {paymentData.ledgerEntries.length > 0 && (
        <Card size="3">
          <Flex direction="column" gap="4">
            <Heading size="4">Payment History</Heading>
            <Separator />
            <Flex direction="column" gap="3">
              {paymentData.ledgerEntries.slice(0, 10).map((entry, index) => (
                <Flex key={entry.id || index} justify="between" align="start">
                  <Flex direction="column" gap="1" style={{ flex: 1 }}>
                    <Flex align="center" gap="2">
                      <Badge
                        color={entry.type === 'credit' ? 'green' : entry.type === 'debit' ? 'blue' : 'gray'}
                        variant="soft"
                        size="1"
                      >
                        {entry.category}
                      </Badge>
                      <Text size="2" weight="medium">
                        {entry.description}
                      </Text>
                    </Flex>
                    <Text size="1" color="gray">
                      {entry.art_info?.event_name && `${entry.art_info.event_name} • `}
                      {formatDate(entry.date)}
                    </Text>
                    {entry.metadata?.lost_opportunity && (
                      <Text size="1" color="amber">
                        Potential earnings: {formatAmount(entry.metadata.potential_artist_earnings, entry.currency)}
                      </Text>
                    )}
                  </Flex>
                  <Flex direction="column" align="end" gap="1">
                    {entry.amount !== undefined && (
                      <Text
                        size="3"
                        weight="bold"
                        color={entry.type === 'credit' ? 'green' : entry.type === 'debit' ? 'red' : 'gray'}
                      >
                        {entry.type === 'credit' ? '+' : entry.type === 'debit' ? '-' : ''}
                        {formatAmount(entry.amount, entry.currency)}
                      </Text>
                    )}
                    {entry.balance_after !== undefined && (
                      <Text size="1" color="gray">
                        Balance: {formatAmount(entry.balance_after, entry.currency)}
                      </Text>
                    )}
                  </Flex>
                </Flex>
              ))}
              {paymentData.ledgerEntries.length > 10 && (
                <Text size="1" color="gray" style={{ textAlign: 'center' }}>
                  Showing 10 most recent entries of {paymentData.ledgerEntries.length} total
                </Text>
              )}
            </Flex>
          </Flex>
        </Card>
      )}
    </Flex>
  );
};

export default PaymentDashboard;
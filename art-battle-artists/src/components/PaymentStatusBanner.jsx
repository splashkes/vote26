import { useState, useEffect } from 'react';
import {
  Card,
  Flex,
  Text,
  Badge,
  Button,
  Box,
  IconButton,
  Callout,
  Dialog,
} from '@radix-ui/themes';
import {
  CheckCircledIcon,
  ClockIcon,
  ExclamationTriangleIcon,
  Cross2Icon,
  LockClosedIcon,
  ArrowRightIcon,
  InfoCircledIcon,
} from '@radix-ui/react-icons';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

const PaymentStatusBanner = ({ artistProfile, confirmations, hasRecentActivity, onNavigateToTab }) => {
  const { person } = useAuth();
  const [paymentData, setPaymentData] = useState(null);
  const [paymentAccount, setPaymentAccount] = useState(null);
  const [loading, setLoading] = useState(true);
  const [dismissed, setDismissed] = useState(false);
  const [showBanner, setShowBanner] = useState(false);
  const [showInfoModal, setShowInfoModal] = useState(false);
  const [redirecting, setRedirecting] = useState(false);

  useEffect(() => {
    if (artistProfile) {
      checkIfShouldShowBanner();
    } else {
      setLoading(false);
    }
  }, [artistProfile, hasRecentActivity]);

  const checkIfShouldShowBanner = async () => {
    try {
      // Use the hasRecentActivity flag passed from parent (already calculated in edge function)
      if (!hasRecentActivity) {
        setShowBanner(false);
        setLoading(false);
        return;
      }

      // Load payment account status and outstanding payments
      await Promise.all([
        loadPaymentAccount(),
        loadPaymentData()
      ]);

      setShowBanner(true);
    } catch (err) {
      console.error('Error checking payment banner eligibility:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadPaymentAccount = async () => {
    try {
      // Load Global Payments account (prioritized system)
      const { data: globalData, error: globalError } = await supabase
        .from('artist_global_payments')
        .select('*')
        .eq('artist_profile_id', artistProfile.id)
        .maybeSingle();

      if (!globalError && globalData) {
        setPaymentAccount({ type: 'global', data: globalData });
        return;
      }

      // Fallback to Stripe Connect if no Global Payments
      const { data: stripeData, error: stripeError } = await supabase
        .from('artist_stripe_accounts')
        .select('*')
        .eq('artist_profile_id', artistProfile.id)
        .maybeSingle();

      if (!stripeError && stripeData) {
        setPaymentAccount({ type: 'connect', data: stripeData });
      } else {
        setPaymentAccount(null);
      }
    } catch (err) {
      console.error('Error loading payment account:', err);
      setPaymentAccount(null);
    }
  };

  const loadPaymentData = async () => {
    try {
      // Get current session for authentication
      const { data: sessionData } = await supabase.auth.getSession();

      // Use the same artist-account-ledger function as the admin system with auth
      const { data, error } = await supabase.functions.invoke('artist-account-ledger', {
        body: {
          artist_profile_id: artistProfile.id
        },
        headers: sessionData?.session?.access_token ? {
          Authorization: `Bearer ${sessionData.session.access_token}`
        } : {}
      });

      if (error) {
        console.error('Artist account ledger error:', error);
        setPaymentData({ pendingPayments: 0, unpaidBids: 0, currency: 'USD', hasEarnings: false, hasPotentialEarnings: false });
        return;
      }

      if (!data || !data.summary) {
        setPaymentData({ pendingPayments: 0, unpaidBids: 0, currency: 'USD', hasEarnings: false, hasPotentialEarnings: false });
        return;
      }

      // Extract balances by currency from the ledger
      const currencyBreakdown = data.summary.currency_breakdown || {};

      // Calculate total pending payments across all currencies (convert to primary currency)
      let totalPendingPayments = 0;
      let totalUnpaidBids = 0;
      let primaryCurrency = 'USD';

      // Get the currency with the highest balance as primary
      const currencies = Object.keys(currencyBreakdown);
      if (currencies.length > 0) {
        const primaryCurrencyKey = currencies.reduce((a, b) =>
          Math.abs(currencyBreakdown[a].balance || 0) > Math.abs(currencyBreakdown[b].balance || 0) ? a : b
        );
        primaryCurrency = primaryCurrencyKey;

        // Sum positive balances (money owed to artist)
        totalPendingPayments = Object.values(currencyBreakdown)
          .reduce((sum, breakdown) => {
            const balance = breakdown.balance || 0;
            return sum + (balance > 0 ? balance : 0);
          }, 0);
      }

      // Calculate unpaid bids from artworks that appear in ledger as opportunities
      const unpaidBidsFromLedger = data.entries
        ?.filter((entry) => entry.type === 'event' && entry.metadata?.lost_opportunity)
        ?.reduce((sum, entry) => sum + (entry.metadata?.potential_artist_earnings || 0), 0) || 0;

      setPaymentData({
        pendingPayments: totalPendingPayments,
        unpaidBids: unpaidBidsFromLedger,
        currency: primaryCurrency,
        hasEarnings: totalPendingPayments > 0,
        hasPotentialEarnings: unpaidBidsFromLedger > 0
      });
    } catch (err) {
      console.error('Error loading payment data:', err);
      setPaymentData({ pendingPayments: 0, unpaidBids: 0, currency: 'USD', hasEarnings: false, hasPotentialEarnings: false });
    }
  };

  const getPaymentStatus = () => {
    if (!paymentAccount) {
      return { status: 'not_started', text: 'Not Started', color: 'gray' };
    }

    if (paymentAccount.type === 'global') {
      const status = paymentAccount.data.status || 'not_started';
      switch (status) {
        case 'ready':
          return { status: 'ready', text: 'Ready', color: 'green' };
        case 'pending_verification':
        case 'pending':
          return { status: 'pending', text: 'Pending Verification', color: 'orange' };
        case 'restricted':
          return { status: 'restricted', text: 'Setup Incomplete', color: 'orange' };
        default:
          return { status: 'not_started', text: 'Setup Required', color: 'gray' };
      }
    } else {
      // Stripe Connect
      const status = paymentAccount.data.onboarding_status || 'not_started';
      switch (status) {
        case 'completed':
          return { status: 'ready', text: 'Active', color: 'green' };
        case 'pending':
          return { status: 'pending', text: 'Pending', color: 'orange' };
        case 'restricted':
          return { status: 'restricted', text: 'Setup Incomplete', color: 'orange' };
        default:
          return { status: 'not_started', text: 'Setup Required', color: 'gray' };
      }
    }
  };

  const formatAmount = (amount, currency = 'USD') => {
    if (!amount) return '$0.00';
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

  const getStatusIcon = (status) => {
    switch (status) {
      case 'ready':
        return <CheckCircledIcon width="16" height="16" />;
      case 'pending':
        return <ClockIcon width="16" height="16" />;
      case 'restricted':
        return <ExclamationTriangleIcon width="16" height="16" />;
      default:
        return <LockClosedIcon width="16" height="16" />;
    }
  };

  const handleStartOnboarding = async () => {
    try {
      // Set redirecting state immediately for instant UI feedback
      setRedirecting(true);

      const { data, error } = await supabase.functions.invoke('stripe-global-payments-onboard', {
        body: {
          person_id: person.id,
          return_url: window.location.origin + '/profile?tab=payments&system=global&onboarding=success',
          refresh_url: window.location.origin + '/profile?tab=payments&system=global&onboarding=refresh',
          country: 'US',
          currency: 'USD'
        }
      });

      if (error) throw error;

      if ((data.onboarding_type === 'direct_redirect' && data.onboarding_url) || data.onboarding_url) {
        // Immediate redirect without delay
        window.location.replace(data.onboarding_url);
        return; // Don't reset redirecting state
      }
    } catch (err) {
      console.error('Onboarding error:', err);
      setRedirecting(false);
    }
  };

  const handleCancelInvitation = async () => {
    try {
      // Call cancel invitation function if needed
      console.log('Canceling invitation for retry');
      // For now, just refresh the page or reload account data
      window.location.reload();
    } catch (err) {
      console.error('Cancel invitation error:', err);
    }
  };

  const getActionButtons = (status) => {
    const isDisabled = redirecting;

    switch (status) {
      case 'ready':
        if (paymentData?.pendingPayments > 0 || paymentData?.unpaidBids > 0) {
          return (
            <Button size="2" variant="soft" onClick={() => onNavigateToTab('payments')}>
              View Payments
              <ArrowRightIcon width="16" height="16" />
            </Button>
          );
        }
        return null;

      case 'pending':
        // Check if this is an active invitation that can be continued
        const canContinue = paymentAccount?.type === 'global' &&
                           paymentAccount?.data?.status === 'invited';

        if (canContinue) {
          return (
            <Flex gap="2">
              <Button
                size="2"
                variant="solid"
                color="orange"
                disabled={isDisabled}
                onClick={handleStartOnboarding}
              >
                {redirecting ? 'Redirecting...' : 'Continue Setup'}
                {!redirecting && <ArrowRightIcon width="16" height="16" />}
              </Button>
              <Button
                size="2"
                variant="soft"
                color="red"
                disabled={isDisabled}
                onClick={handleCancelInvitation}
              >
                Cancel & Retry
              </Button>
            </Flex>
          );
        } else {
          return (
            <Button size="2" variant="soft" color="orange" onClick={() => onNavigateToTab('payments')}>
              Continue Setup
              <ArrowRightIcon width="16" height="16" />
            </Button>
          );
        }

      case 'restricted':
        return (
          <Button
            size="2"
            variant="solid"
            color="orange"
            disabled={isDisabled}
            onClick={handleStartOnboarding}
          >
            {redirecting ? 'Redirecting...' : 'Complete Setup'}
            {!redirecting && <ArrowRightIcon width="16" height="16" />}
          </Button>
        );

      default:
        return (
          <Button
            size="2"
            variant="solid"
            color="blue"
            disabled={isDisabled}
            onClick={handleStartOnboarding}
          >
            {redirecting ? 'Redirecting...' : 'Start Setup'}
            {!redirecting && <ArrowRightIcon width="16" height="16" />}
          </Button>
        );
    }
  };

  // Don't render if loading, dismissed, or shouldn't show
  if (loading || dismissed || !showBanner) {
    return null;
  }

  const paymentStatus = getPaymentStatus();

  // Only show banner if there are pending payments OR unpaid bids (regardless of account status)
  if ((!paymentData?.pendingPayments || paymentData.pendingPayments <= 0) &&
      (!paymentData?.unpaidBids || paymentData.unpaidBids <= 0)) {
    return null;
  }

  return (
    <Card size="3" style={{
      marginBottom: '1.5rem',
      border: `2px solid var(--${paymentStatus.color === 'gray' ? 'blue' : paymentStatus.color}-8)`,
      backgroundColor: `var(--${paymentStatus.color === 'gray' ? 'blue' : paymentStatus.color}-2)`
    }}>
      <Flex justify="between" align="start">
        <Flex direction="column" gap="3" style={{ flex: 1 }}>
          <Flex align="center" gap="2">
            <Badge color={paymentStatus.color} variant="soft" size="2">
              {getStatusIcon(paymentStatus.status)}
              Payment Account: {paymentStatus.text}
            </Badge>
          </Flex>

          <Box>
            <Text size="3" weight="medium" mb="2" style={{ display: 'block' }}>
              {paymentStatus.status === 'ready'
                ? 'Payment Account Ready'
                : 'Payment Account Setup Required'}
            </Text>

            {/* Balance Display - always show if there are any amounts */}
            {(paymentData?.pendingPayments > 0 || paymentData?.unpaidBids > 0) && (
              <Flex direction="column" gap="2" mb="2">
                {/* Outstanding Balance - Big Green */}
                {paymentData?.pendingPayments > 0 && (
                  <Flex align="center" gap="2">
                    <Text size="1" color="gray">Outstanding Balance:</Text>
                    <Text size="5" weight="bold" color="green">
                      {formatAmount(paymentData.pendingPayments, paymentData.currency)}
                    </Text>
                  </Flex>
                )}

                {/* Pending Sales - Smaller Yellow */}
                {paymentData?.unpaidBids > 0 && (
                  <Flex align="center" gap="2">
                    <Text size="1" color="gray">Pending Sales:</Text>
                    <Text size="3" weight="medium" style={{ color: 'var(--amber-11)' }}>
                      {formatAmount(paymentData.unpaidBids, paymentData.currency)}
                    </Text>
                    <Button
                      variant="ghost"
                      size="1"
                      color="gray"
                      onClick={() => setShowInfoModal(true)}
                      style={{ padding: '2px 4px', fontSize: '10px' }}
                    >
                      <InfoCircledIcon width="10" height="10" />
                      (more info)
                    </Button>
                  </Flex>
                )}
              </Flex>
            )}

            {/* Setup message for non-ready accounts */}
            {paymentStatus.status !== 'ready' && (
              <Text size="2" color="gray">
                Set up your payment account to receive earnings from art sales
              </Text>
            )}
          </Box>

          {getActionButtons(paymentStatus.status) && (
            <Box>
              {getActionButtons(paymentStatus.status)}
            </Box>
          )}
        </Flex>

        <IconButton
          size="1"
          variant="ghost"
          color="gray"
          onClick={() => setDismissed(true)}
        >
          <Cross2Icon width="14" height="14" />
        </IconButton>
      </Flex>

      {/* Pending Sales Info Modal */}
      <Dialog.Root open={showInfoModal} onOpenChange={setShowInfoModal}>
        <Dialog.Content maxWidth="500px">
          <Dialog.Title>
            <Flex align="center" gap="2">
              <InfoCircledIcon width="18" height="18" />
              About Pending Sales
            </Flex>
          </Dialog.Title>

          <Dialog.Description size="2" mb="4">
            <Box style={{ lineHeight: '1.6' }}>
              <Text as="p" mb="3">
                We let buyers bid without putting down a credit card or deposit as it leads to much more successful auctions. This means that sometimes we aren't able to collect payment.
              </Text>
              <Text as="p" mb="3">
                We will work to reach out to the buyer, and (if any) other bidders who showed interest in your artwork.
              </Text>
              <Text as="p" weight="medium">
                Art Battle pays out 50% of what we are able to collect.
              </Text>
            </Box>
          </Dialog.Description>

          <Flex gap="3" mt="4" justify="end">
            <Dialog.Close>
              <Button variant="soft">Got it</Button>
            </Dialog.Close>
          </Flex>
        </Dialog.Content>
      </Dialog.Root>
    </Card>
  );
};

export default PaymentStatusBanner;
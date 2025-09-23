import { useState, useEffect } from 'react';
import {
  Card,
  Flex,
  Text,
  Button,
  Heading,
  Callout,
  Badge,
  Separator,
  Box,
} from '@radix-ui/themes';
import { 
  InfoCircledIcon,
  ExternalLinkIcon,
  CheckCircledIcon,
  ClockIcon,
  ExclamationTriangleIcon
} from '@radix-ui/react-icons';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';

const StripeConnectOnboarding = ({ stripeAccount, onAccountUpdate }) => {
  const { person } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleStartOnboarding = async () => {
    setLoading(true);
    setError('');

    try {
      console.log('Starting onboarding with person:', person);
      
      // Call Supabase Edge Function to create Stripe Connect account and onboarding link
      const { data, error } = await supabase.functions.invoke('stripe-connect-onboard', {
        body: {
          person_id: person.id,
          return_url: window.location.origin + '/profile?tab=payments&onboarding=success',
          refresh_url: window.location.origin + '/profile?tab=payments&onboarding=refresh'
        }
      });

      console.log('Function response:', { data, error });

      if (error) throw error;

      if (data.onboarding_url) {
        // Redirect to Stripe onboarding
        window.location.href = data.onboarding_url;
      } else {
        throw new Error('No onboarding URL received');
      }
    } catch (err) {
      console.error('Onboarding error:', err);
      setError('Failed to start onboarding: ' + (err.message || JSON.stringify(err)));
    } finally {
      setLoading(false);
    }
  };

  const handleRefreshOnboarding = async () => {
    if (!stripeAccount?.stripe_account_id) return;

    setLoading(true);
    setError('');

    try {
      const { data, error } = await supabase.functions.invoke('stripe-connect-onboard', {
        body: {
          person_id: person.id,
          stripe_account_id: stripeAccount.stripe_account_id,
          return_url: window.location.origin + '/profile?tab=payments&onboarding=success',
          refresh_url: window.location.origin + '/profile?tab=payments&onboarding=refresh'
        }
      });

      if (error) throw error;

      if (data.onboarding_url) {
        window.location.href = data.onboarding_url;
      } else {
        throw new Error('No onboarding URL received');
      }
    } catch (err) {
      setError('Failed to refresh onboarding: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const getStatusInfo = () => {
    if (!stripeAccount) {
      return {
        status: 'not_started',
        badge: <Badge color="gray" variant="soft">Not Started</Badge>,
        message: 'Set up your payment account to start receiving earnings from sold artwork.',
        canOnboard: true,
        buttonText: 'Set Up Payment Account',
        buttonAction: handleStartOnboarding
      };
    }

    switch (stripeAccount.onboarding_status) {
      case 'completed':
        return {
          status: 'completed',
          badge: <Badge color="green" variant="soft"><CheckCircledIcon width="12" height="12" /> Active</Badge>,
          message: 'Your payment account is fully set up and ready to receive payments.',
          canOnboard: false,
          showDetails: true
        };
      
      case 'pending':
        return {
          status: 'pending',
          badge: <Badge color="orange" variant="soft"><ClockIcon width="12" height="12" /> Pending</Badge>,
          message: 'Your account setup is in progress. Complete any remaining steps to start receiving payments.',
          canOnboard: true,
          buttonText: 'Continue Setup',
          buttonAction: handleRefreshOnboarding
        };
      
      case 'restricted':
        return {
          status: 'restricted',
          badge: <Badge color="orange" variant="soft"><ExclamationTriangleIcon width="12" height="12" /> Setup Incomplete</Badge>,
          message: 'Payment account setup incomplete. Please go to Stripe to add missing information.',
          canOnboard: true,
          buttonText: 'Complete Setup',
          buttonAction: handleRefreshOnboarding
        };
      
      default:
        return {
          status: 'incomplete',
          badge: <Badge color="gray" variant="soft"><ClockIcon width="12" height="12" /> Incomplete</Badge>,
          message: 'Complete your payment account setup to start receiving earnings.',
          canOnboard: true,
          buttonText: 'Complete Setup',
          buttonAction: handleRefreshOnboarding
        };
    }
  };

  const statusInfo = getStatusInfo();

  return (
    <Card size="3">
      <Flex direction="column" gap="4">
        <Flex justify="between" align="center">
          <Heading size="4">Payment Account Setup</Heading>
          {statusInfo.badge}
        </Flex>
        
        <Separator />

        {error && (
          <Callout.Root color="red">
            <Callout.Icon>
              <InfoCircledIcon />
            </Callout.Icon>
            <Callout.Text>{error}</Callout.Text>
          </Callout.Root>
        )}

        <Text size="3" color="gray">
          {statusInfo.message}
        </Text>

        {statusInfo.canOnboard && (
          <Button 
            size="3" 
            variant="solid"
            loading={loading}
            onClick={statusInfo.buttonAction}
          >
            {statusInfo.buttonText}
            <ExternalLinkIcon width="16" height="16" />
          </Button>
        )}

        {statusInfo.showDetails && stripeAccount && (
          <Box>
            <Flex direction="column" gap="2">
              <Text size="2" weight="medium">Account Details</Text>
              <Flex direction="column" gap="1">
                <Text size="2" color="gray">
                  Account Type: {stripeAccount.stripe_account_type || 'Express'}
                </Text>
                <Text size="2" color="gray">
                  Country: {stripeAccount.country || 'Not specified'}
                </Text>
                <Text size="2" color="gray">
                  Currency: {stripeAccount.currency || 'USD'}
                </Text>
                <Text size="2" color="gray">
                  Charges Enabled: {stripeAccount.charges_enabled ? '✓ Yes' : '✗ No'}
                </Text>
                <Text size="2" color="gray">
                  Payouts Enabled: {stripeAccount.payouts_enabled ? '✓ Yes' : '✗ No'}
                </Text>
              </Flex>
            </Flex>
          </Box>
        )}

        <Callout.Root color="blue">
          <Callout.Icon>
            <InfoCircledIcon />
          </Callout.Icon>
          <Callout.Text>
            We use Stripe to securely handle payments. Your banking information is encrypted and never stored on our servers.
          </Callout.Text>
        </Callout.Root>
      </Flex>
    </Card>
  );
};

export default StripeConnectOnboarding;
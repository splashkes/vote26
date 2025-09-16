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
  Grid,
} from '@radix-ui/themes';
import { 
  InfoCircledIcon,
  ExternalLinkIcon,
  CheckCircledIcon,
  ClockIcon,
  ExclamationTriangleIcon,
  RocketIcon,
  LightningBoltIcon,
  LockClosedIcon,
  GearIcon
} from '@radix-ui/react-icons';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';

const GlobalPaymentsOnboarding = ({ globalPaymentAccount, onAccountUpdate }) => {
  const { person } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleStartOnboarding = async () => {
    setLoading(true);
    setError('');

    try {
      console.log('Starting Global Payments onboarding for person:', person);
      
      // Call Global Payments onboarding function
      const { data, error } = await supabase.functions.invoke('stripe-global-payments-onboard', {
        body: {
          person_id: person.id,
          return_url: window.location.origin + '/profile?tab=payments&system=global&onboarding=success',
          refresh_url: window.location.origin + '/profile?tab=payments&system=global&onboarding=refresh',
          country: 'US', // Default, could be detected or user-selected
          currency: 'USD'
        }
      });

      console.log('Global Payments function response:', { data, error });

      if (error) throw error;

      if (data.onboarding_type === 'direct_redirect' && data.onboarding_url) {
        // Direct redirect to Stripe onboarding
        console.log('Redirecting to Stripe onboarding:', data.onboarding_url);
        // Don't reset loading - keep button disabled until redirect
        window.location.href = data.onboarding_url;
        return; // Exit early, don't reset loading
      } else if (data.onboarding_type === 'manual_setup') {
        // Show setup confirmation message instead of redirecting
        setError('');
        // Show success message
        alert(`✅ Global Payments Setup Initiated!\n\n${data.instructions.subtitle}\n\nTimeline: ${data.instructions.timeline}\n\nWe'll contact you at ${data.contact_info.email} with next steps.`);
        // Refresh the account data
        if (onAccountUpdate) {
          onAccountUpdate();
        }
      } else if (data.onboarding_url) {
        // Fallback redirect to onboarding URL
        window.location.href = data.onboarding_url;
        return; // Exit early, don't reset loading
      } else {
        throw new Error('Invalid onboarding response: ' + JSON.stringify(data));
      }
    } catch (err) {
      console.error('Global Payments onboarding error:', err);
      
      // Parse debug info from Edge Function response
      if (err && err.context && err.context.text) {
        try {
          const responseText = await err.context.text();
          console.log('Raw edge function response:', responseText);
          const parsed = JSON.parse(responseText);
          
          if (parsed.debug) {
            console.log('Edge function debug info:', parsed.debug);
          }
          
          setError('Failed to start onboarding: ' + (parsed.error || err.message || JSON.stringify(err)));
        } catch (parseError) {
          console.log('Could not parse error response:', parseError);
          setError('Failed to start onboarding: ' + (err.message || JSON.stringify(err)));
        }
      } else {
        setError('Failed to start onboarding: ' + (err.message || JSON.stringify(err)));
      }
    } finally {
      setLoading(false);
    }
  };

  const handleCancelInvitation = async () => {
    if (!globalPaymentAccount?.id) {
      setError('No invitation to cancel');
      return;
    }

    setLoading(true);
    setError('');

    try {
      // Delete the Global Payments record to cancel the invitation
      const { error } = await supabase
        .from('artist_global_payments')
        .delete()
        .eq('id', globalPaymentAccount.id);

      if (error) throw error;

      // Refresh the account data
      if (onAccountUpdate) {
        onAccountUpdate();
      }
    } catch (err) {
      setError('Failed to cancel invitation: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleRefreshOnboarding = async () => {
    if (!globalPaymentAccount?.stripe_recipient_id) {
      // If no recipient ID, treat as new onboarding
      return handleStartOnboarding();
    }

    setLoading(true);
    setError('');

    try {
      const { data, error } = await supabase.functions.invoke('stripe-global-payments-onboard', {
        body: {
          person_id: person.id,
          stripe_recipient_id: globalPaymentAccount.stripe_recipient_id,
          return_url: window.location.origin + '/profile?tab=payments&system=global&onboarding=success',
          refresh_url: window.location.origin + '/profile?tab=payments&system=global&onboarding=refresh'
        }
      });

      if (error) throw error;

      if (data.onboarding_url) {
        window.location.href = data.onboarding_url;
        return; // Exit early, don't reset loading
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
    if (!globalPaymentAccount) {
      return {
        status: 'not_started',
        badge: <Badge color="gray" variant="soft"><GearIcon width="12" height="12" /> Not Started</Badge>,
        message: 'Set up your Global Payments account to start receiving earnings with our new, simplified system.',
        canOnboard: true,
        buttonText: 'Set Up Global Payments',
        buttonAction: handleStartOnboarding,
        color: 'blue'
      };
    }

    switch (globalPaymentAccount.status) {
      case 'ready':
        return {
          status: 'ready',
          badge: <Badge color="green" variant="soft"><CheckCircledIcon width="12" height="12" /> Ready</Badge>,
          message: 'Your Global Payments account is fully set up and ready to receive direct payouts.',
          canOnboard: false,
          showDetails: true,
          color: 'green'
        };
      
      case 'in_review':
        return {
          status: 'in_review',
          badge: <Badge color="orange" variant="soft"><ClockIcon width="12" height="12" /> In Review</Badge>,
          message: 'Your account information is being reviewed. This typically takes 1-2 business days.',
          canOnboard: true,
          buttonText: 'Check Status',
          buttonAction: handleRefreshOnboarding,
          color: 'orange'
        };
      
      case 'blocked':
        return {
          status: 'blocked',
          badge: <Badge color="red" variant="soft"><ExclamationTriangleIcon width="12" height="12" /> Blocked</Badge>,
          message: 'Your account has been blocked and needs attention before you can receive payments.',
          canOnboard: true,
          buttonText: 'Resolve Issues',
          buttonAction: handleRefreshOnboarding,
          color: 'red'
        };
      
      case 'invited':
      default:
        // Check if manual setup is in progress
        const requiresManualSetup = globalPaymentAccount?.metadata?.requires_manual_setup;
        
        if (requiresManualSetup) {
          return {
            status: 'setup_in_progress',
            badge: <Badge color="orange" variant="soft"><ClockIcon width="12" height="12" /> Setup In Progress</Badge>,
            message: 'Your Global Payments account is being set up. We\'ll contact you within 24-48 hours with onboarding instructions.',
            canOnboard: false,
            showTimeline: true,
            color: 'orange'
          };
        }
        
        // Show invitation active status with email and cancel option
        const invitedEmail = globalPaymentAccount?.metadata?.person_email;
        return {
          status: 'invited',
          badge: <Badge color="orange" variant="soft"><ExclamationTriangleIcon width="12" height="12" /> Invitation Active</Badge>,
          message: `Invitation active for ${invitedEmail || 'your account'} - complete setup or cancel to retry.`,
          canOnboard: true,
          buttonText: 'Continue Setup',
          buttonAction: handleStartOnboarding,
          canCancel: true,
          cancelAction: () => handleCancelInvitation(),
          color: 'orange'
        };
    }
  };

  const statusInfo = getStatusInfo();

  return (
    <Card size="3">
      <Flex direction="column" gap="4">
        <Flex justify="between" align="center">
          <Flex align="center" gap="2">
            <RocketIcon width="20" height="20" />
            <Heading size="4">Global Payments Setup</Heading>
          </Flex>
          {statusInfo.badge}
        </Flex>
        
        <Separator />

        {error && (
          <Callout.Root color="red">
            <Callout.Icon>
              <ExclamationTriangleIcon />
            </Callout.Icon>
            <Callout.Text>{error}</Callout.Text>
          </Callout.Root>
        )}

        {/* Benefits Section - Show for new users */}
        {(!globalPaymentAccount || globalPaymentAccount.status === 'invited') && (
          <Box>
            <Text size="3" weight="medium" mb="3">
              Why upgrade to Global Payments?
            </Text>
            <Grid columns="1" gap="2">
              <Flex align="center" gap="2">
                <LightningBoltIcon width="16" height="16" color="green" />
                <Text size="2">Faster setup - reduced verification requirements</Text>
              </Flex>
              <Flex align="center" gap="2">
                <RocketIcon width="16" height="16" color="blue" />
                <Text size="2">Direct payouts - funds sent straight to your account</Text>
              </Flex>
              <Flex align="center" gap="2">
                <LockClosedIcon width="16" height="16" color="purple" />
                <Text size="2">Simplified onboarding - no complex merchant setup</Text>
              </Flex>
              <Flex align="center" gap="2">
                <CheckCircledIcon width="16" height="16" color="green" />
                <Text size="2">Global reach - available in 100+ countries</Text>
              </Flex>
            </Grid>
          </Box>
        )}

        <Text size="3" color="gray">
          {statusInfo.message}
        </Text>

        {statusInfo.canOnboard && (
          <Flex gap="3">
            <Button 
              size="3" 
              variant="solid"
              color={statusInfo.color}
              loading={loading}
              disabled={loading}
              onClick={statusInfo.buttonAction}
            >
              {loading ? 'Redirecting to Stripe...' : statusInfo.buttonText}
              {!loading && <ExternalLinkIcon width="16" height="16" />}
            </Button>
            
            {statusInfo.canCancel && (
              <Button 
                size="3" 
                variant="soft"
                color="red"
                disabled={loading}
                onClick={statusInfo.cancelAction}
              >
                Cancel & Retry
              </Button>
            )}
          </Flex>
        )}

        {statusInfo.showDetails && globalPaymentAccount && (
          <Box>
            <Flex direction="column" gap="2">
              <Text size="2" weight="medium">Account Details</Text>
              <Flex direction="column" gap="1">
                <Text size="2" color="gray">
                  System: Global Payments
                </Text>
                <Text size="2" color="gray">
                  Country: {globalPaymentAccount.country || 'Not specified'}
                </Text>
                <Text size="2" color="gray">
                  Currency: {globalPaymentAccount.default_currency || 'USD'}
                </Text>
                <Text size="2" color="gray">
                  Status: {globalPaymentAccount.status}
                </Text>
                {globalPaymentAccount.stripe_recipient_id && (
                  <Text size="2" color="gray">
                    Recipient ID: {globalPaymentAccount.stripe_recipient_id.substring(0, 20)}...
                  </Text>
                )}
              </Flex>
            </Flex>
          </Box>
        )}

        {/* Migration Notice - Show if they have legacy Connect account */}
        {globalPaymentAccount?.legacy_stripe_connect_account_id && (
          <Callout.Root color="blue">
            <Callout.Icon>
              <InfoCircledIcon />
            </Callout.Icon>
            <Callout.Text>
              You've successfully migrated from Stripe Connect to Global Payments. 
              Your previous account setup has been preserved.
            </Callout.Text>
          </Callout.Root>
        )}

        <Callout.Root color="blue">
          <Callout.Icon>
            <InfoCircledIcon />
          </Callout.Icon>
          <Callout.Text>
            Global Payments uses Stripe's secure infrastructure with simplified setup. 
            Your banking information is encrypted and never stored on our servers.
          </Callout.Text>
        </Callout.Root>
      </Flex>
    </Card>
  );
};

export default GlobalPaymentsOnboarding;
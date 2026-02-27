import { useState } from 'react';
import {
  Box,
  Heading,
  Text,
  Button,
  Card,
  Flex,
  Separator,
  Badge,
  Callout
} from '@radix-ui/themes';
import {
  ExclamationTriangleIcon,
  TrashIcon,
  CheckCircledIcon,
  CrossCircledIcon
} from '@radix-ui/react-icons';
import { supabase } from '../lib/supabase';

const Settings = () => {
  const [stripeCleanupRunning, setStripeCleanupRunning] = useState(false);
  const [stripeCleanupResult, setStripeCleanupResult] = useState(null);

  const handleStripeCleanup = async () => {
    if (!confirm('This will delete all abandoned Stripe accounts (7+ days old, incomplete onboarding). Continue?')) {
      return;
    }

    setStripeCleanupRunning(true);
    setStripeCleanupResult(null);

    try {
      const { data, error } = await supabase.functions.invoke('cron-cleanup-abandoned-accounts', {
        body: {}
      });

      if (error) throw error;

      setStripeCleanupResult(data);
    } catch (error) {
      setStripeCleanupResult({
        success: false,
        error: error.message
      });
    } finally {
      setStripeCleanupRunning(false);
    }
  };

  const handleOneTimeCleanup = async () => {
    if (!confirm('This is a ONE-TIME cleanup of 73 specific accounts already deleted from database. Continue?')) {
      return;
    }

    setStripeCleanupRunning(true);
    setStripeCleanupResult(null);

    console.log('Starting one-time cleanup...');

    try {
      console.log('Calling admin-delete-stripe-batch function...');

      // Set a timeout for the function call
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Function timeout after 120 seconds')), 120000)
      );

      const functionPromise = supabase.functions.invoke('admin-delete-stripe-batch', {
        body: {}
      });

      const { data, error } = await Promise.race([functionPromise, timeoutPromise]);

      console.log('Response received:', { data, error });

      if (error) {
        console.error('Function error:', error);
        throw error;
      }

      console.log('Cleanup successful:', data);
      setStripeCleanupResult(data);
    } catch (error) {
      console.error('Cleanup failed:', error);
      setStripeCleanupResult({
        success: false,
        error: error.message || error.toString()
      });
    } finally {
      setStripeCleanupRunning(false);
    }
  };

  return (
    <Box p="6" style={{ maxWidth: '900px', margin: '0 auto' }}>
      <Heading size="8" mb="2">Settings</Heading>
      <Text size="3" color="gray" mb="6">
        System configuration and maintenance tools
      </Text>

      {/* Stripe Account Cleanup Section */}
      <Card size="3" mb="4">
        <Heading size="5" mb="3">
          <TrashIcon width="18" height="18" style={{ display: 'inline', marginRight: '8px' }} />
          Stripe Account Cleanup
        </Heading>

        <Text size="2" color="gray" mb="4">
          Automatically delete abandoned Stripe accounts that haven't completed onboarding.
          This stops reminder emails and keeps the database clean.
        </Text>

        <Separator size="4" mb="4" />

        {/* Regular Cleanup */}
        <Flex direction="column" gap="3" mb="4">
          <Box>
            <Text size="3" weight="bold" mb="1">Regular Cleanup</Text>
            <Text size="2" color="gray" mb="3">
              Deletes accounts that are:
              <ul style={{ marginLeft: '20px', marginTop: '8px' }}>
                <li>7+ days old</li>
                <li>Status: invited or blocked</li>
                <li>Onboarding not completed</li>
              </ul>
            </Text>
            <Button
              onClick={handleStripeCleanup}
              disabled={stripeCleanupRunning}
              variant="soft"
              color="red"
              size="2"
            >
              {stripeCleanupRunning ? 'Running...' : 'Run Cleanup Now'}
            </Button>
          </Box>
        </Flex>

        <Separator size="4" mb="4" />

        {/* One-Time Cleanup */}
        <Flex direction="column" gap="3">
          <Box>
            <Text size="3" weight="bold" mb="1">One-Time Batch Cleanup</Text>
            <Text size="2" color="gray" mb="3">
              Deletes 73 specific accounts that were already removed from database.
              <Badge color="orange" ml="2">One-time only</Badge>
            </Text>
            <Button
              onClick={handleOneTimeCleanup}
              disabled={stripeCleanupRunning}
              variant="soft"
              color="orange"
              size="2"
            >
              {stripeCleanupRunning ? 'Running...' : 'Run Batch Cleanup'}
            </Button>
          </Box>
        </Flex>

        {/* Results Display */}
        {stripeCleanupResult && (
          <Box mt="4">
            <Separator size="4" mb="4" />

            {stripeCleanupResult.success ? (
              <Callout.Root color="green" mb="3">
                <Callout.Icon>
                  <CheckCircledIcon />
                </Callout.Icon>
                <Callout.Text>
                  <Text weight="bold">Cleanup Complete</Text>
                </Callout.Text>
              </Callout.Root>
            ) : (
              <Callout.Root color="red" mb="3">
                <Callout.Icon>
                  <CrossCircledIcon />
                </Callout.Icon>
                <Callout.Text>
                  <Text weight="bold">Cleanup Failed: {stripeCleanupResult.error}</Text>
                </Callout.Text>
              </Callout.Root>
            )}

            {stripeCleanupResult.summary && (
              <Card size="2" variant="surface">
                <Text size="2" weight="bold" mb="2">Summary:</Text>
                <Flex direction="column" gap="1">
                  <Text size="2">Total Found: {stripeCleanupResult.summary.total_found || stripeCleanupResult.summary.total}</Text>
                  <Text size="2">Deleted from Stripe: {stripeCleanupResult.summary.stripe_deleted || stripeCleanupResult.summary.deleted}</Text>
                  <Text size="2">Deleted from Database: {stripeCleanupResult.summary.db_deleted}</Text>
                  {stripeCleanupResult.summary.already_deleted > 0 && (
                    <Text size="2">Already Deleted: {stripeCleanupResult.summary.already_deleted}</Text>
                  )}
                  {stripeCleanupResult.summary.stripe_failed > 0 && (
                    <Text size="2" color="red">Failed: {stripeCleanupResult.summary.stripe_failed || stripeCleanupResult.summary.failed}</Text>
                  )}
                </Flex>
              </Card>
            )}
          </Box>
        )}
      </Card>

      {/* Info Callout */}
      <Callout.Root>
        <Callout.Icon>
          <ExclamationTriangleIcon />
        </Callout.Icon>
        <Callout.Text>
          The regular cleanup function is also scheduled to run automatically every week.
        </Callout.Text>
      </Callout.Root>
    </Box>
  );
};

export default Settings;

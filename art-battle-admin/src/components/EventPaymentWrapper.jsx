import { useState, useEffect } from 'react';
import {
  Box,
  Heading,
  Card,
  Flex,
  Text,
  Button,
  Callout,
  Skeleton,
  Badge
} from '@radix-ui/themes';
import {
  ExclamationTriangleIcon,
  CheckCircledIcon,
  InfoCircledIcon
} from '@radix-ui/react-icons';
import { supabase } from '../lib/supabase';
import EventPaymentDashboard from './EventPaymentDashboard';

/**
 * EventPaymentWrapper - Handles permission checking and provides event payment dashboard
 * This component should be integrated into existing event admin views
 *
 * Props:
 * - eventId: UUID of the event
 * - eventName: Name of the event (optional, will be fetched if not provided)
 * - showInlineView: If true, shows a compact inline view instead of full dashboard
 */
const EventPaymentWrapper = ({
  eventId,
  eventName = null,
  showInlineView = false
}) => {
  const [hasAccess, setHasAccess] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [userInfo, setUserInfo] = useState(null);
  const [eventInfo, setEventInfo] = useState(null);
  const [showFullDashboard, setShowFullDashboard] = useState(!showInlineView);

  useEffect(() => {
    if (eventId) {
      checkEventAccess();
    }
  }, [eventId]);

  const checkEventAccess = async () => {
    setLoading(true);
    setError('');

    try {
      // Get current user
      const { data: { user }, error: userError } = await supabase.auth.getUser();

      if (userError || !user) {
        throw new Error('Authentication required');
      }

      setUserInfo(user);

      // Check if user has access to this event by trying to call the payment function
      // The function itself handles permission checking
      const { data, error } = await supabase.functions.invoke('event-admin-payments', {
        body: {
          event_id: eventId,
          days_back: 1 // Just checking access, minimal data
        }
      });

      if (error) {
        console.error('Access check error:', error);

        // Check if it's a permission error
        if (error.message?.includes('Access denied') ||
            error.message?.includes('Not an admin') ||
            error.status === 403) {
          setHasAccess(false);
          setError('You do not have admin access to this event\'s payment data');
        } else {
          throw error;
        }
      } else if (data?.success) {
        setHasAccess(true);

        // Extract event info from response
        if (data.event_summary) {
          setEventInfo({
            name: data.event_summary.event_name,
            currency: data.event_summary.event_currency,
            artists_owed: data.event_summary.artists_owed_count,
            ready_to_pay: data.event_summary.artists_ready_to_pay_count,
            outstanding_amount: data.event_summary.outstanding_artist_payments
          });
        }
      } else {
        throw new Error(data?.error || 'Unknown error checking access');
      }

    } catch (err) {
      console.error('Error checking event access:', err);
      setError(err.message);
      setHasAccess(false);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <Box p="4">
        <Skeleton height="40px" mb="4" />
        <Skeleton height="100px" />
      </Box>
    );
  }

  if (error && hasAccess === null) {
    return (
      <Box p="4">
        <Callout.Root color="red">
          <Callout.Icon>
            <ExclamationTriangleIcon />
          </Callout.Icon>
          <Callout.Text>
            Error checking payment access: {error}
          </Callout.Text>
        </Callout.Root>
        <Button mt="3" onClick={checkEventAccess} variant="soft">
          Retry
        </Button>
      </Box>
    );
  }

  if (!hasAccess) {
    return (
      <Box p="4">
        <Callout.Root color="orange">
          <Callout.Icon>
            <InfoCircledIcon />
          </Callout.Icon>
          <Callout.Text>
            Payment Dashboard: {error || 'Access denied - You need event admin permissions to view payment data'}
          </Callout.Text>
        </Callout.Root>
      </Box>
    );
  }

  // Inline compact view for embedding in other interfaces
  if (showInlineView && !showFullDashboard) {
    return (
      <Card p="4">
        <Flex justify="between" align="center" mb="3">
          <Heading size="4">Payment Summary</Heading>
          <Button
            size="2"
            variant="soft"
            onClick={() => setShowFullDashboard(true)}
          >
            View Full Dashboard
          </Button>
        </Flex>

        {eventInfo && (
          <Flex direction="column" gap="2">
            <Flex justify="between">
              <Text size="2" color="gray">Artists Owed Money:</Text>
              <Badge color={eventInfo.artists_owed > 0 ? 'red' : 'green'}>
                {eventInfo.artists_owed} artists
              </Badge>
            </Flex>

            <Flex justify="between">
              <Text size="2" color="gray">Ready to Pay:</Text>
              <Badge color={eventInfo.ready_to_pay > 0 ? 'green' : 'gray'}>
                {eventInfo.ready_to_pay} artists
              </Badge>
            </Flex>

            <Flex justify="between">
              <Text size="2" color="gray">Outstanding Amount:</Text>
              <Text size="2" weight="bold" color={eventInfo.outstanding_amount > 0 ? 'red' : 'green'}>
                {eventInfo.currency} ${eventInfo.outstanding_amount?.toFixed(2) || '0.00'}
              </Text>
            </Flex>

            {eventInfo.artists_owed > 0 && (
              <Callout.Root color="orange" size="1" mt="2">
                <Callout.Icon>
                  <ExclamationTriangleIcon />
                </Callout.Icon>
                <Callout.Text>
                  Some artists are owed money for this event. Click "View Full Dashboard" to manage payments.
                </Callout.Text>
              </Callout.Root>
            )}
          </Flex>
        )}
      </Card>
    );
  }

  // Full dashboard view
  return (
    <Box>
      {showInlineView && (
        <Flex justify="between" align="center" mb="4">
          <Heading size="5">Event Payment Dashboard</Heading>
          <Button
            variant="soft"
            onClick={() => setShowFullDashboard(false)}
          >
            Show Compact View
          </Button>
        </Flex>
      )}

      <EventPaymentDashboard
        eventId={eventId}
        eventName={eventName || eventInfo?.name}
      />
    </Box>
  );
};

export default EventPaymentWrapper;
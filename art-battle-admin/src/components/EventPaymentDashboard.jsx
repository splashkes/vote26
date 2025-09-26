import { useState, useEffect } from 'react';
import {
  Box,
  Heading,
  Card,
  Flex,
  Text,
  Button,
  Badge,
  Table,
  Skeleton,
  Callout,
  IconButton,
  TextField,
  Separator,
  Tabs,
  Dialog
} from '@radix-ui/themes';
import {
  UpdateIcon,
  EyeOpenIcon,
  InfoCircledIcon,
  CheckCircledIcon,
  ExclamationTriangleIcon,
  MagnifyingGlassIcon
} from '@radix-ui/react-icons';
import { supabase } from '../lib/supabase';

const EventPaymentDashboard = ({ eventId, eventName }) => {
  const [eventData, setEventData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchFilter, setSearchFilter] = useState('');
  const [selectedTab, setSelectedTab] = useState('overview');
  const [showPayNowDialog, setShowPayNowDialog] = useState(false);
  const [selectedArtist, setSelectedArtist] = useState(null);
  const [paymentCurrency, setPaymentCurrency] = useState('');
  const [processingPayment, setProcessingPayment] = useState(false);

  useEffect(() => {
    if (eventId) {
      fetchEventPaymentData();
    }
  }, [eventId]);

  const fetchEventPaymentData = async () => {
    setLoading(true);
    setError('');

    try {
      console.log(`Fetching payment data for event: ${eventId}`);

      const { data, error } = await supabase.functions.invoke('event-admin-payments', {
        body: {
          event_id: eventId,
          days_back: 30
        }
      });

      if (error) {
        console.error('Supabase function error:', error);
        throw error;
      }

      if (!data.success) {
        console.error('Function returned error:', data);
        throw new Error(data.error || 'Failed to fetch event payment data');
      }

      console.log('Successfully fetched event payment data:', data);
      setEventData(data);

    } catch (err) {
      console.error('Error fetching event payment data:', err);
      setError(err.message);

      // Try to extract debug info from error response
      if (err && err.context && err.context.text) {
        try {
          const responseText = await err.context.text();
          const parsed = JSON.parse(responseText);
          if (parsed.debug) {
            console.log('Edge function debug info:', parsed.debug);
          }
          if (parsed.error) {
            setError(parsed.error);
          }
        } catch (e) {
          console.log('Could not parse error response:', e);
        }
      }
    } finally {
      setLoading(false);
    }
  };

  // Payment processing functions
  const openPayNowDialog = (artist, currency) => {
    setSelectedArtist(artist);
    setPaymentCurrency(currency);
    setShowPayNowDialog(true);
  };

  const handlePayNow = async (currency) => {
    if (!selectedArtist) return;

    try {
      setProcessingPayment(true);

      // Get the balance for this artist
      const balance = selectedArtist.estimated_balance || 0;

      if (balance <= 0) {
        setError('No balance owing for this artist');
        return;
      }

      // Create automated payment via Stripe
      const { data, error } = await supabase.functions.invoke('process-artist-payment', {
        body: {
          artist_profile_id: selectedArtist.artist_id,
          amount: balance,
          currency: currency,
          payment_type: 'automated',
          description: `Event payment for ${eventName || 'event'} - ${currency} balance`
        }
      });

      if (error) throw error;

      // Refresh the data to show updated status
      await fetchEventPaymentData();
      setShowPayNowDialog(false);
      setError(''); // Clear any previous errors

    } catch (err) {
      setError('Failed to process payment: ' + err.message);
    } finally {
      setProcessingPayment(false);
    }
  };

  // Filter functions for search
  const filterBySearch = (items, searchTerm) => {
    if (!searchTerm) return items;
    const term = searchTerm.toLowerCase();
    return items.filter(item =>
      item.artist_profiles?.name?.toLowerCase().includes(term) ||
      item.artist_profiles?.email?.toLowerCase().includes(term) ||
      item.art_code?.toLowerCase().includes(term) ||
      item.artist_name?.toLowerCase().includes(term)
    );
  };

  const filteredArtistsOwed = eventData?.event_artists_owing ?
    filterBySearch(eventData.event_artists_owing, searchFilter) : [];

  const filteredReadyToPay = eventData?.event_artists_ready_to_pay ?
    filterBySearch(eventData.event_artists_ready_to_pay, searchFilter) : [];

  const filteredPaymentAttempts = eventData?.event_payment_attempts ?
    filterBySearch(eventData.event_payment_attempts, searchFilter) : [];

  const filteredArtStatus = eventData?.event_art_status ?
    filterBySearch(eventData.event_art_status, searchFilter) : [];

  const summary = eventData?.event_summary;

  if (loading) {
    return (
      <Box p="4">
        <Skeleton height="40px" mb="4" />
        <Skeleton height="200px" mb="4" />
        <Skeleton height="300px" />
      </Box>
    );
  }

  if (error) {
    return (
      <Box p="4">
        <Callout.Root color="red" mb="4">
          <Callout.Icon>
            <ExclamationTriangleIcon />
          </Callout.Icon>
          <Callout.Text>
            Error loading event payment data: {error}
          </Callout.Text>
        </Callout.Root>
        <Button onClick={fetchEventPaymentData}>
          <UpdateIcon width="16" height="16" />
          Retry
        </Button>
      </Box>
    );
  }

  return (
    <Box p="4">
      {/* Header */}
      <Flex justify="between" align="center" mb="4">
        <Heading size="6">
          Payment Dashboard: {eventName || summary?.event_name}
        </Heading>
        <Button onClick={fetchEventPaymentData} variant="soft">
          <UpdateIcon width="16" height="16" />
          Refresh
        </Button>
      </Flex>

      {/* Summary Cards */}
      {summary && (
        <Box mb="6">
          <Heading size="4" mb="3">Event Summary</Heading>
          <Flex gap="4" wrap="wrap">
            <Card style={{ minWidth: '200px', flex: '1' }}>
              <Flex direction="column" gap="2">
                <Text size="2" color="gray">Total Art Pieces</Text>
                <Text size="6" weight="bold">{summary.total_art_pieces}</Text>
                <Text size="1" color="gray">
                  {summary.sold_art_pieces} sold • {summary.paid_art_pieces} paid
                </Text>
              </Flex>
            </Card>

            <Card style={{ minWidth: '200px', flex: '1' }}>
              <Flex direction="column" gap="2">
                <Text size="2" color="gray">Total Sales</Text>
                <Text size="6" weight="bold">
                  {summary.event_currency} ${summary.total_sales_amount?.toFixed(2)}
                </Text>
                <Text size="1" color="gray">Artist earnings: ${summary.total_artist_earnings?.toFixed(2)}</Text>
              </Flex>
            </Card>

            <Card style={{ minWidth: '200px', flex: '1' }}>
              <Flex direction="column" gap="2">
                <Text size="2" color="gray">Outstanding Payments</Text>
                <Text size="6" weight="bold" color="red">
                  ${summary.outstanding_artist_payments?.toFixed(2)}
                </Text>
                <Text size="1" color="gray">{summary.artists_owed_count} artists</Text>
              </Flex>
            </Card>

            <Card style={{ minWidth: '200px', flex: '1' }}>
              <Flex direction="column" gap="2">
                <Text size="2" color="gray">Ready to Pay</Text>
                <Text size="6" weight="bold" color="green">
                  {summary.artists_ready_to_pay_count}
                </Text>
                <Text size="1" color="gray">artists ready</Text>
              </Flex>
            </Card>
          </Flex>

          {/* Currency breakdown */}
          {summary.event_currency_totals && Object.keys(summary.event_currency_totals).length > 0 && (
            <Box mt="4">
              <Text size="3" weight="medium" mb="2">Currency Breakdown:</Text>
              <Flex direction="row" gap="4" mb="4">
                {Object.entries(summary.event_currency_totals)
                  .sort(([,a], [,b]) => b.total - a.total)
                  .map(([currency, data]) => (
                    <Flex key={currency} align="center" gap="1">
                      <Text size="2" weight="bold" color="red">
                        {currency} ${data.total.toFixed(2)}
                      </Text>
                      <Text size="1" color="gray">
                        ({data.count} artists)
                      </Text>
                    </Flex>
                  ))
                }
              </Flex>
            </Box>
          )}
        </Box>
      )}

      {/* Search */}
      <Box mb="4">
        <TextField.Root
          placeholder="Search artists, emails, or art codes..."
          value={searchFilter}
          onChange={(e) => setSearchFilter(e.target.value)}
        >
          <TextField.Slot>
            <MagnifyingGlassIcon height="16" width="16" />
          </TextField.Slot>
        </TextField.Root>
      </Box>

      {/* Tabs */}
      <Tabs.Root value={selectedTab} onValueChange={setSelectedTab}>
        <Tabs.List>
          <Tabs.Trigger value="overview">Overview</Tabs.Trigger>
          <Tabs.Trigger value="artists-owed">
            Artists Owed ({filteredArtistsOwed.length})
          </Tabs.Trigger>
          <Tabs.Trigger value="ready-to-pay">
            Ready to Pay ({filteredReadyToPay.length})
          </Tabs.Trigger>
          <Tabs.Trigger value="art-status">
            Art Status ({filteredArtStatus.length})
          </Tabs.Trigger>
          {filteredPaymentAttempts.length > 0 && (
            <Tabs.Trigger value="in-progress">
              In Progress ({filteredPaymentAttempts.length})
            </Tabs.Trigger>
          )}
        </Tabs.List>

        {/* Overview Tab */}
        <Tabs.Content value="overview">
          <Card mt="4">
            <Heading size="4" mb="4">Event Payment Overview</Heading>

            {summary?.unpaid_art_pieces > 0 && (
              <Callout.Root color="orange" mb="4">
                <Callout.Icon>
                  <ExclamationTriangleIcon />
                </Callout.Icon>
                <Callout.Text>
                  {summary.unpaid_art_pieces} art pieces are sold but not yet paid for.
                  Consider sending payment reminders or offering to runners-up.
                </Callout.Text>
              </Callout.Root>
            )}

            <Text size="3" mb="3">Quick Actions:</Text>
            <Flex gap="3" wrap="wrap">
              {filteredArtistsOwed.length > 0 && (
                <Button
                  onClick={() => setSelectedTab('artists-owed')}
                  variant="soft"
                  color="red"
                >
                  View Artists Owed Money ({filteredArtistsOwed.length})
                </Button>
              )}

              {filteredReadyToPay.length > 0 && (
                <Button
                  onClick={() => setSelectedTab('ready-to-pay')}
                  variant="soft"
                  color="green"
                >
                  Process Ready Payments ({filteredReadyToPay.length})
                </Button>
              )}

              {filteredArtStatus.filter(art => art.needs_reminder).length > 0 && (
                <Button
                  onClick={() => setSelectedTab('art-status')}
                  variant="soft"
                  color="orange"
                >
                  Send Payment Reminders ({filteredArtStatus.filter(art => art.needs_reminder).length})
                </Button>
              )}
            </Flex>
          </Card>
        </Tabs.Content>

        {/* Artists Owed Tab */}
        <Tabs.Content value="artists-owed">
          <Card mt="4">
            <Heading size="4" mb="4" color="red">
              Artists Owed Money ({filteredArtistsOwed.length})
            </Heading>

            {filteredArtistsOwed.length === 0 ? (
              <Callout.Root color="green">
                <Callout.Icon>
                  <CheckCircledIcon />
                </Callout.Icon>
                <Callout.Text>
                  No artists are owed money for this event. All payments are up to date!
                </Callout.Text>
              </Callout.Root>
            ) : (
              <Table.Root>
                <Table.Header>
                  <Table.Row>
                    <Table.ColumnHeaderCell>Artist</Table.ColumnHeaderCell>
                    <Table.ColumnHeaderCell>Amount Owed</Table.ColumnHeaderCell>
                    <Table.ColumnHeaderCell>Payment Status</Table.ColumnHeaderCell>
                    <Table.ColumnHeaderCell>Recent City</Table.ColumnHeaderCell>
                    <Table.ColumnHeaderCell>Actions</Table.ColumnHeaderCell>
                  </Table.Row>
                </Table.Header>
                <Table.Body>
                  {filteredArtistsOwed.map((artist, index) => (
                    <Table.Row key={`${artist.artist_profiles.id}-${index}`}>
                      <Table.Cell>
                        <Flex direction="column" gap="1">
                          <Text size="2" weight="medium">{artist.artist_profiles.name}</Text>
                          <Badge variant="soft" size="1">#{artist.artist_profiles.entry_id}</Badge>
                        </Flex>
                      </Table.Cell>
                      <Table.Cell>
                        <Text size="2" weight="bold" color="red">
                          ${(artist.estimated_balance || 0).toFixed(2)} {artist.balance_currency || 'USD'}
                        </Text>
                      </Table.Cell>
                      <Table.Cell>
                        <Badge color={
                          artist.payment_account_status === 'ready' ? 'green' :
                          artist.payment_account_status === 'in_progress' ? 'orange' :
                          artist.payment_account_status === 'invited' ? 'blue' : 'red'
                        }>
                          {artist.payment_account_status === 'ready' ? 'Ready' :
                           artist.payment_account_status === 'in_progress' ? 'In Progress' :
                           artist.payment_account_status === 'invited' ? 'Invited' : 'No Account'}
                        </Badge>
                      </Table.Cell>
                      <Table.Cell>
                        <Text size="2" color="gray">{artist.recent_city || summary?.event_name}</Text>
                      </Table.Cell>
                      <Table.Cell>
                        <Button size="1" variant="soft">
                          <EyeOpenIcon width="12" height="12" />
                          View Details
                        </Button>
                      </Table.Cell>
                    </Table.Row>
                  ))}
                </Table.Body>
              </Table.Root>
            )}
          </Card>
        </Tabs.Content>

        {/* Ready to Pay Tab */}
        <Tabs.Content value="ready-to-pay">
          <Card mt="4">
            <Heading size="4" mb="4" color="green">
              Ready to Pay ({filteredReadyToPay.length})
            </Heading>

            {filteredReadyToPay.length === 0 ? (
              <Callout.Root color="blue">
                <Callout.Icon>
                  <InfoCircledIcon />
                </Callout.Icon>
                <Callout.Text>
                  No artists are ready for automatic payment. Artists need verified Stripe accounts to appear here.
                </Callout.Text>
              </Callout.Root>
            ) : (
              <>
                <Text size="2" color="gray" mb="3">
                  These artists have verified payment accounts and are ready for processing.
                </Text>
                <Table.Root>
                  <Table.Header>
                    <Table.Row>
                      <Table.ColumnHeaderCell>Artist</Table.ColumnHeaderCell>
                      <Table.ColumnHeaderCell>Amount</Table.ColumnHeaderCell>
                      <Table.ColumnHeaderCell>Currency</Table.ColumnHeaderCell>
                      <Table.ColumnHeaderCell>Stripe Account</Table.ColumnHeaderCell>
                      <Table.ColumnHeaderCell>Actions</Table.ColumnHeaderCell>
                    </Table.Row>
                  </Table.Header>
                  <Table.Body>
                    {filteredReadyToPay.map((artist, index) => (
                      <Table.Row key={`${artist.artist_profiles.id}-${index}`}>
                        <Table.Cell>
                          <Flex direction="column" gap="1">
                            <Text size="2" weight="medium">{artist.artist_profiles.name}</Text>
                            <Badge variant="soft" size="1">#{artist.artist_profiles.entry_id}</Badge>
                          </Flex>
                        </Table.Cell>
                        <Table.Cell>
                          <Text size="2" weight="bold" color="green">
                            ${(artist.estimated_balance || 0).toFixed(2)}
                          </Text>
                        </Table.Cell>
                        <Table.Cell>
                          <Badge variant="soft">{artist.balance_currency || 'USD'}</Badge>
                        </Table.Cell>
                        <Table.Cell>
                          <Badge color="green" variant="soft">Ready</Badge>
                        </Table.Cell>
                        <Table.Cell>
                          <Flex gap="1">
                            <Button
                              size="1"
                              variant="solid"
                              color="green"
                              onClick={() => openPayNowDialog(artist, artist.balance_currency || 'USD')}
                              title={`Pay ${artist.balance_currency || 'USD'} $${(artist.estimated_balance || 0).toFixed(2)} now`}
                            >
                              Pay Now
                            </Button>
                            <Button size="1" variant="soft">
                              <EyeOpenIcon width="12" height="12" />
                              View
                            </Button>
                          </Flex>
                        </Table.Cell>
                      </Table.Row>
                    ))}
                  </Table.Body>
                </Table.Root>
              </>
            )}
          </Card>
        </Tabs.Content>

        {/* Art Status Tab */}
        <Tabs.Content value="art-status">
          <Card mt="4">
            <Heading size="4" mb="4">
              Art Payment Status ({filteredArtStatus.length})
            </Heading>

            {filteredArtStatus.length === 0 ? (
              <Callout.Root color="blue">
                <Callout.Icon>
                  <InfoCircledIcon />
                </Callout.Icon>
                <Callout.Text>
                  No sold art pieces found for this event.
                </Callout.Text>
              </Callout.Root>
            ) : (
              <Table.Root>
                <Table.Header>
                  <Table.Row>
                    <Table.ColumnHeaderCell>Art Code</Table.ColumnHeaderCell>
                    <Table.ColumnHeaderCell>Artist</Table.ColumnHeaderCell>
                    <Table.ColumnHeaderCell>Final Price</Table.ColumnHeaderCell>
                    <Table.ColumnHeaderCell>Payment Status</Table.ColumnHeaderCell>
                    <Table.ColumnHeaderCell>Days Since Sale</Table.ColumnHeaderCell>
                    <Table.ColumnHeaderCell>Actions</Table.ColumnHeaderCell>
                  </Table.Row>
                </Table.Header>
                <Table.Body>
                  {filteredArtStatus.map((art, index) => (
                    <Table.Row key={`${art.art_id}-${index}`}>
                      <Table.Cell>
                        <Text size="2" weight="medium">{art.art_code}</Text>
                      </Table.Cell>
                      <Table.Cell>
                        <Text size="2">{art.artist_name}</Text>
                      </Table.Cell>
                      <Table.Cell>
                        <Text size="2" weight="bold">
                          {art.currency} ${(art.final_price || art.current_bid || 0).toFixed(2)}
                        </Text>
                      </Table.Cell>
                      <Table.Cell>
                        <Badge color={art.payment_status === 'paid' ? 'green' : 'orange'}>
                          {art.payment_status === 'paid' ? 'Paid' : 'Unpaid'}
                        </Badge>
                      </Table.Cell>
                      <Table.Cell>
                        <Text size="2" color={art.needs_reminder ? 'red' : 'gray'}>
                          {art.days_since_sale || 0} days
                        </Text>
                      </Table.Cell>
                      <Table.Cell>
                        <Flex gap="2">
                          {art.needs_reminder && (
                            <Button size="1" variant="soft" color="orange">
                              Send Reminder
                            </Button>
                          )}
                          {art.needs_runner_up_offer && (
                            <Button size="1" variant="soft" color="red">
                              Offer to Runner-up
                            </Button>
                          )}
                        </Flex>
                      </Table.Cell>
                    </Table.Row>
                  ))}
                </Table.Body>
              </Table.Root>
            )}
          </Card>
        </Tabs.Content>

        {/* In Progress Tab */}
        {filteredPaymentAttempts.length > 0 && (
          <Tabs.Content value="in-progress">
            <Card mt="4">
              <Heading size="4" mb="4" color="orange">
                In Progress Payments ({filteredPaymentAttempts.length})
              </Heading>

              <Table.Root>
                <Table.Header>
                  <Table.Row>
                    <Table.ColumnHeaderCell>Artist</Table.ColumnHeaderCell>
                    <Table.ColumnHeaderCell>Amount</Table.ColumnHeaderCell>
                    <Table.ColumnHeaderCell>Status</Table.ColumnHeaderCell>
                    <Table.ColumnHeaderCell>Payment Date</Table.ColumnHeaderCell>
                    <Table.ColumnHeaderCell>Method</Table.ColumnHeaderCell>
                  </Table.Row>
                </Table.Header>
                <Table.Body>
                  {filteredPaymentAttempts.map((payment, index) => (
                    <Table.Row key={`${payment.payment_id}-${index}`}>
                      <Table.Cell>
                        <Text size="2" weight="medium">{payment.artist_profiles.name}</Text>
                      </Table.Cell>
                      <Table.Cell>
                        <Text size="2" weight="bold">
                          ${(payment.payment_amount || 0).toFixed(2)} {payment.payment_currency}
                        </Text>
                      </Table.Cell>
                      <Table.Cell>
                        <Badge color={
                          payment.latest_payment_status === 'processing' ? 'orange' :
                          payment.latest_payment_status === 'failed' ? 'red' : 'gray'
                        }>
                          {payment.latest_payment_status}
                        </Badge>
                      </Table.Cell>
                      <Table.Cell>
                        <Text size="2" color="gray">
                          {payment.payment_date ? new Date(payment.payment_date).toLocaleDateString() : 'N/A'}
                        </Text>
                      </Table.Cell>
                      <Table.Cell>
                        <Text size="2">{payment.payment_method || 'N/A'}</Text>
                      </Table.Cell>
                    </Table.Row>
                  ))}
                </Table.Body>
              </Table.Root>
            </Card>
          </Tabs.Content>
        )}
      </Tabs.Root>

      {/* Pay Now Confirmation Dialog */}
      <Dialog.Root open={showPayNowDialog} onOpenChange={setShowPayNowDialog}>
        <Dialog.Content style={{ maxWidth: '500px' }}>
          <Dialog.Title>Process Payment Now</Dialog.Title>
          <Dialog.Description>
            Process payment to {selectedArtist?.artist_name || selectedArtist?.artist_profiles?.name} via Stripe
          </Dialog.Description>
          <Flex direction="column" gap="4" mt="4">
            <Card variant="ghost">
              <Flex direction="column" gap="3">
                <Heading size="3">Payment Details</Heading>
                <Flex justify="between">
                  <Text size="2" color="gray">Artist:</Text>
                  <Text size="2" weight="medium">
                    {selectedArtist?.artist_name || selectedArtist?.artist_profiles?.name}
                    (#{selectedArtist?.artist_entry_id || selectedArtist?.artist_profiles?.entry_id})
                  </Text>
                </Flex>
                <Flex justify="between">
                  <Text size="2" color="gray">Amount:</Text>
                  <Text size="2" weight="bold" color="green">
                    {paymentCurrency} ${(selectedArtist?.estimated_balance || 0).toFixed(2)}
                  </Text>
                </Flex>
                <Flex justify="between">
                  <Text size="2" color="gray">Payment Method:</Text>
                  <Text size="2">Stripe Transfer</Text>
                </Flex>
                <Flex justify="between">
                  <Text size="2" color="gray">Event:</Text>
                  <Text size="2">{eventName}</Text>
                </Flex>
              </Flex>
            </Card>
            <Callout.Root color="blue">
              <Callout.Icon>
                <InfoCircledIcon />
              </Callout.Icon>
              <Callout.Text>
                This will initiate an automatic Stripe transfer to the artist's verified account.
              </Callout.Text>
            </Callout.Root>
          </Flex>

          <Flex gap="3" mt="4" justify="end">
            <Dialog.Close>
              <Button variant="soft" color="gray" disabled={processingPayment}>Cancel</Button>
            </Dialog.Close>
            <Button
              onClick={() => handlePayNow(paymentCurrency)}
              disabled={processingPayment || !paymentCurrency}
              color="green"
              loading={processingPayment}
            >
              {processingPayment ? 'Processing...' : 'Process Payment Now'}
            </Button>
          </Flex>
        </Dialog.Content>
      </Dialog.Root>
    </Box>
  );
};

export default EventPaymentDashboard;
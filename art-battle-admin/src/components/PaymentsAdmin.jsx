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
  Dialog,
  TextField,
  TextArea,
  Select,
  Separator,
  ScrollArea,
  Tabs
} from '@radix-ui/themes';
import {
  UpdateIcon,
  EyeOpenIcon,
  PlusIcon,
  Cross2Icon,
  InfoCircledIcon,
  CheckCircledIcon,
  ExclamationTriangleIcon,
  MagnifyingGlassIcon
} from '@radix-ui/react-icons';
import { supabase } from '../lib/supabase';

const PaymentsAdmin = () => {
  const [artists, setArtists] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedArtist, setSelectedArtist] = useState(null);
  const [showArtistDetail, setShowArtistDetail] = useState(false);
  const [stripeDetails, setStripeDetails] = useState(null);
  const [loadingStripe, setLoadingStripe] = useState(false);
  const [showManualPayment, setShowManualPayment] = useState(false);
  const [showReminderDialog, setShowReminderDialog] = useState(false);
  const [reminderType, setReminderType] = useState('email'); // 'email' or 'sms'
  const [sendingReminder, setSendingReminder] = useState(false);
  const [accountLedger, setAccountLedger] = useState(null);
  const [loadingLedger, setLoadingLedger] = useState(false);
  const [showZeroAccount, setShowZeroAccount] = useState(false);
  const [artistBalances, setArtistBalances] = useState({ owing: [], zero: [] });
  const [recentPayments, setRecentPayments] = useState([]);
  const [enhancedData, setEnhancedData] = useState(null);
  const [groupByCity, setGroupByCity] = useState(false);
  const [loadingBalances, setLoadingBalances] = useState(false);
  const [searchFilter, setSearchFilter] = useState('');
  const [showPayNowDialog, setShowPayNowDialog] = useState(false);
  const [paymentCurrency, setPaymentCurrency] = useState('');
  const [processingPayment, setProcessingPayment] = useState(false);
  const [manualPaymentData, setManualPaymentData] = useState({
    amount: '',
    currency: 'USD',
    description: '',
    payment_method: 'bank_transfer',
    reference: ''
  });

  useEffect(() => {
    fetchRecentEventArtists();
  }, []);

  const fetchRecentEventArtists = async () => {
    try {
      setLoading(true);

      // Try enhanced function first
      const { data: enhancedResult, error: enhancedError } = await supabase
        .rpc('get_enhanced_payments_admin_data');

      if (enhancedResult && !enhancedError) {
        // Use enhanced data structure
        setEnhancedData(enhancedResult);
        setRecentPayments(enhancedResult.recent_payments || []);
        setArtistBalances({
          owing: enhancedResult.artists_owing || [],
          zero: enhancedResult.artists_zero_balance || []
        });
        setArtists([...enhancedResult.artists_owing, ...enhancedResult.artists_zero_balance]);
        setLoading(false);
        return;
      }

      // Fallback to original function
      const { data: recentArtists, error: artistsError } = await supabase
        .rpc('get_recent_event_artists_with_payment_status');

      if (artistsError) {
        console.error('RPC function not found, using fallback query:', artistsError);

        // Fallback: Direct query for recent event artists
        const { data: fallbackData, error: fallbackError } = await supabase
          .from('round_contestants')
          .select(`
            artist_profiles!inner(
              id,
              name,
              email,
              entry_id,
              phone,
              country,
              created_at
            ),
            rounds!inner(
              event_id,
              events!inner(
                name,
                event_start_datetime,
                eid
              )
            )
          `)
          .gte('rounds.events.event_start_datetime', new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString());

        if (fallbackError) throw fallbackError;

        // Process fallback data to match expected format
        const processedData = await processArtistData(fallbackData || []);
        setArtists(processedData);
      } else {
        // Process RPC data to ensure balance info is loaded
        const processedData = recentArtists || [];
        setArtists(processedData);

        // Always fetch balance information for grouping (only for fallback)
        if (!enhancedResult) {
          await fetchArtistBalancesForGrouping(processedData);
        }
      }
    } catch (err) {
      setError('Failed to load recent event artists: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  // Process artist data to add payment account information
  const processArtistData = async (rawData) => {
    const uniqueArtists = new Map();

    // Group by artist and collect event info
    rawData.forEach(item => {
      const artist = item.artist_profiles;
      const event = item.rounds?.events;

      if (!uniqueArtists.has(artist.id)) {
        uniqueArtists.set(artist.id, {
          artist_profiles: artist,
          events: [],
          recent_contests: 0,
          payment_status: null,
          stripe_recipient_id: null,
          payment_account_created: null
        });
      }

      const artistData = uniqueArtists.get(artist.id);
      if (event && !artistData.events.some(e => e.eid === event.eid)) {
        artistData.events.push(event);
        artistData.recent_contests += 1;
      }
    });

    // Fetch payment status for all artists
    const artistIds = Array.from(uniqueArtists.keys());
    if (artistIds.length > 0) {
      const { data: paymentData } = await supabase
        .from('artist_global_payments')
        .select('artist_profile_id, status, stripe_recipient_id, created_at')
        .in('artist_profile_id', artistIds);

      // Merge payment data
      paymentData?.forEach(payment => {
        const artistData = uniqueArtists.get(payment.artist_profile_id);
        if (artistData) {
          artistData.payment_status = payment.status;
          artistData.stripe_recipient_id = payment.stripe_recipient_id;
          artistData.payment_account_created = payment.created_at;
        }
      });
    }

    const processedArtists = Array.from(uniqueArtists.values());

    // Fetch balance information for grouping
    await fetchArtistBalancesForGrouping(processedArtists);

    return processedArtists
      .sort((a, b) => {
        // Sort by payment status (unsetup first), then by recent activity
        if (!a.payment_status && b.payment_status) return -1;
        if (a.payment_status && !b.payment_status) return 1;
        return b.recent_contests - a.recent_contests;
      });
  };

  const fetchStripeDetails = async (stripeAccountId, artistProfileId) => {
    try {
      setLoadingStripe(true);

      const { data, error } = await supabase.functions.invoke('stripe-account-details', {
        body: {
          stripe_account_id: stripeAccountId,
          artist_profile_id: artistProfileId
        }
      });

      if (error) throw error;

      setStripeDetails(data.account_details);
    } catch (err) {
      setError('Failed to fetch Stripe details: ' + err.message);
    } finally {
      setLoadingStripe(false);
    }
  };

  const handleViewArtist = async (artist) => {
    setSelectedArtist(artist);
    setShowArtistDetail(true);
    setStripeDetails(null);
    setAccountLedger(null);

    // Fetch Stripe details if account exists
    if (artist.stripe_recipient_id) {
      await fetchStripeDetails(artist.stripe_recipient_id, artist.artist_profiles.id);
    }

    // Always fetch account ledger
    await fetchArtistAccountLedger();
  };

  const handleManualPayment = async () => {
    try {
      // Get current user info for created_by field
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError) throw userError;

      const createdBy = user?.email || 'admin@artbattle.com';
      const paymentAmount = parseFloat(manualPaymentData.amount);

      const { data, error } = await supabase
        .from('artist_payments')
        .insert({
          artist_profile_id: selectedArtist.artist_profiles.id,
          gross_amount: paymentAmount,
          net_amount: paymentAmount, // For manual payments, no fees deducted
          platform_fee: 0.00,
          stripe_fee: 0.00,
          currency: manualPaymentData.currency,
          description: manualPaymentData.description,
          payment_method: manualPaymentData.payment_method,
          reference: manualPaymentData.reference || null,
          status: 'pending',
          payment_type: 'manual',
          created_by: createdBy,
          metadata: {
            created_via: 'admin_panel',
            created_at: new Date().toISOString(),
            admin_user: createdBy
          }
        });

      if (error) throw error;

      setShowManualPayment(false);
      setManualPaymentData({ amount: '', currency: 'USD', description: '', payment_method: 'bank_transfer', reference: '' });

      // Refresh artist data
      fetchRecentEventArtists();

    } catch (err) {
      setError('Failed to create manual payment: ' + err.message);
    }
  };

  const getStatusBadge = (status) => {
    if (!status) {
      return <Badge color="red" variant="soft">No Payment Account</Badge>;
    }

    const statusConfig = {
      ready: { color: 'green', text: 'Ready for Payments' },
      invited: { color: 'yellow', text: 'Setup Pending' },
      blocked: { color: 'red', text: 'Account Blocked' },
      rejected: { color: 'red', text: 'Account Rejected' }
    };

    const config = statusConfig[status] || { color: 'gray', text: status };
    return <Badge color={config.color}>{config.text}</Badge>;
  };

  const sendPaymentReminder = async () => {
    try {
      setSendingReminder(true);

      const reminderData = {
        artist_profile_id: selectedArtist.artist_profiles.id,
        artist_name: selectedArtist.artist_profiles.name,
        artist_email: selectedArtist.artist_profiles.email,
        artist_phone: selectedArtist.artist_profiles.phone,
        entry_id: selectedArtist.artist_profiles.entry_id,
        reminder_type: reminderType,
        recent_events: selectedArtist.events?.map(e => e.name).join(', ') || 'recent events'
      };

      const { data, error } = await supabase.functions.invoke('send-payment-setup-reminder', {
        body: reminderData
      });

      if (error) throw error;

      setShowReminderDialog(false);
      setError('');
      // Show success message - you could add a success state if needed
      console.log('Reminder sent successfully:', data);
    } catch (err) {
      // Parse debug info from edge function if available
      let errorMessage = `Failed to send ${reminderType} reminder: ` + err.message;

      try {
        if (err.context && err.context.text) {
          const responseText = await err.context.text();
          console.log('Raw edge function response:', responseText);
          const parsed = JSON.parse(responseText);

          if (parsed.debug) {
            console.log('Edge function debug info:', parsed.debug);
            errorMessage = parsed.error || errorMessage;

            // Add specific error details if available
            if (parsed.debug.email_error) {
              errorMessage += ` (Database error: ${parsed.debug.email_error.message})`;
            }
          }
        }
      } catch (parseError) {
        console.log('Could not parse error response:', parseError);
      }

      setError(errorMessage);
    } finally {
      setSendingReminder(false);
    }
  };

  const fetchArtistAccountLedger = async (includeZeroEntry = false) => {
    if (!selectedArtist?.artist_profiles?.id) return;

    try {
      setLoadingLedger(true);

      const { data, error } = await supabase.functions.invoke('artist-account-ledger', {
        body: {
          artist_profile_id: selectedArtist.artist_profiles.id,
          include_zero_entry: includeZeroEntry
        }
      });

      if (error) throw error;

      setAccountLedger(data);
    } catch (err) {
      setError('Failed to load account ledger: ' + err.message);
    } finally {
      setLoadingLedger(false);
    }
  };

  const handleZeroAccount = async () => {
    await fetchArtistAccountLedger(true);
    setShowZeroAccount(false);
  };

  const handlePayNow = async (currency) => {
    if (!selectedArtist || !accountLedger) return;

    try {
      setProcessingPayment(true);

      // Get the balance for this specific currency
      const currencyBalance = accountLedger.summary.currency_breakdown?.[currency]?.balance || 0;

      if (currencyBalance <= 0) {
        setError('No balance owing in this currency');
        return;
      }

      // Create automated payment via Stripe
      const { data, error } = await supabase.functions.invoke('process-artist-payment', {
        body: {
          artist_profile_id: selectedArtist.artist_profiles.id,
          amount: currencyBalance,
          currency: currency,
          payment_type: 'automated',
          description: `Payment for artwork sales - ${currency} balance`
        }
      });

      if (error) throw error;

      // Refresh the account ledger and artist data
      await Promise.all([
        fetchArtistAccountLedger(),
        fetchRecentEventArtists()
      ]);

      setShowPayNowDialog(false);
      setError(''); // Clear any previous errors

    } catch (err) {
      setError('Failed to process payment: ' + err.message);
    } finally {
      setProcessingPayment(false);
    }
  };

  const openPayNowDialog = (currency) => {
    setPaymentCurrency(currency);
    setShowPayNowDialog(true);
  };

  const fetchArtistBalancesForGrouping = async (artists) => {
    try {
      setLoadingBalances(true);
      const owing = [];
      const zero = [];

      // Fetch balance for each artist (in parallel for efficiency)
      const balancePromises = artists.map(async (artist) => {
        try {
          const { data } = await supabase.functions.invoke('artist-account-ledger', {
            body: { artist_profile_id: artist.artist_profiles.id }
          });

          const balance = data?.summary?.current_balance || 0;
          artist.current_balance = balance;
          artist.currency_info = {
            primary_currency: data?.summary?.primary_currency || 'USD',
            has_mixed_currencies: data?.summary?.has_mixed_currencies || false,
            currency_breakdown: data?.summary?.currency_breakdown || {}
          };

          if (balance > 0.01) { // Consider anything over 1 cent as "owing"
            owing.push(artist);
          } else {
            zero.push(artist);
          }
        } catch (err) {
          console.error(`Failed to fetch balance for ${artist.artist_profiles.name}:`, err);
          // Default to zero group if error
          zero.push(artist);
        }
      });

      await Promise.all(balancePromises);

      // Sort each group
      owing.sort((a, b) => (b.current_balance || 0) - (a.current_balance || 0)); // Highest balance first
      zero.sort((a, b) => b.recent_contests - a.recent_contests); // Most active first

      setArtistBalances({ owing, zero });
    } catch (err) {
      setError('Failed to load artist balances: ' + err.message);
    } finally {
      setLoadingBalances(false);
    }
  };

  const formatCurrency = (amount, currency = 'USD') => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency.toUpperCase()
    }).format(amount);
  };

  const formatArtistBalance = (artist) => {
    // Handle both estimated_balance (from enhanced function) and current_balance (from original)
    const balance = artist.estimated_balance || artist.current_balance || 0;

    if (!artist.currency_info) {
      return `$${balance.toFixed(2)}`;
    }

    const { primary_currency, has_mixed_currencies, currency_breakdown } = artist.currency_info;

    if (!has_mixed_currencies) {
      // Single currency - simple display
      return formatCurrency(artist.current_balance, primary_currency);
    } else {
      // Mixed currencies - show primary currency with indicator
      const currencyKeys = Object.keys(currency_breakdown);
      if (currencyKeys.length <= 2) {
        // Show both currencies if only 2
        return currencyKeys.map(currency =>
          formatCurrency(currency_breakdown[currency].balance, currency)
        ).join(' + ');
      } else {
        // Show primary currency with "mixed" indicator
        return `${formatCurrency(artist.current_balance, primary_currency)} (mixed)`;
      }
    }
  };

  // Filter artists based on search input
  const filterArtists = (artists) => {
    if (!searchFilter.trim()) return artists;

    const filter = searchFilter.toLowerCase().trim();
    return artists.filter(artist =>
      artist.artist_profiles.name?.toLowerCase().includes(filter) ||
      artist.artist_profiles.email?.toLowerCase().includes(filter) ||
      artist.artist_profiles.entry_id?.toString().includes(filter) ||
      artist.artist_profiles.phone?.includes(filter) ||
      artist.recent_city?.toLowerCase().includes(filter)
    );
  };

  // Group artists by city if enabled
  const groupArtistsByCity = (artists) => {
    if (!groupByCity) return { 'All Cities': artists };

    const grouped = {};
    artists.forEach(artist => {
      const city = artist.recent_city || 'Unknown City';
      if (!grouped[city]) grouped[city] = [];
      grouped[city].push(artist);
    });

    // Sort cities by total balance (for owing group) or artist count (for zero group)
    const sortedCities = Object.keys(grouped).sort((a, b) => {
      const aTotal = grouped[a].reduce((sum, artist) => sum + (artist.estimated_balance || artist.current_balance || 0), 0);
      const bTotal = grouped[b].reduce((sum, artist) => sum + (artist.estimated_balance || artist.current_balance || 0), 0);
      return bTotal - aTotal; // Highest total first
    });

    const result = {};
    sortedCities.forEach(city => {
      result[city] = grouped[city];
    });

    return result;
  };

  const filteredArtistBalances = {
    owing: filterArtists(artistBalances.owing),
    zero: filterArtists(artistBalances.zero)
  };

  const groupedOwingArtists = groupArtistsByCity(filteredArtistBalances.owing);
  const groupedZeroArtists = groupArtistsByCity(filteredArtistBalances.zero);

  // Filter recent payments
  const filteredRecentPayments = searchFilter.trim() ?
    recentPayments.filter(payment =>
      payment.artist_name?.toLowerCase().includes(searchFilter.toLowerCase()) ||
      payment.artist_email?.toLowerCase().includes(searchFilter.toLowerCase()) ||
      payment.entry_id?.toString().includes(searchFilter.toLowerCase()) ||
      payment.recent_city?.toLowerCase().includes(searchFilter.toLowerCase())
    ) : recentPayments;

  if (loading) {
    return (
      <Box>
        <Heading size="6" mb="4">Payments Administration</Heading>
        <Card>
          <Skeleton height="200px" />
        </Card>
      </Box>
    );
  }

  return (
    <Box>
      <Flex justify="between" align="center" mb="4">
        <Heading size="6">Artist Payments & Account Setup</Heading>
        <Button onClick={fetchRecentEventArtists} variant="soft">
          <UpdateIcon width="16" height="16" />
          Refresh Recent Artists
        </Button>
      </Flex>

      {error && (
        <Callout.Root color="red" mb="4">
          <Callout.Icon>
            <ExclamationTriangleIcon />
          </Callout.Icon>
          <Callout.Text>{error}</Callout.Text>
        </Callout.Root>
      )}

      {/* Search Filter and Controls */}
      <Card mb="4">
        <Flex align="center" gap="3" wrap="wrap">
          <MagnifyingGlassIcon width="16" height="16" />
          <TextField.Root
            placeholder="Search artists by name, email, entry ID, phone, or city..."
            value={searchFilter}
            onChange={(e) => setSearchFilter(e.target.value)}
            style={{ flex: 1, minWidth: '300px' }}
          />
          {searchFilter && (
            <Button
              variant="ghost"
              size="1"
              onClick={() => setSearchFilter('')}
              title="Clear search"
            >
              <Cross2Icon width="14" height="14" />
            </Button>
          )}
          <Button
            variant={groupByCity ? 'solid' : 'soft'}
            size="2"
            onClick={() => setGroupByCity(!groupByCity)}
            title="Group by city"
          >
            Group by City
          </Button>
        </Flex>
        {enhancedData?.summary && (
          <Flex mt="3" gap="4" wrap="wrap">
            <Text size="2" color="gray">
              <Text weight="medium">{enhancedData.summary.total_artists}</Text> artists total
            </Text>
            <Text size="2" color="green">
              <Text weight="medium">{enhancedData.summary.artists_owing_count}</Text> with balance owing
            </Text>
            <Text size="2" color="gray">
              <Text weight="medium">{enhancedData.summary.artists_zero_count}</Text> with zero balance
            </Text>
            <Text size="2" color="blue">
              <Text weight="medium">{enhancedData.summary.recent_payments_count}</Text> recent payments (30 days)
            </Text>
          </Flex>
        )}
      </Card>

      {/* Summary Stats */}
      {enhancedData?.summary && (
        <Card mb="4">
          <Flex gap="6" wrap="wrap">
            <Box>
              <Text size="3" weight="bold" color="blue">{enhancedData.summary.total_artists}</Text>
              <Text size="2" color="gray" style={{ display: 'block' }}>Total Artists</Text>
            </Box>
            <Box>
              <Text size="3" weight="bold" color="green">{enhancedData.summary.artists_owing_count}</Text>
              <Text size="2" color="gray" style={{ display: 'block' }}>With Balance Owing</Text>
            </Box>
            <Box>
              <Text size="3" weight="bold" color="gray">{enhancedData.summary.artists_zero_count}</Text>
              <Text size="2" color="gray" style={{ display: 'block' }}>Zero Balance</Text>
            </Box>
            <Box>
              <Text size="3" weight="bold" color="purple">{enhancedData.summary.recent_payments_count}</Text>
              <Text size="2" color="gray" style={{ display: 'block' }}>Recent Payments (30d)</Text>
            </Box>
          </Flex>
        </Card>
      )}

      {/* Tabbed Interface */}
      <Tabs.Root defaultValue="owing">
        <Tabs.List>
          <Tabs.Trigger value="owing">
            Artists Owing ({filteredArtistBalances.owing.length})
          </Tabs.Trigger>
          <Tabs.Trigger value="zero">
            Zero Balance ({filteredArtistBalances.zero.length})
          </Tabs.Trigger>
          <Tabs.Trigger value="payments">
            Recent Payments ({filteredRecentPayments.length})
          </Tabs.Trigger>
        </Tabs.List>

        {loadingBalances ? (
          <Skeleton height="200px" />
        ) : (
          <Flex direction="column" gap="6">
            {/* Artists with Balance Owing */}
            {filteredArtistBalances.owing.length > 0 && (
              <Card>
                <Flex align="center" gap="3" mb="4">
                  <Heading size="3" color="green">Artists with Balance Owing ({filteredArtistBalances.owing.length})</Heading>
                  <Badge color="green" variant="soft">
                    {(() => {
                      const totalOwing = filteredArtistBalances.owing.reduce((sum, artist) => sum + (artist.current_balance || 0), 0);

                      // Check if all artists have the same primary currency
                      const currencies = [...new Set(filteredArtistBalances.owing.map(artist =>
                        artist.currency_info?.primary_currency || 'USD'
                      ))];

                      if (currencies.length === 1) {
                        return `Total: ${formatCurrency(totalOwing, currencies[0])}`;
                      } else {
                        return `Total: ${formatCurrency(totalOwing, 'USD')} (mixed currencies)`;
                      }
                    })()}
                  </Badge>
                </Flex>

                <Table.Root>
                  <Table.Header>
                    <Table.Row>
                      <Table.ColumnHeaderCell>Artist</Table.ColumnHeaderCell>
                      <Table.ColumnHeaderCell>Entry ID</Table.ColumnHeaderCell>
                      <Table.ColumnHeaderCell>Recent City</Table.ColumnHeaderCell>
                      <Table.ColumnHeaderCell>Balance Owing</Table.ColumnHeaderCell>
                      <Table.ColumnHeaderCell>Payment Status</Table.ColumnHeaderCell>
                      <Table.ColumnHeaderCell>Actions</Table.ColumnHeaderCell>
                    </Table.Row>
                  </Table.Header>
                  <Table.Body>
                    {filteredArtistBalances.owing.map((artist) => (
                      <Table.Row key={artist.artist_profiles.id}>
                        <Table.Cell>
                          <Flex direction="column" gap="1">
                            <Text
                              weight="medium"
                              style={{ cursor: 'pointer', color: 'var(--accent-9)' }}
                              onClick={() => handleViewArtist(artist)}
                              title="Click to view account details"
                            >
                              {artist.artist_profiles.name}
                            </Text>
                            <Text size="1" color="gray">{artist.artist_profiles.email}</Text>
                          </Flex>
                        </Table.Cell>
                        <Table.Cell>
                          <Badge
                            variant="soft"
                            style={{ cursor: 'pointer' }}
                            onClick={() => handleViewArtist(artist)}
                            title="Click to view account details"
                          >
                            {artist.artist_profiles.entry_id}
                          </Badge>
                        </Table.Cell>
                        <Table.Cell>
                          <Text size="2" color="gray">
                            {artist.recent_city || 'N/A'}
                          </Text>
                        </Table.Cell>
                        <Table.Cell>
                          <Text size="3" weight="bold" color="green">
                            {formatArtistBalance(artist)}
                          </Text>
                        </Table.Cell>
                        <Table.Cell>
                          {getStatusBadge(artist.payment_status)}
                        </Table.Cell>
                        <Table.Cell>
                          <Flex gap="2" wrap="wrap">
                            <IconButton
                              size="1"
                              variant="soft"
                              onClick={() => handleViewArtist(artist)}
                              title="View Account Details"
                            >
                              <EyeOpenIcon />
                            </IconButton>

                            {/* Pay Now buttons for each currency if account is ready */}
                            {artist.payment_status === 'ready' && artist.stripe_recipient_id && artist.currency_info?.currency_breakdown && (
                              <Flex gap="1" wrap="wrap">
                                {Object.entries(artist.currency_info.currency_breakdown).map(([currency, info]) => (
                                  info.balance > 0.01 && (
                                    <Button
                                      key={currency}
                                      size="1"
                                      variant="solid"
                                      color="green"
                                      onClick={() => {
                                        setSelectedArtist(artist);
                                        openPayNowDialog(currency);
                                      }}
                                      title={`Pay ${formatCurrency(info.balance, currency)} now`}
                                    >
                                      Pay {currency}
                                    </Button>
                                  )
                                ))}
                              </Flex>
                            )}

                            {/* Setup payment button for accounts without setup */}
                            {!artist.payment_status && artist.artist_profiles.email && (
                              <Button
                                size="1"
                                variant="soft"
                                color="orange"
                                onClick={() => {
                                  setSelectedArtist(artist);
                                  setShowReminderDialog(true);
                                }}
                              >
                                Setup Payment
                              </Button>
                            )}
                          </Flex>
                        </Table.Cell>
                      </Table.Row>
                    ))}
                  </Table.Body>
                </Table.Root>
              </Card>
            )}

            {/* Artists with Zero Balance */}
            <Card>
              <Flex align="center" gap="3" mb="4">
                <Heading size="3" color="gray">Artists with Zero Balance ({filteredArtistBalances.zero.length})</Heading>
                <Text size="2" color="gray">No payments owing</Text>
              </Flex>

              {filteredArtistBalances.zero.length === 0 ? (
                <Text color="gray">No artists with zero balance found</Text>
              ) : (
                <Table.Root>
                  <Table.Header>
                    <Table.Row>
                      <Table.ColumnHeaderCell>Artist</Table.ColumnHeaderCell>
                      <Table.ColumnHeaderCell>Entry ID</Table.ColumnHeaderCell>
                      <Table.ColumnHeaderCell>Recent City</Table.ColumnHeaderCell>
                      <Table.ColumnHeaderCell>Recent Events</Table.ColumnHeaderCell>
                      <Table.ColumnHeaderCell>Payment Status</Table.ColumnHeaderCell>
                      <Table.ColumnHeaderCell>Actions</Table.ColumnHeaderCell>
                    </Table.Row>
                  </Table.Header>
                  <Table.Body>
                    {filteredArtistBalances.zero.map((artist) => (
                      <Table.Row key={artist.artist_profiles.id}>
                        <Table.Cell>
                          <Flex direction="column" gap="1">
                            <Text
                              weight="medium"
                              style={{ cursor: 'pointer', color: 'var(--accent-9)' }}
                              onClick={() => handleViewArtist(artist)}
                              title="Click to view account details"
                            >
                              {artist.artist_profiles.name}
                            </Text>
                            <Text size="1" color="gray">{artist.artist_profiles.email}</Text>
                          </Flex>
                        </Table.Cell>
                        <Table.Cell>
                          <Badge
                            variant="soft"
                            style={{ cursor: 'pointer' }}
                            onClick={() => handleViewArtist(artist)}
                            title="Click to view account details"
                          >
                            {artist.artist_profiles.entry_id}
                          </Badge>
                        </Table.Cell>
                        <Table.Cell>
                          <Text size="2" color="gray">
                            {artist.recent_city || 'N/A'}
                          </Text>
                        </Table.Cell>
                        <Table.Cell>
                          <Flex direction="column" gap="1">
                            <Badge variant="soft" color="blue">
                              {artist.recent_contests} contest{artist.recent_contests !== 1 ? 's' : ''}
                            </Badge>
                            <Text size="1" color="gray">
                              {artist.events?.[0]?.name || 'Recent events'}
                            </Text>
                          </Flex>
                        </Table.Cell>
                        <Table.Cell>
                          {getStatusBadge(artist.payment_status)}
                        </Table.Cell>
                        <Table.Cell>
                          <Flex gap="2">
                            <IconButton
                              size="1"
                              variant="soft"
                              onClick={() => handleViewArtist(artist)}
                              title="View Account Details"
                            >
                              <EyeOpenIcon />
                            </IconButton>
                            {!artist.payment_status && artist.artist_profiles.email && (
                              <Button
                                size="1"
                                variant="soft"
                                color="orange"
                                onClick={() => {
                                  setSelectedArtist(artist);
                                  setShowReminderDialog(true);
                                }}
                              >
                                Setup Payment
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
          </Flex>
        )}
      </Card>

      {/* Artist Detail Modal */}
      <Dialog.Root open={showArtistDetail} onOpenChange={setShowArtistDetail}>
        <Dialog.Content style={{ maxWidth: '1100px', maxHeight: '95vh', overflow: 'auto' }}>
          <Dialog.Title>
            {selectedArtist?.artist_profiles?.name} - Payment Details
          </Dialog.Title>

          <Box style={{ maxHeight: 'none', padding: '0' }}>
            {selectedArtist && (
              <Flex direction="column" gap="4" mt="4">

                {/* Artist Info */}
                <Card>
                  <Heading size="3" mb="3">Artist Information</Heading>
                  <Flex direction="column" gap="2">
                    <Flex justify="between">
                      <Text weight="medium">Name:</Text>
                      <Text>{selectedArtist.artist_profiles.name}</Text>
                    </Flex>
                    <Flex justify="between">
                      <Text weight="medium">Entry ID:</Text>
                      <Badge>{selectedArtist.artist_profiles.entry_id}</Badge>
                    </Flex>
                    <Flex justify="between">
                      <Text weight="medium">Email:</Text>
                      <Text>{selectedArtist.artist_profiles.email}</Text>
                    </Flex>
                    <Flex justify="between">
                      <Text weight="medium">Phone:</Text>
                      <Text>{selectedArtist.artist_profiles.phone}</Text>
                    </Flex>
                    <Flex justify="between">
                      <Text weight="medium">Country:</Text>
                      <Badge variant="outline">{selectedArtist.artist_profiles.country || 'Not specified'}</Badge>
                    </Flex>
                  </Flex>
                </Card>

                {/* Stripe Account Details */}
                {selectedArtist.stripe_recipient_id && (
                  <Card>
                    <Flex justify="between" align="center" mb="3">
                      <Heading size="3">Stripe Account Details</Heading>
                      <Button
                        size="1"
                        variant="soft"
                        loading={loadingStripe}
                        onClick={() => fetchStripeDetails(selectedArtist.stripe_recipient_id, selectedArtist.artist_profiles.id)}
                      >
                        <UpdateIcon width="14" height="14" />
                        Refresh
                      </Button>
                    </Flex>

                    {loadingStripe ? (
                      <Skeleton height="100px" />
                    ) : stripeDetails ? (
                      <Flex direction="column" gap="2">
                        <Flex justify="between">
                          <Text weight="medium">Account ID:</Text>
                          <Text style={{ fontFamily: 'monospace' }}>{stripeDetails.id}</Text>
                        </Flex>
                        <Flex justify="between">
                          <Text weight="medium">Status:</Text>
                          <Flex gap="2">
                            {stripeDetails.charges_enabled && <Badge color="green">Charges</Badge>}
                            {stripeDetails.payouts_enabled && <Badge color="green">Payouts</Badge>}
                          </Flex>
                        </Flex>
                        <Flex justify="between">
                          <Text weight="medium">Currency:</Text>
                          <Badge variant="outline">{stripeDetails.default_currency.toUpperCase()}</Badge>
                        </Flex>
                        <Flex justify="between">
                          <Text weight="medium">Verification:</Text>
                          <Badge color={stripeDetails.individual?.verification?.status === 'verified' ? 'green' : 'yellow'}>
                            {stripeDetails.individual?.verification?.status || 'Pending'}
                          </Badge>
                        </Flex>
                        {stripeDetails.requirements.currently_due.length > 0 && (
                          <Box>
                            <Text weight="medium" color="red">Requirements Due:</Text>
                            <ul>
                              {stripeDetails.requirements.currently_due.map((req, idx) => (
                                <li key={idx}><Text size="1">{req}</Text></li>
                              ))}
                            </ul>
                          </Box>
                        )}
                      </Flex>
                    ) : (
                      <Text color="gray">Click refresh to load Stripe details</Text>
                    )}
                  </Card>
                )}

                {/* Account Ledger */}
                <Card>
                  <Flex justify="between" align="center" mb="3">
                    <Heading size="3">Account Ledger</Heading>
                    <Flex gap="2">
                      <Button
                        size="1"
                        variant="soft"
                        onClick={() => fetchArtistAccountLedger()}
                        loading={loadingLedger}
                      >
                        <UpdateIcon width="12" height="12" />
                        Refresh
                      </Button>
                      <Button
                        size="1"
                        variant="soft"
                        color="orange"
                        onClick={() => setShowZeroAccount(true)}
                      >
                        ZERO Account
                      </Button>
                    </Flex>
                  </Flex>

                  {loadingLedger ? (
                    <Skeleton height="150px" />
                  ) : accountLedger ? (
                    <Flex direction="column" gap="4">
                      {/* Account Summary */}
                      <Card variant="ghost">
                        <Flex justify="between" align="center">
                          <Box>
                            <Text size="2" color="gray">Current Balance</Text>
                            <Text size="4" weight="bold" color={accountLedger.summary.current_balance >= 0 ? 'green' : 'red'}>
                              {formatCurrency(accountLedger.summary.current_balance, accountLedger.summary.primary_currency)}
                              {accountLedger.summary.has_mixed_currencies && (
                                <Text size="1" color="gray" style={{ display: 'block' }}>
                                  (multiple currencies)
                                </Text>
                              )}
                            </Text>
                          </Box>
                          <Box style={{ textAlign: 'right' }}>
                            <Text size="2" color="gray">Total Credits</Text>
                            <Text size="3" weight="medium" color="green">
                              +${accountLedger.summary.total_credits.toFixed(2)}
                            </Text>
                          </Box>
                          <Box style={{ textAlign: 'right' }}>
                            <Text size="2" color="gray">Total Debits</Text>
                            <Text size="3" weight="medium" color="red">
                              -${accountLedger.summary.total_debits.toFixed(2)}
                            </Text>
                          </Box>
                          <Box style={{ textAlign: 'right' }}>
                            <Text size="2" color="gray">Entries</Text>
                            <Text size="3" weight="medium">
                              {accountLedger.summary.entry_count}
                            </Text>
                          </Box>
                        </Flex>
                      </Card>

                      {/* Ledger Entries */}
                      <Box>
                        <Table.Root>
                          <Table.Header>
                            <Table.Row>
                              <Table.ColumnHeaderCell>Date</Table.ColumnHeaderCell>
                              <Table.ColumnHeaderCell>Type</Table.ColumnHeaderCell>
                              <Table.ColumnHeaderCell>Description</Table.ColumnHeaderCell>
                              <Table.ColumnHeaderCell>Amount</Table.ColumnHeaderCell>
                              <Table.ColumnHeaderCell>Currency</Table.ColumnHeaderCell>
                              <Table.ColumnHeaderCell>Balance</Table.ColumnHeaderCell>
                            </Table.Row>
                          </Table.Header>
                          <Table.Body>
                            {accountLedger.ledger.map((entry) => (
                              <Table.Row key={entry.id}>
                                <Table.Cell>
                                  <Text size="2" color="gray">
                                    {new Date(entry.date).toLocaleDateString()}
                                  </Text>
                                </Table.Cell>
                                <Table.Cell>
                                  <Badge
                                    color={
                                      entry.type === 'credit' ? 'green' :
                                      entry.type === 'debit' ? 'red' : 'blue'
                                    }
                                    variant="soft"
                                  >
                                    {entry.category}
                                  </Badge>
                                </Table.Cell>
                                <Table.Cell>
                                  <Flex direction="column" gap="1">
                                    <Text size="2" weight="medium">
                                      {entry.description}
                                    </Text>
                                    {entry.art_info && (
                                      <Text size="1" color="gray">
                                        {entry.art_info.event_name} • {entry.art_info.art_code}
                                      </Text>
                                    )}
                                    {entry.metadata?.gross_sale_price && (
                                      <Text size="1" color="blue">
                                        Sale: ${entry.metadata.gross_sale_price.toFixed(2)} → Artist: ${entry.amount.toFixed(2)} ({((entry.metadata.commission_rate ?? entry.art_info?.commission_rate ?? 0.5) * 100).toFixed(0)}%)
                                      </Text>
                                    )}
                                    {entry.metadata?.payment_type === 'manual' && (
                                      <Flex direction="column" gap="1">
                                        <Text size="1" color="purple">
                                          Method: {entry.metadata.payment_method || 'Not specified'}
                                        </Text>
                                        {entry.metadata.created_by && (
                                          <Text size="1" color="purple">
                                            Created by: {entry.metadata.created_by}
                                          </Text>
                                        )}
                                        {entry.metadata.reference && (
                                          <Text size="1" color="purple">
                                            Reference: {entry.metadata.reference}
                                          </Text>
                                        )}
                                      </Flex>
                                    )}
                                    {entry.metadata?.payment_type === 'automated' && (
                                      <Text size="1" color="green">
                                        Online Stripe payment - Status: {entry.metadata.status}
                                      </Text>
                                    )}
                                  </Flex>
                                </Table.Cell>
                                <Table.Cell>
                                  {entry.amount !== undefined ? (
                                    <Text
                                      size="2"
                                      weight="medium"
                                      color={entry.type === 'credit' ? 'green' : 'red'}
                                    >
                                      {entry.type === 'credit' ? '+' : '-'}${entry.amount.toFixed(2)}
                                    </Text>
                                  ) : (
                                    <Text size="2" color="gray">—</Text>
                                  )}
                                </Table.Cell>
                                <Table.Cell>
                                  <Badge
                                    variant="outline"
                                    size="1"
                                    color={entry.currency === 'USD' ? 'blue' : 'orange'}
                                  >
                                    {entry.currency || 'USD'}
                                  </Badge>
                                </Table.Cell>
                                <Table.Cell>
                                  {entry.balance_after !== undefined ? (
                                    <Text
                                      size="2"
                                      weight="medium"
                                      color={entry.balance_after >= 0 ? 'green' : 'red'}
                                    >
                                      ${entry.balance_after.toFixed(2)}
                                    </Text>
                                  ) : (
                                    <Text size="2" color="gray">—</Text>
                                  )}
                                </Table.Cell>
                              </Table.Row>
                            ))}
                          </Table.Body>
                        </Table.Root>
                      </Box>
                    </Flex>
                  ) : (
                    <Text color="gray">Click refresh to load account ledger</Text>
                  )}
                </Card>

                {/* Manual Payment Button */}
                <Flex justify="end" gap="2">
                  <Button
                    variant="solid"
                    color="blue"
                    onClick={() => setShowManualPayment(true)}
                  >
                    <PlusIcon width="16" height="16" />
                    Record Manual Payment
                  </Button>
                </Flex>
              </Flex>
            )}
          </Box>

          <Flex gap="3" mt="4" justify="end">
            <Dialog.Close>
              <Button variant="soft" color="gray">Close</Button>
            </Dialog.Close>
          </Flex>
        </Dialog.Content>
      </Dialog.Root>

      {/* Manual Payment Modal */}
      <Dialog.Root open={showManualPayment} onOpenChange={setShowManualPayment}>
        <Dialog.Content style={{ maxWidth: '500px' }}>
          <Dialog.Title>Record Manual Payment</Dialog.Title>
          <Dialog.Description>
            Record a manual payment for {selectedArtist?.artist_profiles?.name}
          </Dialog.Description>

          <Flex direction="column" gap="3" mt="4">
            <Flex gap="3">
              <Box style={{ flex: 2 }}>
                <Text size="2" weight="medium" mb="1">Amount</Text>
                <TextField.Root
                  placeholder="100.00"
                  value={manualPaymentData.amount}
                  onChange={(e) => setManualPaymentData({...manualPaymentData, amount: e.target.value})}
                />
              </Box>

              <Box style={{ flex: 1 }}>
                <Text size="2" weight="medium" mb="1">Currency</Text>
                <Select.Root
                  value={manualPaymentData.currency}
                  onValueChange={(value) => setManualPaymentData({...manualPaymentData, currency: value})}
                >
                  <Select.Trigger />
                  <Select.Content>
                    <Select.Item value="USD">USD</Select.Item>
                    <Select.Item value="CAD">CAD</Select.Item>
                    <Select.Item value="EUR">EUR</Select.Item>
                    <Select.Item value="GBP">GBP</Select.Item>
                    <Select.Item value="AUD">AUD</Select.Item>
                  </Select.Content>
                </Select.Root>
              </Box>
            </Flex>

            <Box>
              <Text size="2" weight="medium" mb="1">Payment Method</Text>
              <Select.Root
                value={manualPaymentData.payment_method}
                onValueChange={(value) => setManualPaymentData({...manualPaymentData, payment_method: value})}
              >
                <Select.Trigger />
                <Select.Content>
                  <Select.Item value="bank_transfer">Bank Transfer</Select.Item>
                  <Select.Item value="check">Check</Select.Item>
                  <Select.Item value="cash">Cash</Select.Item>
                  <Select.Item value="paypal">PayPal</Select.Item>
                  <Select.Item value="other">Other</Select.Item>
                </Select.Content>
              </Select.Root>
            </Box>

            <Box>
              <Text size="2" weight="medium" mb="1">Reference/Transaction ID</Text>
              <TextField.Root
                placeholder="TXN123456"
                value={manualPaymentData.reference}
                onChange={(e) => setManualPaymentData({...manualPaymentData, reference: e.target.value})}
              />
            </Box>

            <Box>
              <Text size="2" weight="medium" mb="1">Description</Text>
              <TextArea
                placeholder="Payment for artwork sales..."
                value={manualPaymentData.description}
                onChange={(e) => setManualPaymentData({...manualPaymentData, description: e.target.value})}
                rows={3}
              />
            </Box>
          </Flex>

          <Flex gap="3" mt="4" justify="end">
            <Dialog.Close>
              <Button variant="soft" color="gray">Cancel</Button>
            </Dialog.Close>
            <Button
              onClick={handleManualPayment}
              disabled={!manualPaymentData.amount || !manualPaymentData.description}
            >
              Record Payment
            </Button>
          </Flex>
        </Dialog.Content>
      </Dialog.Root>

      {/* Send Reminder Dialog */}
      <Dialog.Root open={showReminderDialog} onOpenChange={setShowReminderDialog}>
        <Dialog.Content style={{ maxWidth: '450px' }}>
          <Dialog.Title>Send Payment Setup Reminder</Dialog.Title>
          <Dialog.Description>
            Send a reminder to {selectedArtist?.artist_profiles?.name} to set up their payment account
          </Dialog.Description>

          <Flex direction="column" gap="4" mt="4">
            <Box>
              <Text size="2" weight="medium" mb="2">Artist Details</Text>
              <Card variant="ghost">
                <Flex direction="column" gap="2">
                  <Flex justify="between">
                    <Text size="2" color="gray">Name:</Text>
                    <Text size="2">{selectedArtist?.artist_profiles?.name}</Text>
                  </Flex>
                  <Flex justify="between">
                    <Text size="2" color="gray">Entry ID:</Text>
                    <Text size="2">{selectedArtist?.artist_profiles?.entry_id}</Text>
                  </Flex>
                  <Flex justify="between">
                    <Text size="2" color="gray">Email:</Text>
                    <Text size="2">{selectedArtist?.artist_profiles?.email}</Text>
                  </Flex>
                  {selectedArtist?.artist_profiles?.phone && (
                    <Flex justify="between">
                      <Text size="2" color="gray">Phone:</Text>
                      <Text size="2">{selectedArtist?.artist_profiles?.phone}</Text>
                    </Flex>
                  )}
                  <Flex justify="between">
                    <Text size="2" color="gray">Recent Contests:</Text>
                    <Badge variant="soft" color="blue">{selectedArtist?.recent_contests}</Badge>
                  </Flex>
                </Flex>
              </Card>
            </Box>

            <Box>
              <Text size="2" weight="medium" mb="2">Reminder Method</Text>
              <Select.Root value={reminderType} onValueChange={setReminderType}>
                <Select.Trigger />
                <Select.Content>
                  <Select.Item value="email">📧 Email Reminder</Select.Item>
                  {selectedArtist?.artist_profiles?.phone && (
                    <Select.Item value="sms">📱 SMS Text Message</Select.Item>
                  )}
                </Select.Content>
              </Select.Root>
            </Box>

            <Callout.Root color="orange">
              <Callout.Icon>
                <InfoCircledIcon />
              </Callout.Icon>
              <Callout.Text>
                {reminderType === 'email'
                  ? 'This will send an email with payment setup instructions and links.'
                  : 'This will send an SMS text message with payment setup link.'
                }
              </Callout.Text>
            </Callout.Root>
          </Flex>

          <Flex gap="3" mt="4" justify="end">
            <Dialog.Close>
              <Button variant="soft" color="gray">Cancel</Button>
            </Dialog.Close>
            <Button
              onClick={sendPaymentReminder}
              disabled={sendingReminder || !selectedArtist?.artist_profiles?.email}
              color="orange"
            >
              {sendingReminder ? 'Sending...' : `Send ${reminderType === 'email' ? 'Email' : 'SMS'}`}
            </Button>
          </Flex>
        </Dialog.Content>
      </Dialog.Root>

      {/* Pay Now Confirmation Dialog */}
      <Dialog.Root open={showPayNowDialog} onOpenChange={setShowPayNowDialog}>
        <Dialog.Content style={{ maxWidth: '500px' }}>
          <Dialog.Title>Process Payment Now</Dialog.Title>
          <Dialog.Description>
            Process payment to {selectedArtist?.artist_profiles?.name} via Stripe
          </Dialog.Description>

          <Flex direction="column" gap="4" mt="4">
            <Card variant="ghost">
              <Flex direction="column" gap="3">
                <Heading size="3">Payment Details</Heading>
                <Flex justify="between">
                  <Text size="2" color="gray">Artist:</Text>
                  <Text size="2" weight="medium">{selectedArtist?.artist_profiles?.name}</Text>
                </Flex>
                <Flex justify="between">
                  <Text size="2" color="gray">Entry ID:</Text>
                  <Text size="2">{selectedArtist?.artist_profiles?.entry_id}</Text>
                </Flex>
                <Flex justify="between">
                  <Text size="2" color="gray">Payment Currency:</Text>
                  <Badge color="blue">{paymentCurrency}</Badge>
                </Flex>
                <Flex justify="between">
                  <Text size="2" color="gray">Amount:</Text>
                  <Text size="3" weight="bold" color="green">
                    {accountLedger?.summary?.currency_breakdown?.[paymentCurrency] &&
                      formatCurrency(
                        accountLedger.summary.currency_breakdown[paymentCurrency].balance,
                        paymentCurrency
                      )
                    }
                  </Text>
                </Flex>
                <Flex justify="between">
                  <Text size="2" color="gray">Payment Method:</Text>
                  <Text size="2">Stripe Transfer</Text>
                </Flex>
              </Flex>
            </Card>

            <Callout.Root color="orange">
              <Callout.Icon>
                <InfoCircledIcon />
              </Callout.Icon>
              <Callout.Text>
                This will immediately process the payment to the artist's Stripe account.
                The payment cannot be reversed once processed.
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

      {/* Zero Account Dialog */}
      <Dialog.Root open={showZeroAccount} onOpenChange={setShowZeroAccount}>
        <Dialog.Content style={{ maxWidth: '500px' }}>
          <Dialog.Title>Zero Account Balance</Dialog.Title>
          <Dialog.Description>
            Add a balancing entry to zero out {selectedArtist?.artist_profiles?.name}'s account
          </Dialog.Description>

          <Flex direction="column" gap="4" mt="4">
            <Callout.Root color="orange">
              <Callout.Icon>
                <ExclamationTriangleIcon />
              </Callout.Icon>
              <Callout.Text>
                <strong>Important:</strong> This will add a zeroing entry to balance out the account.
                This is typically used when migrating to the new payment system with existing/legacy data.
                The entry will be marked as a "system migration adjustment".
              </Callout.Text>
            </Callout.Root>

            {accountLedger && (
              <Card variant="ghost">
                <Flex direction="column" gap="2">
                  <Flex justify="between">
                    <Text size="2" color="gray">Current Balance:</Text>
                    <Text size="2" weight="bold" color={accountLedger.summary.current_balance >= 0 ? 'green' : 'red'}>
                      ${accountLedger.summary.current_balance.toFixed(2)}
                    </Text>
                  </Flex>
                  <Flex justify="between">
                    <Text size="2" color="gray">Total Credits:</Text>
                    <Text size="2" color="green">+${accountLedger.summary.total_credits.toFixed(2)}</Text>
                  </Flex>
                  <Flex justify="between">
                    <Text size="2" color="gray">Total Debits:</Text>
                    <Text size="2" color="red">-${accountLedger.summary.total_debits.toFixed(2)}</Text>
                  </Flex>
                  <Separator />
                  <Flex justify="between">
                    <Text size="2" weight="bold">Zero Entry Amount:</Text>
                    <Text size="2" weight="bold" color={accountLedger.summary.current_balance <= 0 ? 'green' : 'red'}>
                      {accountLedger.summary.current_balance <= 0 ? '+' : '-'}${Math.abs(accountLedger.summary.current_balance).toFixed(2)}
                    </Text>
                  </Flex>
                </Flex>
              </Card>
            )}

            <Text size="2" color="gray">
              This action will immediately add the zeroing entry to the database and refresh the account ledger.
            </Text>
          </Flex>

          <Flex gap="3" mt="4" justify="end">
            <Dialog.Close>
              <Button variant="soft" color="gray">Cancel</Button>
            </Dialog.Close>
            <Button
              onClick={handleZeroAccount}
              disabled={!accountLedger || accountLedger.summary.current_balance === 0}
              color="orange"
            >
              Add Zero Entry
            </Button>
          </Flex>
        </Dialog.Content>
      </Dialog.Root>
    </Box>
  );
};

export default PaymentsAdmin;
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

const PaymentsAdminTabbed = () => {
  const [enhancedData, setEnhancedData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchFilter, setSearchFilter] = useState('');
  const [selectedArtist, setSelectedArtist] = useState(null);
  const [showArtistDetail, setShowArtistDetail] = useState(false);
  const [stripeDetails, setStripeDetails] = useState(null);
  const [loadingStripe, setLoadingStripe] = useState(false);
  const [showManualPayment, setShowManualPayment] = useState(false);
  const [showReminderDialog, setShowReminderDialog] = useState(false);
  const [reminderType, setReminderType] = useState('email');
  const [sendingReminder, setSendingReminder] = useState(false);
  const [accountLedger, setAccountLedger] = useState(null);
  const [loadingLedger, setLoadingLedger] = useState(false);
  const [showZeroAccount, setShowZeroAccount] = useState(false);
  const [showPayNowDialog, setShowPayNowDialog] = useState(false);
  const [processingPayments, setProcessingPayments] = useState(false);
  const [paymentProcessResults, setPaymentProcessResults] = useState(null);
  const [paymentLimit, setPaymentLimit] = useState(5);
  const [paymentCurrency, setPaymentCurrency] = useState('');
  const [processingPayment, setProcessingPayment] = useState(false);
  const [manualPaymentData, setManualPaymentData] = useState({
    amount: '',
    currency: 'USD',
    description: '',
    payment_method: 'bank_transfer',
    reference: ''
  });
  const [availableCurrencies, setAvailableCurrencies] = useState([]);
  const [showInvitationHistory, setShowInvitationHistory] = useState(false);
  const [invitationHistory, setInvitationHistory] = useState(null);
  const [loadingInvitationHistory, setLoadingInvitationHistory] = useState(false);
  const [showApiConversations, setShowApiConversations] = useState(false);
  const [apiConversations, setApiConversations] = useState([]);
  const [loadingApiConversations, setLoadingApiConversations] = useState(false);
  const [selectedPaymentForApi, setSelectedPaymentForApi] = useState(null);

  useEffect(() => {
    fetchEnhancedData();
    fetchAvailableCurrencies();
  }, []);

  // Fetch invitation history when reminder dialog opens
  useEffect(() => {
    if (showReminderDialog && selectedArtist?.artist_profiles?.id) {
      fetchInvitationHistory(selectedArtist.artist_profiles.id);
    }
  }, [showReminderDialog, selectedArtist?.artist_profiles?.id]);


  const fetchAvailableCurrencies = async () => {
    try {
      const { data, error } = await supabase.rpc('get_available_currencies');
      if (error) throw error;
      setAvailableCurrencies(data || []);
    } catch (err) {
      console.error('Failed to load currencies:', err);
      // Fallback to default currencies if function fails
      setAvailableCurrencies([
        { currency_code: 'USD' },
        { currency_code: 'CAD' },
        { currency_code: 'EUR' },
        { currency_code: 'GBP' },
        { currency_code: 'AUD' },
        { currency_code: 'NZD' }
      ]);
    }
  };

  const fetchEnhancedData = async () => {
    try {
      setLoading(true);
      console.log('🔍 Fetching artist payment data from working-admin-payments function...');

      const { data: paymentData, error: paymentError } = await supabase.functions.invoke('working-admin-payments', {
        body: {
          days_back: 365
        }
      });

      if (paymentError) {
        console.error('❌ Edge function error:', paymentError);
        throw paymentError;
      }

      console.log('📊 Received payment data:', {
        recent_contestants: paymentData.recent_contestants?.length,
        artists_owed_money: paymentData.artists_owing?.length,
        artists_ready_to_pay: paymentData.artists_ready_to_pay?.length,
        payment_attempts: paymentData.payment_attempts?.length,
        completed_payments: paymentData.completed_payments?.length
      });

      // Use the new 5-category data structure directly
      const enhancedResult = {
        // Pass through all 5 categories from working function
        recent_contestants: paymentData.recent_contestants || [],
        artists_owed_money: paymentData.artists_owing || [],
        artists_ready_to_pay: paymentData.artists_ready_to_pay || [],
        payment_attempts: paymentData.payment_attempts || [],
        completed_payments: paymentData.completed_payments || [],
        summary: paymentData.summary || {
          total_recent_contestants: 0,
          artists_owing_count: 0,
          artists_ready_count: 0,
          payment_attempts_count: 0,
          completed_payments_count: 0,
          generated_at: new Date().toISOString()
        }
      };

      console.log('✅ Enhanced data prepared:', {
        recent_contestants: enhancedResult.recent_contestants?.length,
        artists_owed_money: enhancedResult.artists_owed_money?.length,
        artists_ready_to_pay: enhancedResult.artists_ready_to_pay?.length,
        payment_attempts: enhancedResult.payment_attempts?.length,
        completed_payments: enhancedResult.completed_payments?.length,
        summary: enhancedResult.summary
      });

      setEnhancedData(enhancedResult);
    } catch (err) {
      console.error('❌ Enhanced data fetch error:', err);
      setError('Failed to load payments data: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amount, currency = 'USD') => {
    // Validate and clean the currency code
    let cleanCurrency = currency;

    if (!cleanCurrency || typeof cleanCurrency !== 'string') {
      cleanCurrency = 'USD';
    }

    // Remove any extra whitespace and convert to uppercase
    cleanCurrency = cleanCurrency.trim().toUpperCase();

    // List of common valid currency codes
    const validCurrencies = ['USD', 'CAD', 'EUR', 'GBP', 'AUD', 'JPY', 'CHF', 'CNY', 'INR', 'BRL', 'MXN', 'ZAR'];

    // If currency is not in our list of valid currencies, default to USD
    if (!validCurrencies.includes(cleanCurrency)) {
      console.warn(`Invalid currency code "${currency}", defaulting to USD`);
      cleanCurrency = 'USD';
    }

    try {
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: cleanCurrency
      }).format(amount || 0);
    } catch (error) {
      console.error(`Currency formatting error with currency "${cleanCurrency}":`, error);
      // Fallback to simple formatting
      return `$${(amount || 0).toFixed(2)}`;
    }
  };

  const filterItems = (items, searchTerm) => {
    if (!searchTerm.trim()) return items;
    const filter = searchTerm.toLowerCase();
    return items.filter(item => {
      const profile = item.artist_profiles;
      return (
        profile?.name?.toLowerCase().includes(filter) ||
        profile?.email?.toLowerCase().includes(filter) ||
        profile?.entry_id?.toString().includes(filter) ||
        profile?.phone?.includes(filter) ||
        item.recent_city?.toLowerCase().includes(filter)
      );
    });
  };

  const handleViewArtist = async (artist) => {
    // Immediately clear previous data and set loading states
    setSelectedArtist(artist);
    setStripeDetails(null);
    setAccountLedger(null);
    setLoadingStripe(false);
    setLoadingLedger(true);

    // Open modal with loading state
    setShowArtistDetail(true);

    try {
      // Fetch both Stripe details and account ledger in parallel
      const promises = [];

      // Fetch Stripe details if account exists
      if (artist.stripe_recipient_id) {
        promises.push(fetchStripeDetails(artist.stripe_recipient_id, artist.artist_profiles.id));
      }

      // Always fetch account ledger
      promises.push(fetchArtistAccountLedger(false, artist.artist_profiles.id));

      // Wait for all data to load
      await Promise.all(promises);
    } catch (error) {
      console.error('Error loading artist details:', error);
      setError('Failed to load artist details: ' + error.message);
    }
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

  const fetchArtistAccountLedger = async (includeZeroEntry = false, artistProfileId = null) => {
    // Use provided artistProfileId or fall back to selectedArtist
    const profileId = artistProfileId || selectedArtist?.artist_profiles?.id;

    if (!profileId) {
      console.error('No artist profile ID available for ledger fetch');
      return;
    }

    try {
      setLoadingLedger(true);

      const { data, error } = await supabase.functions.invoke('artist-account-ledger', {
        body: {
          artist_profile_id: profileId,
          include_zero_entry: includeZeroEntry
        }
      });

      if (error) throw error;

      setAccountLedger(data);
    } catch (err) {
      console.error('Failed to load account ledger:', err);
      setError('Failed to load account ledger: ' + err.message);
    } finally {
      setLoadingLedger(false);
    }
  };

  const handleManualPayment = async () => {
    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError) throw userError;

      const createdBy = user?.email || 'admin@artbattle.com';
      const paymentAmount = parseFloat(manualPaymentData.amount);

      const { data, error } = await supabase
        .from('artist_payments')
        .insert({
          artist_profile_id: selectedArtist.artist_profiles.id,
          gross_amount: paymentAmount,
          net_amount: paymentAmount,
          platform_fee: 0.00,
          stripe_fee: 0.00,
          currency: manualPaymentData.currency,
          description: manualPaymentData.description,
          payment_method: manualPaymentData.payment_method,
          reference: manualPaymentData.reference || null,
          status: 'paid',
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

      fetchEnhancedData();
    } catch (err) {
      setError('Failed to create manual payment: ' + err.message);
    }
  };

  const sendPaymentReminder = async (e) => {
    e?.preventDefault(); // Prevent any form submission
    try {
      setSendingReminder(true);

      const reminderData = {
        artist_profile_id: selectedArtist.artist_profiles.id,
        artist_name: selectedArtist.artist_profiles.name,
        artist_email: selectedArtist.artist_profiles.email,
        artist_phone: selectedArtist.artist_profiles.phone,
        entry_id: selectedArtist.artist_profiles.entry_id,
        reminder_type: reminderType,
        recent_events: 'recent events'
      };

      const { data, error } = await supabase.functions.invoke('send-payment-setup-reminder', {
        body: reminderData
      });

      if (error) throw error;

      // Log the invitation after successful send
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      const sentBy = user?.email || 'admin@artbattle.com';

      await supabase.rpc('log_payment_setup_invitation', {
        p_artist_profile_id: selectedArtist.artist_profiles.id,
        p_invitation_method: reminderType,
        p_sent_by: sentBy,
        p_recipient_email: reminderType === 'email' || reminderType === 'both' ? selectedArtist.artist_profiles.email : null,
        p_recipient_phone: reminderType === 'sms' || reminderType === 'both' ? selectedArtist.artist_profiles.phone : null,
        p_invitation_type: 'payment_setup',
        p_message_content: `Payment setup reminder sent via ${reminderType}`,
        p_delivery_metadata: { reminder_data: reminderData }
      });

      // Update the specific artist's invitation info inline without full reload
      const updatedInvitationInfo = {
        latest_invitation_sent_at: new Date().toISOString(),
        latest_invitation_method: reminderType,
        latest_invitation_status: 'sent',
        invitation_count: (selectedArtist.invitation_info?.invitation_count || 0) + 1,
        time_since_latest: 'just now'
      };

      // Update the artist in both arrays
      setEnhancedData(prevData => {
        if (!prevData) return prevData;

        const updateArtist = (artist) => {
          if (artist.artist_profiles.id === selectedArtist.artist_profiles.id) {
            return {
              ...artist,
              invitation_info: updatedInvitationInfo
            };
          }
          return artist;
        };

        return {
          ...prevData,
          artists_owed_money: prevData.artists_owed_money.map(updateArtist)
        };
      });

      setShowReminderDialog(false);
      setError('');
    } catch (err) {
      setError(`Failed to send ${reminderType} reminder: ` + err.message);
    } finally {
      setSendingReminder(false);
    }
  };

  const handlePayNow = async (currency) => {
    if (!selectedArtist || !selectedArtist.estimated_balance) return;

    try {
      setProcessingPayment(true);
      setError(''); // Clear any previous errors

      const { data, error } = await supabase.functions.invoke('process-artist-payment', {
        body: {
          artist_profile_id: selectedArtist.artist_profiles.id,
          amount: selectedArtist.estimated_balance,
          currency: currency,
          payment_type: 'automated',
          description: `Payment for artwork sales - ${currency} balance`
        }
      });

      if (error) throw error;

      // Update local state instead of full refresh
      setEnhancedData(prevData => {
        // Remove artist from ready-to-pay
        const updatedReadyToPay = prevData.artists_ready_to_pay.filter(
          artist => artist.artist_profiles.id !== selectedArtist.artist_profiles.id
        );

        // Add to payment attempts
        const newPaymentAttempt = {
          ...selectedArtist,
          payment_amount: selectedArtist.estimated_balance,
          payment_status: 'processing',
          payment_date: new Date().toISOString(),
          stripe_transfer_id: data?.stripe_transfer_id || null
        };

        return {
          ...prevData,
          artists_ready_to_pay: updatedReadyToPay,
          payment_attempts: [newPaymentAttempt, ...prevData.payment_attempts],
          summary: {
            ...prevData.summary,
            artists_ready_count: updatedReadyToPay.length,
            payment_attempts_count: prevData.payment_attempts.length + 1
          }
        };
      });

      setShowPayNowDialog(false);
      setError('');
    } catch (err) {
      setError('Failed to process payment: ' + err.message);
    } finally {
      setProcessingPayment(false);
    }
  };

  const handleZeroAccount = async () => {
    await fetchArtistAccountLedger(true);
    setShowZeroAccount(false);
  };

  const openPayNowDialog = (currency) => {
    setPaymentCurrency(currency);
    setShowPayNowDialog(true);
  };


  const handleProcessPayments = async () => {
    console.log('🚀 Payment processing started...');
    try {
      setProcessingPayments(true);
      setError('Processing payments...');

      console.log('📡 Calling process-pending-payments function with:', {
        dry_run: false,
        limit: paymentLimit
      });

      const { data, error } = await supabase.functions.invoke('process-pending-payments', {
        body: {
          dry_run: false, // Always live mode now
          limit: paymentLimit
        }
      });

      console.log('📨 Function response:', { data, error });

      if (error) throw error;

      setPaymentProcessResults(data);

      // Create detailed debug output for UI display
      const debugOutput = `
✅ Processing completed: ${data.processed_count} payments processed (${data.successful_count || 0} successful, ${data.failed_count || 0} failed)

📊 FULL DEBUG OUTPUT:
${JSON.stringify(data, null, 2)}
      `.trim();

      setError(debugOutput);

      // Refresh data to show any status changes
      await fetchEnhancedData();

    } catch (err) {
      console.error('❌ Payment processing error:', err);

      let errorDebugOutput = `❌ Failed to process payments: ${err.message}`;

      // Try to parse error details if available
      if (err && err.context && err.context.text) {
        try {
          const responseText = await err.context.text();
          console.log('📄 Raw edge function response:', responseText);
          const parsed = JSON.parse(responseText);

          errorDebugOutput += `

📊 ERROR DEBUG OUTPUT:
Raw Response Text:
${responseText}

Parsed Response:
${JSON.stringify(parsed, null, 2)}`;

          if (parsed.debug) {
            console.log('🔍 Payment processing debug info:', parsed.debug);
            errorDebugOutput += `

🔍 Debug Info:
${JSON.stringify(parsed.debug, null, 2)}`;
          }
        } catch (parseError) {
          console.log('⚠️ Could not parse error response:', parseError);
          errorDebugOutput += `

⚠️ Could not parse error response: ${parseError.message}`;
        }
      }

      setError(errorDebugOutput);
    } finally {
      setProcessingPayments(false);
      console.log('🏁 Payment processing finished');
    }
  };

  const handleProcessInProgressPayments = async () => {
    console.log('🚀 Processing In Progress payments started...');
    try {
      setProcessingPayments(true);
      setError('Processing In Progress payments...');

      // Get processing status artists from the current filtered list
      const processingArtists = filteredPaymentAttempts.filter(p => p.latest_payment_status === 'processing');
      console.log(`📊 Found ${processingArtists.length} processing status artists to process`);

      if (processingArtists.length === 0) {
        setError('No processing status artists found to process');
        return;
      }

      // Call the process-pending-payments function (it looks for 'processing' status)
      const { data, error } = await supabase.functions.invoke('process-pending-payments', {
        body: {
          dry_run: false,
          limit: Math.min(paymentLimit, processingArtists.length)
        }
      });

      console.log('📨 Function response:', { data, error });

      if (error) {
        throw error;
      }

      // Display detailed results with appropriate icon and direct API log links
      const hasFailures = data.failed_count > 0;
      const statusIcon = hasFailures ? '❌' : '✅';
      let resultMessage = `${statusIcon} Processing completed: ${data.processed_count} payments processed`;
      if (data.successful_count !== undefined) {
        resultMessage += ` (${data.successful_count} successful, ${data.failed_count || 0} failed)`;
      }

      // Keep message clean - API buttons will appear right below

      setError(resultMessage);
      setPaymentProcessResults(data);

      // Refresh data to show updated statuses - this is NEEDED for payment methods and button counts
      await fetchEnhancedData();

    } catch (err) {
      let errorDebugOutput = `❌ Failed to process In Progress payments: ${err.message}`;

      // Try to extract debug info from the error response
      if (err && err.context && err.context.text) {
        try {
          const responseText = await err.context.text();
          console.log('Raw edge function response:', responseText);
          const parsed = JSON.parse(responseText);

          if (parsed.debug) {
            console.log('Edge function debug info:', parsed.debug);
            errorDebugOutput += `\nDebug info: ${JSON.stringify(parsed.debug, null, 2)}`;
          }
        } catch (e) {
          console.log('Could not parse error response:', e);
        }
      }

      console.error(errorDebugOutput);
      setError(errorDebugOutput);
    } finally {
      setProcessingPayments(false);
      console.log('🏁 In Progress payment processing finished');
    }
  };

  const handleResetFailedPayments = async () => {
    console.log('🔄 Reset failed payments started...');
    try {
      setProcessingPayments(true);
      setError('Looking for failed payments to reset...');

      // First, get all failed payments to reset their metadata properly
      console.log('🔍 Querying for failed payments with conditions:');
      console.log('  payment_type = automated');
      console.log('  status = failed');

      const { data: failedPayments, error: fetchError } = await supabase
        .from('artist_payments')
        .select('id, metadata, artist_profile_id, gross_amount, currency, status, payment_type')
        .eq('payment_type', 'automated')
        .eq('status', 'failed');

      console.log('📊 Query result - failed payments:', failedPayments);
      console.log('📊 Query error:', fetchError);

      // Also check what payments actually exist
      const { data: allPayments, error: allError } = await supabase
        .from('artist_payments')
        .select('id, status, payment_type, gross_amount, currency')
        .eq('payment_type', 'automated')
        .limit(10);

      console.log('📋 All automated payments in database:', allPayments);

      if (fetchError) throw fetchError;

      if (!failedPayments || failedPayments.length === 0) {
        setError('No failed payments found to reset.');
        console.log('⚠️ No failed payments found');
        return;
      }

      // Update each payment individually to clean metadata
      const updates = failedPayments.map(payment => {
        const cleanMetadata = { ...payment.metadata };
        delete cleanMetadata.error_message;
        delete cleanMetadata.failed_at;
        delete cleanMetadata.processed_by;
        delete cleanMetadata.stripe_response;

        console.log(`🔧 Resetting payment ${payment.id}:`, cleanMetadata);

        return supabase
          .from('artist_payments')
          .update({
            status: 'processing',
            stripe_transfer_id: null,
            metadata: cleanMetadata
          })
          .eq('id', payment.id);
      });

      // Execute all updates
      const results = await Promise.all(updates);

      // Check for any errors
      const errors = results.filter(result => result.error);
      if (errors.length > 0) {
        console.error('❌ Reset errors:', errors);
        throw new Error(`Failed to reset some payments: ${errors.map(e => e.error.message).join(', ')}`);
      }

      const resetCount = failedPayments.length;

      const resetDebugOutput = `
✅ Successfully reset ${resetCount} failed payments back to processing status.

📊 RESET DEBUG OUTPUT:
Reset Payments:
${failedPayments.map(p => `  - ${p.id}: ${p.currency} ${p.gross_amount}`).join('\n')}

Full Results:
${JSON.stringify(results.map(r => ({ data: r.data, error: r.error })), null, 2)}
      `.trim();

      setError(resetDebugOutput);
      console.log(`✅ Successfully reset ${resetCount} payments`);

      // Refresh data to show updated status
      await fetchEnhancedData();

      // Clear results if any
      setPaymentProcessResults(null);

    } catch (err) {
      console.error('❌ Failed to reset payments:', err);
      setError('Failed to reset failed payments: ' + err.message);
    } finally {
      setProcessingPayments(false);
      console.log('🏁 Reset process finished');
    }
  };

  const fetchInvitationHistory = async (artistProfileId) => {
    try {
      setLoadingInvitationHistory(true);
      const { data, error } = await supabase.rpc('get_artist_invitation_history', {
        p_artist_profile_id: artistProfileId
      });

      if (error) throw error;
      setInvitationHistory(data || []);
    } catch (err) {
      console.error('Failed to load invitation history:', err);
      setError('Failed to load invitation history: ' + err.message);
    } finally {
      setLoadingInvitationHistory(false);
    }
  };

  const handleViewInvitationHistory = async (artist) => {
    await fetchInvitationHistory(artist.artist_profiles.id);
    setSelectedArtist(artist);
    setShowInvitationHistory(true);
  };

  const fetchApiConversations = async (paymentId) => {
    try {
      setLoadingApiConversations(true);
      const { data, error } = await supabase
        .from('stripe_api_conversations')
        .select('*')
        .eq('payment_id', paymentId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setApiConversations(data || []);
    } catch (err) {
      console.error('Failed to load API conversations:', err);
      setApiConversations([]);
    } finally {
      setLoadingApiConversations(false);
    }
  };

  const handleViewApiConversations = async (paymentId) => {
    setSelectedPaymentForApi(paymentId);
    await fetchApiConversations(paymentId);
    setShowApiConversations(true);
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

  const getPaymentMethodDisplay = (payment) => {
    // Use enhanced payment method from database if available
    if (payment.enhanced_payment_method) {
      const method = payment.enhanced_payment_method;

      // Format enhanced payment methods
      switch (method) {
        case 'stripe_global_us':
          return 'STRIPE GLOBAL (US)';
        case 'stripe_global_ca':
          return 'STRIPE GLOBAL (CA)';
        case 'stripe_global':
          return 'STRIPE GLOBAL';
        case 'stripe_connect':
          return 'STRIPE CONNECT';
        case 'manual':
          return 'MANUAL';
        default:
          return method.replace('_', ' ').toUpperCase();
      }
    }

    // Fallback to original logic if enhanced method not available
    if (payment.payment_method) {
      return payment.payment_method.replace('_', ' ').toUpperCase();
    }

    // For automated payments (Stripe), use same logic as process-pending-payments
    if (payment.payment_type === 'automated' || payment.latest_payment_status === 'processing') {
      // Determine region using same logic as payment processing
      const currency = payment.payment_currency || payment.currency;
      const stripeRecipientId = payment.stripe_recipient_id;

      const isCanada = (stripeRecipientId && stripeRecipientId.includes('canada')) ||
                       (currency === 'CAD');

      if (isCanada) {
        return 'STRIPE CA';
      } else {
        return 'STRIPE US';
      }
    }

    // For manual payments
    if (payment.payment_type === 'manual') {
      return payment.payment_method ? payment.payment_method.replace('_', ' ').toUpperCase() : 'MANUAL';
    }

    return 'UNKNOWN';
  };

  if (loading) {
    return (
      <Box>
        <Heading size="6" mb="4">Artist Payments & Account Setup</Heading>
        <Card>
          <Skeleton height="200px" />
        </Card>
      </Box>
    );
  }

  // Use data from working function's 5 categories
  const filteredRecentContestants = filterItems(enhancedData?.recent_contestants || [], searchFilter);
  const filteredArtistsOwed = filterItems(enhancedData?.artists_owed_money || [], searchFilter);
  const filteredReadyToPay = filterItems(enhancedData?.artists_ready_to_pay || [], searchFilter);
  const filteredPaymentAttempts = filterItems(enhancedData?.payment_attempts || [], searchFilter);
  const filteredCompletedPayments = filterItems(enhancedData?.completed_payments || [], searchFilter);

  // Calculate total amount ready to pay by currency
  const totalsByCurrency = filteredReadyToPay.reduce((totals, artist) => {
    const currency = artist.currency_info?.primary_currency || 'USD';
    // Use estimated balance if available, otherwise show that there are processing payments
    const amount = artist.estimated_balance || 0;
    totals[currency] = (totals[currency] || 0) + amount;
    return totals;
  }, {});

  const totalReadyToPay = filteredReadyToPay.reduce((sum, artist) => sum + artist.estimated_balance, 0);

  return (
    <Box>
      <Flex justify="between" align="center" mb="4">
        <Heading size="6">Artist Payments & Account Setup</Heading>
      </Flex>

      {error && (
        <Callout.Root color="red" mb="4">
          <Callout.Icon>
            <ExclamationTriangleIcon />
          </Callout.Icon>
          <Callout.Text>{error}</Callout.Text>
        </Callout.Root>
      )}

      {/* Search Filter */}
      <Card mb="4">
        <Flex align="center" gap="3">
          <MagnifyingGlassIcon width="16" height="16" />
          <TextField.Root
            placeholder="Search artists by name, email, entry ID, phone, or city..."
            value={searchFilter}
            onChange={(e) => setSearchFilter(e.target.value)}
            style={{ flex: 1 }}
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
        </Flex>
      </Card>

      {/* Summary Stats */}
      {enhancedData?.summary && (
        <Card mb="4">
          <Flex gap="6" wrap="wrap">
            <Box>
              <Text size="3" weight="bold" color="blue">{enhancedData.summary.total_recent_contestants}</Text>
              <Text size="2" color="gray" style={{ display: 'block' }}>Recent Contestants</Text>
            </Box>
            <Box>
              <Text size="3" weight="bold" color="green">{enhancedData.summary.artists_owing_count}</Text>
              <Text size="2" color="gray" style={{ display: 'block' }}>Artists Owed Money</Text>
            </Box>
            <Box>
              <Text size="3" weight="bold" color="orange">{enhancedData.summary.artists_ready_count}</Text>
              <Text size="2" color="gray" style={{ display: 'block' }}>Ready to Pay</Text>
            </Box>
            <Box>
              <Text size="3" weight="bold" color="purple">{enhancedData.summary.payment_attempts_count}</Text>
              <Text size="2" color="gray" style={{ display: 'block' }}>In Progress</Text>
            </Box>
            <Box>
              <Text size="3" weight="bold" color="green">{enhancedData.summary.completed_payments_count}</Text>
              <Text size="2" color="gray" style={{ display: 'block' }}>Completed Payments</Text>
            </Box>
          </Flex>
        </Card>
      )}

      {/* Tabbed Interface */}
      <Tabs.Root defaultValue="artists-owed">
        <Tabs.List>
          <Tabs.Trigger value="artists-owed">
            Artists Owed Money ({filteredArtistsOwed.length})
          </Tabs.Trigger>
          <Tabs.Trigger value="ready-to-pay">
            Ready to Pay ({filteredReadyToPay.length})
          </Tabs.Trigger>
          <Tabs.Trigger value="payment-attempts">
            In Progress ({filteredPaymentAttempts.length})
          </Tabs.Trigger>
          <Tabs.Trigger value="completed-payments">
            Completed Payments ({filteredCompletedPayments.length})
          </Tabs.Trigger>
        </Tabs.List>


        {/* Artists Owed Money Tab */}
        <Tabs.Content value="artists-owed">
          <Card mt="4">
            <Heading size="3" mb="4" color="gray">
              Artists Owed Money ({filteredArtistsOwed.length})
            </Heading>
            {filteredArtistsOwed.length === 0 ? (
              <Text color="gray" style={{ textAlign: 'center', padding: '2rem' }}>
                No artists owed money found
              </Text>
            ) : (
              <Table.Root>
                <Table.Header>
                  <Table.Row>
                    <Table.ColumnHeaderCell>Artist</Table.ColumnHeaderCell>
                    <Table.ColumnHeaderCell>Amount Owed</Table.ColumnHeaderCell>
                    <Table.ColumnHeaderCell>Payment Status</Table.ColumnHeaderCell>
                    <Table.ColumnHeaderCell>Recent City</Table.ColumnHeaderCell>
                    <Table.ColumnHeaderCell>Recent Events</Table.ColumnHeaderCell>
                    <Table.ColumnHeaderCell>Last Invite</Table.ColumnHeaderCell>
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
                          ${(artist.estimated_balance || artist.current_balance || 0).toFixed(2)} {artist.currency_info?.primary_currency || 'USD'}
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
                        <Text size="2" color="gray">{artist.recent_city || 'No recent events'}</Text>
                      </Table.Cell>
                      <Table.Cell>
                        <Text size="2" color="gray">{artist.recent_contests || 0}</Text>
                      </Table.Cell>
                      <Table.Cell>
                        {artist.invitation_info && artist.invitation_info.time_since_latest ? (
                          <Button
                            size="1"
                            variant="ghost"
                            onClick={() => handleViewInvitationHistory(artist)}
                            style={{ padding: '2px', height: 'auto' }}
                          >
                            <Flex direction="column" gap="1" align="start">
                              <Text size="1" color="gray">{artist.invitation_info.time_since_latest}</Text>
                              <Badge
                                size="1"
                                variant="soft"
                                color={artist.invitation_info.latest_invitation_method === 'email' ? 'blue' : 'orange'}
                              >
                                {artist.invitation_info.latest_invitation_method}
                              </Badge>
                              {artist.invitation_info.invitation_count > 1 && (
                                <Text size="1" color="gray">({artist.invitation_info.invitation_count} total)</Text>
                              )}
                            </Flex>
                          </Button>
                        ) : (
                          <Text size="1" color="gray">None sent</Text>
                        )}
                      </Table.Cell>
                      <Table.Cell>
                        <Flex gap="2" direction="column">
                          <Button
                            size="1"
                            variant="soft"
                            onClick={() => handleViewArtist(artist)}
                            title="View Account Details"
                          >
                            <EyeOpenIcon width="12" height="12" />
                            View Details
                          </Button>
                          {artist.payment_account_status !== 'ready' && artist.artist_profiles.email && (
                            <Button
                              size="1"
                              variant="soft"
                              color="orange"
                              onClick={() => {
                                setSelectedArtist(artist);
                                setShowReminderDialog(true);
                              }}
                            >
                              Send Invite
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

        {/* Ready to Pay Tab */}
        <Tabs.Content value="ready-to-pay">
          <Card mt="4">
            <Flex justify="between" align="center" mb="4">
              <Heading size="3" color="green">
                Ready to Pay ({filteredReadyToPay.length} artists)
              </Heading>
              <Flex gap="3" align="center">
                <Box style={{ textAlign: 'right' }}>
                  <Text size="2" color="gray">Total Amount by Currency</Text>
                  <Flex direction="column" gap="1">
                    {Object.entries(totalsByCurrency).map(([currency, amount]) => (
                      <Text key={currency} size="3" weight="bold" color="green">
                        {formatCurrency(amount, currency)}
                      </Text>
                    ))}
                    {Object.keys(totalsByCurrency).length > 1 && (
                      <Text size="2" color="gray" style={{ borderTop: '1px solid #ccc', paddingTop: '4px' }}>
                        {Object.keys(totalsByCurrency).length} currencies
                      </Text>
                    )}
                  </Flex>
                </Box>
              </Flex>
            </Flex>


            {/* Error/Status Display */}
            {error && (
              <Callout.Root color={error.startsWith('✅') ? 'green' : 'red'} mb="4">
                <Callout.Icon>
                  {error.startsWith('✅') ? <CheckCircledIcon /> : <ExclamationTriangleIcon />}
                </Callout.Icon>
                <Callout.Text>
                  <Flex direction="column" gap="3">
                    <Text
                      size="2"
                      style={{
                        whiteSpace: 'pre-wrap',
                        fontFamily: 'monospace',
                        wordBreak: 'break-word',
                        maxHeight: '400px',
                        overflowY: 'auto'
                      }}
                    >
                      {error}
                    </Text>
                    {/* Show instruction for accessing API logs */}
                    {paymentProcessResults && paymentProcessResults.failed_count > 0 && (
                      <Text size="2" color="gray" style={{ fontStyle: 'italic', marginTop: '8px' }}>
                        💡 Click any "❌ Failed - View Details" badge below to see complete Stripe API error logs
                      </Text>
                    )}
                  </Flex>
                </Callout.Text>
              </Callout.Root>
            )}

            {filteredReadyToPay.length === 0 ? (
              <Text color="gray" style={{ textAlign: 'center', padding: '2rem' }}>
                No artists ready to pay found. Artists need payment accounts set up and balances owing.
              </Text>
            ) : (
              <Table.Root>
                <Table.Header>
                  <Table.Row>
                    <Table.ColumnHeaderCell>Artist</Table.ColumnHeaderCell>
                    <Table.ColumnHeaderCell>Balance Owing</Table.ColumnHeaderCell>
                    <Table.ColumnHeaderCell>Payment Status</Table.ColumnHeaderCell>
                    <Table.ColumnHeaderCell>Recent City</Table.ColumnHeaderCell>
                    <Table.ColumnHeaderCell>Recent Events</Table.ColumnHeaderCell>
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
                          {formatCurrency(artist.estimated_balance, artist.currency_info?.primary_currency)}
                        </Text>
                      </Table.Cell>
                      <Table.Cell>
                        <Badge color={
                          artist.automated_payment_status === 'processing' ? 'blue' :
                          artist.automated_payment_status === 'failed' ? 'red' :
                          artist.automated_payment_status === 'completed' ? 'green' :
                          artist.automated_payment_status === 'pending' ? 'orange' :
                          artist.payment_account_status === 'ready' ? 'gray' : 'gray'
                        }>
                          {artist.automated_payment_status ?
                            artist.automated_payment_status.charAt(0).toUpperCase() + artist.automated_payment_status.slice(1) :
                            'No Payment Record'
                          }
                        </Badge>
                      </Table.Cell>
                      <Table.Cell>
                        <Text size="2" color="gray">{artist.recent_city || 'Unknown'}</Text>
                      </Table.Cell>
                      <Table.Cell>
                        <Text size="2" color="gray">{artist.recent_contests || 0}</Text>
                      </Table.Cell>
                      <Table.Cell>
                        <Flex gap="2">
                          <Button
                            size="1"
                            variant="soft"
                            onClick={() => handleViewArtist(artist)}
                            title="View Account Details"
                          >
                            <EyeOpenIcon width="12" height="12" />
                            View
                          </Button>
                          <Button
                            size="1"
                            variant="solid"
                            color="green"
                            onClick={() => {
                              setSelectedArtist(artist);
                              const currency = artist.currency_info?.primary_currency || 'USD';
                              openPayNowDialog(currency);
                            }}
                            title={`Pay ${formatCurrency(artist.estimated_balance, artist.currency_info?.primary_currency || 'USD')} now`}
                          >
                            Pay Now
                          </Button>
                        </Flex>
                      </Table.Cell>
                    </Table.Row>
                  ))}
                </Table.Body>
              </Table.Root>
            )}

            {/* Processing Results */}
            {paymentProcessResults && (
              <Card variant="ghost" mt="4">
                <Flex direction="column" gap="4">
                  <Heading size="2">Processing Results</Heading>

                  {/* Summary */}
                  <Flex gap="4" align="center">
                    <Badge
                      size="2"
                      color={paymentProcessResults.success ? 'green' : 'red'}
                      variant="solid"
                    >
                      {paymentProcessResults.success ? '✅ Success' : '❌ Failed'}
                    </Badge>

                    <Text size="2" color="gray">
                      {new Date(paymentProcessResults.timestamp).toLocaleString()}
                    </Text>
                  </Flex>

                  <Card>
                    <Flex justify="between" align="center" mb="3">
                      <Text size="3" weight="medium">{paymentProcessResults.message}</Text>
                    </Flex>

                    <Flex gap="6">
                      <Box>
                        <Text size="1" color="gray">Processed</Text>
                        <Text size="4" weight="bold">{paymentProcessResults.processed_count}</Text>
                      </Box>
                      <Box>
                        <Text size="1" color="gray">Successful</Text>
                        <Text size="4" weight="bold" color="green">{paymentProcessResults.successful_count}</Text>
                      </Box>
                      <Box>
                        <Text size="1" color="gray">Failed</Text>
                        <Text size="4" weight="bold" color="red">{paymentProcessResults.failed_count}</Text>
                      </Box>
                      <Box>
                        <Text size="1" color="gray">Total Amount</Text>
                        <Text size="4" weight="bold" color="green">${paymentProcessResults.total_amount?.toFixed(2) || '0.00'}</Text>
                      </Box>
                    </Flex>
                  </Card>

                  {/* Payment Details */}
                  {paymentProcessResults.payments && paymentProcessResults.payments.length > 0 && (
                    <Box>
                      <Text size="2" weight="medium" mb="3">Payment Details</Text>
                      <Table.Root>
                        <Table.Header>
                          <Table.Row>
                            <Table.ColumnHeaderCell>Artist</Table.ColumnHeaderCell>
                            <Table.ColumnHeaderCell>Amount</Table.ColumnHeaderCell>
                            <Table.ColumnHeaderCell>Status</Table.ColumnHeaderCell>
                            <Table.ColumnHeaderCell>Stripe Transfer ID</Table.ColumnHeaderCell>
                            <Table.ColumnHeaderCell>Error</Table.ColumnHeaderCell>
                          </Table.Row>
                        </Table.Header>
                        <Table.Body>
                          {paymentProcessResults.payments.map((payment, index) => (
                            <Table.Row key={`${payment.payment_id}-${index}`}>
                              <Table.Cell>
                                <Text size="2" weight="medium">{payment.artist_name}</Text>
                              </Table.Cell>
                              <Table.Cell>
                                <Text size="2" weight="medium" color="green">
                                  {payment.currency} {payment.amount}
                                </Text>
                              </Table.Cell>
                              <Table.Cell>
                                {payment.status === 'success' ? (
                                  <Badge color="green" variant="soft">
                                    ✅ Success
                                  </Badge>
                                ) : (
                                  <Badge
                                    color="red"
                                    variant="soft"
                                    style={{ cursor: 'pointer' }}
                                    onClick={() => handleViewApiConversations(payment.payment_id)}
                                    title="Click to view API error details"
                                  >
                                    ❌ Failed - View Details
                                  </Badge>
                                )}
                              </Table.Cell>
                              <Table.Cell>
                                {payment.stripe_transfer_id ? (
                                  <Text size="1" color="gray" style={{ fontFamily: 'monospace' }}>
                                    {payment.stripe_transfer_id}
                                  </Text>
                                ) : (
                                  <Text size="1" color="gray">—</Text>
                                )}
                              </Table.Cell>
                              <Table.Cell>
                                {payment.error ? (
                                  <Text size="1" color="red" style={{ maxWidth: '200px', wordBreak: 'break-word' }}>
                                    {payment.error}
                                  </Text>
                                ) : (
                                  <Text size="1" color="gray">—</Text>
                                )}
                              </Table.Cell>
                            </Table.Row>
                          ))}
                        </Table.Body>
                      </Table.Root>
                    </Box>
                  )}

                  {/* Blocked Payments */}
                  {paymentProcessResults.blocked_payments && paymentProcessResults.blocked_payments.length > 0 && (
                    <Box>
                      <Text size="2" weight="medium" mb="3" color="orange">Blocked Payments (No Account Setup)</Text>
                      <Table.Root>
                        <Table.Header>
                          <Table.Row>
                            <Table.ColumnHeaderCell>Artist</Table.ColumnHeaderCell>
                            <Table.ColumnHeaderCell>Amount</Table.ColumnHeaderCell>
                            <Table.ColumnHeaderCell>Issue</Table.ColumnHeaderCell>
                          </Table.Row>
                        </Table.Header>
                        <Table.Body>
                          {paymentProcessResults.blocked_payments.map((payment, index) => (
                            <Table.Row key={`blocked-${payment.payment_id}-${index}`}>
                              <Table.Cell>
                                <Text size="2">{payment.artist_name}</Text>
                              </Table.Cell>
                              <Table.Cell>
                                <Text size="2" color="orange">
                                  {payment.currency} {payment.amount}
                                </Text>
                              </Table.Cell>
                              <Table.Cell>
                                <Badge color="orange" variant="soft">
                                  {payment.issue}
                                </Badge>
                              </Table.Cell>
                            </Table.Row>
                          ))}
                        </Table.Body>
                      </Table.Root>
                    </Box>
                  )}
                </Flex>
              </Card>
            )}
          </Card>
        </Tabs.Content>

        {/* Recent Payments Tab */}
        <Tabs.Content value="payments">
          <Card mt="4">
            <Heading size="3" mb="4" color="purple">
              Recent Payments (Last 30 Days) ({filteredCompletedPayments.length})
            </Heading>
            {filteredCompletedPayments.length === 0 ? (
              <Text color="gray" style={{ textAlign: 'center', padding: '2rem' }}>
                No recent payments found
              </Text>
            ) : (
              <Table.Root>
                <Table.Header>
                  <Table.Row>
                    <Table.ColumnHeaderCell>Artist</Table.ColumnHeaderCell>
                    <Table.ColumnHeaderCell>Amount</Table.ColumnHeaderCell>
                    <Table.ColumnHeaderCell>Method</Table.ColumnHeaderCell>
                    <Table.ColumnHeaderCell>Status</Table.ColumnHeaderCell>
                    <Table.ColumnHeaderCell>Date</Table.ColumnHeaderCell>
                    <Table.ColumnHeaderCell>Description</Table.ColumnHeaderCell>
                    <Table.ColumnHeaderCell>City</Table.ColumnHeaderCell>
                  </Table.Row>
                </Table.Header>
                <Table.Body>
                  {filteredCompletedPayments.map((payment, index) => (
                    <Table.Row key={`${payment.artist_id}-${index}`}>
                      <Table.Cell>
                        <Flex direction="column" gap="1">
                          <Text size="2" weight="medium">{payment.artist_name}</Text>
                          <Badge variant="soft" size="1">#{payment.entry_id}</Badge>
                          <Text size="1" color="gray">{payment.artist_email}</Text>
                        </Flex>
                      </Table.Cell>
                      <Table.Cell>
                        <Flex direction="column" gap="1">
                          <Text size="2" weight="medium">
                            {formatCurrency(payment.gross_amount, payment.currency)}
                          </Text>
                          {payment.net_amount !== payment.gross_amount && (
                            <Text size="1" color="gray">
                              Net: {formatCurrency(payment.net_amount, payment.currency)}
                            </Text>
                          )}
                        </Flex>
                      </Table.Cell>
                      <Table.Cell>
                        <Badge
                          variant="soft"
                          size="1"
                          color={
                            payment.enhanced_payment_method?.includes('stripe') ? 'blue' :
                            payment.payment_type === 'automated' ? 'blue' :
                            payment.payment_type === 'manual' ? 'orange' : 'gray'
                          }
                        >
                          {getPaymentMethodDisplay(payment)}
                        </Badge>
                      </Table.Cell>
                      <Table.Cell>
                        <Badge
                          color={payment.payment_status === 'paid' ? 'green' : payment.payment_status === 'pending' ? 'orange' : payment.payment_status === 'processing' ? 'blue' : 'gray'}
                          size="1"
                        >
                          {payment.payment_status}
                        </Badge>
                      </Table.Cell>
                      <Table.Cell>
                        <Flex direction="column" gap="1">
                          <Text size="1" color="gray">
                            {new Date(payment.payment_date).toLocaleDateString()}
                          </Text>
                          <Text size="1" color="gray">
                            {new Date(payment.payment_date).toLocaleTimeString()}
                          </Text>
                        </Flex>
                      </Table.Cell>
                      <Table.Cell>
                        <Text
                          size="1"
                          color="gray"
                          style={{
                            maxWidth: '200px',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap'
                          }}
                          title={payment.description}
                        >
                          {payment.description || 'No description'}
                        </Text>
                      </Table.Cell>
                      <Table.Cell>
                        <Text size="1" color="gray">
                          {payment.recent_city || 'Unknown'}
                        </Text>
                      </Table.Cell>
                    </Table.Row>
                  ))}
                </Table.Body>
              </Table.Root>
            )}
          </Card>
        </Tabs.Content>

        {/* In Progress Tab */}
        <Tabs.Content value="payment-attempts">
          <Card mt="4">
            <Flex justify="between" align="center" mb="4">
              <Heading size="3" color="orange">
                In Progress ({filteredPaymentAttempts.length})
              </Heading>

              {/* Payment Processing Controls */}
              <Flex gap="3" align="center">
                <Flex gap="2" align="center">
                  <Box>
                    <Text size="1" color="gray" mb="1">Payment Limit</Text>
                    <TextField.Root
                      type="number"
                      min="1"
                      max="50"
                      value={paymentLimit}
                      onChange={(e) => setPaymentLimit(parseInt(e.target.value) || 5)}
                      placeholder="5"
                      style={{ width: '80px' }}
                    />
                  </Box>

                  <Button
                    size="3"
                    variant="solid"
                    color="green"
                    onClick={handleProcessInProgressPayments}
                    disabled={processingPayments || filteredPaymentAttempts.filter(p => p.latest_payment_status === 'processing').length === 0}
                    loading={processingPayments}
                  >
                    💰 Process {Math.min(paymentLimit, filteredPaymentAttempts.filter(p => p.latest_payment_status === 'processing').length)} Processing
                  </Button>
                </Flex>

                <Button
                  onClick={handleResetFailedPayments}
                  disabled={processingPayments}
                  variant="soft"
                  color="orange"
                  size="2"
                >
                  🔄 Reset Failed to Processing
                </Button>
              </Flex>
            </Flex>
            {filteredPaymentAttempts.length === 0 ? (
              <Text color="gray" style={{ textAlign: 'center', padding: '2rem' }}>
                No payment attempts found
              </Text>
            ) : (
              <Table.Root>
                <Table.Header>
                  <Table.Row>
                    <Table.ColumnHeaderCell>Artist</Table.ColumnHeaderCell>
                    <Table.ColumnHeaderCell>Payment Amount</Table.ColumnHeaderCell>
                    <Table.ColumnHeaderCell>Payment Status</Table.ColumnHeaderCell>
                    <Table.ColumnHeaderCell>Payment Method</Table.ColumnHeaderCell>
                    <Table.ColumnHeaderCell>Recent City</Table.ColumnHeaderCell>
                    <Table.ColumnHeaderCell>Payment Date</Table.ColumnHeaderCell>
                    <Table.ColumnHeaderCell>Actions</Table.ColumnHeaderCell>
                  </Table.Row>
                </Table.Header>
                <Table.Body>
                  {filteredPaymentAttempts.map((artist, index) => (
                    <Table.Row key={`${artist.artist_profiles.id}-${index}`}>
                      <Table.Cell>
                        <Flex direction="column" gap="1">
                          <Text size="2" weight="medium">{artist.artist_profiles.name}</Text>
                          <Badge variant="soft" size="1">#{artist.artist_profiles.entry_id}</Badge>
                        </Flex>
                      </Table.Cell>
                      <Table.Cell>
                        <Flex direction="column" gap="1">
                          <Text size="2" weight="bold" color="green">
                            ${(artist.payment_amount || 0).toFixed(2)} {artist.payment_currency || 'USD'}
                          </Text>
                          {artist.stripe_transfer_id && (
                            <Text size="1" color="gray" style={{ fontFamily: 'monospace' }}>
                              {artist.stripe_transfer_id.substring(0, 20)}...
                            </Text>
                          )}
                        </Flex>
                      </Table.Cell>
                      <Table.Cell>
                        <Flex direction="column" gap="1">
                          {artist.latest_payment_status === 'failed' ? (
                            <Badge
                              color="red"
                              variant="soft"
                              style={{ cursor: 'pointer' }}
                              onClick={() => handleViewApiConversations(artist.payment_id)}
                              title="Click to view API error details"
                            >
                              ❌ Failed - View Details
                            </Badge>
                          ) : (
                            <Badge
                              color={
                                artist.latest_payment_status === 'completed' ? 'green' :
                                artist.latest_payment_status === 'pending' ? 'yellow' :
                                artist.latest_payment_status === 'processing' ? 'blue' : 'red'
                              }
                              variant="soft"
                            >
                              {artist.latest_payment_status || 'Unknown'}
                            </Badge>
                          )}
                          {artist.error_message && (
                            <Text size="1" color="red">
                              {artist.error_message.substring(0, 50)}...
                            </Text>
                          )}
                        </Flex>
                      </Table.Cell>
                      <Table.Cell>
                        <Badge variant="outline" size="1">
                          {getPaymentMethodDisplay(artist)}
                        </Badge>
                      </Table.Cell>
                      <Table.Cell>
                        {artist.recent_city ? (
                          <Badge variant="outline" size="1">{artist.recent_city}</Badge>
                        ) : (
                          <Text size="1" color="gray">—</Text>
                        )}
                      </Table.Cell>
                      <Table.Cell>
                        {artist.payment_date ? (
                          <Flex direction="column" gap="1">
                            <Text size="1" color="gray">
                              {new Date(artist.payment_date).toLocaleDateString()}
                            </Text>
                            <Text size="1" color="gray">
                              {new Date(artist.payment_date).toLocaleTimeString()}
                            </Text>
                          </Flex>
                        ) : (
                          <Text size="1" color="gray">—</Text>
                        )}
                      </Table.Cell>
                      <Table.Cell>
                        <Button
                          size="1"
                          variant="soft"
                          onClick={() => {
                            setSelectedArtist(artist);
                            setShowArtistDetail(true);
                          }}
                        >
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

        {/* Completed Payments Tab */}
        <Tabs.Content value="completed-payments">
          <Card mt="4">
            <Heading size="3" mb="4" color="green">
              Completed Payments ({filteredCompletedPayments.length})
            </Heading>
            {filteredCompletedPayments.length === 0 ? (
              <Text color="gray" style={{ textAlign: 'center', padding: '2rem' }}>
                No completed payments found
              </Text>
            ) : (
              <Table.Root>
                <Table.Header>
                  <Table.Row>
                    <Table.ColumnHeaderCell>Artist</Table.ColumnHeaderCell>
                    <Table.ColumnHeaderCell>Payment Amount</Table.ColumnHeaderCell>
                    <Table.ColumnHeaderCell>Payment Method</Table.ColumnHeaderCell>
                    <Table.ColumnHeaderCell>Recent City</Table.ColumnHeaderCell>
                    <Table.ColumnHeaderCell>Completion Date</Table.ColumnHeaderCell>
                    <Table.ColumnHeaderCell>Actions</Table.ColumnHeaderCell>
                  </Table.Row>
                </Table.Header>
                <Table.Body>
                  {filteredCompletedPayments.map((artist, index) => (
                    <Table.Row key={`${artist.artist_profiles.id}-${index}`}>
                      <Table.Cell>
                        <Flex direction="column" gap="1">
                          <Text size="2" weight="medium">{artist.artist_profiles.name}</Text>
                          <Badge variant="soft" size="1">#{artist.artist_profiles.entry_id}</Badge>
                        </Flex>
                      </Table.Cell>
                      <Table.Cell>
                        <Flex direction="column" gap="1">
                          <Text size="2" weight="bold" color="green">
                            ${(artist.payment_amount || 0).toFixed(2)} {artist.payment_currency || 'USD'}
                          </Text>
                          {artist.stripe_transfer_id && (
                            <Text size="1" color="gray" style={{ fontFamily: 'monospace' }}>
                              {artist.stripe_transfer_id.substring(0, 20)}...
                            </Text>
                          )}
                          <Badge color="green" size="1">
                            ✅ Completed
                          </Badge>
                        </Flex>
                      </Table.Cell>
                      <Table.Cell>
                        <Badge variant="outline" size="1">
                          {getPaymentMethodDisplay(artist)}
                        </Badge>
                      </Table.Cell>
                      <Table.Cell>
                        {artist.recent_city ? (
                          <Badge variant="outline" size="1">{artist.recent_city}</Badge>
                        ) : (
                          <Text size="1" color="gray">—</Text>
                        )}
                      </Table.Cell>
                      <Table.Cell>
                        {artist.completion_date ? (
                          <Flex direction="column" gap="1">
                            <Text size="1" color="gray">
                              {new Date(artist.completion_date).toLocaleDateString()}
                            </Text>
                            <Text size="1" color="gray">
                              {new Date(artist.completion_date).toLocaleTimeString()}
                            </Text>
                          </Flex>
                        ) : (
                          <Text size="1" color="gray">—</Text>
                        )}
                      </Table.Cell>
                      <Table.Cell>
                        <Button
                          size="1"
                          variant="soft"
                          onClick={() => {
                            setSelectedArtist(artist);
                            setShowArtistDetail(true);
                          }}
                        >
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

      </Tabs.Root>

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
                        <ScrollArea style={{ height: '300px' }}>
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
                                          Sale: ${entry.metadata.gross_sale_price.toFixed(2)} → Artist: ${entry.amount.toFixed(2)} (50%)
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
                        </ScrollArea>
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
                    {availableCurrencies.map(currency => (
                      <Select.Item key={currency.currency_code} value={currency.currency_code}>
                        {currency.currency_code}
                      </Select.Item>
                    ))}
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
                  <Select.Item value="zelle">Zelle</Select.Item>
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

            {/* Invitation History */}
            <Box>
              <Text size="2" weight="medium" mb="2">Invitation History</Text>
              <Card variant="ghost">
                {loadingInvitationHistory ? (
                  <Skeleton height="60px" />
                ) : invitationHistory && invitationHistory.length > 0 ? (
                  <Flex direction="column" gap="2">
                    {invitationHistory.map((invite, idx) => (
                      <Flex key={idx} justify="between" align="center">
                        <Flex gap="2" align="center">
                          <Badge
                            size="1"
                            variant="soft"
                            color={invite.invitation_method === 'email' ? 'blue' : 'orange'}
                          >
                            {invite.invitation_method}
                          </Badge>
                          <Text size="1" color="gray">{invite.time_since_latest}</Text>
                        </Flex>
                        <Flex direction="column" align="end">
                          <Text size="1" color="gray">by {invite.sent_by}</Text>
                          <Badge size="1" variant="outline" color={invite.status === 'sent' ? 'green' : 'gray'}>
                            {invite.status}
                          </Badge>
                        </Flex>
                      </Flex>
                    ))}
                  </Flex>
                ) : (
                  <Text size="2" color="gray" style={{ textAlign: 'center', padding: '1rem' }}>
                    No invitation history found
                  </Text>
                )}
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
              type="button"
              onClick={(e) => sendPaymentReminder(e)}
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
          <Dialog.Title>
            Process Payment: {selectedArtist?.estimated_balance ?
              formatCurrency(selectedArtist.estimated_balance, paymentCurrency) :
              'Payment'
            }
          </Dialog.Title>
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
                  <Text size="4" weight="bold" color="green">
                    {selectedArtist?.estimated_balance ?
                      formatCurrency(selectedArtist.estimated_balance, paymentCurrency) :
                      'Loading...'
                    }
                  </Text>
                </Flex>
                <Flex justify="between">
                  <Text size="2" color="gray">Payment Method:</Text>
                  <Text size="2">Stripe Transfer</Text>
                </Flex>
              </Flex>
            </Card>

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
              {processingPayment ? 'Processing...' :
                selectedArtist?.estimated_balance ?
                  `Pay ${formatCurrency(selectedArtist.estimated_balance, paymentCurrency)} Now` :
                  'Process Payment Now'
              }
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

      {/* Invitation History Modal */}
      <Dialog.Root open={showInvitationHistory} onOpenChange={setShowInvitationHistory}>
        <Dialog.Content style={{ maxWidth: '800px', maxHeight: '90vh', overflow: 'auto' }}>
          <Dialog.Title>
            {selectedArtist?.artist_profiles?.name} - Payment Setup Invitation History
          </Dialog.Title>

          <Box mt="4">
            {loadingInvitationHistory ? (
              <Skeleton height="200px" />
            ) : invitationHistory && invitationHistory.length > 0 ? (
              <Flex direction="column" gap="3">
                <Text size="2" color="gray">
                  {invitationHistory.length} invitation{invitationHistory.length !== 1 ? 's' : ''} sent
                </Text>

                <Table.Root>
                  <Table.Header>
                    <Table.Row>
                      <Table.ColumnHeaderCell>Date Sent</Table.ColumnHeaderCell>
                      <Table.ColumnHeaderCell>Method</Table.ColumnHeaderCell>
                      <Table.ColumnHeaderCell>Recipient</Table.ColumnHeaderCell>
                      <Table.ColumnHeaderCell>Type</Table.ColumnHeaderCell>
                      <Table.ColumnHeaderCell>Status</Table.ColumnHeaderCell>
                      <Table.ColumnHeaderCell>Sent By</Table.ColumnHeaderCell>
                    </Table.Row>
                  </Table.Header>
                  <Table.Body>
                    {invitationHistory.map((invitation, index) => (
                      <Table.Row key={invitation.id || index}>
                        <Table.Cell>
                          <Flex direction="column" gap="1">
                            <Text size="2" weight="medium">
                              {new Date(invitation.sent_at).toLocaleDateString()}
                            </Text>
                            <Text size="1" color="gray">
                              {new Date(invitation.sent_at).toLocaleTimeString()}
                            </Text>
                            <Badge size="1" variant="soft" color="blue">
                              {invitation.time_since_sent}
                            </Badge>
                          </Flex>
                        </Table.Cell>
                        <Table.Cell>
                          <Badge
                            size="1"
                            color={invitation.invitation_method === 'email' ? 'blue' : invitation.invitation_method === 'sms' ? 'orange' : 'purple'}
                          >
                            {invitation.invitation_method.toUpperCase()}
                          </Badge>
                        </Table.Cell>
                        <Table.Cell>
                          <Flex direction="column" gap="1">
                            {invitation.recipient_email && (
                              <Text size="1" color="gray">
                                📧 {invitation.recipient_email}
                              </Text>
                            )}
                            {invitation.recipient_phone && (
                              <Text size="1" color="gray">
                                📱 {invitation.recipient_phone}
                              </Text>
                            )}
                          </Flex>
                        </Table.Cell>
                        <Table.Cell>
                          <Badge size="1" variant="soft" color="gray">
                            {invitation.invitation_type.replace('_', ' ')}
                          </Badge>
                        </Table.Cell>
                        <Table.Cell>
                          <Badge
                            size="1"
                            color={invitation.status === 'sent' ? 'green' : invitation.status === 'failed' ? 'red' : 'orange'}
                          >
                            {invitation.status}
                          </Badge>
                        </Table.Cell>
                        <Table.Cell>
                          <Text size="1" color="gray">
                            {invitation.sent_by}
                          </Text>
                        </Table.Cell>
                      </Table.Row>
                    ))}
                  </Table.Body>
                </Table.Root>
              </Flex>
            ) : (
              <Flex direction="column" align="center" gap="3" py="6">
                <Text size="3" color="gray">No payment setup invitations sent yet</Text>
                <Text size="2" color="gray">
                  Use the "Setup Payment" button to send the first invitation to {selectedArtist?.artist_profiles?.name}
                </Text>
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

      {/* API Conversations Modal */}
      <Dialog.Root open={showApiConversations} onOpenChange={setShowApiConversations}>
        <Dialog.Content style={{ maxWidth: '900px', maxHeight: '80vh' }}>
          <Dialog.Title>
            <Flex align="center" gap="2">
              <MagnifyingGlassIcon />
              Stripe API Conversations
            </Flex>
          </Dialog.Title>
          <Dialog.Description>
            Complete API request and response details for payment: {selectedPaymentForApi}
          </Dialog.Description>

          <Box mt="4">
            {loadingApiConversations ? (
              <Skeleton height="200px" />
            ) : apiConversations.length > 0 ? (
              <ScrollArea style={{ height: '400px' }}>
                {apiConversations.map((conversation, index) => (
                  <Card key={conversation.id} mb="4" p="4">
                    <Flex justify="between" align="center" mb="3">
                      <Heading size="3">
                        API Call #{index + 1}
                      </Heading>
                      <Flex gap="2" align="center">
                        <Badge
                          color={conversation.response_status === 200 ? 'green' : 'red'}
                          variant="soft"
                        >
                          HTTP {conversation.response_status}
                        </Badge>
                        <Badge variant="outline">
                          {conversation.stripe_account_id === 'canada' ? 'STRIPE CA' : 'STRIPE US'}
                        </Badge>
                        <Text size="1" color="gray">
                          {conversation.processing_duration_ms}ms
                        </Text>
                      </Flex>
                    </Flex>

                    {conversation.error_message && (
                      <Callout.Root color="red" mb="3">
                        <Callout.Icon>
                          <ExclamationTriangleIcon />
                        </Callout.Icon>
                        <Callout.Text>
                          <Text size="3" weight="bold" color="red" mb="2">
                            🚨 STRIPE ERROR: {conversation.error_message}
                          </Text>
                        </Callout.Text>
                      </Callout.Root>
                    )}

                    {conversation.response_body?.error?.message && (
                      <Callout.Root color="orange" mb="3">
                        <Callout.Icon>
                          <ExclamationTriangleIcon />
                        </Callout.Icon>
                        <Callout.Text>
                          <Text size="3" weight="bold" color="orange" mb="2">
                            📄 DETAILED ERROR: {conversation.response_body.error.message}
                          </Text>
                          {conversation.response_body.error.code && (
                            <Text size="2" color="gray">
                              Error Code: {conversation.response_body.error.code}
                            </Text>
                          )}
                        </Callout.Text>
                      </Callout.Root>
                    )}

                    <Tabs.Root defaultValue="request">
                      <Tabs.List>
                        <Tabs.Trigger value="request">Request</Tabs.Trigger>
                        <Tabs.Trigger value="response">Response</Tabs.Trigger>
                        <Tabs.Trigger value="headers">Headers</Tabs.Trigger>
                        <Tabs.Trigger value="metadata">Metadata</Tabs.Trigger>
                      </Tabs.List>

                      <Box mt="3">
                        <Tabs.Content value="request">
                          <Box>
                            <Text size="2" weight="bold" mb="2">
                              {conversation.request_method} {conversation.api_endpoint}
                            </Text>
                            <Card p="3" style={{ backgroundColor: '#f8f9fa' }}>
                              <pre style={{
                                fontSize: '12px',
                                margin: 0,
                                whiteSpace: 'pre-wrap',
                                overflow: 'auto',
                                maxHeight: '200px'
                              }}>
                                {JSON.stringify(conversation.request_body, null, 2)}
                              </pre>
                            </Card>
                          </Box>
                        </Tabs.Content>

                        <Tabs.Content value="response">
                          <Card p="3" style={{ backgroundColor: '#f8f9fa' }}>
                            <pre style={{
                              fontSize: '12px',
                              margin: 0,
                              whiteSpace: 'pre-wrap',
                              overflow: 'auto',
                              maxHeight: '200px'
                            }}>
                              {JSON.stringify(conversation.response_body, null, 2)}
                            </pre>
                          </Card>
                        </Tabs.Content>

                        <Tabs.Content value="headers">
                          <Flex direction="column" gap="2">
                            <Box>
                              <Text size="2" weight="bold" mb="1">Request Headers:</Text>
                              <Card p="2" style={{ backgroundColor: '#f8f9fa' }}>
                                <pre style={{ fontSize: '11px', margin: 0 }}>
                                  {JSON.stringify(conversation.request_headers, null, 2)}
                                </pre>
                              </Card>
                            </Box>
                            <Box>
                              <Text size="2" weight="bold" mb="1">Response Headers:</Text>
                              <Card p="2" style={{ backgroundColor: '#f8f9fa' }}>
                                <pre style={{ fontSize: '11px', margin: 0 }}>
                                  {JSON.stringify(conversation.response_headers, null, 2)}
                                </pre>
                              </Card>
                            </Box>
                          </Flex>
                        </Tabs.Content>

                        <Tabs.Content value="metadata">
                          <Box>
                            <Flex direction="column" gap="2">
                              <Text size="2"><strong>Created:</strong> {new Date(conversation.created_at).toLocaleString()}</Text>
                              <Text size="2"><strong>Created By:</strong> {conversation.created_by}</Text>
                              <Text size="2"><strong>Processing Duration:</strong> {conversation.processing_duration_ms}ms</Text>
                              <Text size="2"><strong>Artist Profile ID:</strong> {conversation.artist_profile_id}</Text>
                              <Text size="2"><strong>Stripe Account:</strong> {conversation.stripe_account_id}</Text>
                            </Flex>
                          </Box>
                        </Tabs.Content>
                      </Box>
                    </Tabs.Root>
                  </Card>
                ))}
              </ScrollArea>
            ) : (
              <Flex direction="column" align="center" gap="3" py="6">
                <Text size="3" color="gray">No API conversations found</Text>
                <Text size="2" color="gray">
                  This payment hasn't made any Stripe API calls yet
                </Text>
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
    </Box>
  );
};

export default PaymentsAdminTabbed;
import { useState, useEffect } from 'react';
import {
  Card,
  Flex,
  Text,
  Button,
  Dialog,
  TextArea,
  Callout,
  Badge,
  Box,
} from '@radix-ui/themes';
import {
  InfoCircledIcon,
  CheckCircledIcon,
  ExclamationTriangleIcon,
} from '@radix-ui/react-icons';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import DismissibleNote from './DismissibleNote';

const ManualPaymentRequest = ({ artistProfile, noteId, serverEligibility }) => {
  const { person } = useAuth();
  const [isEligible, setIsEligible] = useState(false);
  const [eligibilityData, setEligibilityData] = useState(null);
  const [showRequestModal, setShowRequestModal] = useState(false);
  const [paymentDetails, setPaymentDetails] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [existingRequest, setExistingRequest] = useState(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  // Get country-specific form configuration
  const getCountryFormConfig = (country) => {
    const countryUpper = (country || '').toUpperCase();

    if (countryUpper === 'US' || countryUpper === 'USA' || countryUpper === 'UNITED STATES') {
      return {
        methods: ['PayPal', 'Zelle'],
        placeholder: 'Please provide your payment information:\n\nPreferred Method: PayPal or Zelle\n\nFor PayPal:\nEmail: your-paypal@example.com\n\nFor Zelle:\nPhone or Email: your-zelle@example.com\nName on Account: Your Full Name',
        instructions: 'We can pay via PayPal or Zelle. Please provide your email/phone for the method you prefer.'
      };
    } else if (countryUpper === 'CA' || countryUpper === 'CAN' || countryUpper === 'CANADA') {
      return {
        methods: ['Interac e-Transfer'],
        placeholder: 'Please provide your Interac e-Transfer information:\n\nEmail or Phone: your-email@example.com or 555-123-4567\nName on Account: Your Full Name\nBank Name (optional): TD Bank',
        instructions: 'We can pay via Interac e-Transfer. Please provide your email or phone number registered with your bank.'
      };
    } else if (['GB', 'UK', 'DE', 'FR', 'IT', 'ES', 'NL', 'BE', 'AT', 'CH', 'SE', 'NO', 'DK', 'FI', 'IE', 'PT', 'GR', 'PL'].includes(countryUpper)) {
      return {
        methods: ['IBAN/SWIFT Transfer'],
        placeholder: 'Please provide your IBAN information:\n\nFull Name: Your Full Name\nIBAN: DE89 3704 0044 0532 0130 00\nBIC/SWIFT (if required): COBADEFFXXX\nBank Name: Your Bank Name\nBank Address: City, Country',
        instructions: 'We can pay via IBAN/SWIFT bank transfer. Please provide your complete IBAN details.'
      };
    } else if (countryUpper === 'AU' || countryUpper === 'AUS' || countryUpper === 'AUSTRALIA' || countryUpper === 'NZ' || countryUpper === 'NZL' || countryUpper === 'NEW ZEALAND') {
      return {
        methods: ['Bank Transfer', 'PayPal', 'Other'],
        placeholder: 'Please provide your payment information:\n\nPreferred Method: (e.g., Bank Transfer, PayPal, etc.)\n\nFor Bank Transfer:\nAccount Name: Your Full Name\nBSB: 123-456\nAccount Number: 12345678\n\nFor PayPal:\nEmail: your-paypal@example.com\n\nOr provide alternative method details',
        instructions: 'Please provide your preferred payment method and all necessary details.'
      };
    } else {
      return {
        methods: ['Various'],
        placeholder: 'Please provide your payment information:\n\nPreferred Method: (e.g., PayPal, Bank Transfer, etc.)\n\nPlease include:\n- Full Name\n- Payment method details\n- Account numbers or email\n- Any other required information',
        instructions: 'Please provide your preferred payment method and all necessary account details.'
      };
    }
  };

  useEffect(() => {
    if (serverEligibility) {
      // Use server-provided eligibility data
      setIsEligible(true);
      setEligibilityData(serverEligibility);
    } else if (artistProfile && person) {
      // Fallback to client-side check (deprecated)
      checkEligibility();
    }

    if (artistProfile && person) {
      checkExistingRequest();
    }
  }, [artistProfile, person, serverEligibility]);

  const checkEligibility = async () => {
    try {
      // Get payment data to check balance
      const { data: sessionData } = await supabase.auth.getSession();
      const { data: ledgerData } = await supabase.functions.invoke('artist-account-ledger', {
        body: { artist_profile_id: artistProfile.id },
        headers: sessionData?.session?.access_token ? {
          Authorization: `Bearer ${sessionData.session.access_token}`
        } : {}
      });

      if (!ledgerData?.summary) return;

      const balance = ledgerData.summary.current_balance || 0;
      if (balance <= 0) {
        setIsEligible(false);
        return;
      }

      // Check for events older than 14 days
      const { data: confirmations } = await supabase
        .from('artist_confirmations')
        .select(`
          id,
          event_eid,
          events!inner (
            id,
            eid,
            name,
            event_start_datetime
          )
        `)
        .eq('artist_profile_id', artistProfile.id)
        .eq('confirmation_status', 'confirmed');

      if (!confirmations || confirmations.length === 0) {
        setIsEligible(false);
        return;
      }

      // Find events older than 14 days
      const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
      const oldEvents = confirmations.filter(conf => {
        const eventDate = new Date(conf.events.event_start_datetime);
        return eventDate < fourteenDaysAgo;
      });

      if (oldEvents.length > 0) {
        setIsEligible(true);
        setEligibilityData({
          balance: balance,
          currency: ledgerData.summary.primary_currency || 'USD',
          events: oldEvents.map(e => ({
            id: e.events.id,
            eid: e.events.eid,
            name: e.events.name,
            date: e.events.event_start_datetime
          }))
        });
      }
    } catch (err) {
      console.error('Error checking eligibility:', err);
    }
  };

  const checkExistingRequest = async () => {
    try {
      const { data } = await supabase
        .from('artist_manual_payment_requests')
        .select('*')
        .eq('artist_profile_id', artistProfile.id)
        .eq('status', 'pending')
        .maybeSingle();

      setExistingRequest(data);
    } catch (err) {
      console.error('Error checking existing request:', err);
    }
  };

  const handleSubmitRequest = async () => {
    if (!paymentDetails.trim()) {
      setError('Please provide your payment details');
      return;
    }

    setSubmitting(true);
    setError('');

    try {
      const { error: insertError } = await supabase
        .from('artist_manual_payment_requests')
        .insert({
          artist_profile_id: artistProfile.id,
          person_id: person.id,
          payment_details: paymentDetails,
          requested_amount: eligibilityData?.balance,
          events_referenced: eligibilityData?.events.map(e => e.eid),
          status: 'pending'
        });

      if (insertError) throw insertError;

      setSuccess(true);
      setShowRequestModal(false);
      setPaymentDetails('');

      // Refresh to show the existing request
      await checkExistingRequest();

      // Show success message
      setTimeout(() => setSuccess(false), 5000);
    } catch (err) {
      console.error('Error submitting request:', err);
      setError('Failed to submit request: ' + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  // Don't show if not eligible
  if (!isEligible || !eligibilityData) {
    return null;
  }

  // If there's already a pending request, show status instead
  if (existingRequest) {
    return (
      <Card size="3" style={{
        marginBottom: '1.5rem',
        border: '2px solid var(--orange-8)',
        backgroundColor: 'var(--orange-2)'
      }}>
        <Flex direction="column" gap="3">
          <Flex align="center" gap="2">
            <Badge color="orange" variant="soft" size="2">
              <ExclamationTriangleIcon width="16" height="16" />
              Manual Payment Request Pending
            </Badge>
          </Flex>
          <Text size="2">
            Your manual payment request has been submitted and is being reviewed by our team.
            We'll contact you at your registered email once it's processed.
          </Text>
          <Text size="1" color="gray">
            Submitted: {new Date(existingRequest.created_at).toLocaleDateString()}
          </Text>
        </Flex>
      </Card>
    );
  }

  // Show success message
  if (success) {
    return (
      <Card size="3" style={{
        marginBottom: '1.5rem',
        border: '2px solid var(--green-8)',
        backgroundColor: 'var(--green-2)'
      }}>
        <Flex align="center" gap="2">
          <CheckCircledIcon width="20" height="20" color="var(--green-11)" />
          <Text size="3" weight="medium" style={{ color: 'var(--green-11)' }}>
            Manual payment request submitted successfully!
          </Text>
        </Flex>
      </Card>
    );
  }

  return (
    <>
      <DismissibleNote
        noteId="manual-payment-eligible-2025-10"
        variant="warning"
        title="Manual Payment Available"
      >
        <Flex direction="column" gap="2">
          <Text size="2">
            You have a recent event more than 14 days old with a balance of{' '}
            <Text weight="bold">{eligibilityData.balance.toFixed(2)} {eligibilityData.currency}</Text>
            {' '}owing and are eligible for manual payment.
          </Text>
          <Text size="2">
            Please click below to provide your banking/transfer information.
          </Text>
          <Button
            size="2"
            variant="soft"
            color="orange"
            onClick={() => setShowRequestModal(true)}
          >
            Request Manual Payment
          </Button>
        </Flex>
      </DismissibleNote>

      {/* Manual Payment Request Modal */}
      <Dialog.Root open={showRequestModal} onOpenChange={setShowRequestModal}>
        <Dialog.Content maxWidth="600px">
          <Dialog.Title>
            <Flex align="center" gap="2">
              <InfoCircledIcon width="18" height="18" />
              Manual Payment Request
            </Flex>
          </Dialog.Title>

          <Dialog.Description size="2" mb="4">
            <Flex direction="column" gap="3">
              <Text>
                You're requesting manual payment for{' '}
                <Text weight="bold">{eligibilityData.balance.toFixed(2)} {eligibilityData.currency}</Text>
                {' '}from the following event(s):
              </Text>

              <Box>
                {eligibilityData.events.map(event => (
                  <Text key={event.id} size="1" style={{ display: 'block', marginLeft: '1rem' }}>
                    • {event.name} ({new Date(event.date).toLocaleDateString()})
                  </Text>
                ))}
              </Box>

              {(() => {
                const formConfig = getCountryFormConfig(eligibilityData.country);
                return (
                  <>
                    <Callout.Root color="blue" size="1">
                      <Callout.Icon>
                        <InfoCircledIcon />
                      </Callout.Icon>
                      <Callout.Text>
                        <Text size="1">
                          <strong>Available methods:</strong> {formConfig.methods.join(', ')}
                          <br />
                          {formConfig.instructions}
                        </Text>
                      </Callout.Text>
                    </Callout.Root>

                    <Box>
                      <Text size="2" weight="medium" mb="2" style={{ display: 'block' }}>
                        Payment Details *
                      </Text>
                      <TextArea
                        placeholder={formConfig.placeholder}
                        value={paymentDetails}
                        onChange={(e) => setPaymentDetails(e.target.value)}
                        rows={10}
                        style={{ width: '100%' }}
                      />
                    </Box>
                  </>
                );
              })()}

              {error && (
                <Callout.Root color="red" size="1">
                  <Callout.Icon>
                    <ExclamationTriangleIcon />
                  </Callout.Icon>
                  <Callout.Text>{error}</Callout.Text>
                </Callout.Root>
              )}

              <Callout.Root color="amber" size="1">
                <Callout.Icon>
                  <ExclamationTriangleIcon />
                </Callout.Icon>
                <Callout.Text>
                  <Text size="1">
                    <strong>Important:</strong> Manual payments typically take 21+ days to process.
                    For faster payments (2-4 days), we recommend setting up Stripe instead.
                  </Text>
                </Callout.Text>
              </Callout.Root>
            </Flex>
          </Dialog.Description>

          <Flex gap="3" mt="4" justify="end">
            <Dialog.Close>
              <Button variant="soft" disabled={submitting}>
                Cancel
              </Button>
            </Dialog.Close>
            <Button
              variant="solid"
              color="orange"
              onClick={handleSubmitRequest}
              disabled={submitting || !paymentDetails.trim()}
            >
              {submitting ? 'Submitting...' : 'Submit Request'}
            </Button>
          </Flex>
        </Dialog.Content>
      </Dialog.Root>
    </>
  );
};

export default ManualPaymentRequest;

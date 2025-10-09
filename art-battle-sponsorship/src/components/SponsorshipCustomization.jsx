import { useState, useEffect } from 'react';
import { Box, Container, Flex, Heading, Text, Card, TextField, TextArea, Button, Badge, Separator, Callout } from '@radix-ui/themes';
import { CheckCircledIcon, UploadIcon, InfoCircledIcon } from '@radix-ui/react-icons';
import { getPurchaseByFulfillmentHash } from '../lib/api';

const SponsorshipCustomization = ({ fulfillmentHash }) => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);
  const [purchaseData, setPurchaseData] = useState(null);

  // Form state
  const [brandName, setBrandName] = useState('');
  const [brandTagline, setBrandTagline] = useState('');
  const [fullLogo, setFullLogo] = useState(null);
  const [smallLogo, setSmallLogo] = useState(null);

  useEffect(() => {
    loadPurchaseDetails();
  }, [fulfillmentHash]);

  const loadPurchaseDetails = async () => {
    try {
      setLoading(true);
      setError(null);

      const { data, error: fetchError } = await getPurchaseByFulfillmentHash(fulfillmentHash);

      if (fetchError) throw new Error(fetchError);
      if (!data) throw new Error('Purchase not found');

      setPurchaseData(data);
      setBrandName(data.buyer_company || data.buyer_name);
    } catch (err) {
      console.error('Error loading purchase:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      setError(null);

      // TODO: Upload logos to Cloudflare
      // TODO: Save brand customization data

      // Placeholder for now
      await new Promise(resolve => setTimeout(resolve, 1000));

      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      console.error('Error saving:', err);
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleFileChange = (e, type) => {
    const file = e.target.files[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      setError('Please upload an image file');
      return;
    }

    // Validate file size (5MB max)
    if (file.size > 5 * 1024 * 1024) {
      setError('File size must be less than 5MB');
      return;
    }

    if (type === 'full') {
      setFullLogo(file);
    } else {
      setSmallLogo(file);
    }
  };

  if (loading) {
    return (
      <Box style={{ minHeight: '100vh', background: 'var(--gray-1)', padding: '3rem 1rem' }}>
        <Container size="2">
          <Text>Loading your sponsorship details...</Text>
        </Container>
      </Box>
    );
  }

  if (error && !purchaseData) {
    return (
      <Box style={{ minHeight: '100vh', background: 'var(--gray-1)', padding: '3rem 1rem' }}>
        <Container size="2">
          <Callout.Root color="red">
            <Callout.Icon>
              <InfoCircledIcon />
            </Callout.Icon>
            <Callout.Text>{error}</Callout.Text>
          </Callout.Root>
        </Container>
      </Box>
    );
  }

  return (
    <Box style={{ minHeight: '100vh', background: 'var(--gray-1)', padding: '3rem 1rem' }}>
      <Container size="2" py="8" px="4">
        <Flex direction="column" gap="6">
          {/* Header */}
          <Box style={{ textAlign: 'center' }}>
            <img
              src="https://artb.tor1.cdn.digitaloceanspaces.com/img/AB-HWOT1.png"
              alt="Art Battle"
              style={{
                height: '80px',
                marginBottom: '2.5rem',
                objectFit: 'contain',
                display: 'block',
                margin: '0 auto 2.5rem auto'
              }}
            />
            <Badge color="green" size="3" mb="3">
              <CheckCircledIcon width="16" height="16" /> Payment Confirmed
            </Badge>
            <Heading size="8" mb="2">Customize Your Brand Integration</Heading>
            <Text size="4" style={{ color: 'var(--gray-11)' }}>
              Complete your sponsorship setup
            </Text>
          </Box>

          {/* Purchase Summary */}
          <Card size="3">
            <Flex direction="column" gap="3">
              <Heading size="5">Your Sponsorship</Heading>
              <Flex justify="between">
                <Text size="2" style={{ color: 'var(--gray-11)' }}>Event</Text>
                <Text size="2" weight="bold">{purchaseData.event_name}</Text>
              </Flex>
              <Flex justify="between">
                <Text size="2" style={{ color: 'var(--gray-11)' }}>Package</Text>
                <Text size="2" weight="bold">{purchaseData.package_details.main_package.name}</Text>
              </Flex>
              <Flex justify="between">
                <Text size="2" style={{ color: 'var(--gray-11)' }}>Events</Text>
                <Text size="2" weight="bold">{purchaseData.package_details.total_events}</Text>
              </Flex>
            </Flex>
          </Card>

          <Separator />

          {/* Brand Customization Form */}
          <Card size="3">
            <Flex direction="column" gap="4">
              <Heading size="5">Brand Details</Heading>

              {/* Brand Name */}
              <Box>
                <Text size="2" weight="bold" mb="2" style={{ display: 'block' }}>
                  Brand Name *
                </Text>
                <TextField.Root
                  size="3"
                  placeholder="Your company or brand name"
                  value={brandName}
                  onChange={(e) => setBrandName(e.target.value)}
                />
                <Text size="1" style={{ color: 'var(--gray-11)', marginTop: '4px', display: 'block' }}>
                  This will appear on all promotional materials
                </Text>
              </Box>

              {/* Brand Tagline */}
              <Box>
                <Text size="2" weight="bold" mb="2" style={{ display: 'block' }}>
                  Key Message / Tagline
                </Text>
                <TextArea
                  size="3"
                  placeholder="Your key message or special offer (optional)"
                  value={brandTagline}
                  onChange={(e) => setBrandTagline(e.target.value)}
                  rows={3}
                />
                <Text size="1" style={{ color: 'var(--gray-11)', marginTop: '4px', display: 'block' }}>
                  Share your unique message or current promotion
                </Text>
              </Box>

              <Separator />

              {/* Full Logo Upload */}
              <Box>
                <Text size="2" weight="bold" mb="2" style={{ display: 'block' }}>
                  Full Logo
                </Text>
                <Box
                  style={{
                    border: '2px dashed var(--gray-6)',
                    borderRadius: '8px',
                    padding: '2rem',
                    textAlign: 'center',
                    cursor: 'pointer',
                    backgroundColor: 'var(--gray-2)'
                  }}
                  onClick={() => document.getElementById('full-logo-input').click()}
                >
                  <input
                    id="full-logo-input"
                    type="file"
                    accept="image/*"
                    style={{ display: 'none' }}
                    onChange={(e) => handleFileChange(e, 'full')}
                  />
                  <UploadIcon width="32" height="32" style={{ margin: '0 auto 1rem', color: 'var(--gray-9)' }} />
                  <Text size="2" weight="medium" style={{ display: 'block', marginBottom: '0.5rem' }}>
                    {fullLogo ? fullLogo.name : 'Click to upload full logo'}
                  </Text>
                  <Text size="1" style={{ color: 'var(--gray-11)' }}>
                    PNG, JPG or SVG • Max 5MB • Recommended: 1200x400px
                  </Text>
                </Box>
              </Box>

              {/* Small Logo Upload */}
              <Box>
                <Text size="2" weight="bold" mb="2" style={{ display: 'block' }}>
                  Small Logo / Icon
                </Text>
                <Box
                  style={{
                    border: '2px dashed var(--gray-6)',
                    borderRadius: '8px',
                    padding: '2rem',
                    textAlign: 'center',
                    cursor: 'pointer',
                    backgroundColor: 'var(--gray-2)'
                  }}
                  onClick={() => document.getElementById('small-logo-input').click()}
                >
                  <input
                    id="small-logo-input"
                    type="file"
                    accept="image/*"
                    style={{ display: 'none' }}
                    onChange={(e) => handleFileChange(e, 'small')}
                  />
                  <UploadIcon width="32" height="32" style={{ margin: '0 auto 1rem', color: 'var(--gray-9)' }} />
                  <Text size="2" weight="medium" style={{ display: 'block', marginBottom: '0.5rem' }}>
                    {smallLogo ? smallLogo.name : 'Click to upload small logo'}
                  </Text>
                  <Text size="1" style={{ color: 'var(--gray-11)' }}>
                    PNG, JPG or SVG • Max 5MB • Recommended: 400x400px (square)
                  </Text>
                </Box>
              </Box>
            </Flex>
          </Card>

          {/* Success/Error Messages */}
          {success && (
            <Callout.Root color="green">
              <Callout.Icon>
                <CheckCircledIcon />
              </Callout.Icon>
              <Callout.Text>Your brand customization has been saved!</Callout.Text>
            </Callout.Root>
          )}

          {error && (
            <Callout.Root color="red">
              <Callout.Icon>
                <InfoCircledIcon />
              </Callout.Icon>
              <Callout.Text>{error}</Callout.Text>
            </Callout.Root>
          )}

          {/* Save Button */}
          <Button
            size="4"
            onClick={handleSave}
            disabled={saving || !brandName}
            style={{ width: '100%' }}
          >
            {saving ? 'Saving...' : 'Save Brand Customization'}
          </Button>

          <Text size="1" style={{ textAlign: 'center', color: 'var(--gray-11)' }}>
            You can return to this page anytime to update your brand details
          </Text>
        </Flex>
      </Container>
    </Box>
  );
};

export default SponsorshipCustomization;

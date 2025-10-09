import { useState, useEffect } from 'react';
import { Theme, Container, Box, Flex, Spinner, Callout } from '@radix-ui/themes';
import { getSponsorshipInvite, trackInteraction, createSponsorshipCheckout } from './lib/api';
import HeroSection from './components/HeroSection';
import LocalRelevanceSection from './components/LocalRelevanceSection';
import SelfSelectionCTA from './components/SelfSelectionCTA';
import PackageGrid from './components/PackageGrid';
import AddonsModal from './components/AddonsModal';
import MultiEventOffer from './components/MultiEventOffer';
import SponsorshipCustomization from './components/SponsorshipCustomization';

function App() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [inviteData, setInviteData] = useState(null);
  const [hash, setHash] = useState(null);
  const [pageType, setPageType] = useState(null); // 'invite' or 'customize'

  // Flow state
  const [currentStep, setCurrentStep] = useState('landing'); // landing, selection, addons, multi-event
  const [selectedTier, setSelectedTier] = useState(null); // 'premium' or 'targeted'
  const [selectedPackage, setSelectedPackage] = useState(null);
  const [selectedAddons, setSelectedAddons] = useState([]);
  const [multiEventSelection, setMultiEventSelection] = useState([]);

  useEffect(() => {
    // Extract hash from URL path
    const pathParts = window.location.pathname.split('/').filter(p => p);

    // Check if this is a customization page
    if (pathParts.includes('customize')) {
      const hashFromUrl = pathParts[pathParts.length - 1];
      if (hashFromUrl && hashFromUrl.length === 40) { // Fulfillment hash is 40 chars
        setPageType('customize');
        setHash(hashFromUrl);
        setLoading(false);
        return;
      }
    }

    // Otherwise treat as invite flow
    const hashFromUrl = pathParts[pathParts.length - 1] || pathParts[pathParts.length - 2];

    if (!hashFromUrl || hashFromUrl === 'sponsor') {
      setError('Invalid invite link');
      setLoading(false);
      return;
    }

    setPageType('invite');
    setHash(hashFromUrl);
    loadInvite(hashFromUrl);

    // Handle browser back/forward buttons
    const handlePopState = (event) => {
      if (event.state) {
        setCurrentStep(event.state.step || 'landing');
        setSelectedTier(event.state.tier || null);
        setSelectedPackage(event.state.package || null);
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const loadInvite = async (inviteHash) => {
    setLoading(true);
    setError(null);

    try {
      const { data, error: fetchError } = await getSponsorshipInvite(inviteHash);

      if (fetchError) throw new Error(fetchError);
      if (!data) throw new Error('Invite not found or expired');

      setInviteData(data);

      // Track the view
      await trackInteraction(inviteHash, 'view');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleTierSelect = async (tier) => {
    setSelectedTier(tier);
    setCurrentStep('selection');
    window.history.pushState({ step: 'selection', tier }, '', window.location.href);

    if (hash) {
      await trackInteraction(hash, 'tier_select', null, { tier });
    }
  };

  const handlePackageSelect = async (pkg) => {
    setSelectedPackage(pkg);
    setCurrentStep('addons');
    window.history.pushState({ step: 'addons', tier: selectedTier, package: pkg }, '', window.location.href);

    if (hash) {
      await trackInteraction(hash, 'package_click', pkg.id);
    }
  };

  const handleAddonsConfirm = (addons) => {
    setSelectedAddons(addons);
    setCurrentStep('multi-event');
    window.history.pushState({ step: 'multi-event', tier: selectedTier, package: selectedPackage }, '', window.location.href);
  };

  const handleBackToLanding = () => {
    setCurrentStep('landing');
    setSelectedTier(null);
    window.history.pushState({ step: 'landing' }, '', window.location.href);
  };

  const handleBackToSelection = () => {
    setCurrentStep('selection');
    window.history.pushState({ step: 'selection', tier: selectedTier }, '', window.location.href);
  };

  const handleCheckout = async (selectedEvents) => {
    try {
      setLoading(true);
      setError(null);

      // Prepare buyer information from invite
      const buyerName = inviteData.prospect_company || inviteData.prospect_name || 'Sponsor';
      const buyerEmail = inviteData.prospect_email || '';
      const buyerCompany = inviteData.prospect_company || '';

      // Build event IDs array - includes original event + selected additional events
      const eventIds = [
        inviteData.event_id,
        ...selectedEvents.filter(e => !e.isPlaceholder && !e.isChampionship).map(e => e.id)
      ];

      // Create checkout session
      const { data: checkoutData, error: checkoutError } = await createSponsorshipCheckout({
        inviteHash: hash,
        mainPackageId: selectedPackage.id,
        addonPackageIds: selectedAddons.map(a => a.id),
        eventIds: eventIds,
        buyerName: buyerName,
        buyerEmail: buyerEmail,
        buyerCompany: buyerCompany,
        buyerPhone: null,
        successUrl: `${window.location.origin}/sponsor/customize/{FULFILLMENT_HASH}`,
        cancelUrl: `${window.location.origin}/sponsor/${hash}?payment=cancelled`
      });

      if (checkoutError) {
        throw new Error(checkoutError);
      }

      if (checkoutData?.url) {
        // Track checkout initiation
        if (hash) {
          await trackInteraction(hash, 'checkout_initiated', selectedPackage.id, {
            total_events: eventIds.length,
            addon_count: selectedAddons.length
          });
        }

        // Store fulfillment hash in session storage for success redirect
        if (checkoutData.fulfillment_hash) {
          sessionStorage.setItem('fulfillment_hash', checkoutData.fulfillment_hash);
        }

        // Redirect to Stripe Checkout
        window.location.href = checkoutData.url;
      } else {
        throw new Error('No checkout URL returned');
      }
    } catch (err) {
      console.error('Checkout error:', err);
      setError(err.message || 'Failed to initiate checkout');
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <Theme appearance="dark">
        <Container size="1">
          <Flex justify="center" align="center" style={{ minHeight: '100vh' }}>
            <Spinner size="3" />
          </Flex>
        </Container>
      </Theme>
    );
  }

  if (error) {
    return (
      <Theme appearance="dark">
        <Container size="2">
          <Flex justify="center" align="center" style={{ minHeight: '100vh' }}>
            <Callout.Root color="red">
              <Callout.Text size="4">
                {error}
              </Callout.Text>
            </Callout.Root>
          </Flex>
        </Container>
      </Theme>
    );
  }

  // Show customization page if pageType is 'customize'
  if (pageType === 'customize') {
    return (
      <Theme appearance="dark">
        <SponsorshipCustomization fulfillmentHash={hash} />
      </Theme>
    );
  }

  return (
    <Theme appearance="dark">
      <Box style={{ background: 'var(--gray-1)', minHeight: '100vh' }}>
        {/* Landing: Hero + Local Relevance + Self-Selection */}
        {currentStep === 'landing' && (
          <Box style={{ maxWidth: '1400px', margin: '0 auto' }}>
            <HeroSection inviteData={inviteData} />
            <LocalRelevanceSection inviteData={inviteData} />
            <SelfSelectionCTA onSelect={handleTierSelect} />
          </Box>
        )}

        {/* Package Selection */}
        {currentStep === 'selection' && (
          <Box style={{ maxWidth: '1400px', margin: '0 auto', padding: '0 1rem' }}>
            <PackageGrid
              packages={inviteData.packages}
              tier={selectedTier}
              discountPercent={inviteData.discount_percent}
              inviteData={inviteData}
              onSelect={handlePackageSelect}
              onBack={handleBackToLanding}
            />
          </Box>
        )}

        {/* Addons Modal */}
        {currentStep === 'addons' && (
          <AddonsModal
            open={true}
            packages={inviteData.packages}
            selectedPackage={selectedPackage}
            discountPercent={inviteData.discount_percent}
            inviteData={inviteData}
            onConfirm={handleAddonsConfirm}
            onClose={handleBackToSelection}
          />
        )}

        {/* Multi-Event Discount Offer */}
        {currentStep === 'multi-event' && (
          <Box style={{ maxWidth: '1400px', margin: '0 auto' }}>
            <MultiEventOffer
              inviteData={inviteData}
              selectedPackage={selectedPackage}
              selectedAddons={selectedAddons}
              discountPercent={inviteData.discount_percent}
              onConfirm={handleCheckout}
              onSkip={handleCheckout}
            />
          </Box>
        )}
      </Box>
    </Theme>
  );
}

export default App;

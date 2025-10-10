import { useState, useEffect } from 'react';
import { Theme, Container, Box, Flex, Spinner, Callout, Text } from '@radix-ui/themes';
import { getSponsorshipInvite, trackInteraction, createSponsorshipCheckout } from './lib/api';
import HeroSection from './components/HeroSection';
import LocalRelevanceSection from './components/LocalRelevanceSection';
import SelfSelectionCTA from './components/SelfSelectionCTA';
import PackageGrid from './components/PackageGrid';
import AddonsModal from './components/AddonsModal';
import MultiEventOffer from './components/MultiEventOffer';
import SponsorshipCustomization from './components/SponsorshipCustomization';

function App() {
  console.log('🚀 APP STARTED - React is running');
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
  const [paymentCancelled, setPaymentCancelled] = useState(false);

  // Check for cancelled payment on mount
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('payment') === 'cancelled') {
      setPaymentCancelled(true);
      // Clear the query param after showing message
      window.history.replaceState({}, '', window.location.pathname);

      // Track payment cancellation
      if (hash) {
        trackInteraction(hash, 'payment_cancelled');
      }
    }
  }, [hash]);

  // Save state to localStorage on any selection change
  useEffect(() => {
    if (!hash) return;

    const stateToSave = {
      currentStep,
      selectedTier,
      selectedPackage,
      selectedAddons,
      multiEventSelection,
      timestamp: Date.now()
    };

    localStorage.setItem(`sponsorship_flow_${hash}`, JSON.stringify(stateToSave));
    console.log('💾 Saved state to localStorage:', stateToSave);
  }, [hash, currentStep, selectedTier, selectedPackage, selectedAddons, multiEventSelection]);

  // Restore state from localStorage after inviteData is loaded
  useEffect(() => {
    if (!hash || !inviteData) return;

    try {
      const savedState = localStorage.getItem(`sponsorship_flow_${hash}`);
      if (savedState) {
        const parsed = JSON.parse(savedState);
        console.log('📂 Restored state from localStorage:', parsed);

        // Only restore if saved within last 24 hours
        if (parsed.timestamp && (Date.now() - parsed.timestamp < 24 * 60 * 60 * 1000)) {
          if (parsed.currentStep) setCurrentStep(parsed.currentStep);
          if (parsed.selectedTier) setSelectedTier(parsed.selectedTier);
          if (parsed.selectedPackage) setSelectedPackage(parsed.selectedPackage);
          if (parsed.selectedAddons) setSelectedAddons(parsed.selectedAddons);
          if (parsed.multiEventSelection) setMultiEventSelection(parsed.multiEventSelection);
        } else {
          // Clear expired state
          localStorage.removeItem(`sponsorship_flow_${hash}`);
        }
      }
    } catch (err) {
      console.error('Failed to restore state from localStorage:', err);
    }
  }, [hash, inviteData]);

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

    // Push initial landing state for browser history
    window.history.replaceState({ step: 'landing' }, '', window.location.href);

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
    console.log('📥 loadInvite called with hash:', inviteHash);
    setLoading(true);
    setError(null);

    try {
      const { data, error: fetchError } = await getSponsorshipInvite(inviteHash);

      if (fetchError) throw new Error(fetchError);
      if (!data) throw new Error('Invite not found or expired');

      setInviteData(data);

      // Track the view
      console.log('📊 Tracking view interaction...');
      await trackInteraction(inviteHash, 'view');
      console.log('✅ View interaction tracked successfully');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleTierSelect = async (tier) => {
    console.log('🎯 Tier selected:', tier);
    setSelectedTier(tier);
    setCurrentStep('selection');
    window.history.pushState({ step: 'selection', tier }, '', window.location.href);
    console.log('📦 Current step set to: selection');

    if (hash) {
      console.log('📊 Tracking tier select...');
      await trackInteraction(hash, 'tier_select', null, { tier });
      console.log('✅ Tier select tracked');
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

  const handleAddonsConfirm = async (addons) => {
    setSelectedAddons(addons);
    setCurrentStep('multi-event');
    window.history.pushState({ step: 'multi-event', tier: selectedTier, package: selectedPackage }, '', window.location.href);

    if (hash && addons.length > 0) {
      await trackInteraction(hash, 'addon_select', null, {
        addon_count: addons.length,
        addon_ids: addons.map(a => a.id)
      });
    }
  };

  const handleBackToLanding = () => {
    setCurrentStep('landing');
    setSelectedTier(null);
    setSelectedPackage(null);
    setSelectedAddons([]);
    setMultiEventSelection([]);
    window.history.pushState({ step: 'landing' }, '', window.location.href);

    // Clear saved state since user is starting over
    if (hash) {
      localStorage.removeItem(`sponsorship_flow_${hash}`);
      console.log('🗑️ Cleared saved state - user returned to landing');
    }
  };

  const handleBackToSelection = () => {
    setCurrentStep('selection');
    window.history.pushState({ step: 'selection', tier: selectedTier }, '', window.location.href);
  };

  // Check if invite is expired
  const isInviteExpired = () => {
    if (!inviteData?.valid_until) return false;
    return new Date(inviteData.valid_until) < new Date();
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

      // Track event selection if multiple events were selected
      if (hash && eventIds.length > 1) {
        await trackInteraction(hash, 'multi_event_select', null, {
          event_count: eventIds.length,
          event_ids: eventIds
        });
      }

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

        // Clear saved flow state since they're going to Stripe
        localStorage.removeItem(`sponsorship_flow_${hash}`);
        console.log('🗑️ Cleared saved state - proceeding to checkout');

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
        <Flex direction="column" justify="center" align="center" style={{ minHeight: '100vh', gap: '2rem' }}>
          <img
            src="https://artb.tor1.cdn.digitaloceanspaces.com/images/ABWoTCirc1.png"
            alt="Art Battle"
            style={{
              height: '120px',
              width: '120px',
              objectFit: 'contain'
            }}
          />
          <Flex direction="column" align="center" gap="3">
            <Spinner size="3" />
            <Text size="3" style={{ color: 'var(--gray-11)' }}>
              {currentStep === 'multi-event' && inviteData ? 'Redirecting to payment...' : 'Loading...'}
            </Text>
          </Flex>
        </Flex>
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

  console.log('🔄 Rendering App - currentStep:', currentStep, 'selectedTier:', selectedTier, 'hasPackages:', !!inviteData?.packages);

  return (
    <Theme appearance="dark">
      <Box style={{ background: 'var(--gray-1)', minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
        {/* Payment Cancelled Message */}
        {paymentCancelled && (
          <Container size="2" style={{ paddingTop: '2rem' }}>
            <Callout.Root color="amber">
              <Callout.Text>
                Your payment was cancelled. Your selections have been saved - you can continue where you left off.
              </Callout.Text>
            </Callout.Root>
          </Container>
        )}

        {/* Main Content */}
        <Box style={{ flex: 1 }}>
          {/* Landing: Hero + Local Relevance + Self-Selection */}
          {currentStep === 'landing' && (
            <Box style={{ maxWidth: '1400px', margin: '0 auto' }}>
              <HeroSection inviteData={inviteData} />
              <LocalRelevanceSection inviteData={inviteData} />
              <SelfSelectionCTA onSelect={handleTierSelect} isExpired={isInviteExpired()} />
            </Box>
          )}

          {/* Package Selection */}
          {currentStep === 'selection' && (
            <Box style={{ maxWidth: '1400px', margin: '0 auto', padding: '0 1rem' }}>
              {console.log('📦 Rendering PackageGrid with', inviteData?.packages?.length, 'packages')}
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

        {/* Footer with circular logo */}
        <Box style={{ padding: '3rem 1rem', background: 'var(--gray-2)', borderTop: '1px solid var(--gray-6)' }}>
          <Flex justify="center" align="center">
            <img
              src="https://artb.tor1.cdn.digitaloceanspaces.com/images/ABWoTCirc1.png"
              alt="Art Battle"
              style={{
                height: '80px',
                width: '80px',
                objectFit: 'contain'
              }}
            />
          </Flex>
        </Box>
      </Box>
    </Theme>
  );
}

export default App;

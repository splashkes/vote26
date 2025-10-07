import { useState, useEffect } from 'react';
import { Theme, Container, Box, Flex, Spinner, Callout } from '@radix-ui/themes';
import { getSponsorshipInvite, trackInteraction } from './lib/api';
import HeroSection from './components/HeroSection';
import LocalRelevanceSection from './components/LocalRelevanceSection';
import SelfSelectionCTA from './components/SelfSelectionCTA';
import PackageGrid from './components/PackageGrid';
import AddonsModal from './components/AddonsModal';
import MultiEventOffer from './components/MultiEventOffer';

function App() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [inviteData, setInviteData] = useState(null);
  const [hash, setHash] = useState(null);

  // Flow state
  const [currentStep, setCurrentStep] = useState('landing'); // landing, selection, addons, multi-event
  const [selectedTier, setSelectedTier] = useState(null); // 'premium' or 'targeted'
  const [selectedPackage, setSelectedPackage] = useState(null);
  const [selectedAddons, setSelectedAddons] = useState([]);
  const [multiEventSelection, setMultiEventSelection] = useState([]);

  useEffect(() => {
    // Extract hash from URL path
    const pathParts = window.location.pathname.split('/');
    const hashFromUrl = pathParts[pathParts.length - 1] || pathParts[pathParts.length - 2];

    if (!hashFromUrl || hashFromUrl === 'sponsor') {
      setError('Invalid invite link');
      setLoading(false);
      return;
    }

    setHash(hashFromUrl);
    loadInvite(hashFromUrl);
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

    if (hash) {
      await trackInteraction(hash, 'tier_select', null, { tier });
    }
  };

  const handlePackageSelect = async (pkg) => {
    setSelectedPackage(pkg);
    setCurrentStep('addons');

    if (hash) {
      await trackInteraction(hash, 'package_click', pkg.id);
    }
  };

  const handleAddonsConfirm = (addons) => {
    setSelectedAddons(addons);
    setCurrentStep('multi-event');
  };

  const handleCheckout = async () => {
    // Phase 4: Stripe integration
    console.log('Checkout:', {
      package: selectedPackage,
      addons: selectedAddons,
      multiEvents: multiEventSelection
    });
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

  return (
    <Theme appearance="dark">
      <Box style={{ background: 'var(--gray-1)', minHeight: '100vh' }}>
        {/* Landing: Hero + Local Relevance + Self-Selection */}
        {currentStep === 'landing' && (
          <Box style={{ maxWidth: '1400px', margin: '0 auto' }}>
            <HeroSection />
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
              onSelect={handlePackageSelect}
              onBack={() => setCurrentStep('landing')}
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
            onConfirm={handleAddonsConfirm}
            onClose={() => setCurrentStep('selection')}
          />
        )}

        {/* Multi-Event Discount Offer */}
        {currentStep === 'multi-event' && (
          <Box style={{ maxWidth: '1400px', margin: '0 auto' }}>
            <MultiEventOffer
              inviteData={inviteData}
              selectedPackage={selectedPackage}
              selectedAddons={selectedAddons}
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

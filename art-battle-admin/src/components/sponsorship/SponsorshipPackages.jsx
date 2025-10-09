import { useState, useEffect } from 'react';
import { Box, Heading, Tabs, Card, Spinner, Flex, Text } from '@radix-ui/themes';
import PackageTemplateList from './PackageTemplateList';
import CityPricingManager from './CityPricingManager';
import SponsorshipMediaLibrary from './SponsorshipMediaLibrary';
import InvitesAndDiscounts from './InvitesAndDiscounts';

const SponsorshipPackages = () => {
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Initial load
    setLoading(false);
  }, []);

  if (loading) {
    return (
      <Flex direction="column" align="center" justify="center" style={{ minHeight: '50vh', gap: '1rem' }}>
        <Spinner size="3" />
        <Text color="gray">Loading sponsorship packages...</Text>
      </Flex>
    );
  }

  return (
    <Box p="4">
      <Flex direction="column" gap="2" mb="5">
        <Heading size="8">Sponsorship Package Management</Heading>
        <Text size="3" color="gray">
          Manage global sponsorship templates, set pricing by city, and upload visual samples
        </Text>
      </Flex>

      <Tabs.Root defaultValue="templates">
        <Tabs.List>
          <Tabs.Trigger value="templates">Package Templates</Tabs.Trigger>
          <Tabs.Trigger value="pricing">City Pricing</Tabs.Trigger>
          <Tabs.Trigger value="invites">Invites & Discounts</Tabs.Trigger>
          <Tabs.Trigger value="media">Media Library</Tabs.Trigger>
        </Tabs.List>

        <Box pt="4">
          <Tabs.Content value="templates">
            <PackageTemplateList />
          </Tabs.Content>

          <Tabs.Content value="pricing">
            <CityPricingManager />
          </Tabs.Content>

          <Tabs.Content value="invites">
            <InvitesAndDiscounts />
          </Tabs.Content>

          <Tabs.Content value="media">
            <SponsorshipMediaLibrary />
          </Tabs.Content>
        </Box>
      </Tabs.Root>
    </Box>
  );
};

export default SponsorshipPackages;

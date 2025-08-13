import { useState, useEffect } from 'react';
import { Tabs, Box, Container, Heading } from '@radix-ui/themes';
import { PersonIcon, CalendarIcon, HomeIcon, ClockIcon, CheckIcon } from '@radix-ui/react-icons';
import Home from './Home';
import ProfileEditor from './ProfileEditor';
import EventApplications from './EventApplications';
import Activity from './Activity';
import PaymentDashboard from './PaymentDashboard';

const MainNavigation = () => {
  const [activeTab, setActiveTab] = useState('home');
  const [showProfilePicker, setShowProfilePicker] = useState(false);

  // Force tab to home when profile picker is showing
  const handleTabChange = (value) => {
    console.log('MainNavigation: Tab change requested:', value, 'showProfilePicker:', showProfilePicker);
    if (showProfilePicker) {
      console.log('MainNavigation: Blocking tab change due to profile picker');
      return; // Don't allow tab changes when profile picker is active
    }
    console.log('MainNavigation: Setting active tab to:', value);
    setActiveTab(value);
  };

  // Force active tab to home when profile picker shows (but allow navigation when it's hidden)
  useEffect(() => {
    console.log('MainNavigation: Profile picker state changed:', showProfilePicker);
    if (showProfilePicker) {
      console.log('MainNavigation: Forcing tab to home due to profile picker');
      setActiveTab('home');
    }
  }, [showProfilePicker]);

  return (
    <Container size="4" style={{ padding: '2rem' }}>
      <Box mb="4">
        <Heading size="8" align="center" mb="2">
          Art Battle Artists
        </Heading>
      </Box>

      <Tabs.Root value={activeTab} onValueChange={handleTabChange}>
        <Tabs.List size="2" style={{ marginBottom: '2rem' }}>
          <Tabs.Trigger value="home">
            <HomeIcon width="16" height="16" />
            Home
          </Tabs.Trigger>
          {!showProfilePicker && (
            <>
              <Tabs.Trigger value="profile">
                <PersonIcon width="16" height="16" />
                Artist Profile
              </Tabs.Trigger>
              <Tabs.Trigger value="events">
                <CalendarIcon width="16" height="16" />
                Apply to Events
              </Tabs.Trigger>
              <Tabs.Trigger value="history">
                <ClockIcon width="16" height="16" />
                Activity
              </Tabs.Trigger>
              <Tabs.Trigger value="payments">
                <CheckIcon width="16" height="16" />
                Payments
              </Tabs.Trigger>
            </>
          )}
        </Tabs.List>

        <Tabs.Content value="home">
          <Home onNavigateToTab={setActiveTab} onProfilePickerChange={setShowProfilePicker} />
        </Tabs.Content>

        <Tabs.Content value="profile">
          <ProfileEditor />
        </Tabs.Content>

        <Tabs.Content value="events">
          <EventApplications />
        </Tabs.Content>

        <Tabs.Content value="history">
          <Activity />
        </Tabs.Content>

        <Tabs.Content value="payments">
          <PaymentDashboard />
        </Tabs.Content>
      </Tabs.Root>
    </Container>
  );
};

export default MainNavigation;
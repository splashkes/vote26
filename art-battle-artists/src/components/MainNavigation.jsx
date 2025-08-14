import { useState, useEffect } from 'react';
import { Tabs, Box, Container, Heading, Button, Flex } from '@radix-ui/themes';
import { PersonIcon, CalendarIcon, HomeIcon, ClockIcon, CheckIcon, ExitIcon } from '@radix-ui/react-icons';
import { useAuth } from '../contexts/AuthContext';
import Home from './Home';
import ProfileEditor from './ProfileEditor';
import EventApplications from './EventApplications';
import Activity from './Activity';
import PaymentDashboard from './PaymentDashboard';

const MainNavigation = () => {
  const [activeTab, setActiveTab] = useState('home');
  const [showProfilePicker, setShowProfilePicker] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  
  const { user, signOut } = useAuth();

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

  const handleLogout = async () => {
    setLoggingOut(true);
    try {
      const { error } = await signOut();
      if (error) {
        console.error('Logout failed:', error);
      }
    } catch (err) {
      console.error('Logout error:', err);
    } finally {
      setLoggingOut(false);
    }
  };

  return (
    <Container size="4" style={{ 
      padding: '1rem', 
      paddingTop: 'max(1rem, env(safe-area-inset-top))',
      minHeight: '100vh' 
    }}>
      <Box mb="3">
        {user ? (
          <Flex 
            justify="between" 
            align="center" 
            mb="2"
            style={{
              flexWrap: 'nowrap',
              gap: '0.5rem'
            }}
          >
            <Heading 
              size={{ initial: '6', sm: '8' }}
              style={{ 
                flexShrink: 1,
                minWidth: 0,
                overflow: 'hidden',
                textOverflow: 'ellipsis'
              }}
            >
              Art Battle Artists
            </Heading>
            <Button 
              variant="soft" 
              color="gray" 
              size={{ initial: '1', sm: '2' }}
              onClick={handleLogout}
              disabled={loggingOut}
              loading={loggingOut}
              style={{
                flexShrink: 0,
                whiteSpace: 'nowrap'
              }}
            >
              <ExitIcon width="16" height="16" />
              <Box 
                as="span" 
                display={{ initial: 'none', sm: 'inline' }}
                ml="1"
              >
                {loggingOut ? 'Signing out...' : 'Sign out'}
              </Box>
            </Button>
          </Flex>
        ) : (
          <Heading size="8" align="center" mb="2">
            Art Battle Artists
          </Heading>
        )}
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
                Profile
              </Tabs.Trigger>
              <Tabs.Trigger value="events">
                <CalendarIcon width="16" height="16" />
                Apply
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
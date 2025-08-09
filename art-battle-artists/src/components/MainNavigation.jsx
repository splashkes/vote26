import { useState } from 'react';
import { Tabs, Box, Container, Heading } from '@radix-ui/themes';
import { PersonIcon, CalendarIcon, HomeIcon, ClockIcon } from '@radix-ui/react-icons';
import Home from './Home';
import ProfileEditor from './ProfileEditor';
import EventApplications from './EventApplications';
import EventHistory from './EventHistory';

const MainNavigation = () => {
  const [activeTab, setActiveTab] = useState('home');

  return (
    <Container size="4" style={{ padding: '2rem' }}>
      <Box mb="4">
        <Heading size="8" align="center" mb="2">
          Art Battle Artists
        </Heading>
      </Box>

      <Tabs.Root value={activeTab} onValueChange={setActiveTab}>
        <Tabs.List size="2" style={{ marginBottom: '2rem' }}>
          <Tabs.Trigger value="home">
            <HomeIcon width="16" height="16" />
            Home
          </Tabs.Trigger>
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
            Event History
          </Tabs.Trigger>
        </Tabs.List>

        <Tabs.Content value="home">
          <Home onNavigateToTab={setActiveTab} />
        </Tabs.Content>

        <Tabs.Content value="profile">
          <ProfileEditor />
        </Tabs.Content>

        <Tabs.Content value="events">
          <EventApplications />
        </Tabs.Content>

        <Tabs.Content value="history">
          <EventHistory />
        </Tabs.Content>
      </Tabs.Root>
    </Container>
  );
};

export default MainNavigation;
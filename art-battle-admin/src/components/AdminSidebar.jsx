import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  Box,
  Flex,
  Text,
  Button,
  Select,
  Separator,
  Badge
} from '@radix-ui/themes';
import { 
  DashboardIcon, 
  PersonIcon, 
  ImageIcon, 
  GearIcon, 
  ExitIcon 
} from '@radix-ui/react-icons';
import { useAuth } from '../contexts/AuthContext';
import { DebugField } from './DebugComponents';

const AdminSidebar = () => {
  const { user, adminEvents, signOut } = useAuth();
  const [selectedEventId, setSelectedEventId] = useState('');
  const location = useLocation();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await signOut();
    navigate('/login');
  };

  const handleEventSelect = (eventId) => {
    setSelectedEventId(eventId);
    navigate(`/events/${eventId}`);
  };

  const navItems = [
    {
      to: '/events',
      icon: DashboardIcon,
      label: 'Events',
      description: 'Manage events and settings'
    },
    {
      to: selectedEventId ? `/events/${selectedEventId}/artists` : '/events',
      icon: PersonIcon,
      label: 'Artists',
      description: 'Manage artists and contestants',
      disabled: !selectedEventId
    },
    {
      to: selectedEventId ? `/events/${selectedEventId}/art` : '/events',
      icon: ImageIcon,
      label: 'Artwork',
      description: 'View and manage artwork',
      disabled: !selectedEventId
    }
  ];

  return (
    <Box>
      {/* User Info */}
      <div className="nav-section">
        <Flex direction="column" gap="2">
          <Text size="2" weight="medium">
            <DebugField 
              value={user?.email} 
              fieldName="user.email" 
              fallback="Unknown user" 
            />
          </Text>
          <Badge color="green" size="1">
            {adminEvents.length} event{adminEvents.length !== 1 ? 's' : ''}
          </Badge>
        </Flex>
      </div>

      <Separator />

      {/* Event Selector */}
      {adminEvents.length > 0 && (
        <>
          <div className="nav-section">
            <Text size="2" weight="medium" mb="2" style={{ display: 'block' }}>
              Select Event
            </Text>
            <Select.Root 
              value={selectedEventId} 
              onValueChange={handleEventSelect}
              size="2"
            >
              <Select.Trigger style={{ width: '100%' }} placeholder="Choose event..." />
              <Select.Content>
                {adminEvents.map((event) => (
                  <Select.Item key={event.event_id} value={event.event_id}>
                    <Flex direction="column" align="start">
                      <Text size="2" weight="medium">
                        <DebugField 
                          value={event.event_name || event.name} 
                          fieldName="event.name"
                        />
                      </Text>
                      <Text size="1" color="gray">
                        <DebugField 
                          value={event.event_eid || event.eid} 
                          fieldName="event.eid"
                        />
                        {' • '}
                        <DebugField 
                          value={event.level} 
                          fieldName="admin.level"
                        />
                      </Text>
                    </Flex>
                  </Select.Item>
                ))}
              </Select.Content>
            </Select.Root>
          </div>
          
          <Separator />
        </>
      )}

      {/* Navigation */}
      <div className="nav-section">
        <Text size="2" weight="medium" mb="3" style={{ display: 'block' }}>
          Navigation
        </Text>
        <Flex direction="column" gap="1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.to;
            const isDisabled = item.disabled;

            return (
              <Link
                key={item.to}
                to={item.to}
                className={`nav-item ${isActive ? 'active' : ''} ${isDisabled ? 'disabled' : ''}`}
                style={{
                  pointerEvents: isDisabled ? 'none' : 'auto',
                  opacity: isDisabled ? 0.5 : 1
                }}
              >
                <Flex align="center" gap="2">
                  <Icon size={16} />
                  <Box>
                    <Text size="2" weight="medium" style={{ display: 'block' }}>
                      {item.label}
                    </Text>
                    <Text size="1" color="gray">
                      {item.description}
                    </Text>
                  </Box>
                </Flex>
              </Link>
            );
          })}
        </Flex>
      </div>

      <Separator />

      {/* Admin Actions */}
      <div className="nav-section">
        <Text size="2" weight="medium" mb="3" style={{ display: 'block' }}>
          Admin
        </Text>
        <Flex direction="column" gap="2">
          <Button variant="ghost" size="2" onClick={handleSignOut}>
            <ExitIcon />
            Sign Out
          </Button>
        </Flex>
      </div>
    </Box>
  );
};

export default AdminSidebar;
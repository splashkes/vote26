import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  Box,
  Flex,
  Text,
  Button,
  Separator,
  Badge,
  ScrollArea
} from '@radix-ui/themes';
import { 
  DashboardIcon, 
  PersonIcon, 
  ImageIcon, 
  GearIcon, 
  ExitIcon,
  HeartFilledIcon,
  BarChartIcon
} from '@radix-ui/react-icons';
import { useAuth } from '../contexts/AuthContext';
import { DebugField } from './DebugComponents';
import EventSearch from './EventSearch';

const AdminSidebar = () => {
  const { user, adminEvents, signOut } = useAuth();
  const [selectedEventId, setSelectedEventId] = useState('');
  const location = useLocation();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await signOut();
    navigate('/login');
  };

  const handleEventSelect = (event) => {
    const eventId = event.event_id || event.id;
    setSelectedEventId(eventId);
    navigate(`/events/${eventId}`);
  };

  const navItems = [
    {
      to: '/events',
      icon: DashboardIcon,
      label: 'Events',
      description: 'Event dashboard and management'
    },
    {
      to: '/artists',
      icon: PersonIcon,
      label: 'Artists',
      description: 'All artists across the system'
    },
    {
      to: '/people',
      icon: PersonIcon,
      label: 'People',
      description: 'Customer loyalty and management'
    },
    {
      to: '/health',
      icon: HeartFilledIcon,
      label: 'Health',
      description: 'AI recommendations across all events',
      color: 'crimson'
    },
    {
      to: '/settings',
      icon: GearIcon,
      label: 'Settings',
      description: 'System configuration'
    }
  ];

  return (
    <ScrollArea style={{ height: '100%' }}>
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

        {/* Navigation */}
        <div className="nav-section">
          <Text size="2" weight="medium" mb="3" style={{ display: 'block' }}>
            Navigation
          </Text>
          <Flex direction="column" gap="1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = location.pathname.startsWith(item.to) && item.to !== '/events' || location.pathname === item.to;
              const isDisabled = false; // No more event-dependent disabled states

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
                    <Icon 
                      size={16} 
                      color={item.color && !isDisabled ? `var(--${item.color}-9)` : undefined}
                    />
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
    </ScrollArea>
  );
};

export default AdminSidebar;
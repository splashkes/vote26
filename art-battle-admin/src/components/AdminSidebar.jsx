import { useState, useEffect } from 'react';
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
  CalendarIcon,
  PersonIcon,
  ImageIcon,
  GearIcon,
  ExitIcon,
  ActivityLogIcon,
  TableIcon,
  LockClosedIcon,
  HamburgerMenuIcon,
  ChevronRightIcon,
  EnvelopeClosedIcon,
  PaperPlaneIcon,
  MobileIcon,
  CardStackIcon,
  CheckCircledIcon,
  Component1Icon,
  CopyIcon,
  ReaderIcon,
  StarIcon
} from '@radix-ui/react-icons';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { DebugField } from './DebugComponents';
import EventSearch from './EventSearch';

const AdminSidebar = ({ collapsed = false, onToggleCollapse, hideToggleAndSignOut = false }) => {
  const { user, adminEvents, signOut } = useAuth();
  const [selectedEventId, setSelectedEventId] = useState('');
  const [userLevel, setUserLevel] = useState(null);
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    const checkUserLevel = async () => {
      if (!user?.email) return;
      
      try {
        const { data: adminUser } = await supabase
          .from('abhq_admin_users')
          .select('level')
          .eq('email', user.email)
          .eq('active', true)
          .single();
          
        setUserLevel(adminUser?.level);
      } catch (err) {
        console.error('Error checking user level:', err);
      }
    };

    checkUserLevel();
  }, [user]);

  const handleSignOut = async () => {
    await signOut();
    navigate('/login');
  };

  const handleEventSelect = (event) => {
    const eventId = event.event_id || event.id;
    setSelectedEventId(eventId);
    navigate(`/events/${eventId}`);
  };

  // Section 1: Events & Operations
  const eventsSection = [
    {
      to: '/events',
      icon: CalendarIcon,
      label: 'Events Dashboard',
      description: 'Browse and manage all events',
      section: 'events'
    },
    {
      to: '/event-linter',
      icon: CheckCircledIcon,
      label: 'Event Validator',
      description: 'Automated event health checks and issue detection',
      color: 'violet',
      section: 'events'
    },
    {
      to: '/venues',
      icon: Component1Icon,
      label: 'Venues',
      description: 'Manage event venues and locations',
      color: 'cyan',
      section: 'events'
    }
  ];

  // Section 2: Artists
  const artistsSection = [
    {
      to: '/artists',
      icon: PersonIcon,
      label: 'Artist Profiles',
      description: 'Manage profiles, applications, and invitations',
      section: 'artists'
    },
    {
      to: '/artists/bulk-management',
      icon: TableIcon,
      label: 'Bulk Artist Editor',
      description: 'Batch edit bios, images, and profile data',
      color: 'purple',
      section: 'artists'
    }
  ];

  // Section 3: Content & Marketing
  const contentSection = [
    {
      to: '/content',
      icon: ImageIcon,
      label: 'Content Library',
      description: 'Curated feed content and performance analytics',
      color: 'purple',
      section: 'content'
    },
    {
      to: '/sms-marketing',
      icon: MobileIcon,
      label: 'SMS Campaigns',
      description: 'Create and send promotional text messages',
      color: 'green',
      section: 'content'
    }
  ];

  // Section 4: Customers
  const customersSection = [
    {
      to: '/people',
      icon: ReaderIcon,
      label: 'Customer Hub',
      description: 'Customer loyalty, profiles, and engagement',
      section: 'customers'
    }
  ];

  // Section 7: Configuration (always visible)
  const configSection = [
    {
      to: '/settings',
      icon: GearIcon,
      label: 'Settings',
      description: 'System configuration and preferences',
      section: 'config'
    }
  ];

  const baseNavItems = [
    ...eventsSection,
    ...artistsSection,
    ...contentSection,
    ...customersSection,
    ...configSection
  ];

  // Super admin sections
  const superAdminEventsSectionExtra = [
    {
      to: '/sponsorship-packages',
      icon: StarIcon,
      label: 'Sponsorship Tiers',
      description: 'Global sponsorship templates and pricing',
      color: 'teal',
      section: 'events'
    }
  ];

  const superAdminArtistsExtra = [
    {
      to: '/duplicate-profiles',
      icon: CopyIcon,
      label: 'Duplicate Resolver',
      description: 'Find and merge duplicate artist profiles',
      color: 'orange',
      section: 'artists'
    }
  ];

  const financeSection = [
    {
      to: '/payments',
      icon: CardStackIcon,
      label: 'Artist Payments',
      description: 'Payment status, invites, and Stripe management',
      color: 'green',
      section: 'finance'
    }
  ];

  const systemAdminSection = [
    {
      to: '/health',
      icon: ActivityLogIcon,
      label: 'System Health',
      description: 'AI recommendations and system monitoring',
      color: 'crimson',
      section: 'system'
    },
    {
      to: '/admin-users',
      icon: LockClosedIcon,
      label: 'Admin Users',
      description: 'Manage administrator accounts and permissions',
      color: 'orange',
      section: 'system'
    },
    {
      to: '/invitations',
      icon: EnvelopeClosedIcon,
      label: 'Admin Invitations',
      description: 'Create and manage admin account invites',
      color: 'blue',
      section: 'system'
    },
    {
      to: '/email-queue',
      icon: PaperPlaneIcon,
      label: 'Email Queue',
      description: 'Monitor artist payment email notifications',
      color: 'purple',
      section: 'system'
    }
  ];

  // Build nav items based on user level
  const navItems = userLevel === 'super'
    ? [
        ...eventsSection,
        ...superAdminEventsSectionExtra,
        ...artistsSection,
        ...superAdminArtistsExtra,
        ...contentSection,
        ...customersSection,
        ...financeSection,
        ...systemAdminSection,
        ...configSection
      ]
    : baseNavItems;

  return (
    <ScrollArea style={{ height: '100%' }}>
      <Box>
        {!hideToggleAndSignOut && (
          <>
            {/* Collapse Toggle */}
            <div className="nav-section" style={{ padding: collapsed ? '0.5rem' : '1rem' }}>
              <Flex justify={collapsed ? 'center' : 'between'} align="center">
                {!collapsed && (
                  <Text size="2" weight="medium">
                    <DebugField 
                      value={user?.email} 
                      fieldName="user.email" 
                      fallback="Unknown user" 
                    />
                  </Text>
                )}
                <Button
                  variant="ghost"
                  size="1"
                  onClick={onToggleCollapse}
                  style={{ minHeight: '24px', minWidth: '24px', padding: '2px' }}
                >
                  {collapsed ? <ChevronRightIcon /> : <HamburgerMenuIcon />}
                </Button>
              </Flex>
              {!collapsed && (
                <Badge color="green" size="1" style={{ marginTop: '0.5rem' }}>
                  {adminEvents.length} event{adminEvents.length !== 1 ? 's' : ''}
                </Badge>
              )}
            </div>

            <Separator />
          </>
        )}

        {/* Event count when top nav is used */}
        {hideToggleAndSignOut && !collapsed && (
          <div className="nav-section" style={{ padding: '0.75rem' }}>
            <Badge color="green" size="1">
              {adminEvents.length} event{adminEvents.length !== 1 ? 's' : ''}
            </Badge>
          </div>
        )}

        {/* Navigation */}
        <div className="nav-section" style={{ padding: collapsed ? '0.5rem' : '1rem' }}>
          {!collapsed && (
            <Text size="2" weight="medium" mb="3" style={{ display: 'block' }} data-mobile-hide>
              Navigation
            </Text>
          )}
          <Flex direction="column" gap="1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = location.pathname.startsWith(item.to) && item.to !== '/events' || location.pathname === item.to;
              const isDisabled = false;

              return (
                <Link
                  key={item.to}
                  to={item.to}
                  className={`nav-item ${isActive ? 'active' : ''} ${isDisabled ? 'disabled' : ''} ${collapsed ? 'collapsed' : ''}`}
                  style={{
                    pointerEvents: isDisabled ? 'none' : 'auto',
                    opacity: isDisabled ? 0.5 : 1,
                    justifyContent: collapsed ? 'center' : 'flex-start',
                    padding: collapsed ? '0.5rem' : '0.5rem 0.75rem'
                  }}
                  title={collapsed ? `${item.label} - ${item.description}` : ''}
                >
                  <Flex align="center" gap={collapsed ? "0" : "2"} justify={collapsed ? 'center' : 'flex-start'}>
                    <Icon 
                      size={16} 
                      color={item.color && !isDisabled ? `var(--${item.color}-9)` : undefined}
                    />
                    {!collapsed && (
                      <Box>
                        <Text size="2" weight="medium" style={{ display: 'block' }}>
                          {item.label}
                        </Text>
                        <Text size="1" color="gray">
                          {item.description}
                        </Text>
                      </Box>
                    )}
                  </Flex>
                </Link>
              );
            })}
          </Flex>
        </div>

        {!hideToggleAndSignOut && (
          <>
            <Separator />

            {/* Admin Actions */}
            <div className="nav-section" style={{ padding: collapsed ? '0.5rem' : '1rem' }}>
              {!collapsed && (
                <Text size="2" weight="medium" mb="3" style={{ display: 'block' }} data-mobile-hide>
                  Admin
                </Text>
              )}
              <Flex direction="column" gap="2">
                <Button 
                  variant="ghost" 
                  size="2" 
                  onClick={handleSignOut}
                  style={{ 
                    justifyContent: collapsed ? 'center' : 'flex-start',
                    padding: collapsed ? '0.5rem' : undefined
                  }}
                  title={collapsed ? 'Sign Out' : ''}
                >
                  <ExitIcon />
                  {!collapsed && 'Sign Out'}
                </Button>
              </Flex>
            </div>
          </>
        )}
      </Box>
    </ScrollArea>
  );
};

export default AdminSidebar;
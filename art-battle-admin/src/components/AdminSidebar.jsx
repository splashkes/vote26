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
  DashboardIcon,
  PersonIcon,
  ImageIcon,
  GearIcon,
  ExitIcon,
  HeartFilledIcon,
  BarChartIcon,
  LockClosedIcon,
  HamburgerMenuIcon,
  ChevronRightIcon,
  EnvelopeClosedIcon,
  PaperPlaneIcon,
  ChatBubbleIcon,
  FileTextIcon,
  CardStackIcon
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

  const baseNavItems = [
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
      description: 'Manage profiles, applications, invitations'
    },
    {
      to: '/artists/bulk-management',
      icon: BarChartIcon,
      label: 'Bulk Artist View',
      description: 'Bulk management of artist bios and promo images',
      color: 'purple'
    },
    {
      to: '/content',
      icon: FileTextIcon,
      label: 'Content',
      description: 'Manage curated feed content and analytics',
      color: 'purple'
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

  // Add Admin Users, Invitations, and Email Queue for super admins only
  const navItems = userLevel === 'super' 
    ? [
        ...baseNavItems.slice(0, -1), // All items except Settings
        {
          to: '/admin-users',
          icon: LockClosedIcon,
          label: 'Admin Users',
          description: 'Manage administrator accounts',
          color: 'orange'
        },
        {
          to: '/invitations',
          icon: EnvelopeClosedIcon,
          label: 'Invitations',
          description: 'Manage admin invitations',
          color: 'blue'
        },
        {
          to: '/email-queue',
          icon: PaperPlaneIcon,
          label: 'Email Queue',
          description: 'Manage artist payment email notifications',
          color: 'purple'
        },
        {
          to: '/payments',
          icon: CardStackIcon,
          label: 'Payments',
          description: 'Artist payment administration and Stripe management',
          color: 'green'
        },
        {
          to: '/sms-marketing',
          icon: ChatBubbleIcon,
          label: 'SMS Marketing',
          description: 'Create and send promotional SMS campaigns',
          color: 'green'
        },
        baseNavItems[baseNavItems.length - 1] // Settings at the end
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